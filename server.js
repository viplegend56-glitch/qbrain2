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
  LAB_PAY_MIN_USD: 5, LAB_PAY_MAX_USD: 15, // a lab job is worth this many dollars of $QI, by circuit size
  payoutEveryMin: 20,                   // the payout timer: everything owed is paid at once, this often
  PRICE_MUL: 1,                         // every price in the box times this; raise it by hand as the chart climbs
  chain: { mode: 'off', buyQi: true, maxPaySol: 0.2, dayCapSol: 2 }, // mode: off (the box only) · dry (log what would be sent) · live (send it). buyQi: the treasury buys the $QI it owes at payout time
  QI_SOL: 0,                            // fallback SOL price of one $QI for the box's own sells, until the chart is read
  gas: { auto: true, floor: 0.01, min: 0.002 }, // every cat keeps `floor` SOL for fees; under `min` the treasury refills it
  aiStudyGapSec: 0,                     // with an API key: the model writes every study note (0), or at most one every N seconds
  SOL_USD: 150, START_MC_USD: 3100,
  sellCapPct: 5,          // max % of its stack a cat may sell per day (enforced once the cats trade for real)
  buyPct: 15,             // % of spare SOL a cat spends per buy (same)
  slippageBps: 300,       // 3% slippage on operator sells
  paused: false,
  lastTreasurySol: null,  // last treasury balance we saw, so a rise can be logged as "fees landed"
  feesSeenSol: 0,         // total real SOL that has landed in the treasury
  auto: { distribute: false, distKeep: 0.02, distPct: 0, qiPct: 0, sell: false, sellPct: 1, sellDayCap: 5, maxMin: 20, nextDist: 0, nextSell: 0, lastDist: '', lastSell: '', soldDay: '', soldPct: {} },
};
let config = { ...DEFAULTS };
try { const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); config = { ...DEFAULTS, ...saved, auto: { ...DEFAULTS.auto, ...(saved.auto || {}) }, gas: { ...DEFAULTS.gas, ...(saved.gas || {}) }, chain: { ...DEFAULTS.chain, ...(saved.chain || {}) } }; } catch (_) {}
config.NAME = DEFAULTS.NAME; config.TICKER = DEFAULTS.TICKER; // the name and ticker come from the code, not from an old saved config
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
engine.setPaused(config.paused); engine.setLabPay(config.LAB_PAY_MIN_USD, config.LAB_PAY_MAX_USD); engine.setPayoutEvery((config.payoutEveryMin || 20) * 60); engine.setPriceMul(config.PRICE_MUL || 1);
const applyChainMode = () => { const m = (config.chain || {}).mode || 'off'; engine.setLiveTx(m === 'live' || m === 'dry'); engine.setDryRun(m === 'dry'); }; applyChainMode();
const saveState = () => { try { fs.writeFileSync(STATE_PATH, JSON.stringify({ at: Date.now(), engine: engine.snapshot() })); } catch (e) { console.error('save failed', e); } };
function resetBox() {
  logs.length = 0; engine = newEngine(); engine.setPaused(config.paused);
  if (mkt.ok && mkt.mcapUsd) engine.setMarketCapUsd(mkt.mcapUsd);
  saveState(); console.log('box reset');
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
let busy = false; // one on-chain operation at a time
async function pollBalances() {
  const ws = wallets.load();
  if (!ws.ready || !RPC_URL) return;
  try {
    balances = { at: Date.now(), err: null, ...(await wallets.balances(RPC_URL, ws, config.CA, config.QI_MINT)) };
    const t = balances.treasury && balances.treasury.sol;
    { const tq = balances.treasury && balances.treasury.qi; engine.setQiPool(typeof tq === 'number' ? tq : null, !!config.QI_MINT && typeof tq === 'number'); }
    if ((config.chain || {}).mode === 'live') engine.setLiveBalances(balances.cats); // the wallets are the truth once the box is paying for real
    if (typeof t === 'number') {
      engine.setTreasury(t);
      if (config.lastTreasurySol != null && t > config.lastTreasurySol + 0.0005) {
        const d = t - config.lastTreasurySol; config.feesSeenSol += d; engine.noteFees(d);
      }
      if (config.lastTreasurySol !== t) { config.lastTreasurySol = t; saveConfig(); }
    }
  } catch (e) { balances = { ...balances, err: String(e.message || e) }; }
}
setInterval(pollBalances, 30000); pollBalances();

// ---------- the executor: one queued intent at a time, as a real transaction (or a log line in dry-run) ----------
const chainLog = []; let chainSpentToday = { day: '', sol: 0 };
function chainNote(e) { chainLog.unshift({ ...e, at: Date.now() }); if (chainLog.length > 100) chainLog.pop(); }
async function runIntent(i) {
  const ws = wallets.load(); if (!ws.ready || !RPC_URL) throw new Error('wallets or RPC not ready');
  const catW = ws.cats.find(c => c.name === i.cat); if (!catW) throw new Error('unknown cat ' + i.cat);
  const ch = config.chain || {}; const day = new Date().toISOString().slice(0, 10); if (chainSpentToday.day !== day) chainSpentToday = { day, sol: 0 };
  const memo = `${config.TICKER} · ${i.cat} · ${i.memo}`;
  if (i.type === 'pay') { // cat -> treasury
    if (i.sol > (ch.maxPaySol || 0.2)) throw new Error(`over the per-payment cap (${i.sol} SOL)`);
    const b = balances.cats[i.cat]; if (b && b.sol - i.sol < (config.gas.min || 0.002)) throw new Error('would dip into gas');
    return wallets.transferSol(RPC_URL, ws, catW.kp, [{ pub: ws.treasury.pub, sol: i.sol }], memo, true);
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
  const ch = config.chain || {}; if (ch.mode !== 'live' && ch.mode !== 'dry') return;
  if (busy) return;
  const i = engine.takeIntent(); if (!i) return;
  engine.markIntent(i.id, 'sending');
  if (ch.mode === 'dry') { engine.intentDone(i.id, null); chainNote({ id: i.id, type: i.type, cat: i.cat, to: i.to || 'treasury', sol: i.sol, memo: i.memo, ok: true, dry: true }); return; }
  busy = true;
  try { const sig = await runIntent(i); engine.intentDone(i.id, sig); chainNote({ id: i.id, type: i.type, cat: i.cat, to: i.to || 'treasury', sol: i.sol, memo: i.memo, ok: true, sig }); console.log('chain', i.type, i.cat, i.sol, i.memo, sig); }
  catch (e) { engine.intentFailed(i.id, e.message); chainNote({ id: i.id, type: i.type, cat: i.cat, to: i.to || 'treasury', sol: i.sol, memo: i.memo, ok: false, err: String(e.message).slice(0, 160) }); console.error('chain failed', i.type, i.cat, e.message); }
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
setInterval(() => { topUpGas().catch(e => console.error('topUpGas', e)); }, 45000);

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
const adminPage = (extra = {}) => renderAdmin({ config, engine, market: mkt, marketQi: mktQi, chainLog, wallets: wallets.load(), balances, logs: logs.slice(0, 40), flash: '', err: '', busy, env: { RPC_URL: !!RPC_URL, DATA_DIR, simulateFees: simulateFees(), llm: llm.status }, ...extra });

// ---------- the two real-money actions ----------
async function distribute(b) {
  // SOL is split by the chores done since the last payout; $QI by the lab work. Either, or both, in one press.
  const ws = wallets.load(); if (!ws.ready) throw new Error('wallets not loaded');
  if (!RPC_URL) throw new Error('RPC_URL not set');
  const total = Number(b.sol) || 0, totalQi = Number(b.qi) || 0;
  if (!(total > 0) && !(totalQi > 0)) throw new Error('enter an amount of SOL, $QI or both');
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
  if (spentSol > 0) { config.lastTreasurySol = tre - spentSol; saveConfig(); }
  pollBalances();
  return parts.join(' — ');
}
// tok: 'qcats' (the project's own coin) or 'qi'. 'auto' follows what the cat's box-self sold last.
function tokFor(name, tok) {
  if (tok === 'qi') return 'qi'; if (tok === 'qcats') return 'qcats';
  const b = balances.cats[name]; return config.QI_MINT && b && b.qi > 0 && engine.sellIntent(name) === 'qi' ? 'qi' : 'qcats';
}
// the payout timer fired: pay every cat exactly what it is owed (SOL for chores, $QI for lab work) from the treasury, then tell the box
async function payOwed() {
  const ws = wallets.load(); if (!ws.ready) throw new Error('wallets not loaded');
  if (!RPC_URL) throw new Error('RPC_URL not set');
  const owed = engine.owedAll(); if (!owed.length) { engine.settle([]); return 'nothing owed'; }
  const tre = balances.treasury && balances.treasury.sol; if (typeof tre !== 'number') throw new Error('treasury balance not read yet');
  const parts = []; let paid = [];
  const solOuts = owed.filter(o => o.sol >= 0.001).map(o => ({ name: o.name, pub: ws.cats.find(c => c.name === o.name).pub, sol: o.sol }));
  const needSol = solOuts.reduce((a, o) => a + o.sol, 0);
  let solSig = null;
  if (solOuts.length) {
    if (needSol > tre - 0.01) throw new Error(`treasury has ${tre.toFixed(4)} SOL, ${needSol.toFixed(4)} is owed`);
    solSig = await wallets.transferSol(RPC_URL, ws, ws.treasury.kp, solOuts, `${config.TICKER} · payout · SOL for chores`); parts.push(`${needSol.toFixed(4)} SOL to ${solOuts.length} cats · ${solSig.slice(0, 8)}…`);
    paid = paid.concat(solOuts.map(o => ({ name: o.name, sol: o.sol, qi: 0, sig: solSig })));
  }
  const qiOuts = config.QI_MINT ? owed.filter(o => o.qi >= 1) : [];
  if (qiOuts.length) {
    let tq = balances.treasury && balances.treasury.qi, dec = balances.treasury && balances.treasury.qiDec;
    if (dec == null) { try { dec = (await wallets.mintInfo(RPC_URL, config.QI_MINT)).decimals; } catch (e) { throw new Error('could not read the $QI mint: ' + e.message); } }
    if (typeof tq !== 'number') tq = 0;
    const needQi = qiOuts.reduce((a, o) => a + o.qi, 0);
    if (needQi > tq) {
      // the treasury buys the shortfall at the market, with SOL, through Jupiter — the payout is funded by fees the way it is meant to be
      if (!(config.chain || {}).buyQi) throw new Error(`treasury holds ${Math.floor(tq)} $QI, ${needQi} is owed, and buying is off`);
      const shortQi = needQi - tq, priceSol = mktQi.priceSol; if (!(priceSol > 0)) throw new Error('no $QI price yet, cannot size the buy');
      const solIn = shortQi * priceSol * 1.03; // 3% over for slippage; whatever is left stays in the treasury as $QI
      if (solIn > tre - spentSol - needSol - 0.02) throw new Error(`treasury needs ${solIn.toFixed(4)} SOL to buy the $QI owed, has ${(tre - spentSol - needSol).toFixed(4)}`);
      const r = await wallets.jupiterSwap(RPC_URL, ws.treasury.kp, config.QI_MINT, 'buy', Math.floor(solIn * wallets.LAMPORTS), config.slippageBps);
      const got = r.outAmount / Math.pow(10, dec); tq += got; parts.push(`bought ${Math.floor(got).toLocaleString('en-US')} $QI for ${solIn.toFixed(4)} SOL · ${r.sig.slice(0, 8)}…`); console.log('treasury bought', got, '$QI for', solIn, 'SOL', r.sig);
      if (needQi > tq) throw new Error('the buy came up short; try again');
    }
    const { sigs } = await wallets.transferToken(RPC_URL, ws, ws.treasury.kp, config.QI_MINT, qiOuts.map(o => ({ pub: ws.cats.find(c => c.name === o.name).pub, raw: Math.floor(o.qi * Math.pow(10, dec)) })), `${config.TICKER} · payout · $QI for lab work`);
    parts.push(`${needQi.toLocaleString('en-US')} $QI to ${qiOuts.length} cats · ${sigs.map(x => x.slice(0, 8)).join(', ')}…`);
    for (const o of qiOuts) { const p = paid.find(x => x.name === o.name); if (p) p.qi = o.qi; else paid.push({ name: o.name, sol: 0, qi: o.qi, sig: sigs[0] }); }
  }
  // the box: settle per transaction signature so each row links to the right one
  const bySig = {}; for (const p of paid) (bySig[p.sig] = bySig[p.sig] || []).push(p);
  for (const sig of Object.keys(bySig)) engine.settle(bySig[sig], sig);
  if (!paid.length) engine.settle([]);
  if (needSol > 0) { config.lastTreasurySol = tre - needSol; saveConfig(); }
  pollBalances();
  return parts.join(' — ') || 'nothing above the minimums';
}
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
async function autoTick() {
  const a = config.auto, ws = wallets.load();
  if (!ws.ready || !RPC_URL) return;
  const now = Date.now();
  if (a.distribute) { if (!a.nextDist || a.nextDist > now + a.maxMin * 60000) { a.nextDist = when(); saveConfig(); } }
  if (a.sell && (config.CA || config.QI_MINT)) { if (!a.nextSell || a.nextSell > now + a.maxMin * 60000) { a.nextSell = when(); saveConfig(); } }
  if (busy) return;
  if (a.distribute && engine.payoutDue()) { // the box's payout timer: pay exactly what is owed
    busy = true;
    try { a.lastDist = stamp() + ' · payout: ' + await payOwed(); } catch (e) { a.lastDist = stamp() + ' · payout failed: ' + e.message; console.error('payout', e); engine.settle([]); }
    finally { busy = false; saveConfig(); }
  }
  if (a.distribute && a.distPct > 0 && now >= a.nextDist) {
    a.nextDist = when(); busy = true;
    try {
      await pollBalances();
      const tre = balances.treasury && balances.treasury.sol, names = engine.cats.map(c => c.name);
      const amount = Math.floor(Math.max(0, (tre || 0) - a.distKeep - 0.005) * a.distPct / 100 * 1000) / 1000;
      const tq = balances.treasury && balances.treasury.qi, qi = config.QI_MINT && typeof tq === 'number' ? Math.floor(tq * (a.qiPct || 0) / 100) : 0;
      if (names.length && (amount >= 0.002 || qi >= 10)) { const b = { sol: amount >= 0.002 ? amount : 0, qi: qi >= 10 ? qi : 0 }; for (const n of names) b['dist_' + n] = 'on'; a.lastDist = stamp() + ' · ' + await distribute(b); }
      else a.lastDist = stamp() + ' · skipped (treasury ' + (tre == null ? 'unread' : tre.toFixed(4) + ' SOL, nothing above the keep amount' + (config.QI_MINT ? ', no $QI to hand out' : '')) + ')';
    } catch (e) { a.lastDist = stamp() + ' · failed: ' + e.message; console.error('auto-distribute', e); }
    finally { busy = false; saveConfig(); }
  }
  if (a.sell && (config.CA || config.QI_MINT) && now >= a.nextSell && !busy) {
    a.nextSell = when(); busy = true;
    try {
      const names = engine.cats.map(c => c.name).filter(n => { const b = balances.cats[n]; if (!b) return false; return tokFor(n, 'auto') === 'qi' ? b.qi > 0 : (b.qcat > 0 && soldToday(n) + a.sellPct <= a.sellDayCap + 1e-9); });
      if (names.length) { const r = await sellMany(names, a.sellPct, 'auto'); a.lastSell = stamp() + ' · ' + r.msg; }
      else a.lastSell = stamp() + ' · skipped (every cat is at the daily cap or holds no tokens)';
    } catch (e) { a.lastSell = stamp() + ' · failed: ' + e.message; console.error('auto-sell', e); }
    finally { busy = false; saveConfig(); }
  }
}
setInterval(() => { autoTick().catch(e => console.error('autoTick', e)); }, 20000);

const callSeen = new Map();
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); const p = u.pathname;
  try {
    if (req.method === 'GET' && p === '/') return send(res, 200, 'quantum cats brain · /state.json · /admin', 'text/plain');
    if (req.method === 'GET' && p === '/health') return send(res, 200, { ok: true, up: process.uptime() });
    if (req.method === 'GET' && p === '/state.json') {
      const ws = wallets.load();
      return send(res, 200, {
        at: Date.now(),
        config: { NAME: config.NAME, TICKER: config.TICKER, CA: config.CA, X_URL: config.X_URL, SOL_USD: config.SOL_USD, sellCapPct: config.sellCapPct, QI_MINT: config.QI_MINT, gas: config.gas, chain: { mode: (config.chain || {}).mode || 'off' } },
        market: { ...mkt, qi: mktQi },
        wallets: ws.ready ? { treasury: ws.treasury.pub, cats: ws.cats.map(w => ({ name: w.name, pub: w.pub })), balances, feesSeenSol: config.feesSeenSol } : null,
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
        for (const k of ['CA', 'X_URL', 'QI_MINT']) if (k in b) config[k] = String(b[k]).trim();
        for (const k of ['sellCapPct', 'buyPct', 'slippageBps', 'QI_SOL', 'aiStudyGapSec', 'LAB_PAY_MIN_USD', 'LAB_PAY_MAX_USD', 'payoutEveryMin', 'PRICE_MUL']) if (k in b && b[k] !== '') config[k] = Number(b[k]);
        config.PRICE_MUL = Math.max(0.1, Math.min(20, config.PRICE_MUL || 1));
        if (config.LAB_PAY_MAX_USD < config.LAB_PAY_MIN_USD) config.LAB_PAY_MAX_USD = config.LAB_PAY_MIN_USD; config.payoutEveryMin = Math.max(5, config.payoutEveryMin || 20);
        if ('gasFloor' in b || 'gasMin' in b || 'gasForm' in b) { const g = config.gas; g.auto = !!b.gasAuto; if (b.gasFloor !== '' && b.gasFloor != null) g.floor = Math.max(0.001, Number(b.gasFloor)); if (b.gasMin !== '' && b.gasMin != null) g.min = Math.max(0.0005, Math.min(g.floor, Number(b.gasMin))); }
        engine.setSimulateFees(simulateFees()); engine.setQiConfig(0, config.QI_SOL); engine.setLabPay(config.LAB_PAY_MIN_USD, config.LAB_PAY_MAX_USD); engine.setPayoutEvery(config.payoutEveryMin * 60); engine.setPriceMul(config.PRICE_MUL);
        saveConfig(); pollMarket(); pollQi(); pollBalances(); return back(res, 'saved');
      }
      if (p === '/admin/auto') {
        const a = config.auto;
        a.distribute = !!b.distribute; a.sell = !!b.sell && !!(config.CA || config.QI_MINT);
        for (const k of ['distKeep', 'distPct', 'qiPct', 'sellPct', 'sellDayCap', 'maxMin']) if (k in b && b[k] !== '') a[k] = Number(b[k]);
        a.maxMin = Math.max(5, a.maxMin || 20); a.nextDist = a.distribute ? when() : 0; a.nextSell = a.sell ? when() : 0;
        saveConfig(); return back(res, 'autopilot ' + (a.distribute || a.sell ? 'on: ' + [a.distribute ? 'distribute' : '', a.sell ? 'sell' : ''].filter(Boolean).join(' + ') : 'off'));
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
        const ch = config.chain; ch.mode = ['off', 'dry', 'live'].includes(b.mode) ? b.mode : 'off'; ch.buyQi = !!b.buyQi;
        if (b.maxPaySol !== '' && b.maxPaySol != null) ch.maxPaySol = Math.max(0.001, Number(b.maxPaySol)); if (b.dayCapSol !== '' && b.dayCapSol != null) ch.dayCapSol = Math.max(0.01, Number(b.dayCapSol));
        applyChainMode(); saveConfig(); return back(res, 'on-chain mode: ' + ch.mode);
      }
      if (p === '/admin/payowed') {
        if (busy) return back(res, 'another transaction is still running', true);
        busy = true; try { return back(res, 'paid what was owed: ' + await payOwed()); } catch (e) { console.error('payowed failed', e); return back(res, 'payout failed: ' + e.message, true); } finally { busy = false; }
      }
      if (p === '/admin/distribute') {
        if (busy) return back(res, 'another transaction is still running', true);
        busy = true; try { return back(res, await distribute(b)); } catch (e) { console.error('distribute failed', e); return back(res, 'distribute failed: ' + e.message, true); } finally { busy = false; }
      }
      if (p === '/admin/sell') {
        if (busy) return back(res, 'another transaction is still running', true);
        busy = true;
        try {
          const released = new Set(engine.cats.map(c => c.name));
          const names = b.name ? [b.name] : wallets.ROSTER_NAMES.filter(n => released.has(n) && b['sel_' + n]);
          if (!names.length) return back(res, 'no cat is ticked', true);
          const r = await sellMany(names, b.pct, b.tok || 'qcats');
          return back(res, r.msg, !r.done.length);
        } finally { busy = false; }
      }
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
