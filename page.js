// The admin page: one HTML page, basic-auth protected, styled like the site. Controls behaviour only — never keys.
'use strict';
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const usd = v => v == null ? '—' : (v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'K' : '$' + Math.round(v));
const sol = v => v == null ? '—' : v.toFixed(4) + ' SOL';
const ago = ms => ms ? Math.round((Date.now() - ms) / 1000) + 's ago' : 'never';

function renderAdmin({ config, engine, market, wallets, balances, logs, flash, env, generated }) {
  const snap = engine.snapshot();
  const released = snap.cats.map(c => c.name);
  const css = `
  :root{--bg:#070A1A;--panel:rgba(9,13,32,.92);--line:rgba(92,242,255,.2);--line2:rgba(92,242,255,.45);--cyan:#5CF2FF;--gold:#F7C86A;--magenta:#FF4FAE;--green:#5CFFAA;--text:#E6ECFF;--muted:#8C97C2}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 "IBM Plex Sans",system-ui,sans-serif}
  a{color:var(--cyan)}code{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:12.5px}
  .wrap{max-width:1100px;margin:0 auto;padding:24px 20px 60px}
  h1{font:700 26px "Chakra Petch",sans-serif;margin:0 0 4px}h1 span{color:var(--cyan)}
  .sub{color:var(--muted);font-family:"IBM Plex Mono",monospace;font-size:12.5px;margin-bottom:20px}
  .flash{background:rgba(92,255,170,.12);border:1px solid rgba(92,255,170,.5);padding:8px 12px;margin:0 0 16px;font-family:"IBM Plex Mono",monospace;font-size:13px}
  .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:18px}
  .tile{border:1px solid var(--line);background:var(--panel);padding:12px 14px}.tile small{display:block;color:var(--muted);font-family:"IBM Plex Mono",monospace;font-size:11px}.tile b{font:700 20px "Chakra Petch",sans-serif;color:var(--gold)}
  .tile.c b{color:var(--cyan)}.tile.g b{color:var(--green)}.tile.m b{color:var(--magenta)}
  .panel{border:1px solid var(--line);background:var(--panel);margin-bottom:18px}
  .ph{padding:10px 14px;border-bottom:1px solid var(--line);font:600 13px "Chakra Petch",sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--cyan);display:flex;justify-content:space-between;align-items:center}
  .pb{padding:14px}
  label{display:block;font-family:"IBM Plex Mono",monospace;font-size:11.5px;color:var(--muted);margin:10px 0 4px}
  input[type=text],input[type=number]{width:100%;padding:8px 10px;background:#0B1028;border:1px solid var(--line2);color:var(--text);font-family:"IBM Plex Mono",monospace;font-size:13px}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}.row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 16px}
  .btn{display:inline-block;padding:9px 16px;background:var(--cyan);color:#041018;border:0;font:600 13px "Chakra Petch",sans-serif;letter-spacing:.06em;cursor:pointer;margin-top:12px}
  .btn.ghost{background:transparent;color:var(--text);border:1px solid var(--line2)}.btn.warn{background:var(--magenta);color:#fff}
  table{width:100%;border-collapse:collapse;font-family:"IBM Plex Mono",monospace;font-size:12.5px}th{text-align:left;color:var(--muted);font-weight:500;padding:6px 8px;border-bottom:1px solid var(--line)}td{padding:7px 8px;border-top:1px solid var(--line);vertical-align:top}
  .chk{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;font-family:"IBM Plex Mono",monospace;font-size:12.5px}.chk label{display:flex;align-items:center;gap:8px;margin:0;color:var(--text)}
  .ok{color:var(--green)}.bad{color:var(--magenta)}.mut{color:var(--muted)}
  .log{font-family:"IBM Plex Mono",monospace;font-size:12px;max-height:320px;overflow:auto}.log div{padding:4px 0;border-top:1px solid var(--line)}.log .t{color:var(--muted);margin-right:8px}.gain{color:var(--gold)}.loss{color:var(--magenta)}.link{color:#B9A6FF}
  .secret{background:#120A14;border:1px solid var(--magenta);padding:12px;word-break:break-all}
  inline{display:inline}form.inline{display:inline}
  @media(max-width:800px){.grid{grid-template-columns:1fr 1fr}.row,.row3{grid-template-columns:1fr}.chk{grid-template-columns:1fr 1fr}}`;
  const d = config.distribute || {};
  const catRows = engine.ROSTER.map(([name, job, trait], i) => {
    const c = snap.cats.find(x => x.name === name);
    const w = wallets.ready ? wallets.cats[i] : null;
    const b = balances && balances.cats && balances.cats[name];
    return `<tr><td>${esc(name)}<br><span class="mut">${esc(job)} · ${esc(trait)}</span></td>
      <td>${c ? `<span class="ok">in the box</span> <form class="inline" method="post" action="/admin/unrelease" onsubmit="return confirm('Take ${esc(name)} out of the box?')"><input type="hidden" name="name" value="${esc(name)}"><button class="btn ghost" style="margin:0;padding:3px 8px;font-size:11px">take out</button></form>` : `<span class="mut">at ${usd(engine.UNLOCK_MC[i])}</span> <form class="inline" method="post" action="/admin/release"><input type="hidden" name="name" value="${esc(name)}"><button class="btn ghost" style="margin:0;padding:3px 8px;font-size:11px">release now</button></form>`}</td>
      <td>${c ? esc(c.doing) + `<form class="inline" method="post" action="/admin/trait" style="display:block;margin-top:4px"><input type="hidden" name="name" value="${esc(name)}"><select name="trait" onchange="this.form.submit()" style="background:#0B1028;color:var(--text);border:1px solid var(--line2);font:11px 'IBM Plex Mono',monospace;padding:2px 4px">${Object.keys(engine.TRAITS).map(t => `<option value="${t}" ${t === c.trait ? 'selected' : ''}>${t} · ${esc(engine.TRAITS[t].label)}</option>`).join('')}</select></form>` : '—'}</td>
      <td>${c ? sol(c.sol) + '<br><span class="mut">sim · earned ' + sol(c.earned) + '</span>' : '—'}</td>
      <td><code>${w ? esc(w.pub) : '<span class="mut">no wallet</span>'}</code>${w ? `<br><a href="https://solscan.io/account/${esc(w.pub)}" target="_blank" rel="noopener">solscan</a>` : ''}</td>
      <td>${b ? sol(b.sol) + '<br>' + (b.qcat == null ? '<span class="mut">set CA for tokens</span>' : Math.round(b.qcat).toLocaleString() + ' ' + esc(config.TICKER)) : '<span class="mut">—</span>'}</td></tr>`;
  }).join('');
  const genBlock = generated ? `<div class="panel"><div class="ph"><span>New wallets — shown once</span></div><div class="pb">
    <p><b>Copy these into your host's environment variables now.</b> They are not stored anywhere on this server. Close this page and they are gone. After adding them, restart the service.</p>
    <label>TREASURY_KEY</label><div class="secret"><code>${esc(generated.TREASURY_KEY)}</code></div>
    <label>CAT_KEYS (ten keys, roster order)</label><div class="secret"><code>${esc(generated.CAT_KEYS)}</code></div>
    <label>Public addresses (safe to share)</label><table><tr><th>wallet</th><th>address</th></tr><tr><td>treasury</td><td><code>${esc(generated.treasury.pub)}</code></td></tr>${generated.cats.map(c => `<tr><td>${esc(c.name)}</td><td><code>${esc(c.pub)}</code></td></tr>`).join('')}</table>
  </div></div>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>brain · admin</title>
  <link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500&display=swap" rel="stylesheet"><style>${css}</style></head><body><div class="wrap">
  <h1>${esc(config.NAME)} <span>· brain</span></h1>
  <div class="sub">uptime ${Math.round(process.uptime() / 60)} min · sim clock ${esc(snap.clock)} · ${snap.paused ? '<span class="bad">PAUSED</span>' : '<span class="ok">running</span>'} · rpc ${env.RPC_URL ? '<span class="ok">set</span>' : '<span class="bad">not set</span>'} · wallets ${wallets.ready ? '<span class="ok">loaded</span>' : '<span class="bad">' + esc(wallets.reason) + '</span>'}</div>
  ${flash ? `<div class="flash">${esc(flash)}</div>` : ''}
  ${genBlock}
  <div class="grid">
    <div class="tile c"><small>market cap</small><b>${usd(snap.mkt.mcapUsd)}</b><small>${market.ok ? 'live · dexscreener · ' + ago(market.at) : 'simulated · ' + esc(market.err || '')}</small></div>
    <div class="tile"><small>treasury (sim)</small><b>${sol(snap.stats.treasury)}</b><small>fees in ${sol(snap.stats.fees)} · wages ${sol(snap.stats.wages)}</small></div>
    <div class="tile g"><small>cats in the box</small><b>${snap.cats.length} / 10</b><small>buys ${snap.stats.buys} · sells ${snap.stats.sells}</small></div>
    <div class="tile ${balances && balances.treasury ? 'g' : 'm'}"><small>treasury wallet (real)</small><b>${balances && balances.treasury ? sol(balances.treasury.sol) : '—'}</b><small>${balances && balances.at ? 'read ' + ago(balances.at) : (wallets.ready ? (env.RPC_URL ? 'reading…' : 'set RPC_URL') : 'no wallets')}</small></div>
  </div>

  <div class="panel"><div class="ph"><span>Controls</span></div><div class="pb">
    <form method="post" action="/admin/pause" class="inline"><button class="btn ${snap.paused ? '' : 'warn'}" style="margin:0">${snap.paused ? 'Resume the box' : 'Pause the box'}</button></form>
    <form method="post" action="/admin/fees" class="inline" style="margin-left:12px"><input type="number" step="0.001" min="0" name="sol" placeholder="0.05" style="width:120px;display:inline-block;padding:7px"> <button class="btn ghost" style="margin:0">drop SOL into treasury (sim)</button></form>
  </div></div>

  <form method="post" action="/admin/config">
  <div class="panel"><div class="ph"><span>Token</span><small class="mut">saved to ${esc(env.DATA_DIR)}/config.json</small></div><div class="pb">
    <label>Contract address (CA) — paste it the moment the coin exists; market cap and wallet token balances go live from this</label><input type="text" name="CA" value="${esc(config.CA)}" placeholder="not launched yet">
    <div class="row"><div><label>Buy link</label><input type="text" name="BUY_URL" value="${esc(config.BUY_URL)}"></div><div><label>Chart link</label><input type="text" name="CHART_URL" value="${esc(config.CHART_URL)}"></div></div>
    <div class="row"><div><label>X link</label><input type="text" name="X_URL" value="${esc(config.X_URL)}"></div><div><label>Telegram link</label><input type="text" name="TG_URL" value="${esc(config.TG_URL)}"></div></div>
  </div></div>
  <div class="panel"><div class="ph"><span>Economy</span></div><div class="pb">
    <div class="row3">
      <div><label>Cats' share of claimed fees (0–1)</label><input type="number" step="0.05" min="0" max="1" name="feeShare" value="${esc(config.feeShare)}"></div>
      <div><label>Sell cap: max % of stack per cat per day</label><input type="number" step="1" min="0" max="100" name="sellCapPct" value="${esc(config.sellCapPct)}"></div>
      <div><label>Buy size: % of spare SOL per buy</label><input type="number" step="1" min="1" max="100" name="buyPct" value="${esc(config.buyPct)}"></div>
    </div>
    <div class="row"><div><label>SOL price (USD)</label><input type="number" step="0.01" name="SOL_USD" value="${esc(config.SOL_USD)}"><label style="display:flex;align-items:center;gap:8px;margin-top:6px;color:var(--text)"><input type="checkbox" name="solUsdManual" ${config.solUsdManual ? 'checked' : ''}> keep this price (ignore the live feed)</label></div><div><label>The lab opens at (USD market cap)</label><input type="number" step="1000" name="LAB_MC_USD" value="${esc(config.LAB_MC_USD)}"></div></div>
    <label style="display:flex;align-items:center;gap:8px;margin-top:14px;color:var(--text)"><input type="checkbox" name="simulateFees" ${config.simulateFees ? 'checked' : ''}> keep simulated fee drops (turn off once real fees are flowing)</label>
    <label>Who gets paid — unchecked cats receive no wages</label>
    <div class="chk">${engine.ROSTER.map(r => `<label><input type="checkbox" name="dist_${esc(r[0])}" ${d[r[0]] !== false ? 'checked' : ''}> ${esc(r[0])}</label>`).join('')}</div>
    <button class="btn">Save</button>
  </div></div>
  </form>

  <div class="panel"><div class="ph"><span>Cats &amp; wallets</span>${wallets.ready ? '' : `<form method="post" action="/admin/wallets/generate" class="inline"><button class="btn ghost" style="margin:0;padding:5px 10px;font-size:12px" onclick="return confirm('Generate a fresh treasury + ten cat wallets? They are shown once.')">generate wallets</button></form>`}</div><div class="pb">
    ${wallets.ready ? `<p><span class="mut">treasury</span> <code>${esc(wallets.treasury.pub)}</code> <a href="https://solscan.io/account/${esc(wallets.treasury.pub)}" target="_blank" rel="noopener">solscan</a></p>` : '<p class="mut">No wallets loaded. Generate a set, paste the keys into the environment, restart.</p>'}
    <table><tr><th>cat</th><th>status</th><th>doing</th><th>sim SOL</th><th>wallet</th><th>real balance</th></tr>${catRows}</table>
  </div></div>

  <div class="panel" style="border-color:rgba(255,79,174,.5)"><div class="ph" style="color:var(--magenta)"><span>Danger zone</span></div><div class="pb">
    <p class="mut" style="margin:0 0 8px">Reset puts the box back to day zero: two cats, fresh wallets in the sim, empty ledger and talk, all releases undone. Token settings, links and economy are kept. Real wallets are not touched. Do this right before launch.</p>
    <form method="post" action="/admin/reset" class="inline" onsubmit="return confirm('Reset the whole box to day zero? This cannot be undone.')"><input type="text" name="confirm" placeholder="type RESET" style="width:160px;display:inline-block;padding:7px"> <button class="btn warn" style="margin:0">Reset the box</button></form>
  </div></div>

  <div class="panel"><div class="ph"><span>Box log</span><small class="mut">latest first</small></div><div class="pb log">${logs.map(l => `<div><span class="t">${esc(l.t)}</span><span class="${esc(l.kind)}">${esc(l.text)}</span></div>`).join('') || '<span class="mut">nothing yet</span>'}</div></div>
  </div></body></html>`;
}
module.exports = { renderAdmin };
