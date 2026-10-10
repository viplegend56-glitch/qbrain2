// Quantum Cats — the brain.
// Runs the one shared simulation of the box, serves /state.json to the website, and a password-protected /admin.
// Phase 1: shared sim + real market cap. Phase 2: wallet addresses + balances (read-only). No transactions are signed here yet.
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
fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- config (editable from /admin, saved to disk) ----------
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const DEFAULTS = {
  NAME: 'Quantum Cats', TICKER: 'QCAT',
  CA: process.env.CA || '', BUY_URL: process.env.BUY_URL || '', CHART_URL: process.env.CHART_URL || '', X_URL: process.env.X_URL || '', TG_URL: process.env.TG_URL || '',
  SOL_USD: 150, START_MC_USD: 3100, LAB_MC_USD: 200000,
  feeShare: 0.5,          // share of claimed creator fees that goes to the cats (the rest stays in the treasury wallet for you)
  sellCapPct: 5,          // max % of its stack a cat may sell per day (enforced server-side in phase 3)
  buyPct: 15,             // % of spare SOL a cat spends per buy (phase 3)
  distribute: {},         // { catName: true/false } — unchecked cats get no wages
  paused: false,
  simulateFees: true,     // keep the simulated fee drops until real fees flow
};
let config = { ...DEFAULTS };
try { config = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) }; } catch (_) {}
const saveConfig = () => fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

// ---------- engine ----------
const logs = [];
const engine = createEngine({ ...config, SIMULATE_FEES: config.simulateFees }, { onLog: e => { logs.unshift({ ...e, at: Date.now() }); if (logs.length > 300) logs.pop(); } });
const STATE_PATH = path.join(DATA_DIR, 'state.json');
try { const snap = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); engine.restore(snap.engine); console.log('restored state from disk'); } catch (_) {}
engine.setPaused(config.paused);
for (const r of engine.ROSTER) if (!(r[0] in config.distribute)) config.distribute[r[0]] = true;

const TICK = 0.25;
let last = Date.now();
setInterval(() => {
  const now = Date.now(); let dt = (now - last) / 1000; last = now; if (dt > 2) dt = 2;
  try { engine.step(dt); } catch (e) { console.error('step failed', e); }
}, TICK * 1000);

// ---------- market cap (real once the CA is set) ----------
let mkt = { ok: false, mcapUsd: null, solUsd: null, priceUsd: null, at: 0, err: null };
async function pollMarket() {
  if (!config.CA) { engine.setMarketCapUsd(null); mkt = { ...mkt, ok: false, err: 'no CA set' }; return; }
  try {
    const m = await market.fetchToken(config.CA);
    mkt = { ok: true, ...m, at: Date.now(), err: null };
    if (m.solUsd) config.SOL_USD = m.solUsd;
    engine.setMarketCapUsd(m.mcapUsd);
  } catch (e) { mkt = { ...mkt, ok: false, err: String(e.message || e) }; }
}
setInterval(pollMarket, 30000); pollMarket();

// ---------- wallets (read-only: addresses + balances) ----------
let balances = { at: 0, err: null, cats: {}, treasury: null };
async function pollBalances() {
  const ws = wallets.load();
  if (!ws.ready || !process.env.RPC_URL) return;
  try { balances = { at: Date.now(), err: null, ...(await wallets.balances(process.env.RPC_URL, ws, config.CA)) }; }
  catch (e) { balances = { ...balances, err: String(e.message || e) }; }
}
setInterval(pollBalances, 60000); pollBalances();

// ---------- persistence ----------
setInterval(() => { try { fs.writeFileSync(STATE_PATH, JSON.stringify({ at: Date.now(), engine: engine.snapshot() })); } catch (e) { console.error('save failed', e); } }, 30000);

// ---------- http (no framework: Node's built-in server) ----------
function send(res, status, body, type = 'application/json', extra = {}) {
  const h = { 'Content-Type': type + (type.startsWith('text') || type.includes('html') ? '; charset=utf-8' : ''), 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store', ...extra };
  res.writeHead(status, h); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
const redirect = (res, to) => send(res, 303, '', 'text/plain', { Location: to });
function readBody(req) { return new Promise(r => { let d = ''; req.on('data', c => { d += c; if (d.length > 1e6) req.destroy(); }); req.on('end', () => { const out = {}; try { if ((req.headers['content-type'] || '').includes('json')) Object.assign(out, JSON.parse(d || '{}')); else for (const [k, v] of new URLSearchParams(d)) out[k] = v; } catch (_) {} r(out); }); }); }
function authed(req, res) {
  if (!ADMIN_PASSWORD) { send(res, 503, 'Set ADMIN_PASSWORD in the environment to enable /admin.', 'text/plain'); return false; }
  const [, b64] = (req.headers.authorization || '').split(' ');
  const [, pw] = Buffer.from(b64 || '', 'base64').toString().split(':');
  if (pw === ADMIN_PASSWORD) return true;
  send(res, 401, 'password required', 'text/plain', { 'WWW-Authenticate': 'Basic realm="quantum cats"' }); return false;
}
const adminPage = (extra = {}) => renderAdmin({ config, engine, market: mkt, wallets: wallets.load(), balances, logs: logs.slice(0, 40), flash: '', env: { RPC_URL: !!process.env.RPC_URL, DATA_DIR }, ...extra });

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); const p = u.pathname;
  try {
    if (req.method === 'GET' && p === '/') return send(res, 200, 'quantum cats brain · /state.json · /admin', 'text/plain');
    if (req.method === 'GET' && p === '/health') return send(res, 200, { ok: true, up: process.uptime() });
    if (req.method === 'GET' && p === '/state.json') {
      const ws = wallets.load();
      return send(res, 200, {
        at: Date.now(),
        config: { NAME: config.NAME, TICKER: config.TICKER, CA: config.CA, BUY_URL: config.BUY_URL, CHART_URL: config.CHART_URL, X_URL: config.X_URL, TG_URL: config.TG_URL, SOL_USD: config.SOL_USD, LAB_MC_USD: config.LAB_MC_USD, sellCapPct: config.sellCapPct, feeShare: config.feeShare },
        market: mkt,
        wallets: ws.ready ? { treasury: ws.treasury.pub, cats: ws.cats.map(w => ({ name: w.name, pub: w.pub })), balances } : null,
        engine: engine.snapshot(),
      });
    }
    if (p.startsWith('/admin')) {
      if (!authed(req, res)) return;
      if (req.method === 'GET' && p === '/admin') return send(res, 200, adminPage({ flash: u.searchParams.get('msg') || '' }), 'text/html');
      const b = req.method === 'POST' ? await readBody(req) : {};
      if (p === '/admin/config' && req.method === 'POST') {
        for (const k of ['CA', 'BUY_URL', 'CHART_URL', 'X_URL', 'TG_URL']) if (k in b) config[k] = String(b[k]).trim();
        for (const k of ['SOL_USD', 'LAB_MC_USD', 'feeShare', 'sellCapPct', 'buyPct']) if (k in b && b[k] !== '') config[k] = Number(b[k]);
        config.simulateFees = !!b.simulateFees;
        for (const r of engine.ROSTER) config.distribute[r[0]] = !!b['dist_' + r[0]];
        saveConfig(); pollMarket(); return redirect(res, '/admin?msg=saved');
      }
      if (p === '/admin/pause' && req.method === 'POST') { config.paused = !config.paused; engine.setPaused(config.paused); saveConfig(); return redirect(res, '/admin?msg=' + (config.paused ? 'paused' : 'resumed')); }
      if (p === '/admin/fees' && req.method === 'POST') { const n = Number(b.sol); if (n > 0) engine.dropFees(n); return redirect(res, '/admin?msg=fees+dropped'); }
      if (p === '/admin/release' && req.method === 'POST') { if (b.name) engine.setReleased([b.name]); return redirect(res, '/admin?msg=released'); }
      if (p === '/admin/wallets/generate' && req.method === 'POST') {
        const ws = wallets.load(); if (ws.ready) return redirect(res, '/admin?msg=wallets+already+set');
        return send(res, 200, adminPage({ generated: wallets.generate(engine.ROSTER.map(r => r[0])), logs: [] }), 'text/html');
      }
    }
    send(res, 404, 'not found', 'text/plain');
  } catch (e) { console.error(e); send(res, 500, 'error: ' + e.message, 'text/plain'); }
});
server.listen(PORT, () => console.log(`brain listening on :${PORT}`));
