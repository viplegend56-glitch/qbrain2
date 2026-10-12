// Quantum Cats — the brain.
// Runs the one shared simulation of the box, serves /state.json to the website, and a password-protected /admin.
// Real money: the treasury wallet pays the cats when the operator presses Distribute; the operator can sell a cat's tokens for SOL.
// Every signed transaction goes through wallets.js, which only ever sends SOL to the ten cats / the treasury, or swaps SOL <-> the project's own mint.
'use strict';
const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const createEngine = require('./engine');
const market = require('./market');
const wallets = require('./wallets');
const { renderAdmin } = require('./page');
const llm = require('./llm');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const RPC_URL = process.env.RPC_URL || '';
fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- config (editable from /admin, saved to disk) ----------
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const DEFAULTS = {
  NAME: 'Quantum Cats', TICKER: 'QCATS',
  CA: process.env.CA || '', X_URL: process.env.X_URL || '',
  QI_MINT: process.env.QI_MINT || '',   // $QI: what the lab pays. The treasury wallet holds the supply.
  OWN_WALLETS: [],                      // the operator's own wallets: SOL arriving in the treasury from these is funding, not creator fees
  FUND_PUB: '',                         // the build fund: a wallet of yours (address only, no key here). The cats give SOL to it; its balance is the bar on the site
  FUND_GOAL: 2.5,                       // SOL the build fund needs before the boarded-up buildings open
  LAB_PAY_MIN_USD: 5, LAB_PAY_MAX_USD: 15, // a filled bar in the lab pays this many dollars of $QI: small bars the minimum, big bars the maximum
  GOAL_MUL: 1,                          // every bar in the lab times this: 2 makes the pay twice as hard to reach
  SCRAP_PAY: 100,                       // $QCATS a tier-1 salvage job pays (tier 2 two and a half times, tier 3 five times), from the treasury's own supply
  payoutEveryMin: 20,                   // the payout timer: everything owed is paid at once, this often
  PRICE_MUL: 1,                         // every price in the box times this; raise it by hand as the chart climbs
  START_QCATS: 10000,                   // the stack of $QCATS each cat is given (the Distribute panel hands it out; the site copy reads it)
  PACE_MIN: 6,                          // in the real modes: minutes between one cat's paid moves (a meal, a spin, a trade…), so the chain is not hammered
  chain: { mode: 'off', buyQi: true, maxPaySol: 1, dayCapSol: 25, testFlat: 0.001, fundSwaps: true }, // fundSwaps: a cat that cannot afford a swap's own costs is sent exactly the shortfall by the treasury first, quietly // mode: off = sandbox (the box only) · test (default testing: real transactions, every price 0.001 SOL, a filled lab bar pays $0.20 of $QI) · live (default: the real deal). The caps are a safety net against a bug, not a setting.
  QI_SOL: 0,                            // fallback SOL price of one $QI for the box's own sells, until the chart is read
  gas: { auto: false, floor: 0.001, min: 0.002 }, // no gas rule: floor is only the chain's rent minimum; the admin table flags a cat under `min` so you can send it SOL by hand
  aiStudyGapSec: 0,                     // with an API key: the model writes every study note (0), or at most one every N seconds
  SOL_USD: 150, START_MC_USD: 3100,
  sellCapPct: 5,          // max % of its stack a cat may sell per day (enforced once the cats trade for real)
  buyPct: 15,             // % of spare SOL a cat spends per buy (same)
  slippageBps: 500,       // 5% slippage on swaps (the cats' are dust-sized on thin coins; a refusal retries once at three times this)
  paused: false,
  lastTreasurySol: null,  // last treasury balance we saw, so a rise can be logged as "fees landed"
  feesSeenSol: 0,         // total real SOL that has landed in the treasury
  auto: { distribute: false, distKeep: 0.02, distPct: 0, qiPct: 0, sell: false, sellPct: 1, sellDayCap: 5, maxMin: 20, nextDist: 0, nextSell: 0, lastDist: '', lastSell: '', soldDay: '', soldPct: {} },
};
let config = { ...DEFAULTS };
try { const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); config = { ...DEFAULTS, ...saved, auto: { ...DEFAULTS.auto, ...(saved.auto || {}) }, gas: { ...DEFAULTS.gas, ...(saved.gas || {}) }, chain: { ...DEFAULTS.chain, ...(saved.chain || {}) } }; } catch (_) {}
if (config.FUND_GOAL === 5 && !config.fundGoalSet) config.FUND_GOAL = 2.5; // the goal came down from 5 to 2.5 SOL; a goal you set yourself in admin is kept
config.NAME = DEFAULTS.NAME; config.TICKER = DEFAULTS.TICKER; config.gas = { ...DEFAULTS.gas }; if (!(config.slippageBps >= 500)) config.slippageBps = 500; // the name, ticker and gas rule come from the code, not from an old saved config
const saveConfig = () => { try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2)); } catch (e) { console.error('config save failed', e); } };
// simulated fee drops only while there is no coin yet; the moment a CA is set, the only SOL the cats get is what you distribute
const simulateFees = () => !config.CA;

// ---------- engine ----------
const logs = [];
const STATE_PATH = path.join(DATA_DIR, 'state.json');
let lastPairAt = 0, lastStudyAt = 0;
const hooks = {
  onLog: e => { logs.unshift({ ...e, at: Date.now() }); if (logs.length > 300) logs.pop(); },
  // the countdown just hit zero: ask the model for a meeting written for the cats that showed up; the box keeps its stock lines if that fails
  onMeeting: ctx => { if (!llm.enabled()) return; llm.meetingScript(ctx).then(lines => { if (lines) engine.setMeetingScript(lines); }).catch(e => console.error('meeting script', e.message)); },
  // when a meeting ends every cat that was there takes something from it, and carries it into the next days
  onMeetingEnd: (ctx, lines) => { if (!llm.enabled()) return; llm.takeaways(ctx, lines).then(ts => { for (const t of ts) engine.setMemory(t.name, t.text); }).catch(e => console.error('takeaways', e.message)); },
  // two cats sitting down together get their own exchange (at most one AI chat every three minutes; the rest use the built-in lines)
  onPair: (ctx, a, b) => { if (!llm.enabled() || Date.now() - lastPairAt < 180000) return; lastPairAt = Date.now(); llm.pairChat(ctx, a, b).then(lines => { if (lines) engine.setChat(a, b, lines); }).catch(e => console.error('pair chat', e.message)); },
  // a cat finished a study session in the lab: the model writes its note (at most one every 90 seconds; the box's own line stands otherwise)
  onStudy: (ctx, name, info) => { if (!llm.enabled() || Date.now() - lastStudyAt < (Number(config.aiStudyGapSec) || 0) * 1000) return; lastStudyAt = Date.now(); llm.studyNote(ctx, name, info).then(t => { if (t) engine.setNote(info.noteId, t); }).catch(e => console.error('study note', e.message)); },
  // the day's lesson, written at the end of each day and read back into every later meeting
  onDayEnd: (recap, ctx) => { if (!llm.enabled()) { engine.setLesson(`day ${recap.day}: ${recap.fees.toFixed ? recap.fees.toFixed(4) : recap.fees} SOL of fees in, ${recap.jobs} job${recap.jobs === 1 ? '' : 's'} run, ${recap.tasks} thing${recap.tasks === 1 ? '' : 's'} dealt with${recap.topEarner ? ', ' + recap.topEarner + ' earned most' : ''}`); return; } llm.daySummary(ctx, recap).then(line => { if (line) engine.setLesson(line); }).catch(e => console.error('day summary', e.message)); },
};
const newEngine = () => createEngine({ ...config, SIMULATE_FEES: simulateFees() }, hooks);
let engine = newEngine();
try { const snap = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); engine.restore(snap.engine); console.log('restored state from disk'); } catch (_) {}
const applyChainMode = () => { const ch = config.chain || {}; if (ch.mode === 'dry') ch.mode = 'off'; ch.buyQi = true; const m = ch.mode || 'off'; engine.setLiveTx(m === 'live' || m === 'test'); engine.setDryRun(false); engine.setTestFlat(m === 'test' ? (ch.testFlat || 0.001) : 0); }; applyChainMode();
const testFlatNow = () => ((config.chain || {}).mode === 'test' ? (config.chain.testFlat || 0.001) : 0);
// everything the engine must be told from the config: on start, and again after a reset (a fresh engine knows none of it)
function applySettings() {
  engine.setPaused(config.paused); engine.setLabPay(config.LAB_PAY_MIN_USD, config.LAB_PAY_MAX_USD); engine.setPriceMul(config.PRICE_MUL || 1);
  engine.setQiConfig(0, config.QI_SOL); engine.setSolUsd(config.SOL_USD); engine.setSimulateFees(simulateFees()); engine.setPace(config.PACE_MIN); engine.setStartQcats(config.START_QCATS); engine.setGoalMul(config.GOAL_MUL || 1); engine.setScrapPay(config.SCRAP_PAY || 100); engine.setFundGoal(config.FUND_GOAL || 2.5); applyChainMode();
  if (typeof fundBal.sol === 'number') engine.setFundSol(fundBal.sol);
  if (mkt.ok && mkt.mcapUsd) engine.setMarketCapUsd(mkt.mcapUsd);
  if (mktQi.ok && mktQi.priceSol > 0) engine.setQiPrice(mktQi.priceSol);
  if (balances.at) { const tq = balances.treasury && balances.treasury.qi; engine.setQiPool(typeof tq === 'number' ? tq : null, !!config.QI_MINT && typeof tq === 'number'); const t = balances.treasury && balances.treasury.sol; if (typeof t === 'number') engine.setTreasury(t); if (['test', 'live'].includes((config.chain || {}).mode)) engine.setLiveBalances(balances.cats || {}); const tc = balances.treasury && balances.treasury.qcat; engine.setQcatPool(typeof tc === 'number' ? tc : null, !!config.CA && typeof tc === 'number'); }
}
const saveState = () => { try { fs.writeFileSync(STATE_PATH, JSON.stringify({ at: Date.now(), engine: engine.snapshot() })); } catch (e) { console.error('save failed', e); } };
function resetBox() {
  logs.length = 0; chainLog.length = 0; engine = newEngine(); applySettings();
  saveState(); console.log('box reset (mode ' + ((config.chain || {}).mode || 'off') + ', prices x' + (config.PRICE_MUL || 1) + ')');
}

const TICK = 0.25;
let last = Date.now();
setInterval(() => {
  const now = Date.now(); let dt = (now - last) / 1000; last = now; if (dt > 2) dt = 2;
  try { engine.step(dt); } catch (e) { console.error('step failed', e); }
}, TICK * 1000);

// ---------- market cap (real once the CA is set) + SOL price ----------
let mkt = { ok: false, mcapUsd: null, solUsd: null, priceUsd: null, at: 0, err: null };
async function pollMarket() {
  if (!config.CA) { engine.setMarketCapUsd(null); mkt = { ...mkt, ok: false, err: 'no CA set' }; return; }
  try {
    const m = await market.fetchToken(config.CA);
    mkt = { ok: true, ...m, at: Date.now(), err: null };
    if (m.solUsd) { config.SOL_USD = m.solUsd; engine.setSolUsd(m.solUsd); }
    engine.setMarketCapUsd(m.mcapUsd);
  } catch (e) { mkt = { ...mkt, ok: false, err: String(e.message || e) }; }
}
async function pollSolPrice() {
  // SOL/USD from the deepest wrapped-SOL pair, so the site shows dollar market caps even before the coin exists
  try { const m = await market.fetchToken(wallets.SOL_MINT); if (m.priceUsd > 0) { config.SOL_USD = m.priceUsd; engine.setSolUsd(m.priceUsd); } } catch (_) {}
}
let mktQi = { ok: false, priceSol: null, priceUsd: null, at: 0, err: null };
const mintChecks = {}; // CA / QI_MINT: { ok, msg } from the last save, shown in the Token panel
async function pollQi() {
  if (!config.QI_MINT) { mktQi = { ...mktQi, ok: false, err: 'no $QI mint set' }; engine.setQiPrice(0); return; }
  try { const m = await market.fetchToken(config.QI_MINT); mktQi = { ok: true, priceSol: m.priceNative, priceUsd: m.priceUsd, mcapUsd: m.mcapUsd, url: m.url, at: Date.now(), err: null }; engine.setQiPrice(m.priceNative); }
  catch (e) { mktQi = { ...mktQi, ok: false, err: String(e.message || e) }; }
}
setInterval(pollMarket, 30000); pollMarket();
setInterval(pollQi, 60000); pollQi();
setInterval(pollSolPrice, 300000); pollSolPrice();

// ---------- wallets: balances, and "fees landed" detection ----------
let balances = { at: 0, err: null, cats: {}, treasury: null };
let fundBal = { at: 0, sol: null, err: null }; // the build fund wallet's SOL, read every poll
const loadWallets = () => { const ws = wallets.load(); if (ws.ready) ws.fund = wallets.fundOf(config.FUND_PUB); return ws; };
let catsPaidIn = 0; // SOL the cats have paid into the treasury since the last balance read, so it is not mistaken for fees
applySettings(); // now that the market and balance holders exist
let busy = false; // one on-chain operation at a time
async function pollBalances() {
  const ws = loadWallets();
  if (!ws.ready || !RPC_URL) return;
  if (ws.fund) { try { const f = await wallets.solBalance(RPC_URL, ws.fund.pub); fundBal = { at: Date.now(), sol: f, err: null }; engine.setFundSol(f); } catch (e) { fundBal = { ...fundBal, err: String(e.message || e) }; } } else { fundBal = { at: 0, sol: null, err: null }; engine.setFundSol(null); }
  try {
    balances = { at: Date.now(), err: null, ...(await wallets.balances(RPC_URL, ws, config.CA, config.QI_MINT)) };
    const t = balances.treasury && balances.treasury.sol;
    { const tq = balances.treasury && balances.treasury.qi; engine.setQiPool(typeof tq === 'number' ? tq : null, !!config.QI_MINT && typeof tq === 'number'); const tc = balances.treasury && balances.treasury.qcat; engine.setQcatPool(typeof tc === 'number' ? tc : null, !!config.CA && typeof tc === 'number'); }
    if (['live', 'test'].includes((config.chain || {}).mode)) engine.setLiveBalances(balances.cats); // the wallets are the truth once the box is paying for real
    if (typeof t === 'number') {
      engine.setTreasury(t);
      // a rise in the treasury is creator fees landing — except for what the cats themselves just paid in (meals, stakes, entries), which is counted and taken off first
      if (busy) return; // a cat's transaction may be landing right now: judge the rise on the next read, once it has been counted
      if (config.lastTreasurySol != null && t > config.lastTreasurySol + 0.0005 + catsPaidIn) {
        const d = t - config.lastTreasurySol - catsPaidIn;
        let sig = null, k = { kind: 'unknown', from: null }; try { const recent = await wallets.recentSigs(RPC_URL, ws.treasury.pub, 12); sig = (recent.find(x => !ourSigs.has(x)) || null); if (sig) k = await wallets.inflowKind(RPC_URL, sig, config.OWN_WALLETS || [], ws.cats.map(c => c.pub)); } catch (_) {}
        if (k.kind === 'cat') { console.log('treasury rise was a cat paying in', d, sig); } // already shown as that cat's own row; never a fee
        else if (k.kind === 'own') { engine.noteDeposit(d, sig, k.from); chainNote({ id: 'D', type: 'deposit', cat: 'your wallet', to: 'treasury', sol: d, memo: 'your funding, from ' + (k.from || '').slice(0, 6) + '… · shown in the box, not counted as fees', ok: true, sig }); console.log('treasury funded by the operator', d, sig); }
        else { config.feesSeenSol += d; engine.noteFees(d, sig); if (k.kind === 'deposit') chainNote({ id: 'D', type: 'deposit', cat: 'outside', to: 'treasury', sol: d, memo: 'from ' + (k.from || '').slice(0, 6) + '… · counted as fees (add the wallet to “your own wallets” if it was you)', ok: true, sig }); }
      }
      catsPaidIn = 0;
      if (config.lastTreasurySol !== t) { config.lastTreasurySol = t; saveConfig(); }
    }
  } catch (e) { balances = { ...balances, err: String(e.message || e) }; }
}
setInterval(pollBalances, 30000); pollBalances();

// ---------- the executor: one queued intent at a time, as a real transaction (or a log line in dry-run) ----------
const chainLog = []; let chainSpentToday = { day: '', sol: 0 };
const ourSigs = new Set(); // every signature this brain produced, so money arriving from elsewhere can be told apart
function chainNote(e) { if (e.sig) ourSigs.add(e.sig); chainLog.unshift({ ...e, at: Date.now() }); if (chainLog.length > 100) chainLog.pop(); }
// admin jobs (Distribute, Pull back, Retry): queued, run one at a time ahead of the cats' own transactions, never refused for "busy"
const adminJobs = []; let adminSeq = 0;
function queueJob(kind, label, run) { const j = { id: 'A' + (++adminSeq), kind, label, run, state: 'queued', at: Date.now(), result: null }; adminJobs.push(j); return j; }
async function jobTick() {
  if (busy) return; const j = adminJobs.find(x => x.state === 'queued'); if (!j) return;
  busy = true; j.state = 'running'; j.started = Date.now();
  try { j.result = await j.run(); j.state = 'done'; console.log('admin job', j.kind, j.result); }
  catch (e) { j.result = 'failed: ' + e.message; j.state = 'failed'; console.error('admin job failed', j.kind, e); }
  finally { j.ended = Date.now(); busy = false; while (adminJobs.filter(x => x.state !== 'queued' && x.state !== 'running').length > 12) { const k = adminJobs.findIndex(x => x.state !== 'queued' && x.state !== 'running'); adminJobs.splice(k, 1); } }
}
setInterval(() => { jobTick().catch(e => console.error('jobTick', e)); }, 1500);
const mintCache = {}; // mint -> { decimals, program }, read once
async function mintMeta(mint) { if (!mintCache[mint]) mintCache[mint] = await wallets.mintInfo(RPC_URL, mint); return mintCache[mint]; }
async function runIntent(i) {
  const ws = loadWallets(); if (!ws.ready || !RPC_URL) throw new Error('wallets or RPC not ready');
  const catW = ws.cats.find(c => c.name === i.cat); if (!catW) throw new Error('unknown cat ' + i.cat);
  const ch = config.chain || {}; const day = new Date().toISOString().slice(0, 10); if (chainSpentToday.day !== day) chainSpentToday = { day, sol: 0 };
  const memo = `${config.TICKER} · ${i.cat} · ${i.memo}`;
  const RENT = 0.001, SWAP_FLOOR = 0.0024; // the chain's own minimum, and what a swap needs on top of the amount: the wrapped-SOL deposit (0.00204, refunded) plus the fee and priority
  if (i.type === 'pay') { // cat -> treasury
    if (i.sol > (ch.maxPaySol || 1)) throw new Error(`over the per-payment cap (${i.sol} SOL)`);
    const b = balances.cats[i.cat]; if (b && b.sol - i.sol < RENT) throw new Error(`${i.cat} has ${b.sol.toFixed(4)} SOL, not enough for this and the fee`);
    return wallets.transferSol(RPC_URL, ws, catW.kp, [{ pub: ws.treasury.pub, sol: i.sol }], memo, true);
  }
  if (i.type === 'donate') { // cat -> the build fund (an address of yours; the brain never holds its key)
    if (!ws.fund) throw new Error('no build-fund wallet set (Token panel)');
    if (i.sol > (ch.maxPaySol || 1)) throw new Error(`over the per-payment cap (${i.sol} SOL)`);
    const b = balances.cats[i.cat]; if (b && b.sol - i.sol < RENT) throw new Error(`${i.cat} has ${b.sol.toFixed(4)} SOL, not enough for this and the fee`);
    const sig = await wallets.transferSol(RPC_URL, ws, catW.kp, [{ pub: ws.fund.pub, sol: i.sol }], memo, true);
    if (typeof fundBal.sol === 'number') { fundBal.sol += i.sol; engine.setFundSol(fundBal.sol); }
    return sig;
  }
  if (i.type === 'wage') { // treasury -> cat: SOL for a chore, the moment it is done
    if (i.sol > (ch.maxPaySol || 1)) throw new Error('wage over the cap');
    const tre = balances.treasury && balances.treasury.sol; if (typeof tre === 'number' && tre - i.sol < 0.005) throw new Error(`treasury has ${tre.toFixed(4)} SOL, cannot pay ${i.sol}`);
    if (chainSpentToday.sol + i.sol > (ch.dayCapSol || 25)) throw new Error('treasury day cap reached'); chainSpentToday.sol += i.sol;
    return wallets.transferSol(RPC_URL, ws, ws.treasury.kp, [{ pub: catW.pub, sol: i.sol }], memo, true);
  }
  if (i.type === 'qi') { // treasury -> cat: $QI for a lab task, the moment it is done. The treasury buys what it lacks first, with SOL from the fees.
    if (!config.QI_MINT) throw new Error('no $QI CA set');
    const qi = Math.round(i.qi || 0); if (qi < 1) throw new Error('nothing to pay');
    let tq = balances.treasury && balances.treasury.qi, dec = balances.treasury && balances.treasury.qiDec;
    if (dec == null) dec = (await wallets.mintInfo(RPC_URL, config.QI_MINT)).decimals;
    if (typeof tq !== 'number') tq = 0;
    if (qi > tq) {
      const priceSol = mktQi.priceSol; if (!(priceSol > 0)) throw new Error('no $QI price yet, cannot size the buy');
      const solIn = Math.max((qi - tq) * priceSol * 1.03, 2 / (Number(config.SOL_USD) || 150)), tre = balances.treasury && balances.treasury.sol; // 3% over for slippage, and never a dust buy: at least two dollars' worth, the rest stays in the treasury for the next payouts
      if (typeof tre === 'number' && solIn > tre - 0.01) throw new Error(`treasury needs ${solIn.toFixed(4)} SOL to buy the $QI owed, has ${tre.toFixed(4)}`);
      const qm = await mintMeta(config.QI_MINT), r = await wallets.swapAny(RPC_URL, ws.treasury.kp, config.QI_MINT, 'buy', Math.max(1000, Math.floor(solIn * wallets.LAMPORTS)), config.slippageBps, { maxFeeLamports: 300000, decimals: dec, program: qm.program, slippageBps: config.slippageBps });
      const got = (r.outcome && r.outcome.tokDeltaRaw > 0 ? r.outcome.tokDeltaRaw : (r.outAmount || 0)) / Math.pow(10, dec); tq += got; if (balances.treasury) balances.treasury.qi = tq;
      chainNote({ id: i.id + 'b', type: 'buy $QI', cat: 'treasury', to: 'treasury', sol: solIn, memo: `bought ${Math.floor(got).toLocaleString('en-US')} $QI for ${i.cat}'s pay`, ok: true, sig: r.sig }); console.log('treasury bought', got, '$QI for', solIn, 'SOL', r.sig);
      if (qi > tq) throw new Error('the $QI buy came up short; will retry');
    }
    const { sigs } = await wallets.transferToken(RPC_URL, ws, ws.treasury.kp, config.QI_MINT, [{ pub: catW.pub, raw: Math.floor(qi * Math.pow(10, dec)) }], memo);
    if (balances.treasury) balances.treasury.qi = tq - qi;
    return sigs[0];
  }
  if (i.type === 'qcat') { // treasury -> cat: $QCATS for a salvage job, from the treasury's own supply (nothing is bought)
    if (!config.CA) throw new Error('no CA set');
    const q = Math.round(i.q || 0); if (q < 1) throw new Error('nothing to pay');
    const tq = balances.treasury && balances.treasury.qcat, dec = balances.treasury && balances.treasury.decimals;
    if (typeof tq !== 'number' || dec == null) throw new Error('treasury $' + config.TICKER + ' balance not read yet');
    if (q > tq) throw new Error(`treasury holds ${Math.floor(tq).toLocaleString('en-US')} ${config.TICKER}, cannot pay ${q.toLocaleString('en-US')}`);
    const { sigs } = await wallets.transferToken(RPC_URL, ws, ws.treasury.kp, config.CA, [{ pub: catW.pub, raw: Math.floor(q * Math.pow(10, dec)) }], memo);
    if (balances.treasury) balances.treasury.qcat = tq - q;
    return sigs[0];
  }
  if (i.type === 'swap') { // the cat's own wallet, through Jupiter: SOL -> token (buy) or token -> SOL (sell)
    const mint = i.tok === 'qi' ? config.QI_MINT : config.CA; if (!mint) throw new Error(`no ${i.tok === 'qi' ? '$QI' : config.TICKER} CA set`);
    const dec = i.tok === 'qi' ? (balances.treasury && balances.treasury.qiDec) : (balances.treasury && balances.treasury.decimals);
    const decimals = dec != null ? dec : (await wallets.mintInfo(RPC_URL, mint)).decimals;
    if (i.dir === 'buy' && i.sol > (ch.maxPaySol || 1)) throw new Error('buy over the cap');
    // a swap costs the cat more than it trades: the fee, a deposit for the temporary wrapped-SOL account (refunded), and on a first buy the token account (not). Short of that, the treasury tops it up first.
    const b = balances.cats[i.cat] || {}, hasAcct = i.tok === 'qi' ? (b.qiRaw > 0) : (b.qcatRaw > 0);
    const need = SWAP_FLOOR + (i.dir === 'buy' ? i.sol : 0) + (i.dir === 'buy' && !hasAcct ? 0.0021 : 0);
    if (typeof b.sol === 'number' && b.sol < need) {
      if (ch.fundSwaps === false) throw new Error(`${i.cat} has ${b.sol.toFixed(4)} SOL, not enough for this swap and its fees (funding is off)`);
      const amt = Math.ceil((need - b.sol + 0.0002) * 1e4) / 1e4, tre = balances.treasury && balances.treasury.sol; // just the shortfall for this swap, rounded up to the next 0.0001
      if (typeof tre === 'number' && tre - amt < 0.005) throw new Error(`treasury has ${tre.toFixed(4)} SOL, cannot fund ${i.cat}'s swap (${amt.toFixed(4)} needed)`);
      if (chainSpentToday.sol + amt > (ch.dayCapSol || 25)) throw new Error('treasury day cap reached'); chainSpentToday.sol += amt;
      const sig = await wallets.transferSol(RPC_URL, ws, ws.treasury.kp, [{ pub: catW.pub, sol: amt }], `${config.TICKER} · ${i.cat} · SOL to swap with`, true);
      chainNote({ id: i.id + 'f', type: 'fund', cat: 'treasury', to: i.cat, sol: amt, memo: 'SOL to swap with', ok: true, sig }); engine.noteFund(i.cat, amt, sig, true); b.sol += amt; console.log('funded', i.cat, amt, 'SOL to swap with', sig);
    }
    const feeCap = ch.mode === 'test' ? 100000 : 300000; // lamports of priority at most: a tenth of a cent in testing
    const meta = await mintMeta(mint), sopts = { maxFeeLamports: feeCap, decimals, program: meta.program, slippageBps: config.slippageBps };
    const raw = i.dir === 'buy' ? Math.max(1000, Math.floor(i.sol * wallets.LAMPORTS)) : Math.floor(i.q * Math.pow(10, decimals)); if (raw < 1) throw new Error('nothing to sell');
    const r = await wallets.swapAny(RPC_URL, catW.kp, mint, i.dir, raw, config.slippageBps, sopts);
    // what to book: the confirmed transaction's real balance changes when they could be read, else the quote, else the box's own estimate
    const o = r.outcome; let extra;
    const sane = o && typeof o.solDelta === 'number' && (i.dir === 'buy' ? o.tokDeltaRaw > 0 : o.solDelta > 0);
    if (sane) extra = i.dir === 'buy' ? { inSol: Math.max(0, -o.solDelta), outQ: Math.max(0, o.tokDeltaRaw) / Math.pow(10, decimals) } : { inQ: Math.max(0, -o.tokDeltaRaw) / Math.pow(10, decimals), outSol: Math.max(0, o.solDelta) };
    else if (r.inAmount != null && r.outAmount != null) extra = i.dir === 'buy' ? { inSol: r.inAmount / wallets.LAMPORTS, outQ: r.outAmount / Math.pow(10, decimals) } : { inQ: r.inAmount / Math.pow(10, decimals), outSol: r.outAmount / wallets.LAMPORTS };
    return { sig: r.sig, extra, via: r.via };
  }
  if (i.type === 'win') { // treasury -> cat (a casino win)
    if (i.sol > (ch.maxPaySol || 0.2) * 4) throw new Error('win over the cap');
    if (chainSpentToday.sol + i.sol > (ch.dayCapSol || 2)) throw new Error('treasury day cap reached'); chainSpentToday.sol += i.sol;
    return wallets.transferSol(RPC_URL, ws, ws.treasury.kp, [{ pub: catW.pub, sol: i.sol }], memo, true);
  }
  if (i.type === 'wager') { // cat -> cat
    const toW = ws.cats.find(c => c.name === i.to); if (!toW) throw new Error('unknown cat ' + i.to);
    if (i.sol > (ch.maxPaySol || 0.2)) throw new Error('wager over the cap');
    return wallets.transferSol(RPC_URL, ws, catW.kp, [{ pub: toW.pub, sol: i.sol }], memo, true);
  }
  throw new Error('unknown intent type ' + i.type);
}
async function chainTick() {
  const ch = config.chain || {}; if (!['live', 'dry', 'test'].includes(ch.mode)) return;
  if (busy || adminJobs.some(x => x.state === 'queued')) return; // the operator's jobs go first
  const i = engine.takeIntent(); if (!i) return;
  engine.markIntent(i.id, 'sending');
  if (ch.mode === 'dry') { engine.intentDone(i.id, null); chainNote({ id: i.id, type: i.type, cat: i.cat, to: i.to || 'treasury', sol: i.sol, memo: i.memo, ok: true, dry: true }); return; }
  busy = true;
  const fromTre = i.type === 'wage' || i.type === 'qi' || i.type === 'qcat', who = fromTre ? 'treasury' : i.cat, to = fromTre ? i.cat : i.type === 'swap' ? 'jupiter' : i.type === 'donate' ? 'build fund' : (i.to || 'treasury');
  const amt = i.type === 'qi' || i.type === 'qcat' ? null : (i.type === 'swap' && i.dir === 'sell' ? null : i.sol), what = i.type === 'qi' ? `${Math.round(i.qi).toLocaleString('en-US')} $QI · ${i.memo}` : i.type === 'qcat' ? `${Math.round(i.q).toLocaleString('en-US')} ${config.TICKER} · ${i.memo}` : i.memo;
  try { const r = await runIntent(i); const sig = r && r.sig ? r.sig : r; if (i.type === 'pay') catsPaidIn += i.sol || 0; engine.intentDone(i.id, sig, r && r.extra); chainNote({ id: i.id, type: i.type, cat: who, to: r && r.via ? r.via : to, sol: amt, memo: what + (r && r.via && r.via !== 'Jupiter' ? ' · via ' + r.via : ''), ok: true, sig }); console.log('chain', i.type, who, '->', to, amt != null ? amt : '', what, sig); pollBalances(); }
  catch (e) { engine.intentFailed(i.id, e.message); chainNote({ id: i.id, type: i.type, cat: who, to, sol: amt, memo: what, ok: false, err: String(e.message).slice(0, 160) }); console.error('chain failed', i.type, who, what, e.message); }
  finally { busy = false; }
}
setInterval(() => { chainTick().catch(e => console.error('chainTick', e)); }, 2500);

// ---------- gas: a cat under the minimum gets refilled to the floor from the treasury, at most once every ten minutes per cat ----------
const gasLast = {};
async function topUpGas() {
  const g = config.gas || {}, ws = wallets.load();
  if (!g.auto || busy || !ws.ready || !RPC_URL || !balances.at) return;
  const tre = balances.treasury && balances.treasury.sol; if (typeof tre !== 'number') return;
  const now = Date.now(), inBox = new Set(engine.cats.map(c => c.name));
  const outs = ws.cats.filter(c => inBox.has(c.name)).map(c => ({ name: c.name, pub: c.pub, bal: balances.cats[c.name] })).filter(o => o.bal && typeof o.bal.sol === 'number' && o.bal.sol < g.min && now - (gasLast[o.name] || 0) > 600000)
    .map(o => ({ ...o, sol: Math.round((g.floor - o.bal.sol + 0.0005) * 1e6) / 1e6 }));
  if (!outs.length) return;
  const need = outs.reduce((a, o) => a + o.sol, 0);
  if (need > tre - 0.005) { console.warn('gas: treasury too low to refill', outs.map(o => o.name).join(', ')); return; }
  busy = true;
  try {
    const sig = await wallets.transferSol(RPC_URL, ws, ws.treasury.kp, outs, `${config.TICKER} · gas top-up`);
    for (const o of outs) { gasLast[o.name] = now; engine.noteGas(o.name, o.sol, sig); }
    config.lastTreasurySol = tre - need; saveConfig();
    console.log('gas top-up', outs.map(o => o.name + ' +' + o.sol).join(', '), sig);
    pollBalances();
  } catch (e) { console.error('gas top-up failed', e.message); for (const o of outs) gasLast[o.name] = now; }
  finally { busy = false; }
}
// (no automatic gas top-ups: the admin table shows 'needs SOL' and you send it by hand)

// ---------- persistence ----------
setInterval(saveState, 30000);

// ---------- thoughts: every few minutes a few awake cats get a line of their own ----------
async function thoughtTick() {
  if (!llm.enabled()) return;
  const ctx = engine.meetingContext(); if (!ctx.cats.length) return;
  const pool = ctx.cats.map(c => c.name).sort(() => Math.random() - 0.5).slice(0, 3);
  try { for (const t of await llm.thoughts(ctx, pool)) engine.setThought(t.name, t.text); } catch (e) { console.error('thoughts', e.message); }
}
setInterval(thoughtTick, 300000 + Math.random() * 120000); setTimeout(thoughtTick, 90000);

// ---------- http (no framework: Node's built-in server) ----------
function send(res, status, body, type = 'application/json', extra = {}) {
  const h = { 'Content-Type': type + (type.startsWith('text') || type.includes('html') ? '; charset=utf-8' : ''), 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store', ...extra };
  res.writeHead(status, h); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
const redirect = (res, to) => send(res, 303, '', 'text/plain', { Location: to });
const back = (res, msg, bad) => redirect(res, '/admin?' + (bad ? 'err=' : 'msg=') + encodeURIComponent(msg));
function readBody(req) { return new Promise(r => { let d = ''; req.on('data', c => { d += c; if (d.length > 1e6) req.destroy(); }); req.on('end', () => { const out = {}; try { if ((req.headers['content-type'] || '').includes('json')) Object.assign(out, JSON.parse(d || '{}')); else for (const [k, v] of new URLSearchParams(d)) out[k] = v; } catch (_) {} r(out); }); }); }
function authed(req, res) {
  if (!ADMIN_PASSWORD) { send(res, 503, 'Set ADMIN_PASSWORD in the environment to enable /admin.', 'text/plain'); return false; }
  const [, b64] = (req.headers.authorization || '').split(' ');
  const [, pw] = Buffer.from(b64 || '', 'base64').toString().split(':');
  if (pw === ADMIN_PASSWORD) return true;
  send(res, 401, 'password required', 'text/plain', { 'WWW-Authenticate': 'Basic realm="quantum cats"' }); return false;
}
const adminPage = (extra = {}) => renderAdmin({ config, engine, market: mkt, marketQi: mktQi, mintChecks, chainLog, adminJobs, wallets: loadWallets(), balances, fundBal, logs: logs.slice(0, 40), flash: '', err: '', busy, env: { RPC_URL: !!RPC_URL, DATA_DIR, simulateFees: simulateFees(), llm: llm.status }, ...extra });

// ---------- the two real-money actions ----------
async function distribute(b) {
  // SOL is split by the chores done since the last payout; $QI by the lab work. Either, or both, in one press.
  const ws = wallets.load(); if (!ws.ready) throw new Error('wallets not loaded');
  if (!RPC_URL) throw new Error('RPC_URL not set');
  const total = Number(b.sol) || 0, totalQi = Number(b.qi) || 0, qcatEach = Math.floor(Number(b.qcatEach) || 0);
  if (!(total > 0) && !(totalQi > 0) && !(qcatEach > 0)) throw new Error('enter an amount of SOL or $QCATS');
  const released = new Set(engine.cats.map(c => c.name));
  const names = ws.cats.map(c => c.name).filter(n => released.has(n) && b['dist_' + n]);
  if (!names.length) throw new Error('no released cat is ticked');
  const tre = balances.treasury && balances.treasury.sol;
  if (typeof tre !== 'number') throw new Error('treasury balance not read yet');
  const parts = [];
  let spentSol = 0, needSol = 0;
  if (total > 0) {
    if (total > tre - 0.005) throw new Error(`treasury has ${tre.toFixed(4)} SOL; keep 0.005 for fees`);
    const shares = engine.workShares(names);
    const outs = names.map(n => ({ name: n, pub: ws.cats.find(c => c.name === n).pub, sol: Math.floor(total * shares[n] * 1e6) / 1e6 })).filter(o => o.sol >= 0.001);
    if (!outs.length) throw new Error('every SOL share would be under 0.001 SOL — send more or tick fewer cats');
    const sig = await wallets.transferSol(RPC_URL, ws, ws.treasury.kp, outs);
    engine.payout(outs.map(o => ({ name: o.name, sol: o.sol })), sig); engine.resetWork(outs.map(o => o.name));
    spentSol = outs.reduce((a, o) => a + o.sol, 0);
    console.log('distributed', spentSol, 'SOL by chores:', outs.map(o => o.name + ' ' + o.sol).join(', '), sig);
    parts.push(`paid ${spentSol.toFixed(4)} SOL by chores · ${outs.map(o => `${o.name} ${o.sol.toFixed(4)} (${Math.round(shares[o.name] * 100)}%)`).join(' · ')} · ${sig.slice(0, 8)}…`);
  }
  if (totalQi > 0) {
    if (!config.QI_MINT) throw new Error('set the $QI mint first');
    const tq = balances.treasury && balances.treasury.qi, dec = balances.treasury && balances.treasury.qiDec;
    if (typeof tq !== 'number' || dec == null) throw new Error('treasury $QI balance not read yet');
    if (totalQi > tq) throw new Error(`treasury holds ${Math.floor(tq).toLocaleString('en-US')} $QI`);
    if (tre - spentSol < 0.01) throw new Error('treasury needs ~0.01 SOL for the token transfers');
    const shares = engine.labShares(names);
    const outs = names.map(n => ({ name: n, pub: ws.cats.find(c => c.name === n).pub, qi: Math.floor(totalQi * shares[n]) })).filter(o => o.qi >= 1).map(o => ({ ...o, raw: Math.floor(o.qi * Math.pow(10, dec)) }));
    if (!outs.length) throw new Error('every $QI share would round to nothing');
    const { sigs } = await wallets.transferToken(RPC_URL, ws, ws.treasury.kp, config.QI_MINT, outs);
    engine.qiPayout(outs.map(o => ({ name: o.name, qi: o.qi })), sigs[0]); engine.resetLab(outs.map(o => o.name));
    const sent = outs.reduce((a, o) => a + o.qi, 0);
    console.log('distributed', sent, '$QI by lab work:', outs.map(o => o.name + ' ' + o.qi).join(', '), sigs.join(','));
    parts.push(`paid ${sent.toLocaleString('en-US')} $QI by lab work · ${outs.map(o => `${o.name} ${o.qi.toLocaleString('en-US')} (${Math.round(shares[o.name] * 100)}%)`).join(' · ')} · ${sigs.map(x => x.slice(0, 8)).join(', ')}…`);
  }
  if (qcatEach > 0) { // the same stack to every ticked cat, from the treasury's own $QCATS
    if (!config.CA) throw new Error('set the CA first');
    const tq = balances.treasury && balances.treasury.qcat, dec = balances.treasury && balances.treasury.decimals;
    if (typeof tq !== 'number' || dec == null) throw new Error('treasury $' + config.TICKER + ' balance not read yet');
    if (qcatEach * names.length > tq) throw new Error(`treasury holds ${Math.floor(tq).toLocaleString('en-US')} ${config.TICKER}; ${names.length} × ${qcatEach.toLocaleString('en-US')} is more than that`);
    if (tre - spentSol < 0.003 * names.length) throw new Error('treasury needs about 0.003 SOL per cat for the token accounts');
    const outs = names.map(n => ({ name: n, pub: ws.cats.find(c => c.name === n).pub, q: qcatEach, raw: Math.floor(qcatEach * Math.pow(10, dec)) }));
    const { sigs } = await wallets.transferToken(RPC_URL, ws, ws.treasury.kp, config.CA, outs, `${config.TICKER} · starting stack`);
    engine.qcatGrant(outs.map(o => ({ name: o.name, q: o.q })), sigs[0]);
    config.START_QCATS = qcatEach; engine.setStartQcats(qcatEach);
    console.log('handed out', qcatEach, config.TICKER, 'each to', names.join(', '), sigs.join(','));
    parts.push(`${qcatEach.toLocaleString('en-US')} ${config.TICKER} to each of ${names.length} cats · ${sigs.map(x => x.slice(0, 8)).join(', ')}…`);
  }
  if (spentSol > 0 || qcatEach > 0) { config.lastTreasurySol = tre - spentSol; saveConfig(); }
  pollBalances();
  return parts.join(' — ');
}
// tok: 'qcats' (the project's own coin) or 'qi'. 'auto' follows what the cat's box-self sold last.
function tokFor(name, tok) {
  if (tok === 'qi') return 'qi'; if (tok === 'qcats') return 'qcats';
  const b = balances.cats[name]; return config.QI_MINT && b && b.qi > 0 && engine.sellIntent(name) === 'qi' ? 'qi' : 'qcats';
}
// the payout timer fired: pay every cat exactly what it is owed (SOL for chores, $QI for lab work) from the treasury, then tell the box
// (payouts are per task now: see the 'wage' and 'qi' intents in runIntent)
async function sellFor(name, pct, tok) {
  const ws = wallets.load(); if (!ws.ready) throw new Error('wallets not loaded');
  if (!RPC_URL) throw new Error('RPC_URL not set');
  tok = tokFor(name, tok);
  const mint = tok === 'qi' ? config.QI_MINT : config.CA, label = tok === 'qi' ? '$QI' : config.TICKER;
  if (!mint) throw new Error(tok === 'qi' ? 'set the $QI mint first' : 'set the CA first');
  pct = Number(pct); if (!(pct > 0 && pct <= 100)) throw new Error('pick 1–100%');
  const w = ws.cats.find(c => c.name === name); if (!w) throw new Error('unknown cat');
  const bal = balances.cats[name];
  const heldRaw = tok === 'qi' ? bal && bal.qiRaw : bal && bal.qcatRaw, dec = tok === 'qi' ? bal && bal.qiDec : bal && bal.decimals;
  if (!bal || heldRaw == null) throw new Error(`${name}: ${label} balance not read yet`);
  if (bal.sol < 0.003) throw new Error(`${name} has ${bal.sol.toFixed(4)} SOL — needs ~0.003 for the swap fee`);
  const raw = Math.floor(heldRaw * pct / 100);
  if (raw <= 0) throw new Error(`${name} holds no ${label}`);
  const r = await wallets.jupiterSwap(RPC_URL, w.kp, mint, 'sell', raw, config.slippageBps);
  const q = raw / Math.pow(10, dec || 6), sol = r.outAmount / wallets.LAMPORTS;
  if (tok === 'qi') engine.noteSellQi(name, q, sol, r.sig); else engine.noteSell(name, q, sol, r.sig);
  console.log('sold', q, label, 'from', name, 'for', sol, 'SOL', r.sig);
  return { q, sol, sig: r.sig, tok };
}

async function sellMany(names, pct, tok) {
  const done = [], failed = [];
  for (const n of names) { try { const r = await sellFor(n, pct, tok); done.push(`${n} ${r.sol.toFixed(4)} SOL (${r.tok === 'qi' ? '$QI' : config.TICKER})`); if (r.tok !== 'qi') noteSold(n, Number(pct)); } catch (e) { failed.push(`${n}: ${e.message}`); } }
  pollBalances();
  const msg = (done.length ? 'sold · ' + done.join(' · ') : '') + (failed.length ? (done.length ? ' — ' : '') + 'failed · ' + failed.join(' · ') : '');
  return { done, failed, msg: msg || 'nothing to sell' };
}
// per-cat "% sold today" so autopilot never blows through the daily cap
function noteSold(name, pct) {
  const day = new Date().toISOString().slice(0, 10), a = config.auto;
  if (a.soldDay !== day) { a.soldDay = day; a.soldPct = {}; }
  a.soldPct[name] = (a.soldPct[name] || 0) + pct; saveConfig();
}
const soldToday = name => (config.auto.soldDay === new Date().toISOString().slice(0, 10) ? config.auto.soldPct[name] || 0 : 0);

// ---------- autopilot ----------
const when = () => Date.now() + (5 + Math.random() * Math.max(0, (config.auto.maxMin || 20) - 5)) * 60000;
const stamp = () => new Date().toISOString().slice(11, 16) + ' UTC';
async function autoTick() {} // nothing scheduled any more: pay is per task, and failed payouts are retried by the box itself every ten minutes
setInterval(() => { autoTick().catch(e => console.error('autoTick', e)); }, 20000);

const callSeen = new Map();
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); const p = u.pathname;
  try {
    if (req.method === 'GET' && p === '/') return send(res, 200, 'quantum cats brain · /state.json · /admin', 'text/plain');
    if (req.method === 'GET' && p === '/health') return send(res, 200, { ok: true, up: process.uptime() });
    if (req.method === 'GET' && p === '/state.json') {
      const ws = loadWallets();
      return send(res, 200, {
        at: Date.now(),
        config: { NAME: config.NAME, TICKER: config.TICKER, CA: config.CA, X_URL: config.X_URL, SOL_USD: config.SOL_USD, sellCapPct: config.sellCapPct, QI_MINT: config.QI_MINT, gas: config.gas, chain: { mode: (config.chain || {}).mode || 'off' }, PRICE_MUL: config.PRICE_MUL || 1, PACE_MIN: config.PACE_MIN == null ? 6 : config.PACE_MIN, START_QCATS: config.START_QCATS || 10000, GOAL_MUL: config.GOAL_MUL || 1, SCRAP_PAY: config.SCRAP_PAY || 100, FUND_GOAL: config.FUND_GOAL || 2.5, FUND_LIVE: !!config.FUND_PUB, LIVE_TX: ['test', 'live'].includes((config.chain || {}).mode), TEST_FLAT: testFlatNow(), QI_SOL: config.QI_SOL || 0, LAB_PAY_MIN_USD: config.LAB_PAY_MIN_USD, LAB_PAY_MAX_USD: config.LAB_PAY_MAX_USD, QI_LIVE: !!config.QI_MINT },
        market: { ...mkt, qi: mktQi },
        wallets: ws.ready ? { treasury: ws.treasury.pub, cats: ws.cats.map(w => ({ name: w.name, pub: w.pub })), fund: config.FUND_PUB || null, fundSol: fundBal.sol, balances, feesSeenSol: config.feesSeenSol } : null,
        engine: engine.snapshot(),
        ai: llm.enabled(),
      });
    }
    if (req.method === 'POST' && p === '/call') {
      // a viewer clicked the badge over something on the ground: the cats hear about it (a nudge, not an order). Public, lightly rate-limited per address.
      const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(), now = Date.now();
      for (const [k, v] of callSeen) if (now - v > 60000) callSeen.delete(k);
      if (now - (callSeen.get(ip) || 0) < 3000) return send(res, 429, 'slow down', 'text/plain');
      callSeen.set(ip, now);
      let raw = ''; await new Promise(r => { req.on('data', c => { raw += c; if (raw.length > 200) req.destroy(); }); req.on('end', r); });
      const id = String(raw).replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
      const ok = id ? engine.callTask(id) : false; return send(res, ok ? 200 : 404, ok ? 'ok' : 'gone', 'text/plain');
    }
    if (p.startsWith('/admin')) {
      if (!authed(req, res)) return;
      if (req.method === 'GET' && p === '/admin') return send(res, 200, adminPage({ flash: u.searchParams.get('msg') || '', err: u.searchParams.get('err') || '' }), 'text/html');
      if (req.method !== 'POST') return send(res, 404, 'not found', 'text/plain');
      const b = await readBody(req);
      if (p === '/admin/config') {
        const notes0 = [];
        for (const k of ['CA', 'X_URL', 'QI_MINT']) if (k in b) config[k] = String(b[k]).trim();
        if ('OWN_WALLETS' in b) config.OWN_WALLETS = String(b.OWN_WALLETS).split(/[\s,;]+/).map(x => x.trim()).filter(x => x.length >= 32 && x.length <= 44);
        if ('FUND_PUB' in b) { const f = String(b.FUND_PUB).trim(); if (f && !wallets.fundOf(f)) notes0.push('build fund: that is not a valid Solana address'); else config.FUND_PUB = f; }
        if ('FUND_GOAL' in b && b.FUND_GOAL !== '') { config.FUND_GOAL = Math.max(0.01, Math.min(10000, Number(b.FUND_GOAL) || 2.5)); config.fundGoalSet = true; engine.setFundGoal(config.FUND_GOAL); }
        // the two token addresses must be mints, not pool addresses: check on-chain, and if a pair was pasted, resolve its mint
        const notes = notes0;
        for (const k of ['CA', 'QI_MINT']) { const a = config[k]; if (!a || !RPC_URL) continue; const label = k === 'CA' ? config.TICKER : '$QI';
          try { const m = await wallets.mintInfo(RPC_URL, a); notes.push(`${label}: mint ok, ${m.decimals} decimals`); mintChecks[k] = { ok: true, msg: `mint · ${m.decimals} decimals` }; }
          catch (e) { try { const r = await market.mintFromPair(a); const m = await wallets.mintInfo(RPC_URL, r.mint); config[k] = r.mint; notes.push(`${label}: that was the pair address — using the mint ${r.mint.slice(0, 6)}… (${r.symbol}, ${m.decimals} decimals)`); mintChecks[k] = { ok: true, msg: `mint · ${m.decimals} decimals · resolved from the pair you pasted` }; }
            catch (e2) { notes.push(`${label}: ${e.message}`); mintChecks[k] = { ok: false, msg: e.message }; } } }
        for (const k of ['sellCapPct', 'buyPct', 'slippageBps', 'QI_SOL', 'aiStudyGapSec', 'LAB_PAY_MIN_USD', 'LAB_PAY_MAX_USD', 'payoutEveryMin', 'PRICE_MUL']) if (k in b && b[k] !== '') config[k] = Number(b[k]);
        config.PRICE_MUL = Math.max(0.1, Math.min(20, config.PRICE_MUL || 1));
        if (config.LAB_PAY_MAX_USD < config.LAB_PAY_MIN_USD) config.LAB_PAY_MAX_USD = config.LAB_PAY_MIN_USD; config.payoutEveryMin = Math.max(5, config.payoutEveryMin || 20);
        if ('gasFloor' in b || 'gasMin' in b || 'gasForm' in b) { const g = config.gas; g.auto = !!b.gasAuto; if (b.gasFloor !== '' && b.gasFloor != null) g.floor = Math.max(0.001, Number(b.gasFloor)); if (b.gasMin !== '' && b.gasMin != null) g.min = Math.max(0.0005, Math.min(g.floor, Number(b.gasMin))); }
        engine.setSimulateFees(simulateFees()); engine.setQiConfig(0, config.QI_SOL); engine.setLabPay(config.LAB_PAY_MIN_USD, config.LAB_PAY_MAX_USD); engine.setPriceMul(config.PRICE_MUL);
        saveConfig(); pollMarket(); pollQi(); pollBalances(); return back(res, 'saved' + (notes.length ? ' · ' + notes.join(' · ') : ''), notes.some(n => /not a token mint|not found|not a known|not a valid/.test(n)));
      }
      if (p === '/admin/payouts') { // the lab pay range
        for (const k of ['LAB_PAY_MIN_USD', 'LAB_PAY_MAX_USD', 'GOAL_MUL', 'SCRAP_PAY']) if (k in b && b[k] !== '') config[k] = Number(b[k]); config.SCRAP_PAY = Math.max(1, Math.round(config.SCRAP_PAY || 100)); engine.setScrapPay(config.SCRAP_PAY);
        if (config.LAB_PAY_MAX_USD < config.LAB_PAY_MIN_USD) config.LAB_PAY_MAX_USD = config.LAB_PAY_MIN_USD; config.GOAL_MUL = Math.max(0.1, Math.min(20, config.GOAL_MUL || 1));
        engine.setLabPay(config.LAB_PAY_MIN_USD, config.LAB_PAY_MAX_USD); engine.setGoalMul(config.GOAL_MUL);
        saveConfig(); return back(res, 'a filled bar pays $' + config.LAB_PAY_MIN_USD + '–$' + config.LAB_PAY_MAX_USD + ' of $QI · bars x' + config.GOAL_MUL);
      }
      if (p === '/admin/task') {
        const t = engine.postTask({ kind: b.kind, bounty: Math.max(0, Number(b.bounty) || 0) }, 'the operator');
        if (!t) return back(res, 'the box already has three things lying about; wait for the cats to clear one', true);
        return back(res, `dropped ${t.title} into the box (tier ${t.tier})`);
      }
      if (p === '/admin/release') { if (b.name) engine.setReleased([b.name]); return back(res, b.name + ' released'); }
      if (p === '/admin/unrelease') { const ok = b.name && engine.unrelease(b.name); return back(res, ok ? b.name + ' taken out' : 'not in the box', !ok); }
      if (p === '/admin/trait') { const ok = b.name && engine.setTrait(b.name, b.trait); return back(res, ok ? b.name + ' is now ' + b.trait : 'no change', !ok); }
      if (p === '/admin/refresh') { await pollBalances(); await pollMarket(); return back(res, 'balances refreshed'); }
      if (p === '/admin/chain') {
        const ch = config.chain; ch.mode = ['off', 'test', 'live'].includes(b.mode) ? b.mode : 'off'; ch.buyQi = true; ch.testFlat = 0.001;
        if ('PRICE_MUL' in b && b.PRICE_MUL !== '') { config.PRICE_MUL = Math.max(0.1, Math.min(20, Number(b.PRICE_MUL) || 1)); engine.setPriceMul(config.PRICE_MUL); }
        if ('PACE_MIN' in b && b.PACE_MIN !== '') { config.PACE_MIN = Math.max(0, Math.min(120, Number(b.PACE_MIN) || 0)); engine.setPace(config.PACE_MIN); }
        if ('fundForm' in b) ch.fundSwaps = !!b.fundSwaps;
        applyChainMode(); saveConfig(); return back(res, 'economy: ' + ({ off: 'sandbox', test: 'default testing — every price 0.001 SOL', live: 'default — real prices' })[ch.mode] + ' · prices x' + config.PRICE_MUL);
      }
      if (p === '/admin/payowed') { const n = engine.retryUnpaid(); return back(res, n ? n + ' payout' + (n === 1 ? '' : 's') + ' queued again' : 'nothing waiting'); }
      if (p === '/admin/distribute') {
        const what = [b.sol > 0 ? Number(b.sol).toFixed(3) + ' SOL' : '', Number(b.qcatEach) > 0 ? Math.floor(Number(b.qcatEach)).toLocaleString('en-US') + ' ' + config.TICKER + ' each' : ''].filter(Boolean).join(' + ') || 'nothing';
        const j = queueJob('distribute', `distribute ${what}`, () => distribute(b)); const ahead = adminJobs.filter(x => x.state === 'queued' && x !== j).length + (busy ? 1 : 0);
        return back(res, `queued: ${j.label}` + (ahead ? ` (${ahead} ahead of it)` : ' (starts now)') + ' — see Pending');
      }
      if (p === '/admin/sell') {
        const released = new Set(engine.cats.map(c => c.name));
        const names = b.name ? [b.name] : wallets.ROSTER_NAMES.filter(n => released.has(n) && b['sel_' + n]);
        if (!names.length) return back(res, 'no cat is ticked', true);
        queueJob('sell', `sell ${b.pct}% of ${names.length} cats' ${b.tok || 'qcats'}`, async () => (await sellMany(names, b.pct, b.tok || 'qcats')).msg);
        return back(res, 'queued — see Pending');
      }
      if (p === '/admin/collect') { // everything the ticked cats hold, back to the treasury
        const ws = wallets.load(); if (!ws.ready || !RPC_URL) return back(res, 'wallets or RPC not ready', true);
        const names = wallets.ROSTER_NAMES.filter(n => b['col_' + n]); if (!names.length) return back(res, 'no cat is ticked', true);
        const what = { sol: !!b.colSol, qcat: !!b.colQcat && !!config.CA, qi: !!b.colQi && !!config.QI_MINT }; if (!what.sol && !what.qcat && !what.qi) return back(res, 'nothing ticked to send', true);
        queueJob('collect', `pull ${[what.sol ? 'SOL' : '', what.qcat ? config.TICKER : '', what.qi ? '$QI' : ''].filter(Boolean).join(' + ')} back from ${names.length} cats`, async () => {
          const parts = [], errs = [];
          await pollBalances();
          for (const n of names) {
            const catW = ws.cats.find(c => c.name === n), bal = balances.cats[n] || {};
            try {
              if (what.qcat && bal.qcatRaw > 0) { const { sigs } = await wallets.transferToken(RPC_URL, ws, catW.kp, config.CA, [{ pub: ws.treasury.pub, raw: bal.qcatRaw }], `${config.TICKER} · ${n} · back to the treasury`); parts.push(`${n}: ${Math.floor(bal.qcat).toLocaleString('en-US')} ${config.TICKER} ${sigs[0].slice(0, 8)}…`); chainNote({ id: 'C', type: 'collect', cat: n, to: 'treasury', sol: null, memo: `${Math.floor(bal.qcat).toLocaleString('en-US')} ${config.TICKER} back to the treasury`, ok: true, sig: sigs[0] }); }
              if (what.qi && bal.qiRaw > 0) { const { sigs } = await wallets.transferToken(RPC_URL, ws, catW.kp, config.QI_MINT, [{ pub: ws.treasury.pub, raw: bal.qiRaw }], `${config.TICKER} · ${n} · $QI back to the treasury`); parts.push(`${n}: ${Math.floor(bal.qi).toLocaleString('en-US')} $QI ${sigs[0].slice(0, 8)}…`); chainNote({ id: 'C', type: 'collect', cat: n, to: 'treasury', sol: null, memo: `${Math.floor(bal.qi).toLocaleString('en-US')} $QI back to the treasury`, ok: true, sig: sigs[0] }); }
              if (what.sol && bal.sol > 0.00002) { const r = await wallets.sweepSol(RPC_URL, ws, catW.kp, ws.treasury.pub, `${config.TICKER} · ${n} · SOL back to the treasury`); parts.push(`${n}: ${r.sol.toFixed(6)} SOL ${r.sig.slice(0, 8)}…`); chainNote({ id: 'C', type: 'collect', cat: n, to: 'treasury', sol: r.sol, memo: 'all SOL back to the treasury', ok: true, sig: r.sig }); }
            } catch (e) { errs.push(`${n}: ${e.message}`); chainNote({ id: 'C', type: 'collect', cat: n, to: 'treasury', sol: null, memo: 'back to the treasury', ok: false, err: String(e.message).slice(0, 160) }); console.error('collect', n, e.message); }
          }
          pollBalances();
          return (parts.length ? 'sent to the treasury — ' + parts.join(' · ') : 'nothing to send') + (errs.length ? ' · failed: ' + errs.join(' · ') : '');
        });
        return back(res, 'queued — see Pending');
      }
      if (p === '/admin/topup') { // every ticked cat below the target gets the difference from the treasury, in one transaction
        const ws = wallets.load(); if (!ws.ready || !RPC_URL) return back(res, 'wallets or RPC not ready', true);
        const target = Math.max(0.002, Math.min(5, Number(b.target) || 0)); if (!(target > 0)) return back(res, 'enter a target balance', true);
        const names = wallets.ROSTER_NAMES.filter(n => b['dist_' + n]); if (!names.length) return back(res, 'no cat is ticked', true);
        queueJob('topup', `top up ${names.length} cats to ${target.toFixed(3)} SOL`, async () => {
          await pollBalances();
          const outs = names.map(n => ({ name: n, pub: ws.cats.find(c => c.name === n).pub, sol: Math.round((target - ((balances.cats[n] || {}).sol || 0)) * 1e6) / 1e6 })).filter(o => o.sol >= 0.0002);
          if (!outs.length) return 'every ticked cat is already at or above ' + target.toFixed(3) + ' SOL';
          const need = outs.reduce((a, o) => a + o.sol, 0), tre = balances.treasury && balances.treasury.sol;
          if (typeof tre === 'number' && need > tre - 0.01) throw new Error(`treasury has ${tre.toFixed(4)} SOL; ${need.toFixed(4)} needed`);
          const sig = await wallets.transferSol(RPC_URL, ws, ws.treasury.kp, outs, `${config.TICKER} · top-up`, true);
          for (const o of outs) { engine.noteFund(o.name, o.sol, sig); chainNote({ id: 'T', type: 'topup', cat: 'treasury', to: o.name, sol: o.sol, memo: 'top-up to ' + target.toFixed(3) + ' SOL', ok: true, sig }); }
          config.lastTreasurySol = (tre || 0) - need; saveConfig(); pollBalances();
          return `topped up ${outs.map(o => o.name + ' +' + o.sol.toFixed(4)).join(', ')} · ${sig.slice(0, 8)}…`;
        });
        return back(res, 'queued — see Pending');
      }
      if (p === '/admin/puppet') { const act = String(b.act || ''), tok = act === 'buyqi' || act === 'sellqi' ? 'qi' : act === 'buyqcats' || act === 'sellqcats' ? 'qcats' : null, a = act.replace(/qi$|qcats$/, ''); const r = engine.puppet(String(b.name || ''), a, { tok }); return back(res, r, /no such|nobody|try after/.test(r)); }
      if (p === '/admin/reset') { if (b.confirm !== 'RESET') return back(res, 'type RESET to confirm', true); resetBox(); return back(res, 'box reset to day zero'); }
      if (p === '/admin/wallets/generate') {
        const ws = wallets.load(); if (ws.ready) return back(res, 'wallets already set', true);
        return send(res, 200, adminPage({ generated: wallets.generate(engine.ROSTER.map(r => r[0])), logs: [] }), 'text/html');
      }
    }
    send(res, 404, 'not found', 'text/plain');
  } catch (e) { console.error(e); send(res, 500, 'error: ' + e.message, 'text/plain'); }
});
server.listen(PORT, () => console.log(`brain listening on :${PORT}`));
