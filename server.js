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

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const RPC_URL = process.env.RPC_URL || '';
fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- config (editable from /admin, saved to disk) ----------
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const DEFAULTS = {
  NAME: 'Quantum Cats', TICKER: 'QCAT',
  CA: process.env.CA || '', X_URL: process.env.X_URL || '',
  SOL_USD: 150, START_MC_USD: 3100, LAB_MC_USD: 200000,
  sellCapPct: 5,          // max % of its stack a cat may sell per day (enforced once the cats trade for real)
  buyPct: 15,             // % of spare SOL a cat spends per buy (same)
  slippageBps: 300,       // 3% slippage on operator sells
  paused: false,
  lastTreasurySol: null,  // last treasury balance we saw, so a rise can be logged as "fees landed"
  feesSeenSol: 0,         // total real SOL that has landed in the treasury
  auto: { distribute: false, distKeep: 0.02, distPct: 50, sell: false, sellPct: 1, sellDayCap: 5, maxMin: 20, nextDist: 0, nextSell: 0, lastDist: '', lastSell: '', soldDay: '', soldPct: {} },
};
let config = { ...DEFAULTS };
try { const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); config = { ...DEFAULTS, ...saved, auto: { ...DEFAULTS.auto, ...(saved.auto || {}) } }; } catch (_) {}
const saveConfig = () => { try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2)); } catch (e) { console.error('config save failed', e); } };
// simulated fee drops only while there is no coin yet; the moment a CA is set, the only SOL the cats get is what you distribute
const simulateFees = () => !config.CA;

// ---------- engine ----------
const logs = [];
const STATE_PATH = path.join(DATA_DIR, 'state.json');
const newEngine = () => createEngine({ ...config, SIMULATE_FEES: simulateFees() }, { onLog: e => { logs.unshift({ ...e, at: Date.now() }); if (logs.length > 300) logs.pop(); } });
let engine = newEngine();
try { const snap = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); engine.restore(snap.engine); console.log('restored state from disk'); } catch (_) {}
engine.setPaused(config.paused);
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
setInterval(pollMarket, 30000); pollMarket();
setInterval(pollSolPrice, 300000); pollSolPrice();

// ---------- wallets: balances, and "fees landed" detection ----------
let balances = { at: 0, err: null, cats: {}, treasury: null };
let busy = false; // one on-chain operation at a time
async function pollBalances() {
  const ws = wallets.load();
  if (!ws.ready || !RPC_URL) return;
  try {
    balances = { at: Date.now(), err: null, ...(await wallets.balances(RPC_URL, ws, config.CA)) };
    const t = balances.treasury && balances.treasury.sol;
    if (typeof t === 'number') {
      if (config.lastTreasurySol != null && t > config.lastTreasurySol + 0.0005) {
        const d = t - config.lastTreasurySol; config.feesSeenSol += d; engine.noteFees(d);
      }
      if (config.lastTreasurySol !== t) { config.lastTreasurySol = t; saveConfig(); }
    }
  } catch (e) { balances = { ...balances, err: String(e.message || e) }; }
}
setInterval(pollBalances, 30000); pollBalances();

// ---------- persistence ----------
setInterval(saveState, 30000);

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
const adminPage = (extra = {}) => renderAdmin({ config, engine, market: mkt, wallets: wallets.load(), balances, logs: logs.slice(0, 40), flash: '', err: '', busy, env: { RPC_URL: !!RPC_URL, DATA_DIR, simulateFees: simulateFees() }, ...extra });

// ---------- the two real-money actions ----------
async function distribute(b) {
  const ws = wallets.load(); if (!ws.ready) throw new Error('wallets not loaded');
  if (!RPC_URL) throw new Error('RPC_URL not set');
  const total = Number(b.sol);
  if (!(total > 0)) throw new Error('enter an amount');
  const released = new Set(engine.cats.map(c => c.name));
  const names = ws.cats.map(c => c.name).filter(n => released.has(n) && b['dist_' + n]);
  if (!names.length) throw new Error('no released cat is ticked');
  const tre = balances.treasury && balances.treasury.sol;
  if (typeof tre !== 'number') throw new Error('treasury balance not read yet');
  if (total > tre - 0.005) throw new Error(`treasury has ${tre.toFixed(4)} SOL; keep 0.005 for fees`);
  const each = Math.floor((total / names.length) * 1e6) / 1e6;
  if (each < 0.001) throw new Error('that is less than 0.001 SOL per cat');
  const outs = names.map(n => ({ pub: ws.cats.find(c => c.name === n).pub, sol: each }));
  const sig = await wallets.transferSol(RPC_URL, ws, ws.treasury.kp, outs);
  engine.payout(names.map(n => ({ name: n, sol: each })), sig);
  console.log('distributed', each, 'SOL to', names.join(','), sig);
  if (typeof tre === 'number') { config.lastTreasurySol = tre - each * names.length; saveConfig(); }
  pollBalances();
  return `paid ${each} SOL to ${names.length} cats · ${sig.slice(0, 8)}…`;
}
async function sellFor(name, pct) {
  const ws = wallets.load(); if (!ws.ready) throw new Error('wallets not loaded');
  if (!RPC_URL) throw new Error('RPC_URL not set');
  if (!config.CA) throw new Error('set the CA first');
  pct = Number(pct); if (!(pct > 0 && pct <= 100)) throw new Error('pick 1–100%');
  const w = ws.cats.find(c => c.name === name); if (!w) throw new Error('unknown cat');
  const bal = balances.cats[name];
  if (!bal || bal.qcatRaw == null) throw new Error(`${name}: token balance not read yet`);
  if (bal.sol < 0.003) throw new Error(`${name} has ${bal.sol.toFixed(4)} SOL — needs ~0.003 for the swap fee`);
  const raw = Math.floor(bal.qcatRaw * pct / 100);
  if (raw <= 0) throw new Error(`${name} holds no ${config.TICKER}`);
  const r = await wallets.jupiterSwap(RPC_URL, w.kp, config.CA, 'sell', raw, config.slippageBps);
  const q = raw / Math.pow(10, bal.decimals || 6), sol = r.outAmount / wallets.LAMPORTS;
  engine.noteSell(name, q, sol, r.sig);
  console.log('sold', q, config.TICKER, 'from', name, 'for', sol, 'SOL', r.sig);
  return { q, sol, sig: r.sig };
}

async function sellMany(names, pct) {
  const done = [], failed = [];
  for (const n of names) { try { const r = await sellFor(n, pct); done.push(`${n} ${r.sol.toFixed(4)} SOL`); noteSold(n, Number(pct)); } catch (e) { failed.push(`${n}: ${e.message}`); } }
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
  if (a.sell && config.CA) { if (!a.nextSell || a.nextSell > now + a.maxMin * 60000) { a.nextSell = when(); saveConfig(); } }
  if (busy) return;
  if (a.distribute && now >= a.nextDist) {
    a.nextDist = when(); busy = true;
    try {
      await pollBalances();
      const tre = balances.treasury && balances.treasury.sol, names = engine.cats.map(c => c.name);
      const amount = Math.floor(Math.max(0, (tre || 0) - a.distKeep - 0.005) * a.distPct / 100 * 1000) / 1000;
      if (names.length && amount / names.length >= 0.001) { const b = { sol: amount }; for (const n of names) b['dist_' + n] = 'on'; a.lastDist = stamp() + ' · ' + await distribute(b); }
      else a.lastDist = stamp() + ' · skipped (treasury ' + (tre == null ? 'unread' : tre.toFixed(4) + ' SOL, nothing above the keep amount') + ')';
    } catch (e) { a.lastDist = stamp() + ' · failed: ' + e.message; console.error('auto-distribute', e); }
    finally { busy = false; saveConfig(); }
  }
  if (a.sell && config.CA && now >= a.nextSell && !busy) {
    a.nextSell = when(); busy = true;
    try {
      const names = engine.cats.map(c => c.name).filter(n => { const b = balances.cats[n]; return b && b.qcat > 0 && soldToday(n) + a.sellPct <= a.sellDayCap + 1e-9; });
      if (names.length) { const r = await sellMany(names, a.sellPct); a.lastSell = stamp() + ' · ' + r.msg; }
      else a.lastSell = stamp() + ' · skipped (every cat is at the daily cap or holds no tokens)';
    } catch (e) { a.lastSell = stamp() + ' · failed: ' + e.message; console.error('auto-sell', e); }
    finally { busy = false; saveConfig(); }
  }
}
setInterval(() => { autoTick().catch(e => console.error('autoTick', e)); }, 20000);

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); const p = u.pathname;
  try {
    if (req.method === 'GET' && p === '/') return send(res, 200, 'quantum cats brain · /state.json · /admin', 'text/plain');
    if (req.method === 'GET' && p === '/health') return send(res, 200, { ok: true, up: process.uptime() });
    if (req.method === 'GET' && p === '/state.json') {
      const ws = wallets.load();
      return send(res, 200, {
        at: Date.now(),
        config: { NAME: config.NAME, TICKER: config.TICKER, CA: config.CA, X_URL: config.X_URL, SOL_USD: config.SOL_USD, LAB_MC_USD: config.LAB_MC_USD, sellCapPct: config.sellCapPct },
        market: mkt,
        wallets: ws.ready ? { treasury: ws.treasury.pub, cats: ws.cats.map(w => ({ name: w.name, pub: w.pub })), balances, feesSeenSol: config.feesSeenSol } : null,
        engine: engine.snapshot(),
      });
    }
    if (p.startsWith('/admin')) {
      if (!authed(req, res)) return;
      if (req.method === 'GET' && p === '/admin') return send(res, 200, adminPage({ flash: u.searchParams.get('msg') || '', err: u.searchParams.get('err') || '' }), 'text/html');
      if (req.method !== 'POST') return send(res, 404, 'not found', 'text/plain');
      const b = await readBody(req);
      if (p === '/admin/config') {
        for (const k of ['CA', 'X_URL']) if (k in b) config[k] = String(b[k]).trim();
        for (const k of ['LAB_MC_USD', 'sellCapPct', 'buyPct', 'slippageBps']) if (k in b && b[k] !== '') config[k] = Number(b[k]);
        engine.setLabMc(config.LAB_MC_USD); engine.setSimulateFees(simulateFees());
        saveConfig(); pollMarket(); pollBalances(); return back(res, 'saved');
      }
      if (p === '/admin/auto') {
        const a = config.auto;
        a.distribute = !!b.distribute; a.sell = !!b.sell && !!config.CA;
        for (const k of ['distKeep', 'distPct', 'sellPct', 'sellDayCap', 'maxMin']) if (k in b && b[k] !== '') a[k] = Number(b[k]);
        a.maxMin = Math.max(5, a.maxMin || 20); a.nextDist = a.distribute ? when() : 0; a.nextSell = a.sell ? when() : 0;
        saveConfig(); return back(res, 'autopilot ' + (a.distribute || a.sell ? 'on: ' + [a.distribute ? 'distribute' : '', a.sell ? 'sell' : ''].filter(Boolean).join(' + ') : 'off'));
      }
      if (p === '/admin/release') { if (b.name) engine.setReleased([b.name]); return back(res, b.name + ' released'); }
      if (p === '/admin/unrelease') { const ok = b.name && engine.unrelease(b.name); return back(res, ok ? b.name + ' taken out' : 'not in the box', !ok); }
      if (p === '/admin/trait') { const ok = b.name && engine.setTrait(b.name, b.trait); return back(res, ok ? b.name + ' is now ' + b.trait : 'no change', !ok); }
      if (p === '/admin/refresh') { await pollBalances(); await pollMarket(); return back(res, 'balances refreshed'); }
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
          const r = await sellMany(names, b.pct);
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
