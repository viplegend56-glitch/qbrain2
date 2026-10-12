// The admin page: one HTML page, basic-auth protected, styled like the site. Controls behaviour and the two money actions — never keys.
'use strict';
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const usd = v => v == null ? '—' : (v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'K' : '$' + Math.round(v));
const sol = v => v == null ? '—' : v.toFixed(4) + ' SOL';
const num = v => v == null ? '—' : Math.round(v).toLocaleString('en-US');
const ago = ms => ms ? Math.round((Date.now() - ms) / 1000) + 's ago' : 'never';
const short = pub => pub ? pub.slice(0, 4) + '…' + pub.slice(-4) : '';
const addr = pub => pub ? `<span class="addr" data-copy="${esc(pub)}" title="click to copy"><code>${short(pub)}</code></span> <a class="sc" href="https://solscan.io/account/${esc(pub)}" target="_blank" rel="noopener" title="solscan">↗</a>` : '<span class="mut">no wallet</span>';

function renderAdmin({ config, engine, market, marketQi, mintChecks, chainLog, adminJobs, wallets, balances, logs, flash, err, env, generated, busy }) {
  marketQi = marketQi || {}; mintChecks = mintChecks || {}; adminJobs = adminJobs || []; const mc = k => mintChecks[k] ? ` · <span class="${mintChecks[k].ok ? 'ok' : 'bad'}">${esc(mintChecks[k].msg)}</span>` : ''; chainLog = chainLog || []; const ch = config.chain || { mode: 'off' };
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
      <td>${(() => { const t = c ? c.trait : trait; return esc(engine.TRAITS[t] ? engine.TRAITS[t].label : t); })()}</td>
      <td>${c ? sol(c.earned) : '—'}</td>
      <td>${addr(w && w.pub)}</td>
      <td>${b ? `<b>${sol(b.sol)}</b>${b.sol < (config.gas && config.gas.min || 0.002) ? ' <span class="bad">needs SOL</span>' : ''}${(() => { const floor = config.gas && config.gas.floor || 0.01, sp = Math.max(0, b.sol - floor); return ch.mode === 'off' ? '' : sp < 0.001 ? ' <span class="bad">empty</span>' : ` <span class="mut">${sp.toFixed(4)} to spend</span>`; })()}<br>${b.qcat == null ? '<span class="mut">set CA for tokens</span>' : num(b.qcat) + ' ' + esc(config.TICKER)}${b.qi != null ? '<br>' + num(b.qi) + ' $QI' : (config.QI_MINT ? '' : '<br><span class="mut">set the $QI mint</span>')}` : '<span class="mut">—</span>'}</td>
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
    return `<label class="${on ? '' : 'off'}"><input type="checkbox" name="dist_${esc(name)}" class="dchk" ${on ? 'checked' : 'disabled'}> ${esc(name)}${on ? ` <span class="mut">${Math.round((shares[name] || 0) * 100)}% of the SOL</span>` : ' <span class="mut">(not released)</span>'}</label>`;
  }).join('');
  const treQi = balances && balances.treasury && typeof balances.treasury.qi === 'number' ? balances.treasury.qi : null;
  const treQcat = balances && balances.treasury && typeof balances.treasury.qcat === 'number' ? balances.treasury.qcat : null;
    const a = config.auto || {};

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
    <div class="tile g"><small>paid to the cats so far</small><b>${sol(snap.stats.wages)}</b><small>${num(snap.stats.qiPaid || 0)} $QI</small></div>
    <div class="tile"><small>economy</small><b>${ch.mode === 'live' ? 'default' : ch.mode === 'test' ? 'testing' : 'sandbox'}</b><small>prices x${(snap.priceMul || 1).toFixed(1)} · SOL $${config.SOL_USD ? Number(config.SOL_USD).toFixed(0) : '—'}</small></div>
  </div>

  <form method="post" action="/admin/config">
  <div class="panel"><div class="ph"><span>Token</span><small class="mut">the site copies this CA from the top-right button and the $${esc(config.TICKER)} page</small></div><div class="pb">
    <label>Contract address (CA) — the token's mint, not the pool address; market cap, token balances and the site's CA button go live from this${mc('CA')}</label><input type="text" name="CA" value="${esc(config.CA)}" placeholder="not launched yet">
    <label>X link</label><input type="text" name="X_URL" value="${esc(config.X_URL)}" placeholder="https://x.com/…">
    <label>$QI contract address (CA) — the token's mint, not the pool address; the treasury buys what it owes and hands it out${mc('QI_MINT')}${marketQi.ok ? ` · chart: ${marketQi.priceSol ? marketQi.priceSol.toExponential(2) + ' SOL per $QI' : '—'}` : marketQi.err && config.QI_MINT ? ` · <span class="bad">${esc(marketQi.err.slice(0, 50))}</span>` : ''}</label><input type="text" name="QI_MINT" value="${esc(config.QI_MINT || '')}" placeholder="$QI contract address">
    <button class="btn">Save</button>
  </div></div>
  </form>

  <div class="panel"><div class="ph"><span>Distribute</span><small>${wallets.ready ? `treasury ${addr(wallets.treasury.pub)} · ${tre != null ? sol(tre) : '—'}${treQi != null ? ' · ' + num(treQi) + ' $QI' : ''}` : '<span class="bad">no wallets loaded</span>'}</small></div><div class="pb">
    ${walletsReady ? `
    <p class="mut" style="margin:0 0 6px">Hand out SOL (split by chores done) and the ${esc(config.TICKER)} starting stack (the same amount to every ticked cat) from the treasury. $QI is paid automatically per lab task and is not handed out here.</p>
    <form method="post" action="/admin/distribute" onsubmit="return confirm('Send ' + document.getElementById('dAmt').textContent + ' SOL and ' + (Number(document.getElementById('dQcat').value) || 0).toLocaleString('en-US') + ' ${esc(config.TICKER)} per cat from the treasury to the ticked cats?')">
      <div class="dist">
        <div>
          <label>SOL to distribute — treasury has ${sol(tre)} (0.005 kept for fees)</label>
          <input type="range" id="dRange" min="0" max="${maxDist}" step="0.001" value="0">
          <input type="hidden" name="sol" id="dSol" value="0">
          <label style="margin-top:10px">${esc(config.TICKER)} to give <b>each</b> ticked cat — treasury holds ${treQcat != null ? num(treQcat) + ' ' + esc(config.TICKER) : (config.CA ? 'reading…' : 'no CA set')}</label>
          <input type="number" name="qcatEach" id="dQcat" min="0" step="1" value="0" ${treQcat != null ? `max="${Math.floor(treQcat)}" placeholder="${esc(config.START_QCATS || 10000)}"` : 'disabled'} style="max-width:220px">
          <div class="chk" style="margin-top:12px">${distChecks}</div>${allNone('dchk')}
          <div style="margin-top:12px;padding-top:10px;border-top:1px dashed var(--line)"><label style="margin-top:0">or: top every ticked cat up to this balance (SOL) — only the ones below it, only the difference, one transaction</label>
            <div style="display:flex;gap:10px;align-items:center"><input type="number" id="tuTarget" step="0.001" min="0.002" max="5" value="0.02" style="max-width:160px"> <button type="button" class="btn ghost" id="tuBtn" style="margin-top:0" ${busy ? 'disabled' : ''}>Top up</button></div></div>
        </div>
        <div style="text-align:right"><div class="big"><span id="dAmt">0</span> SOL</div><div class="mut" style="font-family:'IBM Plex Mono',monospace;font-size:12px"><span id="dN">0</span> cats · <span id="dQcatTot">0</span> ${esc(config.TICKER)} in all</div>
          <button class="btn gold" id="dBtn" ${busy ? 'disabled data-busy="1"' : ''}>Distribute</button></div>
      </div>
    </form>` : `<p class="mut">${!wallets.ready ? 'Generate wallets below, paste the keys into the host\u2019s environment variables, redeploy.' : 'Set RPC_URL (your Helius URL) in the environment.'}</p>`}
  </div></div>

  <div class="panel"><div class="ph"><span>Payouts</span><small class="mut">per task, the moment it is done · ${esc(String(engine.payouts.n || 0))} so far</small></div><div class="pb">
    ${walletsReady ? (() => { const un = engine.payouts.unpaid || [], wait = engine.intents.filter(i => i.type === 'wage' || i.type === 'qi').length; return `
    <p class="mut" style="margin:0 0 6px">A chore pays SOL the moment it is done. A salvage job in the scrapyard pays ${esc(config.TICKER)} the moment it is done, from the treasury's own supply. The lab pays by goals: each cat picks one (the Payments bars on the site's Work page), lab work fills it, and a <b>full bar</b> pays $QI — a small bar the minimum, a big bar the maximum. One transfer from the treasury each, shown in the box only once it has landed; the treasury buys the $QI it lacks through Jupiter first, with SOL from the fees. A payout that cannot be sent is retried every ten minutes.</p>
    <div class="dist">
      <form method="post" action="/admin/payouts">
        <div class="row3">
          <div><label>a small bar pays ($ of $QI)</label><input type="number" step="0.5" min="0.5" name="LAB_PAY_MIN_USD" value="${esc(config.LAB_PAY_MIN_USD || 5)}"></div>
          <div><label>a big bar pays ($)</label><input type="number" step="0.5" min="0.5" name="LAB_PAY_MAX_USD" value="${esc(config.LAB_PAY_MAX_USD || 15)}"></div>
          <div><label>bar size × — every bar this many times longer (2 = twice the work for the same pay)</label><input type="number" step="0.1" min="0.1" max="20" name="GOAL_MUL" value="${esc(config.GOAL_MUL || 1)}"></div>
        </div>
        <label>the scrapyard: a tier-1 salvage job pays this many ${esc(config.TICKER)} from the treasury's own supply (tier 2 pays 2.5×, tier 3 pays 5×; nothing is bought — send the coin to the treasury and the yard pays from it)</label><input type="number" step="1" min="1" name="SCRAP_PAY" value="${esc(config.SCRAP_PAY || 100)}" style="max-width:220px">
        <button class="btn">Save</button>
      </form>
      <form method="post" action="/admin/payowed" style="text-align:right">
        <div class="big">${wait}</div><div class="mut" style="font-family:'IBM Plex Mono',monospace;font-size:12px">on their way now · ${un.length} could not be sent</div>
        <button class="btn gold" ${busy || !un.length ? 'disabled' : ''}>Retry now</button>
      </form>
    </div>
    ${un.length ? `<table style="margin-top:10px"><tr><th>cat</th><th>pay</th><th>for</th><th>why it failed</th></tr>${un.slice(0, 10).map(u => `<tr><td>${esc(u.cat)}</td><td>${u.sol ? sol(u.sol) : u.qcat ? Math.round(u.qcat).toLocaleString('en-US') + ' ' + esc(config.TICKER) : Math.round(u.qi).toLocaleString('en-US') + ' $QI'}</td><td>${esc(u.memo)}</td><td class="bad">${esc(u.err)}</td></tr>`).join('')}</table>` : ''}`; })() : '<p class="mut">Needs wallets + RPC_URL.</p>'}
  </div></div>

  <div class="panel"><div class="ph"><span>Cats &amp; wallets</span>
    <span style="display:flex;gap:12px;align-items:center">
      ${wallets.ready ? '' : `<form method="post" action="/admin/wallets/generate" class="inline"><button class="btn ghost mini" onclick="return confirm('Generate a fresh treasury + ten cat wallets? They are shown once.')">generate wallets</button></form>`}
      ${walletsReady ? `<form method="post" action="/admin/refresh" class="inline"><button class="btn ghost mini">refresh balances</button></form>` : ''}
    </span></div>
    <div class="pb">
    <table><tr><th>cat</th><th>status</th><th>trait</th><th>SOL earned (box)</th><th>wallet</th><th>real balance</th></tr>${catRows}</table>
  </div></div>

  <div class="panel"><div class="ph"><span>Pull back to treasury</span><small class="mut">everything the ticked cats hold, sent to the treasury wallet — for a reset, or when you are done testing</small></div><div class="pb">
    ${walletsReady ? `
    <form method="post" action="/admin/collect" onsubmit="return confirm('Send everything ticked from the ticked cats to the treasury wallet? The cats end up empty.')">
      <div class="dist">
        <div>
          <div class="chk" style="grid-template-columns:repeat(3,auto);justify-content:start;gap:18px;margin-bottom:8px">
            <label><input type="checkbox" name="colSol" checked> all SOL</label>
            <label class="${config.CA ? '' : 'off'}"><input type="checkbox" name="colQcat" ${config.CA ? 'checked' : 'disabled'}> all ${esc(config.TICKER)}${config.CA ? '' : ' <span class="mut">(no CA)</span>'}</label>
            <label class="${config.QI_MINT ? '' : 'off'}"><input type="checkbox" name="colQi" ${config.QI_MINT ? 'checked' : 'disabled'}> all $QI${config.QI_MINT ? '' : ' <span class="mut">(no $QI CA)</span>'}</label>
          </div>
          <div class="chk">${engine.ROSTER.map(([name]) => `<label><input type="checkbox" name="col_${esc(name)}" class="cchk" checked> ${esc(name)}</label>`).join('')}</div>${allNone('cchk')}
        </div>
        <div style="text-align:right"><div class="mut" style="font-family:'IBM Plex Mono',monospace;font-size:12px">tokens first, then the SOL to the last lamport<br>(a wallet left at zero is simply empty, not broken)</div>
          <button class="btn warn" ${busy ? 'disabled' : ''}>Send to treasury</button></div>
      </div>
    </form>` : '<p class="mut">Needs wallets + RPC_URL.</p>'}
  </div></div>

  <div class="panel"><div class="ph"><span>Pending</span><small class="mut">your jobs run first, one at a time; the cats' own transactions wait behind them · ${busy ? '<span class="bad">one is running now</span>' : 'idle'}</small></div><div class="pb">
    ${(() => { const q = adminJobs.filter(j => j.state === 'queued' || j.state === 'running'), done = adminJobs.filter(j => j.state === 'done' || j.state === 'failed').slice(-5).reverse(), cats = engine.intents.slice(0, 12);
      return `<div class="row">
        <div><label>your jobs</label>${q.length ? `<table>${q.map(j => `<tr><td>${j.state === 'running' ? '<span class="ok">running</span>' : 'queued'}</td><td>${esc(j.label)}</td><td class="mut">${ago(j.at)}</td></tr>`).join('')}</table>` : '<div class="mut">nothing queued</div>'}
          ${done.length ? `<label>last results</label><table>${done.map(j => `<tr><td>${j.state === 'done' ? '<span class="ok">done</span>' : '<span class="bad">failed</span>'}</td><td style="word-break:break-word">${esc(j.label)} — ${esc(String(j.result || '').slice(0, 220))}</td></tr>`).join('')}</table>` : ''}</div>
        <div><label>the cats' transactions waiting (${engine.intents.length})</label>${cats.length ? `<table>${cats.map(i => `<tr><td>${esc(i.type)}</td><td>${esc(i.cat)}${i.to ? ' → ' + esc(i.to) : ''}</td><td>${i.type === 'qcat' ? Math.round(i.q).toLocaleString('en-US') + ' ' + esc(config.TICKER) : i.sol != null && i.type !== 'qi' ? sol(i.sol) : i.qi ? Math.round(i.qi).toLocaleString('en-US') + ' $QI' : ''}</td><td class="mut">${esc(i.memo || '')}</td></tr>`).join('')}</table>` : '<div class="mut">none</div>'}</div>
      </div>`; })()}
  </div></div>

  <form method="post" action="/admin/chain">
  <div class="panel"><div class="ph"><span>Economy</span><small class="mut">${ch.mode === 'live' ? '<span class="ok">DEFAULT: every payment the cats make is a real transaction at the real prices</span>' : ch.mode === 'test' ? '<span class="ok">DEFAULT TESTING: real transactions, every price in the box 0.001 SOL</span>' : 'sandbox: the box only, nothing on-chain'}</small></div><div class="pb">
    ${walletsReady ? `
    <p class="mut" style="margin:0 0 10px"><b>Sandbox</b> is the box on its own, nothing leaves a wallet. <b>Default testing</b> sends every transaction for real but makes every price 0.001 SOL (and lab pay a hundredth), on the site too, so the plumbing can be proved for cents. <b>Default</b> is the real prices. Meals, heater, yard, shop, arena entries and casino stakes go cat → treasury; casino wins treasury → cat; arena wagers cat → cat; each with a memo that shows on Solscan.</p>
    <div class="row3">
      <div><label>mode</label><select name="mode" style="width:100%;padding:8px 10px;font-size:13px"><option value="off" ${ch.mode === 'off' ? 'selected' : ''}>sandbox — the box only</option><option value="test" ${ch.mode === 'test' ? 'selected' : ''}>default testing — real transactions, every price 0.001 SOL</option><option value="live" ${ch.mode === 'live' ? 'selected' : ''}>default — real transactions at the real prices</option></select></div>
      <div><label>price multiplier — every price in the box and on the site times this (x1 = the menu as written; raise it by hand as the chart climbs)</label><input type="number" step="0.1" min="0.1" max="20" name="PRICE_MUL" value="${esc(config.PRICE_MUL || 1)}"></div>
      <div><label>pace — minutes between one cat's paid moves in testing and default (a meal, the heater, a spin, a trade); 0 = no limit. Sandbox ignores it.</label><input type="number" step="1" min="0" max="120" name="PACE_MIN" value="${esc(config.PACE_MIN == null ? 6 : config.PACE_MIN)}"></div>
    </div>
    <div class="row" style="margin-top:6px"><input type="hidden" name="fundForm" value="1">
      <div><label style="display:flex;align-items:center;gap:8px;color:var(--text);font-size:13px;margin-top:10px"><input type="checkbox" name="fundSwaps" ${ch.fundSwaps !== false ? 'checked' : ''}> <b>The treasury funds a swap the cat cannot afford</b></label><small class="mut">a Jupiter swap needs about 0.0045 SOL over the amount (the fee and a refundable deposit, plus 0.002 for a first buy's token account). A cat short of that is sent the difference first, as its own transfer with a Solscan link, then the swap runs.</small></div>
      <div><label>top the cat up to (SOL) when that happens</label><input type="number" step="0.001" min="0.005" max="1" name="swapTopUp" value="${esc(ch.swapTopUp != null ? ch.swapTopUp : 0.01)}"></div>
    </div>
    <button class="btn">Save</button>
    </form>
    <div style="margin-top:14px;padding-top:12px;border-top:1px dashed var(--line)"><label style="margin-top:0">testing: send a cat somewhere and watch what it does (ignores pacing and its own urges; a buy or sell swaps for real in testing and default)</label>
      <form method="post" action="/admin/puppet" class="inline"><div class="row3" style="align-items:end">
        <div><select name="name" style="width:100%;padding:8px 10px;font-size:13px">${engine.ROSTER.map(([n]) => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}</select></div>
        <div><select name="act" style="width:100%;padding:8px 10px;font-size:13px">${[['eat', 'the diner — eat'], ['warm', 'the heater — warm up'], ['recohere', 'cryo — recohere'], ['play', 'the yard — play'], ['shop', 'the shop — buy something'], ['gamble', 'the casino — one spin'], ['wager', 'the arena — call somebody out'], ['buyqi', 'the exchange — buy $QI'], ['buyqcats', 'the exchange — buy ' + config.TICKER], ['sellqi', 'the exchange — sell $QI'], ['sellqcats', 'the exchange — sell ' + config.TICKER], ['work', 'the lab — run a job'], ['salvage', 'the scrapyard — take a job off the bench'], ['task', 'the ground — deal with the nearest chore'], ['entangle', 'find somebody to talk to'], ['steal', 'the bunks — a paw in a stash'], ['sleep', 'the bunks — sleep'], ['wake', 'wake up']].map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}</select></div>
        <div><button class="btn ghost" style="margin-top:0">Go</button></div>
      </div></form>
    </div>
    <form>
    <div style="margin-top:12px"><small class="mut">queued now: ${engine.intents.length} · last results, newest first</small>
    ${chainLog.length ? `<table style="margin-top:6px"><tr><th>when</th><th>what</th><th>SOL</th><th>result</th></tr>${chainLog.slice(0, 20).map(e => `<tr><td>${ago(e.at)}</td><td>${esc(e.cat)} → ${esc(e.to)} · ${esc(e.memo)}</td><td>${e.sol != null ? sol(e.sol) : ''}</td><td>${e.ok ? `<span class="ok">sent</span> ${addr(e.sig)}` : `<span class="bad">${esc(e.err)}</span>`}</td></tr>`).join('')}</table>` : '<div class="mut" style="margin-top:6px">nothing yet</div>'}</div>` : '<p class="mut">Needs wallets + RPC_URL.</p>'}
  </div></div>
  </form>

  <div class="panel"><div class="ph"><span>Box log</span><small class="mut">latest first</small></div><div class="pb log">${logs.map(l => `<div><span class="t">${esc(l.t)}</span><span class="${esc(l.kind)}">${esc(l.text)}</span></div>`).join('') || '<span class="mut">nothing yet</span>'}</div></div>

  <div class="foot"><span>saved to ${esc(env.DATA_DIR)}</span><form method="post" action="/admin/reset" class="inline" onsubmit="return confirm('Reset the box to day zero? Cats, ledger and releases are wiped. Wallets and settings stay.')"><input type="text" name="confirm" placeholder="type RESET"> <button>reset the box</button></form></div>
  </div>
  <script>
  (function(){
    var r=document.getElementById('dRange'); if(r){ var out=document.getElementById('dSol'), amt=document.getElementById('dAmt'), n=document.getElementById('dN'), btn=document.getElementById('dBtn');
      var qi=document.getElementById('dQcat'), qt=document.getElementById('dQcatTot'); function upd(){ var v=Number(r.value), on=document.querySelectorAll('.dchk:checked').length, q=qi?Number(qi.value)||0:0; out.value=v.toFixed(3); amt.textContent=v.toFixed(3); n.textContent=on; if(qt) qt.textContent=(q*on).toLocaleString('en-US'); if(btn&&!btn.dataset.busy) btn.disabled=!(on>0&&((v>0&&v>=0.002)||q>=1)); }
      r.addEventListener('input',upd); if(qi) qi.addEventListener('input',upd); document.querySelectorAll('.dchk').forEach(function(c){c.addEventListener('change',upd)}); upd(); }
    var tu=document.getElementById('tuBtn'); if(tu){ tu.addEventListener('click',function(){ var t=Number(document.getElementById('tuTarget').value)||0, on=[].slice.call(document.querySelectorAll('.dchk:checked')); if(!(t>0)||!on.length) return; if(!confirm('Top up '+on.length+' cats to '+t.toFixed(3)+' SOL from the treasury?')) return; var f=document.createElement('form'); f.method='post'; f.action='/admin/topup'; var add=function(n,v){ var i=document.createElement('input'); i.type='hidden'; i.name=n; i.value=v; f.appendChild(i); }; add('target',t); on.forEach(function(c){ add(c.name,'on'); }); document.body.appendChild(f); f.submit(); }); }
    document.querySelectorAll('[data-all],[data-none]').forEach(function(b){ b.addEventListener('click',function(){ var cls=b.dataset.all||b.dataset.none, on=!!b.dataset.all; document.querySelectorAll('.'+cls).forEach(function(c){ if(!c.disabled) c.checked=on; c.dispatchEvent(new Event('change')); }); }); });
    document.querySelectorAll('.addr').forEach(function(a){ a.addEventListener('click',function(){ var t=a.dataset.copy; (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){a.classList.add('did');setTimeout(function(){a.classList.remove('did')},1200)}).catch(function(){prompt('address',t)}); }); });
  })();
  </script>
  </body></html>`;
}
module.exports = { renderAdmin };
