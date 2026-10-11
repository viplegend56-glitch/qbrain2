// The admin page: one HTML page, basic-auth protected, styled like the site. Controls behaviour and the two money actions — never keys.
'use strict';
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const usd = v => v == null ? '—' : (v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'K' : '$' + Math.round(v));
const sol = v => v == null ? '—' : v.toFixed(4) + ' SOL';
const num = v => v == null ? '—' : Math.round(v).toLocaleString('en-US');
const ago = ms => ms ? Math.round((Date.now() - ms) / 1000) + 's ago' : 'never';
const short = pub => pub ? pub.slice(0, 4) + '…' + pub.slice(-4) : '';
const addr = pub => pub ? `<span class="addr" data-copy="${esc(pub)}" title="click to copy"><code>${short(pub)}</code></span> <a class="sc" href="https://solscan.io/account/${esc(pub)}" target="_blank" rel="noopener" title="solscan">↗</a>` : '<span class="mut">no wallet</span>';

function renderAdmin({ config, engine, market, marketQi, chainLog, wallets, balances, logs, flash, err, env, generated, busy }) {
  marketQi = marketQi || {}; chainLog = chainLog || []; const ch = config.chain || { mode: 'off' };
  const snap = engine.snapshot();
  const inBox = new Set(snap.cats.map(c => c.name));
  const tre = balances && balances.treasury ? balances.treasury.sol : null;
  const maxDist = tre != null ? Math.max(0, Math.floor((tre - 0.005) * 1000) / 1000) : 0;
  const css = `
  :root{--bg:#070A1A;--panel:rgba(9,13,32,.92);--line:rgba(92,242,255,.2);--line2:rgba(92,242,255,.45);--cyan:#5CF2FF;--gold:#F7C86A;--magenta:#FF4FAE;--green:#5CFFAA;--text:#E6ECFF;--muted:#8C97C2}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 "IBM Plex Sans",system-ui,sans-serif}
  a{color:var(--cyan)}code{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:12.5px}
  .wrap{max-width:1100px;margin:0 auto;padding:24px 20px 60px}
  h1{font:700 26px "Chakra Petch",sans-serif;margin:0 0 4px}h1 span{color:var(--cyan)}
  .sub{color:var(--muted);font-family:"IBM Plex Mono",monospace;font-size:12.5px;margin-bottom:20px}
  .flash{background:rgba(92,255,170,.12);border:1px solid rgba(92,255,170,.5);padding:8px 12px;margin:0 0 16px;font-family:"IBM Plex Mono",monospace;font-size:13px;word-break:break-word}
  .flash.bad{background:rgba(255,79,174,.1);border-color:rgba(255,79,174,.6)}
  .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:18px}
  .tile{border:1px solid var(--line);background:var(--panel);padding:12px 14px}.tile small{display:block;color:var(--muted);font-family:"IBM Plex Mono",monospace;font-size:11px}.tile b{font:700 20px "Chakra Petch",sans-serif;color:var(--gold)}
  .tile.c b{color:var(--cyan)}.tile.g b{color:var(--green)}.tile.m b{color:var(--magenta)}
  .panel{border:1px solid var(--line);background:var(--panel);margin-bottom:18px}
  .ph{padding:10px 14px;border-bottom:1px solid var(--line);font:600 13px "Chakra Petch",sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--cyan);display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
  .ph small{font:12px "IBM Plex Mono",monospace;letter-spacing:0;text-transform:none}
  .pb{padding:14px}
  label{display:block;font-family:"IBM Plex Mono",monospace;font-size:11.5px;color:var(--muted);margin:10px 0 4px}
  input[type=text],input[type=number]{width:100%;padding:8px 10px;background:#0B1028;border:1px solid var(--line2);color:var(--text);font-family:"IBM Plex Mono",monospace;font-size:13px}
  input[type=range]{width:100%;accent-color:var(--cyan)}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}.row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 16px}
  .btn{display:inline-block;padding:9px 16px;background:var(--cyan);color:#041018;border:0;font:600 13px "Chakra Petch",sans-serif;letter-spacing:.06em;cursor:pointer;margin-top:12px}
  .btn.ghost{background:transparent;color:var(--text);border:1px solid var(--line2)}.btn.warn{background:var(--magenta);color:#fff}.btn.gold{background:var(--gold)}
  .btn:disabled{opacity:.4;cursor:not-allowed}
  .mini{margin:0;padding:3px 8px;font-size:11px}
  table{width:100%;border-collapse:collapse;font-family:"IBM Plex Mono",monospace;font-size:12.5px}th{text-align:left;color:var(--muted);font-weight:500;padding:6px 8px;border-bottom:1px solid var(--line)}td{padding:7px 8px;border-top:1px solid var(--line);vertical-align:top}
  .chk{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;font-family:"IBM Plex Mono",monospace;font-size:12.5px}.chk label{display:flex;align-items:center;gap:8px;margin:0;color:var(--text)}.chk label.off{color:var(--muted);opacity:.6}
  .ok{color:var(--green)}.bad{color:var(--magenta)}.mut{color:var(--muted)}
  .log{font-family:"IBM Plex Mono",monospace;font-size:12px;max-height:320px;overflow:auto}.log div{padding:4px 0;border-top:1px solid var(--line)}.log .t{color:var(--muted);margin-right:8px}.gain{color:var(--gold)}.loss{color:var(--magenta)}.link{color:#B9A6FF}
  .secret{background:#120A14;border:1px solid var(--magenta);padding:12px;word-break:break-all}
  form.inline{display:inline}
  .addr{cursor:pointer;border-bottom:1px dotted var(--line2)}.addr.did{color:var(--green)}.sc{text-decoration:none;font-size:12px}
  .big{font:700 28px "Chakra Petch",sans-serif;color:var(--gold)}
  .dist{display:grid;grid-template-columns:1fr auto;gap:16px;align-items:end}
  select{background:#0B1028;color:var(--text);border:1px solid var(--line2);font:11px "IBM Plex Mono",monospace;padding:2px 4px}
  .foot{margin-top:30px;color:var(--muted);font-family:"IBM Plex Mono",monospace;font-size:11px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
  .selall{display:inline-flex;gap:6px;margin-top:10px}
  .foot input{width:110px;padding:3px 6px;font-size:11px}.foot button{padding:3px 8px;font-size:11px;margin:0;background:transparent;color:var(--muted);border:1px solid var(--line);cursor:pointer}
  @media(max-width:800px){.grid{grid-template-columns:1fr 1fr}.row,.row3{grid-template-columns:1fr}.chk{grid-template-columns:1fr 1fr}.dist{grid-template-columns:1fr}}`;

  const catRows = engine.ROSTER.map(([name, job, trait], i) => {
    const c = snap.cats.find(x => x.name === name);
    const w = wallets.ready ? wallets.cats[i] : null;
    const b = balances && balances.cats && balances.cats[name];
    return `<tr><td><b>${esc(name)}</b><br><span class="mut">${esc(job)}</span></td>
      <td>${c ? `<span class="ok">in the box</span><br><form class="inline" method="post" action="/admin/unrelease" onsubmit="return confirm('Take ${esc(name)} out of the box?')"><input type="hidden" name="name" value="${esc(name)}"><button class="btn ghost mini">take out</button></form>` : `<span class="mut">at ${usd(engine.UNLOCK_MC[i])} MC</span><br><form class="inline" method="post" action="/admin/release"><input type="hidden" name="name" value="${esc(name)}"><button class="btn ghost mini">release now</button></form>`}</td>
      <td>${c ? `<form class="inline" method="post" action="/admin/trait"><input type="hidden" name="name" value="${esc(name)}"><select name="trait" onchange="this.form.submit()">${Object.keys(engine.TRAITS).map(t => `<option value="${t}" ${t === c.trait ? 'selected' : ''}>${esc(engine.TRAITS[t].label)}</option>`).join('')}</select></form>` : `<span class="mut">${esc(engine.TRAITS[trait] ? engine.TRAITS[trait].label : trait)}</span>`}</td>
      <td>${c ? sol(c.earned) : '—'}</td>
      <td>${addr(w && w.pub)}</td>
      <td>${b ? `<b>${sol(b.sol)}</b>${b.sol < (config.gas && config.gas.min || 0.002) ? ' <span class="bad">low gas</span>' : ''}<br>${b.qcat == null ? '<span class="mut">set CA for tokens</span>' : num(b.qcat) + ' ' + esc(config.TICKER)}${b.qi != null ? '<br>' + num(b.qi) + ' $QI' : (config.QI_MINT ? '' : '<br><span class="mut">set the $QI mint</span>')}` : '<span class="mut">—</span>'}</td>
</tr>`;
  }).join('');

  const checks = (prefix, cls, okFn) => engine.ROSTER.map(([name]) => {
    const on = inBox.has(name) && okFn(name);
    return `<label class="${on ? '' : 'off'}"><input type="checkbox" name="${prefix}_${esc(name)}" class="${cls}" ${on ? 'checked' : 'disabled'}> ${esc(name)}${inBox.has(name) ? (on ? '' : ' <span class="mut">(no tokens)</span>') : ' <span class="mut">(not released)</span>'}</label>`;
  }).join('');
  const allNone = cls => `<span class="selall"><button type="button" class="btn ghost mini" data-all="${cls}">select all</button> <button type="button" class="btn ghost mini" data-none="${cls}">unselect all</button></span>`;
  const inNames = engine.ROSTER.map(r => r[0]).filter(n => inBox.has(n));
  const shares = engine.workShares(inNames), labShares = engine.labShares(inNames);
  const distChecks = engine.ROSTER.map(([name]) => {
    const on = inBox.has(name);
    return `<label class="${on ? '' : 'off'}"><input type="checkbox" name="dist_${esc(name)}" class="dchk" ${on ? 'checked' : 'disabled'}> ${esc(name)}${on ? ` <span class="mut">${Math.round((shares[name] || 0) * 100)}% SOL · ${Math.round((labShares[name] || 0) * 100)}% $QI</span>` : ' <span class="mut">(not released)</span>'}</label>`;
  }).join('');
  const treQi = balances && balances.treasury && typeof balances.treasury.qi === 'number' ? balances.treasury.qi : null;
  const sellChecks = checks('sel', 'schk', n => { const b = balances && balances.cats && balances.cats[n]; return !!(b && (b.qcat > 0 || b.qi > 0)); });
  const a = config.auto || {};
  const mins = ms => ms ? Math.max(0, Math.round((ms - Date.now()) / 60000)) + ' min' : '—';

  const genBlock = generated ? `<div class="panel"><div class="ph"><span>New wallets — shown once</span></div><div class="pb">
    <p><b>Copy these into your host's environment variables now.</b> They are not stored anywhere on this server. Close this page and they are gone. After adding them, redeploy the service.</p>
    <label>TREASURY_KEY</label><div class="secret"><code>${esc(generated.TREASURY_KEY)}</code></div>
    <label>CAT_KEYS (ten keys, roster order)</label><div class="secret"><code>${esc(generated.CAT_KEYS)}</code></div>
    <label>Public addresses (safe to share)</label><table><tr><th>wallet</th><th>address</th></tr><tr><td>treasury</td><td><code>${esc(generated.treasury.pub)}</code></td></tr>${generated.cats.map(c => `<tr><td>${esc(c.name)}</td><td><code>${esc(c.pub)}</code></td></tr>`).join('')}</table>
  </div></div>` : '';

  const walletsReady = wallets.ready && env.RPC_URL;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>brain · admin</title>
  <link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500&display=swap" rel="stylesheet"><style>${css}</style></head><body><div class="wrap">
  <h1>${esc(config.NAME)} <span>· brain</span></h1>
  <div class="sub">day ${snap.day} · ${esc(snap.clock)} in the box · up ${Math.round(process.uptime() / 60)} min · rpc ${env.RPC_URL ? '<span class="ok">set</span>' : '<span class="bad">RPC_URL not set</span>'} · wallets ${wallets.ready ? '<span class="ok">loaded</span>' : '<span class="bad">' + esc(wallets.reason) + '</span>'} · fees ${env.simulateFees ? '<span class="mut">simulated (no CA yet)</span>' : '<span class="ok">real</span>'} · ai dialogue ${env.llm && env.llm.enabled ? '<span class="ok">on</span> <span class="mut">(' + esc(env.llm.model) + (env.llm.calls ? ' · ' + env.llm.ok + '/' + env.llm.calls + ' ok' : '') + ')</span>' + (env.llm.lastErr ? ' <span class="bad">' + esc(env.llm.lastErr.slice(0, 80)) + '</span>' : '') : '<span class="mut">off (set LLM_API_KEY)</span>'}${busy ? ' · <span class="bad">transaction running…</span>' : ''}</div>
  ${flash ? `<div class="flash">${esc(flash)}</div>` : ''}${err ? `<div class="flash bad">${esc(err)}</div>` : ''}
  ${genBlock}
  <div class="grid">
    <div class="tile c"><small>market cap</small><b>${usd(snap.mkt.mcapUsd)}</b><small>${market.ok ? 'live · dexscreener · ' + ago(market.at) : 'simulated · ' + esc(market.err || '')}</small></div>
    <div class="tile"><small>treasury wallet</small><b>${tre != null ? sol(tre) : '—'}</b><small>${balances && balances.at ? 'read ' + ago(balances.at) : (wallets.ready ? (env.RPC_URL ? 'reading…' : 'set RPC_URL') : 'no wallets')}${balances && balances.err ? ' · <span class="bad">' + esc(balances.err.slice(0, 60)) + '</span>' : ''}</small></div>
    <div class="tile g"><small>fees landed (real, total)</small><b>${sol(config.feesSeenSol || 0)}</b><small>paid out so far ${sol(snap.stats.wages)}</small></div>
    <div class="tile"><small>cats in the box</small><b>${snap.cats.length} / 10</b><small>survival prices x${(snap.priceMul || 1).toFixed(1)} · SOL $${config.SOL_USD ? Number(config.SOL_USD).toFixed(0) : '—'}</small></div>
  </div>

  <form method="post" action="/admin/config">
  <div class="panel"><div class="ph"><span>Token</span><small class="mut">the site copies this CA from the top-right button and the $${esc(config.TICKER)} page</small></div><div class="pb">
    <label>Contract address (CA) — paste it the moment the coin exists; market cap, token balances and the site's CA button go live from this</label><input type="text" name="CA" value="${esc(config.CA)}" placeholder="not launched yet">
    <label>X link</label><input type="text" name="X_URL" value="${esc(config.X_URL)}" placeholder="https://x.com/…">
    <label>$QI mint — the token the lab pays. Send the supply to the treasury wallet; its balance is the lab's pool${marketQi.ok ? ` · chart: ${marketQi.priceSol ? marketQi.priceSol.toExponential(2) + ' SOL per $QI' : '—'}` : marketQi.err && config.QI_MINT ? ` · <span class="bad">${esc(marketQi.err.slice(0, 50))}</span>` : ''}</label><input type="text" name="QI_MINT" value="${esc(config.QI_MINT || '')}" placeholder="$QI contract address">
    <button class="btn">Save</button>
  </div></div>
  </form>

  <div class="panel"><div class="ph"><span>Treasury → cats · payroll</span><small>${wallets.ready ? `treasury ${addr(wallets.treasury.pub)}` : '<span class="bad">no wallets loaded</span>'}</small></div><div class="pb">
    ${walletsReady ? `
    <p class="mut" style="margin:0 0 6px">Claim your creator fees on pump.fun and send them to the treasury address above. They show up here within 30 seconds and the site logs "creator fees landed". Then pick how much to pay out — it is split between the ticked cats by how much quantum work each one has done since the last payout (the % next to each name).</p>
    <form method="post" action="/admin/payowed" class="inline" style="margin:0 0 14px" onsubmit="return confirm('Pay every cat exactly what it is owed right now?')"><button class="btn gold" ${busy ? 'disabled' : ''}>Pay what is owed now</button> <span class="mut">${(() => { const o = engine.owedAll(); return o.length ? o.reduce((a, x) => a + x.sol, 0).toFixed(4) + ' SOL and ' + o.reduce((a, x) => a + x.qi, 0).toLocaleString('en-US') + ' $QI owed to ' + o.length + ' cats · next timer payout in ' + Math.max(0, Math.round((engine.payouts.next - engine.T) / 60)) + ' min' : 'nothing owed right now'; })()}</span></form>
    <form method="post" action="/admin/distribute" onsubmit="return confirm('Send ' + document.getElementById('dAmt').textContent + ' SOL and ' + (document.getElementById('dQi') ? document.getElementById('dQi').value || 0 : 0) + ' $QI from the treasury to the ticked cats?')">
      <div class="dist">
        <div>
          <label>SOL to distribute (split by chores) — treasury has ${sol(tre)} (0.005 kept for fees)</label>
          <input type="range" id="dRange" min="0" max="${maxDist}" step="0.001" value="${Math.min(maxDist, Math.max(0, Math.floor(maxDist * 0.5 * 1000) / 1000))}">
          <input type="hidden" name="sol" id="dSol" value="0">
          <label style="margin-top:10px">$QI to distribute (split by lab work) — treasury holds ${treQi != null ? num(treQi) + ' $QI' : (config.QI_MINT ? 'reading…' : 'no $QI mint set')}</label>
          <input type="number" name="qi" id="dQi" min="0" step="1" value="0" ${treQi != null ? `max="${Math.floor(treQi)}"` : 'disabled'} style="max-width:220px">
          <div class="chk" style="margin-top:12px">${distChecks}</div>${allNone('dchk')}
        </div>
        <div style="text-align:right"><div class="big"><span id="dAmt">0</span> SOL</div><div class="mut" style="font-family:'IBM Plex Mono',monospace;font-size:12px"><span id="dN">0</span> cats · SOL by chores, $QI by lab work, since the last payout</div>
          <button class="btn gold" id="dBtn" ${busy ? 'disabled data-busy="1"' : ''}>Distribute</button></div>
      </div>
    </form>` : `<p class="mut">${!wallets.ready ? 'Generate wallets below, paste the keys into the host\u2019s environment variables, redeploy.' : 'Set RPC_URL (your Helius URL) in the environment.'}</p>`}
  </div></div>

  <div class="panel"><div class="ph"><span>Cats &amp; wallets</span>
    <span style="display:flex;gap:12px;align-items:center">
      ${wallets.ready ? '' : `<form method="post" action="/admin/wallets/generate" class="inline"><button class="btn ghost mini" onclick="return confirm('Generate a fresh treasury + ten cat wallets? They are shown once.')">generate wallets</button></form>`}
      ${walletsReady ? `<form method="post" action="/admin/refresh" class="inline"><button class="btn ghost mini">refresh balances</button></form>` : ''}
    </span></div>
    ${walletsReady && (config.CA || config.QI_MINT) ? `<div class="pb" style="border-bottom:1px solid var(--line)">
      <form method="post" action="/admin/sell" onsubmit="return confirm('Sell ' + document.getElementById('sellPct').value + '% of the ticked cats\\' ' + document.getElementById('sellTok').options[document.getElementById('sellTok').selectedIndex].text + ' for SOL?')">
        <div class="dist">
          <div>
            <label>Cats → SOL — sell <b id="sellLbl" style="color:var(--text)">10%</b> of each ticked cat's holding (via Jupiter, ${(config.slippageBps / 100).toFixed(1)}% slippage)</label>
            <select name="tok" id="sellTok" style="max-width:260px">${config.CA ? `<option value="qcats">${esc(config.TICKER)}</option>` : ''}${config.QI_MINT ? `<option value="qi">$QI</option>` : ''}${config.CA && config.QI_MINT ? `<option value="auto">whatever each cat chose in the box</option>` : ''}</select>
            <input type="range" id="sellPct" name="pct" min="1" max="100" step="1" value="10">
            <div class="chk" style="margin-top:12px">${sellChecks}</div>${allNone('schk')}
          </div>
          <div style="text-align:right"><div class="big" style="color:var(--magenta)"><span id="sellBig">10%</span></div><div class="mut" style="font-family:'IBM Plex Mono',monospace;font-size:12px"><span id="sellN">0</span> cats · <span id="sellQ">0</span> ${esc(config.TICKER)} total</div>
            <button class="btn warn" id="sellBtn" ${busy ? 'disabled' : ''}>Sell</button></div>
        </div>
      </form></div>` : ''}
    <div class="pb">
    <table><tr><th>cat</th><th>status</th><th>trait</th><th>SOL earned (box)</th><th>wallet</th><th>real balance</th></tr>${catRows}</table>
  </div></div>

  <form method="post" action="/admin/chain">
  <div class="panel"><div class="ph"><span>On-chain · the cats' own transactions</span><small class="mut">${ch.mode === 'live' ? '<span class="ok">LIVE: every payment the cats make is a real transaction</span>' : ch.mode === 'dry' ? 'dry-run: logging what would be sent, sending nothing' : 'off: the box only'}</small></div><div class="pb">
    ${walletsReady ? `
    <p class="mut" style="margin:0 0 10px">Meals, heater, yard, shop, arena entries and casino stakes go cat → treasury; casino wins treasury → cat; arena wagers cat → cat. Each is one transaction with a memo (what it was) that shows on Solscan. In <b>dry-run</b> the brain logs every one and sends nothing; use that for a day first. In <b>live</b> the wallet balances become the truth for what a cat can spend.</p>
    <div class="row3">
      <div><label>mode</label><select name="mode"><option value="off" ${ch.mode === 'off' ? 'selected' : ''}>off — the box only</option><option value="dry" ${ch.mode === 'dry' ? 'selected' : ''}>dry-run — log, send nothing</option><option value="live" ${ch.mode === 'live' ? 'selected' : ''}>live — send real transactions</option></select></div>
      <div><label>cap per payment (SOL)</label><input type="number" step="0.01" min="0.001" name="maxPaySol" value="${esc(ch.maxPaySol != null ? ch.maxPaySol : 0.2)}"></div>
      <div><label>treasury pays out at most this much SOL a day in casino wins</label><input type="number" step="0.1" min="0.01" name="dayCapSol" value="${esc(ch.dayCapSol != null ? ch.dayCapSol : 2)}"></div>
    </div>
    <label style="display:flex;align-items:center;gap:8px;color:var(--text);font-size:13px;margin-top:8px"><input type="checkbox" name="buyQi" ${ch.buyQi !== false ? 'checked' : ''}> <b>Treasury buys the $QI it owes</b> <span class="mut">at payout time, through Jupiter, with SOL from the fees (otherwise it only pays from $QI it already holds)</span></label>
    <button class="btn">Save</button>
    <div style="margin-top:12px"><small class="mut">queued now: ${engine.intents.length} · last results, newest first</small>
    ${chainLog.length ? `<table style="margin-top:6px"><tr><th>when</th><th>what</th><th>SOL</th><th>result</th></tr>${chainLog.slice(0, 20).map(e => `<tr><td>${ago(e.at)}</td><td>${esc(e.cat)} → ${esc(e.to)} · ${esc(e.memo)}</td><td>${sol(e.sol)}</td><td>${e.dry ? '<span class="mut">dry-run</span>' : e.ok ? `<span class="ok">sent</span> ${addr(e.sig)}` : `<span class="bad">${esc(e.err)}</span>`}</td></tr>`).join('')}</table>` : '<div class="mut" style="margin-top:6px">nothing yet</div>'}</div>` : '<p class="mut">Needs wallets + RPC_URL.</p>'}
  </div></div>
  </form>

  <form method="post" action="/admin/auto">
  <div class="panel"><div class="ph"><span>Autopilot</span><small class="mut">runs on its own at a random moment every few minutes, so the box keeps going while you are away</small></div><div class="pb">
    ${walletsReady ? `
    <div class="row">
      <div>
        <label style="display:flex;align-items:center;gap:8px;color:var(--text);font-size:13px"><input type="checkbox" name="distribute" ${a.distribute ? 'checked' : ''}> <b>Autopilot payouts</b> <span class="mut">${a.distribute ? 'on: pays what is owed when the box’s timer fires' : 'off'}</span></label>
        <div class="row"><div><label>keep at least (SOL) in the treasury</label><input type="number" step="0.001" min="0" name="distKeep" value="${esc(a.distKeep != null ? a.distKeep : 0.02)}"></div><div><label>each run, hand out this % of the treasury's $QI (by lab work)</label><input type="number" step="1" min="0" max="100" name="qiPct" value="${esc(a.qiPct != null ? a.qiPct : 10)}"></div><div><label>extra: also hand out this % of the rest each run (0 = only pay what is owed)</label><input type="number" step="1" min="1" max="100" name="distPct" value="${esc(a.distPct != null ? a.distPct : 50)}"></div></div>
        <small class="mut">${esc(a.lastDist || '')}</small>
      </div>
      <div>
        <label style="display:flex;align-items:center;gap:8px;color:var(--text);font-size:13px"><input type="checkbox" name="sell" ${a.sell ? 'checked' : ''} ${config.CA || config.QI_MINT ? '' : 'disabled'}> <b>Auto-sell</b> <span class="mut">${!(config.CA || config.QI_MINT) ? 'needs a CA or a $QI mint' : a.sell ? 'next in ~' + mins(a.nextSell) : 'off'}</span> <span class="mut">· each cat sells whichever token it chose in the box</span></label>
        <div class="row"><div><label>each run, every released cat sells this % of its ${esc(config.TICKER)}</label><input type="number" step="0.5" min="0.5" max="100" name="sellPct" value="${esc(a.sellPct != null ? a.sellPct : 1)}"></div><div><label>never more than this % per cat per day</label><input type="number" step="1" min="1" max="100" name="sellDayCap" value="${esc(a.sellDayCap != null ? a.sellDayCap : config.sellCapPct)}"></div></div>
        <small class="mut">${esc(a.lastSell || '')}</small>
      </div>
    </div>
    <label>longest gap between runs (minutes) — each run lands at a random moment between 5 and this</label><input type="number" step="1" min="5" max="1440" name="maxMin" value="${esc(a.maxMin || 20)}" style="max-width:160px">
    <button class="btn">Save autopilot</button>` : '<p class="mut">Needs wallets + RPC_URL.</p>'}
  </div></div>
  </form>

  <form method="post" action="/admin/task">
  <div class="panel"><div class="ph"><span>Work on the ground</span><small class="mut">drop something into the box for the cats to deal with · ${esc(String((engine.board.tasks || []).filter(t => t.status === 'open').length))} waiting, ${esc(String((engine.board.tasks || []).filter(t => t.status !== 'open').length))} being dealt with, ${esc(String((engine.board.done || []).length))} done recently</small></div><div class="pb">
    <div class="row3">
      <div><label>What turns up</label><select name="kind">${Object.entries(engine.TASK_KINDS).map(([k, v]) => `<option value="${k}">${esc(v.title)} · tier ${v.tier} · ${v.q ? 'quantum' : 'chore'}</option>`).join('')}</select></div>
      <div><label>SOL on top of the normal pay (from the fee pool; 0 = none)</label><input type="number" name="bounty" min="0" step="0.0001" value="0"></div>
      <div style="align-self:end"><button class="btn">Drop it in the box</button></div>
    </div>
    ${(engine.board.tasks || []).length ? `<table style="margin-top:12px"><tr><th>tier</th><th>what</th><th>status</th></tr>${(engine.board.tasks || []).map(t => `<tr><td>${t.tier}</td><td>${esc(t.title)}${t.poster && t.poster !== 'the box' ? ' <span class="mut">(yours)</span>' : ''}</td><td>${t.status === 'open' ? 'waiting' : esc(t.by) + (t.status === 'carried' ? ' is carrying it' : ' is on its way')}</td></tr>`).join('')}</table>` : ''}
  </div></div>
  </form>

  <form method="post" action="/admin/config">
  <div class="panel"><div class="ph"><span>Economy</span><small class="mut">rules for the cats' own trading</small></div><div class="pb">
    <div class="row3">
      <div><label>Sell cap: max % of its stack a cat may sell per day</label><input type="number" step="1" min="0" max="100" name="sellCapPct" value="${esc(config.sellCapPct)}"></div>
      <div><label>Buy size: % of spare SOL a cat spends per buy</label><input type="number" step="1" min="1" max="100" name="buyPct" value="${esc(config.buyPct)}"></div>
      <div><div class="row"><div><label>a lab job pays at least ($ of $QI)</label><input type="number" step="0.5" min="0.5" name="LAB_PAY_MIN_USD" value="${esc(config.LAB_PAY_MIN_USD || 5)}"></div><div><label>and at most ($)</label><input type="number" step="0.5" min="0.5" name="LAB_PAY_MAX_USD" value="${esc(config.LAB_PAY_MAX_USD || 15)}"></div></div></div>
    </div>
    <div class="row3">
      <div><label>Fallback SOL price of one $QI (used by the box's own sells until the chart is read; 0 = built-in)</label><input type="number" step="any" min="0" name="QI_SOL" value="${esc(config.QI_SOL || 0)}"></div>
      <div><label>price multiplier: every price in the box times this (x1 = the menu as written; raise it by hand as the chart climbs)</label><input type="number" step="0.1" min="0.1" max="20" name="PRICE_MUL" value="${esc(config.PRICE_MUL || 1)}"></div>
      <div><label>payout timer: pay everything owed every N minutes (the site shows the countdown)</label><input type="number" step="1" min="5" name="payoutEveryMin" value="${esc(config.payoutEveryMin || 20)}"></div>
      <div><label>AI study notes: seconds between AI-written notes (0 = the model writes every one; needs LLM_API_KEY)</label><input type="number" step="1" min="0" name="aiStudyGapSec" value="${esc(config.aiStudyGapSec || 0)}"></div>
      <div><label style="display:flex;align-items:center;gap:8px;color:var(--text);font-size:13px"><input type="hidden" name="gasForm" value="1"><input type="checkbox" name="gasAuto" ${config.gas && config.gas.auto ? 'checked' : ''}> <b>Auto gas</b></label><small class="mut">a cat under the minimum is refilled to the floor from the treasury (one real transfer, at most every 10 min per cat)</small></div>
      <div><div class="row"><div><label>gas floor (SOL)</label><input type="number" step="0.001" min="0.001" name="gasFloor" value="${esc(config.gas ? config.gas.floor : 0.01)}"></div><div><label>refill under (SOL)</label><input type="number" step="0.0005" min="0.0005" name="gasMin" value="${esc(config.gas ? config.gas.min : 0.002)}"></div></div></div>
    </div>
    <button class="btn">Save</button>
  </div></div>
  </form>

  <div class="panel"><div class="ph"><span>Box log</span><small class="mut">latest first</small></div><div class="pb log">${logs.map(l => `<div><span class="t">${esc(l.t)}</span><span class="${esc(l.kind)}">${esc(l.text)}</span></div>`).join('') || '<span class="mut">nothing yet</span>'}</div></div>

  <div class="foot"><span>saved to ${esc(env.DATA_DIR)}</span><form method="post" action="/admin/reset" class="inline" onsubmit="return confirm('Reset the box to day zero? Cats, ledger and releases are wiped. Wallets and settings stay.')"><input type="text" name="confirm" placeholder="type RESET"> <button>reset the box</button></form></div>
  </div>
  <script>
  (function(){
    var r=document.getElementById('dRange'); if(r){ var out=document.getElementById('dSol'), amt=document.getElementById('dAmt'), n=document.getElementById('dN'), btn=document.getElementById('dBtn');
      var qi=document.getElementById('dQi'); function upd(){ var v=Number(r.value), on=document.querySelectorAll('.dchk:checked').length, q=qi?Number(qi.value)||0:0; out.value=v.toFixed(3); amt.textContent=v.toFixed(3); n.textContent=on; if(btn&&!btn.dataset.busy) btn.disabled=!(on>0&&((v>0&&v>=0.002)||q>=1)); }
      r.addEventListener('input',upd); if(qi) qi.addEventListener('input',upd); document.querySelectorAll('.dchk').forEach(function(c){c.addEventListener('change',upd)}); upd(); }
    var held=${JSON.stringify(Object.fromEntries(engine.ROSTER.map(([n]) => [n, balances && balances.cats && balances.cats[n] && balances.cats[n].qcat || 0])))};
    var sp=document.getElementById('sellPct'); if(sp){ var lbl=document.getElementById('sellLbl'), big=document.getElementById('sellBig'), sn=document.getElementById('sellN'), sq=document.getElementById('sellQ'), sb=document.getElementById('sellBtn');
      function u2(){ lbl.textContent=sp.value+'%'; big.textContent=sp.value+'%'; var on=[].slice.call(document.querySelectorAll('.schk:checked')); sn.textContent=on.length; var q=0; on.forEach(function(c){ q+=(held[c.name.replace('sel_','')]||0)*sp.value/100; }); sq.textContent=Math.round(q).toLocaleString('en-US'); if(sb&&!sb.disabled) sb.disabled=false; sb.disabled=!on.length; }
      sp.addEventListener('input',u2); document.querySelectorAll('.schk').forEach(function(c){c.addEventListener('change',u2)}); u2(); }
    document.querySelectorAll('[data-all],[data-none]').forEach(function(b){ b.addEventListener('click',function(){ var cls=b.dataset.all||b.dataset.none, on=!!b.dataset.all; document.querySelectorAll('.'+cls).forEach(function(c){ if(!c.disabled) c.checked=on; c.dispatchEvent(new Event('change')); }); }); });
    document.querySelectorAll('.addr').forEach(function(a){ a.addEventListener('click',function(){ var t=a.dataset.copy; (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){a.classList.add('did');setTimeout(function(){a.classList.remove('did')},1200)}).catch(function(){prompt('address',t)}); }); });
  })();
  </script>
  </body></html>`;
}
module.exports = { renderAdmin };
