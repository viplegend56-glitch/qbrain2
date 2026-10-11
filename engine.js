// engine.js — the box, headless. This is the SAME simulation that ships in the website (extracted from index.html
// between "const WS" and the effects section), wrapped so it can run on a server with no canvas or DOM.
// Do not edit the middle section by hand: regenerate it from the site with tools/extract-engine.py.
'use strict';
module.exports = function createEngine(CONFIG, hooks = {}) {
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
const fmt = n => Math.round(n).toLocaleString('en-US');
const TK = '$' + CONFIG.TICKER;
const reduce = true;
const WINC = ['92,242,255', '247,200,106', '154,123,255', '92,242,255'];
// visual effects are client-side; on the server they are events we can forward
const fx = [];
const pushFx = (kind, data) => { fx.push({ kind, ...data, t: T }); if (fx.length > 60) fx.shift(); };
const floatText = (c, text, color) => pushFx('float', { x: c.x, y: c.y, text, color });
const burst = (c, rgb, n) => pushFx('burst', { x: c.x, y: c.y, rgb, n });
const ringFX = (x, y, rgb, mult) => pushFx('ring', { x, y, rgb, mult });
const payFX = c => pushFx('pay', { id: c.id });
const buyFX = c => pushFx('buy', { id: c.id });
const feeFX = amt => pushFx('fee', { amt });
const coinFX = (c, amt) => pushFx('coin', { id: c.id, x: c.x, y: c.y, amt });
const renderUnlocks = () => {};
// talk + log + ledger
const talk = []; let talkSeq = 0;
function talkPush(m) { m.id = ++talkSeq; talk.unshift(m); if (talk.length > 80) talk.pop(); }
function say(c, text) { if (!text) return; c.bubble = text; c.bubbleT = T; talkPush({ sys: false, cat: c.id, name: c.name, coat: c.coat, eye: c.eye, text, t: clock(simMin) }); if (c.said) { c.said.unshift({ t: clock(simMin), day: dayNo(), text }); if (c.said.length > 30) c.said.pop(); } }
function log(text, kind, place) {
  if (place && placeLogs[place]) { placeLogs[place].unshift({ t: clock(simMin), text }); if (placeLogs[place].length > 6) placeLogs[place].pop(); }
  talkPush({ sys: true, kind: kind || 'info', text, t: clock(simMin) });
  if (hooks.onLog) hooks.onLog({ text, kind: kind || 'info', place: place || null, t: clock(simMin) });
}

/* ===== BEGIN extracted from the site ===== */
const WS = 1.3, BLK = 1.6 + 16.8 * WS; // the block is 30% bigger than the demo; landmarks keep their size but spread out
const M = v => 1.6 + (v - 1.6) * WS;
const BUILD = [
  { x: 2, y: 2, w: 3, d: 3, h: 7.6, tower: true },
  { x: 2, y: 5.6, w: 3, d: 3.2, h: 4.6 },
  { x: 2, y: 9.4, w: 3, d: 2.8, h: 5.8, board: 'R' },
  { x: 2, y: 12.8, w: 3, d: 2.6, h: 3.6 },
  { x: 2, y: 16, w: 3, d: 2.2, h: 2.4 },
  { x: 5.6, y: 2, w: 3.2, d: 3, h: 5.2, board: 'L' },
  { x: 9.4, y: 2, w: 2.8, d: 3, h: 3.4 },
  { x: 12.8, y: 2, w: 2.6, d: 3, h: 6.4 },
  { x: 16, y: 2, w: 2.2, d: 3, h: 4.0 },
  { x: 19.4, y: 2, w: 2.6, d: 3, h: 5.4 },
  { x: 2, y: 19.4, w: 3, d: 2.6, h: 3.2 },
];
for (const b of BUILD) {
  b.win = [];
  const floors = Math.floor((b.h - 0.5) / 0.9);
  const cl = Math.floor((b.w - 0.3) / 0.75), cr = Math.floor((b.d - 0.3) / 0.75);
  for (let j = 0; j < floors; j++) {
    for (let i = 0; i < cl; i++) b.win.push({ f: 'L', u: b.x + 0.3 + i * 0.75, z: 0.5 + j * 0.9, on: Math.random() < 0.45, c: pick(WINC), ph: Math.random() * 100 });
    for (let i = 0; i < cr; i++) b.win.push({ f: 'R', u: b.y + 0.3 + i * 0.75, z: 0.5 + j * 0.9, on: Math.random() < 0.45, c: pick(WINC), ph: Math.random() * 100 });
  }
}
const ST = {
  cryo:   { label: 'the circle',      spot: () => { const a = rand(0, TAU), r = rand(1.2, 1.6); return [M(11.6) + Math.cos(a) * r, M(11.6) + Math.sin(a) * r]; } },
  crates: { label: 'the diner',       spot: () => [rand(M(15.05), M(16.5)), rand(M(15.45), M(15.75))] },
  vent:   { label: 'the heater',      spot: () => [rand(M(11.8), M(12.9)), rand(M(16.3), M(16.9))] },
  trays:  { label: 'the scrapyard',   spot: () => [rand(M(15.6), M(16.2)), rand(M(10.4), M(12.8))] },
  loft:   { label: 'the bunks',       spot: () => [rand(M(16.6), M(17.6)), rand(M(5.6), M(6.0))] },
  exchange: { label: 'the exchange',  spot: () => [rand(M(6.9), M(7.6)), rand(M(10.9), M(12.1))] },
  arena:    { label: 'the arena',     spot: () => [rand(M(7.5), M(8.5)), rand(M(14.4), M(15.4))] },
  lab:      { label: 'the lab',       spot: () => { const taken = cats.filter(c => c.act === 'work' && JOBS[c.job].st === 'lab').map(c => [c.tx, c.ty]); const free = LAB_CONSOLES.filter(q => !taken.some(t => Math.hypot(t[0] - q[0], t[1] - q[1]) < 0.2)); const q = pick(free.length ? free : LAB_CONSOLES); return [q[0], q[1]]; } },
  yard:     { label: 'the yard',      spot: () => [rand(YARD.x + 0.4, YARD.x + YARD.w - 0.4), rand(YARD.y + 0.4, YARD.y + YARD.d - 0.4)] },
};
const ARENA = { x: M(8.0), y: M(14.9), r: 0.95, slots: [[M(7.5), M(15.25)], [M(8.5), M(14.55)]] };
const LABELS = [['vault', M(13.3), M(13.7), 2.2], ['yard', M(4.6), M(15.9), 2.0], ['lab', M(13.4), M(9.4), 3.2], ['cryo', M(11.6), M(11.6), 5.4], ['crates', M(15.8), M(14.6), 2.6], ['vent', M(12.3), M(16.5), 1.9], ['trays', M(16.9), M(11.6), 1.5], ['loft', M(17.3), M(5.85), 3.4], ['exchange', M(6.1), M(11.5), 2.4], ['arena', M(8.0), M(14.9), 1.6]];
const LAMPS = [[BLK - 0.4, M(8.7)], [BLK - 0.4, M(13.9)], [BLK - 0.4, M(17.2)], [M(6.5), BLK - 0.4], [M(12), BLK - 0.4]];
const TRACES = [
  [[M(7.2), M(10.0)], [M(7.2), M(11.6)], [M(10.5), M(11.6)]],
  [[M(12.7), M(11.6)], [M(15.0), M(11.6)], [M(15.0), M(9.6)]],
  [[M(11.6), M(12.7)], [M(11.6), M(14.6)], [M(8.7), M(14.6)]],
  [[M(11.6), M(10.5)], [M(11.6), M(8.5)], [M(10.2), M(8.5)]],
  [[M(15.0), M(11.6)], [M(16.3), M(11.6)]],
  [[M(12.4), M(12.7)], [M(12.4), M(15.9)]],
].map(pts => { const seg = []; let len = 0; for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push(l); len += l; } return { pts, seg, len, off: Math.random() * len }; });

/* ---------- the wider city + harbor ---------- */
const QUAY = BLK + 3.2; // land ends here on the two front sides; past it is the harbor
const QLAMPS = [[QUAY - 0.7, 4], [QUAY - 0.7, 11], [QUAY - 0.7, 18], [4, QUAY - 0.7], [11, QUAY - 0.7], [18, QUAY - 0.7]];
const VAULT = { x: M(13.3), y: M(13.7) };
const EXC = { x: M(6.1), y: M(11.5) }, LAB = { x: M(13.4), y: M(9.4), w: 2.6, d: 2.4 }, CRY = { x: M(11.6), y: M(11.6) }, VENT = { x: M(11.6), y: M(16.1) }, YARD = { x: M(3.4), y: M(14.8), w: 2.4, d: 2.2 };
// the lab's consoles: where a cat stands while it runs a job (along the glass front and the right side)
const LAB_CONSOLES = [[LAB.x - 0.9, LAB.y + LAB.d / 2 + 0.4], [LAB.x - 0.3, LAB.y + LAB.d / 2 + 0.4], [LAB.x + 0.3, LAB.y + LAB.d / 2 + 0.4], [LAB.x + 0.9, LAB.y + LAB.d / 2 + 0.4], [LAB.x + LAB.w / 2 + 0.4, LAB.y - 0.6], [LAB.x + LAB.w / 2 + 0.4, LAB.y + 0.1], [LAB.x + LAB.w / 2 + 0.4, LAB.y + 0.8]];
// things a cat cannot walk through: the structures on the plaza and the buildings on the back edges
const OBST = [
  { x: M(15.0), y: M(14.2), w: 1.6, d: 0.8 },          // diner (crates)
  { x: M(16.6), y: M(10.0), w: 0.6, d: 3.2 },          // scrapyard (trays)
  { x: EXC.x - 0.8, y: EXC.y - 0.8, w: 1.6, d: 1.6 },  // exchange
  { x: LAB.x - LAB.w / 2, y: LAB.y - LAB.d / 2, w: LAB.w, d: LAB.d }, // lab
  { x: VAULT.x - 0.45, y: VAULT.y - 0.45, w: 0.9, d: 0.9 }, // treasury
  { x: VENT.x - 0.6, y: VENT.y - 0.05, w: 0.5, d: 0.95 },  // heater unit
  ...BUILD.map(b => ({ x: b.x, y: b.y, w: b.w, d: b.d })),
];
const OBC = [[CRY.x, CRY.y, 0.55]]; // round ones: the beacon in the middle of the circle
// repulsion away from anything within m of (px, py); [fx, fy, strength]
function pushOut(px, py, m) {
  let fx = 0, fy = 0, best = 0;
  for (const o of OBST) {
    const nx = clamp(px, o.x, o.x + o.w), ny = clamp(py, o.y, o.y + o.d); let dx = px - nx, dy = py - ny, dd = Math.hypot(dx, dy);
    if (dd === 0) { // inside: leave by the nearest side
      const l = px - o.x, r = o.x + o.w - px, t = py - o.y, b = o.y + o.d - py, mn = Math.min(l, r, t, b);
      dx = mn === l ? -1 : mn === r ? 1 : 0; dy = mn === t ? -1 : mn === b ? 1 : 0; dd = 1; fx += dx * 2; fy += dy * 2; best = 1; continue;
    }
    if (dd < m) { const f = (m - dd) / m; fx += dx / dd * f; fy += dy / dd * f; if (f > best) best = f; }
  }
  for (const [cx, cy, r] of OBC) {
    const dx = px - cx, dy = py - cy, dd = Math.hypot(dx, dy) || 0.001;
    if (dd < r + m) { const f = clamp((r + m - dd) / m, 0, 2); fx += dx / dd * f; fy += dy / dd * f; if (f > best) best = f; }
  }
  return [fx, fy, best];
}
// one step of walking from (x, y) toward (tx, ty): steers around structures and keeps off other cats. Returns [nx, ny, vx, vy].
// `self` is the cat (or its ghost on the site): it remembers which way round an obstacle it is sliding so it never dithers at a corner.
function steerStep(x, y, tx, ty, sp, dt, self) {
  const dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy); if (d < 1e-6) return [x, y, 0, 0];
  let vx = dx / d, vy = dy / d;
  const near = pushOut(tx, ty, 0.45)[2] > 0 ? 1.3 : 0.45; // a spot right next to a structure: stop steering once close, just walk in
  if (d > near) {
    const [fx, fy, f] = pushOut(x + vx * 0.35, y + vy * 0.35, 0.4);
    if (f > 0) {
      if (!self.slide) { const txn = -fy, tyn = fx; self.slide = txn * vx + tyn * vy < 0 ? -1 : 1; }
      vx += fx * 1.5 - fy * 0.9 * self.slide; vy += fy * 1.5 + fx * 0.9 * self.slide;
    } else self.slide = 0;
  } else self.slide = 0;
  for (const o of cats) { if (o.id === self.id) continue; const ox = x - o.x, oy = y - o.y, od = Math.hypot(ox, oy); if (od > 0.001 && od < 0.42) { const f = (0.42 - od) / 0.42; vx += ox / od * f * 0.8; vy += oy / od * f * 0.8; } }
  const vl = Math.hypot(vx, vy) || 1; vx /= vl; vy /= vl;
  const mv = Math.min(d, sp * dt);
  return [x + vx * mv, y + vy * mv, vx, vy];
}
const CITY_BLOCKS = [[-20, -20, false], [0, -20, false], [-20, 0, false], [-40, -40, true], [-20, -40, true], [0, -40, true], [-40, -20, true], [-40, 0, true]];
const OUT = [];
(function genCity() {
  let sd = 20261010;
  const r = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
  for (const [bx0, by0, far] of CITY_BLOCKS) {
    const near = bx0 === -20 && by0 === -20;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      if (r() < 0.06) continue;
      const w = 2.4 + r() * 1.2, d = 2.4 + r() * 1.2;
      const x = bx0 + 1.9 + i * 4.1 + r() * (3.6 - w), y = by0 + 1.9 + j * 4.1 + r() * (3.6 - d);
      const h = far ? 9 + r() * 15 : near ? 6 + r() * 9 : 3 + r() * 8;
      const b = { x, y, w, d, h, far, win: [], light: h > 8 && r() < 0.6, ph: r() * 10 };
      const n = far ? 5 : 12;
      for (let k = 0; k < n; k++) { const f = r() < 0.5 ? 'L' : 'R', len = f === 'L' ? w : d; b.win.push({ f, u: (f === 'L' ? x : y) + 0.25 + r() * (len - 0.7), z: 0.5 + r() * (h - 1.2), on: r() < 0.6, c: WINC[Math.floor(r() * WINC.length)], ph: r() * 100 }); }
      OUT.push(b);
    }
  }
  const SIGNS = [['QPU', '92,242,255'], ['CRYO', '154,123,255'], ['24H', '255,79,174'], ['QUBITS', '247,200,106'], ['ENTANGLE', '255,79,174'], ['NOODLES', '255,138,92'], ['PAWN', '247,200,106'], ['SOL', '92,255,170'], ['HOTEL', '255,79,174'], ['DECOHERE', '154,123,255']];
  const cand = OUT.filter(b => !b.far && b.h > 6 && b.w > 2.8);
  for (let i = 0; i < SIGNS.length && cand.length; i++) { const b = cand.splice(Math.floor(r() * cand.length), 1)[0]; b.sign = { text: SIGNS[i][0], c: SIGNS[i][1] }; }
})();
OUT.sort((a, b) => (a.x + a.w / 2 + a.y + a.d / 2) - (b.x + b.w / 2 + b.y + b.d / 2));
const SHIM = [];
for (let i = 0; i < 150; i++) SHIM.push(Math.random() < 0.5 ? { x: rand(QUAY + 0.8, 46), y: rand(-40, 46), ph: rand(0, TAU) } : { x: rand(-40, 46), y: rand(QUAY + 0.8, 46), ph: rand(0, TAU) });
const boat = { x: QUAY + 5.4, y: -6, dir: 1 };

/* ---------- weather ---------- */
const WX = {
  clear:   { rain: 0,    snow: 0,    fog: 0.04, wind: 0.15, cold: 1,   coh: 1,    name: 'clear' },
  drizzle: { rain: 0.3,  snow: 0,    fog: 0.1,  wind: 0.2,  cold: 1.4, coh: 1.05, name: 'drizzle' },
  rain:    { rain: 0.75, snow: 0,    fog: 0.14, wind: 0.35, cold: 1.8, coh: 1.15, name: 'rain' },
  storm:   { rain: 1,    snow: 0,    fog: 0.18, wind: 0.85, cold: 2,   coh: 1.6,  name: 'decoherence storm', bolts: true },
  fog:     { rain: 0,    snow: 0,    fog: 0.6,  wind: 0.05, cold: 1.2, coh: 1.2,  name: 'harbor fog' },
  snow:    { rain: 0,    snow: 0.85, fog: 0.16, wind: 0.2,  cold: 2.4, coh: 1,    name: 'snow' },
};
const WXNEXT = { clear: ['drizzle', 'snow', 'drizzle', 'storm', 'clear', 'rain'], drizzle: ['rain', 'clear', 'rain', 'snow'], rain: ['storm', 'drizzle', 'clear', 'storm'], storm: ['rain', 'clear', 'drizzle'], fog: ['clear', 'drizzle', 'storm'], snow: ['clear', 'snow', 'storm', 'clear'] };
const WXLOG = { clear: 'The sky cleared over the block.', drizzle: 'A drizzle started. Strays are looking for cover.', rain: 'Rain rolled in off the harbor.', storm: 'A decoherence storm hit the block. Coherence is draining fast.', fog: 'Fog came in off the harbor.', snow: 'It started snowing. The heater is going to be crowded.' };
let wxNext = 'rain', wxDur = 1, wxKey = 'clear', wxUntil = 0, nextBolt = 0, flash = 0, shake = 0, bolt = null, labBoostUntil = 0;
const wx = { rain: 0, snow: 0, fog: 0.04, wind: 0.15, cold: 1, coh: 1 };
const drops = [], flakes = [], splashes = [], ripples = [];
const WXEFF = {
  clear: 'Calm night. Nothing working against the strays.',
  drizzle: 'A little colder than usual.',
  rain: 'Cold builds fast and the plaza gets slick.',
  storm: 'Coherence drains fast. Lightning can hit the lab and double the pay.',
  fog: 'Coherence drains a bit faster.',
  snow: 'Cold builds very fast. The heater gets crowded.',
};
const WXCOLOR = { clear: '#F7C86A', drizzle: '#8FDFFF', rain: '#5CF2FF', storm: '#B9A6FF', fog: '#A9B3D9', snow: '#E6ECFF' };
const CLOUD = '<path d="M7 15a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 7.5a3.75 3.75 0 0 1 .5 7.5H7z"/>';
const WXICON = {
  clear: '<svg viewBox="0 0 24 24"><path d="M16 3.5a8.5 8.5 0 1 0 4.5 14.9A7.2 7.2 0 0 1 16 3.5z"/><path d="M5.5 3v3.5M3.75 4.75h3.5"/></svg>',
  drizzle: '<svg viewBox="0 0 24 24">' + CLOUD + '<path d="M9.5 18.5l-.6 1.6M14.5 18.5l-.6 1.6"/></svg>',
  rain: '<svg viewBox="0 0 24 24">' + CLOUD + '<path d="M8 18l-1 2.6M12 18l-1 2.6M16 18l-1 2.6"/></svg>',
  storm: '<svg viewBox="0 0 24 24">' + CLOUD + '<path d="M12.8 15.5l-2.3 3.6h3l-2.3 3.6"/></svg>',
  fog: '<svg viewBox="0 0 24 24"><path d="M5 7h14M3 11h18M5 15h14M7 19h10"/></svg>',
  snow: '<svg viewBox="0 0 24 24"><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5"/></svg>',
};

/* ---------- agents ---------- */
const SUPPLY = 1e9, CAT_ALLOC = 1e5; // 100,000 per cat: 1,000,000 across the ten, 0.1% of supply
const COATS = [
  { c: '#E08A3C', e: '#B6FF6A' }, { c: '#1C2033', e: '#F2D45C', d: 1 }, { c: '#9097B3', e: '#5CF2FF' },
  { c: '#ECEFF7', e: '#5CA8FF' }, { c: '#9A6B43', e: '#C8FF7A' }, { c: '#E8CC98', e: '#7AF0C8' }, { c: '#4B4F66', e: '#FFD36A', d: 1 },
  { c: '#C96A5A', e: '#9CFFE0' }, { c: '#6A6EA8', e: '#FFD36A' }, { c: '#D9B88F', e: '#5CF2FF' }
];
const TRAITS = {
  degen:   { label: 'momentum ape', eager: 1.45, dip: 0,   sneak: 0.8,  social: 1,   gamble: 1.5, tp: 0,    panic: true,  desc: 'buys rips, panic sells dumps, wagers big' },
  patient: { label: 'dip buyer',    eager: 0.85, dip: 1,   sneak: 0.5,  social: 1,   gamble: 0.5, tp: 1.3,  panic: false, desc: 'buys dips, takes profit at +30%' },
  greedy:  { label: 'scalper',      eager: 1.0,  dip: 0.4, sneak: 1.7,  social: 0.7, gamble: 1.1, tp: 1.08, panic: false, desc: 'small buys, takes profit at +8%, light paws' },
  loyal:   { label: 'diamond paws', eager: 1.0,  dip: 0.5, sneak: 0.25, social: 1.5, gamble: 0.6, tp: 0,    panic: false, desc: 'only ever buys, never sells, never steals' },
};
const UNLOCK_MC = [0, 0, 10000, 20000, 30000, 50000, 100000, 150000, 300000, 500000]; // market cap that releases each cat
const STAGES = [
  { key: 'launch', title: 'Launch', mc: 0, blurb: 'Two cats, the lab, the exchange. They run quantum jobs for a cut of the creator fees and trade.' },
  { key: 'cats', title: 'The cats', mc: 10000, mcEnd: 500000, blurb: 'Eight more cats are released as the chart climbs: $10K, $20K, $30K, $50K, $100K, $150K, $300K, $500K.' },
  { key: 'lab', title: 'Real hardware', mc: CONFIG.LAB_MC_USD, blurb: 'The lab plugs into a real quantum computer. Fees buy the time, and every job the cats run gets a hardware receipt on the page.' },
];
const stageSeen = {};
const stageOn = k => { if (stageSeen[k]) return true; const st = STAGES.find(x => x.key === k); return !!st && mcapUsd() >= st.mc; };
const PERSONA = {
  Miso: 'first out of the box and acts like it. chases every green candle, talks fast, regrets nothing out loud.',
  Qubit: 'the grinder. runs Shor until the readout blurs, counts every lamport, thinks sleep is for the unemployed.',
  Nori: 'calm, dry, patient. buys the dips everyone else panics on and says so, quietly, every meeting.',
  Pixel: 'small, loud, curious about everything in the lab. asks the questions nobody else will.',
  Mochi: 'diamond paws. has never sold a single token and considers this a personality.',
  Static: 'twitchy. two lab jobs, a storm and a wager before breakfast. gets electrocuted more than most.',
  Olive: 'the elder. remembers every rug, lectures gently, holds forever, sleeps in the top bunk.',
  Photon: 'fast and cheerful. believes the chart is a mood and the mood is good.',
  Biscuit: 'light paws. knows where everyone keeps their stash and swears it was already open.',
  Echo: 'last cat out, hungry to catch up. repeats whatever the top earner says and then does it better.',
};
const ROSTER = [
  ['Miso', 'miner', 'degen'], ['Qubit', 'tunneler', 'greedy'], ['Nori', 'cooler', 'patient'], ['Pixel', 'runner', 'degen'], ['Mochi', 'miner', 'loyal'],
  ['Static', 'tunneler', 'degen'], ['Olive', 'cooler', 'loyal'], ['Photon', 'runner', 'patient'], ['Biscuit', 'miner', 'greedy'], ['Echo', 'cooler', 'patient'],
];
const JOBS = {
  miner:    { label: 'sampler',  st: 'lab',  kind: 'sampling', nq: [2, 4], verb: 'running sampling jobs in the lab',   pay: [0.00009, 0.00024], risk: 0,    riskWhy: '',                                         did: 'ran a sampling job for {n}' },
  runner:   { label: 'searcher', st: 'lab',  kind: 'Grover',   nq: [3, 6], verb: 'running a Grover search in the lab', pay: [0.00012, 0.00033], risk: 0.08, riskWhy: 'search came back as noise and the job was scrapped', did: 'ran a Grover search for {n}' },
  tunneler: { label: 'factorer', st: 'lab',  kind: 'Shor',     nq: [4, 7], verb: 'running Shor in the lab',             pay: [0.00021, 0.00054], risk: 0.14, riskWhy: 'job errored out before the readout', did: 'factored a number for {n}' },
  cooler:   { label: 'calibrator', st: 'lab', kind: 'calibration', nq: [1, 3], verb: 'running calibration jobs in the lab', pay: [0.00008, 0.0002], risk: 0,    riskWhy: '',                                         did: 'ran a calibration job for {n}' },
};
const ACTS = {
  eat:      { st: 'crates',   dur: 50,   verb: 'eating at the diner',          walk: 'heading to the diner',          color: '247,200,106', name: 'eat' },
  hunt:     { st: 'trays',    dur: 60,   verb: 'hunting in the scrapyard',    walk: 'creeping toward the scrapyard', color: '255,138,92', name: 'hunt' },
  work:     {                 dur: 100,                                                                                     color: '92,242,255', name: 'work' },
  recohere: { st: 'cryo',     dur: 75,   verb: 'recohering in the circle',  walk: 'drifting toward the circle',    color: '154,123,255', name: 'recohere' },
  warm:     { st: 'vent',     dur: 60,   verb: 'warming up at the heater',        walk: 'heading for the heater',            color: '255,138,92', name: 'warm up' },
  sell:     { st: 'exchange', dur: 45,  verb: 'selling at the exchange',       walk: 'heading to the exchange',         color: '255,120,120', name: 'sell' },
  buy:      { st: 'exchange', dur: 45, verb: 'buying at the exchange',        walk: 'heading to the exchange',         color: '92,255,170', name: 'buy' },
  steal:    { st: 'loft',     dur: 55,   verb: 'sneaking around the bunks',      walk: 'creeping toward the bunks',        color: '255,79,174', name: 'steal' },
  wager:    { st: 'arena',    dur: 90,                                                                                   color: '255,200,80', name: 'wager' },
  scrap:    {                 dur: 40,                                                                                   color: '255,79,174', name: 'scrap' },
  entangle: {                 dur: 80,                                                                                     color: '154,123,255', name: 'entangle' },
  idle:     { st: 'cryo',     dur: 70,   verb: 'hanging around the circle',       walk: 'drifting over to the circle',          color: '140,151,194', name: 'rest' },
  play:     { st: 'yard',     dur: 60,   verb: 'chasing the laser in the yard',  walk: 'heading to the yard',              color: '120,200,255', name: 'run a circuit' },
  meet:     { st: 'cryo',     dur: 120,  verb: 'at the meeting',                walk: 'heading to the meeting at the circle', color: '247,200,106', name: 'meeting' },
  sleep:    { st: 'loft',     dur: 120,  verb: 'asleep in the bunks',            walk: 'heading to the bunks to sleep',    color: '110,120,170', name: 'sleep' },
};
// what two entangled cats say to each other (alternating lines; {p} = the other cat)
const CHATS = [
  ['you feel that', 'the chart dipped. I always feel it first', 'the box pays either way', 'does it though'],
  ['{p}. you look terrible', 'two jobs and a storm', 'eat something', 'the diner costs more every night'],
  ['the lab opens at 200K', 'you believe that', 'I believe the sign', 'fair'],
  ['who robbed Nori', 'not me', 'you say that every time', 'and every time it is true'],
  ['the lab pays double in lightning', 'it also electrocutes you', 'worth it', 'you have never been hit'],
  ['I am up forty percent', 'on paper', 'paper is where the money lives', 'until you sell'],
  ['the heater was full again', 'cold builds fast in the snow', 'I slept under the circle', 'warm enough'],
  ['rent is going up', 'everything is going up', 'except my stack', 'sell less'],
  ['coherent?', 'barely', 'hold on to me a second', 'that is what this is'],
  ['did you see the treasury tonight', 'fees landed', 'payday soon', 'if they tick our names'],
];
const FOOD = 0.0001, CRYO = 0.00007, WARM = 0.00005, BUNK = 0.00006, ARENA_FEE = 0.00004, PLAY = 0.00005, RESERVE = 0.0003;
// while there is no coin yet the treasury is a simulated fee pool that pays every job; once the coin is live, SOL only moves when the operator distributes
const feePool = () => CONFIG.SIMULATE_FEES !== false;
// survival gets dearer as the chart climbs: x1 at the starting cap, x4 at 16x, x8 at 64x, capped at x40
const priceMul = () => clamp(Math.sqrt(Math.max(1, mcapUsd() / CONFIG.START_MC_USD)), 1, 40);
const costOf = (base, c) => base * priceMul() * (c ? 1 - 0.04 * Math.min(9, (c.lvl || 1) - 1) : 1);
const spare = c => Math.max(0, c.sol - costOf(RESERVE, c));
// ---- levels: XP for everything a cat does; higher levels pay less for food, cryo time and warmth ----
const LVL_XP = [0, 750, 2250, 5000, 9000, 16000, 30000, 60000, 120000, 240000]; // roughly: L2 after a few hours, L5 after a day and a half, L10 after a month
const LVL_TITLE = ['stray', 'scrapper', 'hustler', 'trader', 'operator', 'whale', 'entangled', 'superposed', 'coherent', 'quantum'];
const lvlOf = xp => { let l = 1; while (l < LVL_XP.length && xp >= LVL_XP[l]) l++; return l; };
const lvlTitle = c => LVL_TITLE[Math.min(LVL_TITLE.length, c.lvl || 1) - 1];
function gainXp(c, n) {
  c.xp = (c.xp || 0) + n * rand(0.7, 1.3); const nl = lvlOf(c.xp);
  if (nl > (c.lvl || 1)) {
    c.lvl = nl; burst(c, '247,200,106', 26); ringFX(c.x, c.y, '247,200,106', 1.5); floatText(c, 'level ' + nl, '#F7C86A');
    log(`${c.name} hit level ${nl}: ${lvlTitle(c)}. Survival costs it ${4 * (nl - 1)}% less now.`, 'gain');
    say(c, pick(['levelled', 'getting good at this', 'level ' + nl + '. noted', 'the box respects me now']));
  }
}
function sellUrge(c) {
  if (c.qcat < 2000) return 0;
  let w = 0;
  if (c.sol < costOf(FOOD, c) && c.hunger > 0.5 && c.tr.label !== 'diamond paws') w = 0.6 + c.hunger * 0.5; // broke and hungry: sell enough to eat
  if (c.sol < costOf(FOOD, c) && c.hunger > 0.9) w = Math.max(w, 1.1);                                       // even diamond paws eat
  if (T < (c.sellCool || 0)) return w; // recently took profit or bailed: sit on the rest for a while
  if (c.tr.tp && mkt.price > c.entry * c.tr.tp) w = Math.max(w, 0.7);
  if (c.tr.panic && mkt.mom < -0.004) w = Math.max(w, 0.62);
  return w;
}
const anyoneAsleep = c => cats.some(o => o !== c && asleep(o));
const DRIVES = [
  { act: 'eat',      label: 'hungry',                   w: c => c.hunger * 1.25 * (c.sol >= FOOD ? 1 : 0.15) },
  { act: 'hunt',     label: 'broke and hungry',         w: c => c.hunger * (c.sol < costOf(FOOD, c) ? 1.2 : 0.3) + (stats.lostPool > 2000 ? 0.25 : 0) },
  { act: 'recohere', label: 'decohering',               w: c => (1 - c.coh) * 1.3 * (c.sol >= CRYO ? 1 : 0.45) },
  { act: 'warm',     label: 'cold',                     w: c => c.cold * 0.95 * (c.sol >= WARM ? 1 : 0.4) },
  { act: 'work',     label: c => (c.sol < costOf(FOOD, c) * 3 ? 'needs SOL' : 'feels like working'), w: c => (clamp(1 - c.sol / (0.004 * priceMul())) * 0.9 + 0.3) * c.ethic * (c.tr.label === 'momentum ape' ? rand(0.3, 1.7) : 1) },
  { act: 'buy',      label: 'spare SOL',                w: c => clamp(spare(c) / 0.008) * 0.9 * c.tr.eager * (1 + (c.tr.dip ? -mkt.mom * 40 * c.tr.dip : mkt.mom * 40) ) },
  { act: 'sell',     label: c => (c.sol < costOf(FOOD, c) && c.hunger > 0.5 ? 'broke, selling to eat' : c.tr.panic && mkt.mom < -0.004 ? 'chart is dumping' : 'taking profit'), w: c => sellUrge(c) },
  { act: 'steal',    label: 'light paws',               w: c => (c.sol < costOf(FOOD, c) * 2 ? 0.55 : 0.16) * c.tr.sneak * (anyoneAsleep(c) ? 1 : 0.15) },
  { act: 'scrap',    label: 'has a grudge',             w: c => c.grudge * 0.95 },
  { act: 'wager',    label: 'feeling lucky',            w: c => (0.1 + 0.32 * c.tr.gamble) * (c.qcat > 5000 ? 1 : 0.1) * (mkt.mom > 0.001 ? 1.25 : 1) },
  { act: 'entangle', label: 'wants company',            w: c => c.lonely * 0.85 * c.tr.social },
  { act: 'idle',     label: () => (wx.rain + wx.snow > 0.3 ? 'caught in the weather' : 'nothing urgent'), w: () => 0.2 + wx.rain * 0.4 + wx.snow * 0.35 },
  { act: 'sleep',    label: 'tired',                    w: c => Math.pow(c.tired, 2.2) * 1.1 },
  { act: 'play',     label: 'wants to play',            w: c => (c.lonely * 0.5 + 0.15) * c.tr.social * (spare(c) > costOf(PLAY, c) ? 1 : 0.1) },
];
const TH = {
  eat: ['the diner smells like sardines', 'food first, then the lab', 'could eat a whole fish'],
  hunt: ['something is moving in the cables', 'broke and hungry is a bad mix', 'somebody dropped tokens in the scrapyard'],
  recohere: ['half of me is somewhere else', 'everything feels blurry', 'the circle hums like a purr'],
  warm: ['the heater is the only warm thing out here', 'paws are freezing', 'one more cold night'],
  work: ['the lab pays tonight', 'a job now, buy later', 'every circuit is a few more lamports', 'the fee pool looks fat'],
  buy: ['chart looks cheap from down here', 'adding to the stack', 'fees in, buys out', 'size in'],
  sell: ['taking some off', 'green is green', 'paper paws tonight', 'need the sol'],
  steal: ['{p} sleeps heavy', 'nobody will miss a few thousand', 'light paws, quiet steps'],
  wager: ['{p} wants to bet? fine.', 'double or nothing', 'the arena pays better than the lab', 'feeling lucky tonight'],
  scrap: ['{p} has it coming', 'not letting {p} get away with it', '{p} is on my side of the block'],
  entangle: ['too quiet on this side', '{p} gets it', 'better in pairs'],
  idle: ['a box is a box', 'watching the circle count down', 'not now'],
  play: ['the dot. the dot.', 'yarn time', 'five minutes in the yard'],
  meet: ['circle time', 'the countdown hit zero', 'minutes to read, strategy to argue'],
  circuit: ['let\u2019s see what the machine says', 'five qubits, one thousand shots', 'superposition is a job now'],
  sleep: ['eyes won’t stay open', 'the bunks. now.', 'wake me if the chart moves'],
};

const fmtSol = v => (v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v >= 0.01 ? v.toFixed(3) : v >= 0.001 ? v.toFixed(4) : v.toFixed(5));
const fmtQ = v => (v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e4 ? (v / 1e3).toFixed(1) + 'K' : Math.round(v).toLocaleString('en-US'));
const fmtUsd = v => (v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : v >= 1e5 ? '$' + Math.round(v / 1e3) + 'K' : v >= 1e4 ? '$' + (v / 1e3).toFixed(1) + 'K' : v >= 1e3 ? '$' + (v / 1e3).toFixed(2) + 'K' : '$' + Math.round(v));
const mcapUsd = () => mkt.price * SUPPLY * CONFIG.SOL_USD;
const fmtPrice = () => fmtUsd(mcapUsd()) + ' MC';
const fmtKeys = v => (v >= 1e12 ? (v / 1e12).toFixed(2) + 'T' : v >= 1e9 ? (v / 1e9).toFixed(1) + 'G' : v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.round(v).toLocaleString('en-US'));
const PLACES = {
  cryo:     { title: 'The circle',      kind: 'where the box meets · recovery',     pt: [M(11.6), M(11.6)], stats: ['here', 'spent', 'visits'],     desc: 'The painted circle in the middle of the box, with the countdown above it. When it hits zero every cat that is awake comes in, sits down and talks through the day: the treasury, the chart, the lab, who did what. Between meetings cats come here to recohere, for a small fee.' },
  crates:   { title: 'The diner',       kind: 'food',                      pt: [M(15.8), M(15.6)], stats: ['spent', 'here', 'visits'],   desc: 'Sardines, mostly. A meal costs ' + fmtSol(FOOD) + ' SOL at launch and gets dearer as the chart climbs. Most grudges on the block start here.' },
  vent:     { title: 'The heater',      kind: 'warmth',                    pt: [M(12.3), M(16.6)], stats: ['spent', 'here', 'visits'],   desc: 'The only warm spot on the block. A warm-up costs ' + fmtSol(WARM) + ' SOL. It gets crowded when the weather turns.' },
  trays:    { title: 'The scrapyard',   kind: 'lost and found',            pt: [M(16.0), M(11.6)], stats: ['here', 'found', 'visits'],   desc: 'Where broke cats hunt for food, and where every dropped token on the block ends up. Whatever a decohered or lost cat scatters lands here, and whoever digs it out keeps it.' },
  exchange: { title: 'The exchange',    kind: 'where cats buy back',       pt: [M(6.6), M(11.5)],  stats: ['here', 'bought', 'buysol'],  desc: 'A kiosk with a ticker on the front. Any cat with SOL to spare walks up and buys ' + TK + '. Cats never sell here, there is no sell button. Every buy goes straight to the chart.' },
  arena:    { title: 'The arena',       kind: 'where cats wager · entry fee',          pt: [M(8.0), M(14.9)],  stats: ['spent', 'here', 'wagered'], desc: 'A ring painted on the pavement. Entry costs a little SOL, paid to the treasury. Two cats put up a stake of ' + TK + ', the box flips a quantum coin weighted by their coherence, and the winner takes the pot. Every wager is a transfer between the two wallets.' },
  loft:     { title: 'The bunks',       kind: 'where cats sleep · rent per night',          pt: [M(17.3), M(5.85)],  stats: ['spent', 'here', 'stolen'],  desc: 'Bunks over the corner shop, rent due every night, cheaper the higher a cat\u2019s level. Tired cats climb in and sleep it off. A cat with light paws can sneak in and lift a few thousand ' + TK + ' from a sleeper, if it doesn’t get caught.' },
  lab:      { title: 'The lab',         kind: 'quantum jobs · pays from the fee pool', pt: [LAB.x, LAB.y + LAB.d / 2 + 0.4], stats: ['here', 'circuits', 'paid'], desc: 'Where the cats work. Samplers, factorers and searchers run quantum jobs at the consoles and get paid out of the creator fees for every job that finishes clean. Until the chart hits ' + fmtUsd(CONFIG.LAB_MC_USD) + ' the jobs run on a simulator; after that, fees buy time on a real quantum computer and every job gets a hardware receipt.' },
  yard:     { title: 'The yard',        kind: 'play · costs a little',     pt: [YARD.x + YARD.w / 2, YARD.y + YARD.d / 2], stats: ['spent', 'here', 'visits'], desc: 'A fenced patch with a laser dot that never stays still and a ball of yarn that never ends. Playing costs a little SOL, paid to the treasury, and a cat comes out of it less lonely and more coherent.' },
  vault:    { title: 'The treasury',    kind: 'where the fees land',       pt: [M(13.3), M(13.7)], stats: ['treasury', 'fees', 'wages'], desc: 'Every trade of ' + TK + ' pays the creator a fee in SOL, and the fees land here. Every job the cats finish in the lab is paid out of it, in proportion to the work: the more fees land, the more a job pays. When the pool is empty the work goes on the tab for the next payout.' },
};
const placeStats = {}, placeLogs = {};
for (const k of Object.keys(PLACES)) { placeStats[k] = { paid: 0, spent: 0, visits: 0, found: 0, stolen: 0, bought: 0, buysol: 0, wagered: 0, circuits: 0, keys: 0 }; placeLogs[k] = []; }
let insMode = 'stray', placeKey = null, hoverLabel = null, remote = null;
const labelHits = [];
const stationOf = c => c.act === 'work' ? JOBS[c.job].st : (ACTS[c.act] ? ACTS[c.act].st : null);
const asleep = c => c.state === 'act' && c.act === 'sleep';
const hereAt = k => cats.filter(c => c.state === 'act' && stationOf(c) === k);

const cats = [];
const stats = { circuits: 0, labSol: 0, keys: 0, huntSol: 0, huntShifts: 0, lastJob: null, treasury: rand(0.004, 0.012), fees: 0, wages: 0, upkeep: 0, buySol: 0, boughtBack: 0, buys: 0, sold: 0, sellSol: 0, sells: 0, stolen: 0, lostPool: 0, low: false, lastTrade: null };
const P0 = CONFIG.START_MC_USD / CONFIG.SOL_USD / SUPPLY; // SOL per token at the starting market cap
const mkt = { price: P0, p0: P0, hist: [], mom: 0, acc: 0, nextMove: rand(180, 400), last: 0, pinned: false }; // pinned: the chart follows the real market cap, so the cats' own trades don't move it
const txs = [];
let uid = 0, simMin = 22 * 60 + randi(0, 30), T = 0;
let selId = null, hoverId = null, userPickT = -1e9, lastAutoT = 0;
const byId = id => id == null ? null : cats.find(c => c.id === id) || null;
const DAY_SECS = 1800; // one day in the box lasts 30 real minutes
const dayNo = () => Math.floor(T / DAY_SECS) + 1;
const clock = m => { m = ((Math.floor(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };
function tx(c, type, amount, note) { const e = { t: clock(simMin), cat: c ? c.name : 'the box', type, amount, note: note || '', day: dayNo() }; txs.unshift(e); if (txs.length > 60) txs.pop(); if (c) { c.hist.unshift(e); if (c.hist.length > 40) c.hist.pop(); } }

function makeCat(i) {
  const [name, job, trait] = ROSTER[i], coat = COATS[i % COATS.length];
  const sp = ST[pick(Object.keys(ST))].spot();
  return {
    id: ++uid, name, job, trait, tr: TRAITS[trait], coat: coat.c, eye: coat.e, dark: !!coat.d,
    x: sp[0], y: sp[1], tx: sp[0], ty: sp[1], face: Math.random() < 0.5 ? 1 : -1,
    sol: 0, qcat: CAT_ALLOC, earned: 0, xp: 0, lvl: 1, meetings: 0, hist: [], said: [], bought: 0, solSpent: 0, stole: 0, robbed: 0, found: 0, buys: 0, sells: 0, sold: 0, sellSol: 0, entry: mkt.price, sellCool: 0, arenaNet: 0, arenaSol: 0, arenaW: 0, arenaL: 0, arrived: false, released: T,
    hunger: rand(0, 0.75), coh: rand(0.35, 1), cold: rand(0, 0.6), lonely: rand(0, 0.6),
    grudge: 0, grudgeOn: null, grudgeWhy: '', starve: 0, tired: rand(0, 0.7), stamina: rand(0.75, 1.35),
    ethic: ({ degen: 0.85, patient: 1.0, greedy: 1.35, loyal: 1.15 }[trait] || 1) * rand(0.85, 1.15), qjobs: 0, qwork: 0, qnq: 0,
    rx: (i + 0.5) / ROSTER.length, rdir: Math.random() < 0.5 ? 1 : -1, rsp: rand(0.022, 0.036),
    state: 'pause', pauseT: rand(1, 12), act: 'idle', actT: 0, actDur: 0, partner: null, initiator: false,
    thought: 'just woke up', doing: 'looking around', because: 'the box just woke up', weighed: [],
    lastAte: simMin - randi(30, 400), phase: Math.random() * TAU
  };
}
function findPartner(c, act) {
  if (act === 'scrap' && c.grudgeOn) { const g = byId(c.grudgeOn); if (g && !g.partner && !asleep(g)) return g; }
  let best = null, bd = 1e9;
  for (const o of cats) {
    if (o === c || o.partner || asleep(o)) continue;
    if (act === 'wager' && (o.qcat < 5000 || o.state === 'act')) continue;
    const d = Math.hypot(o.x - c.x, o.y - c.y);
    if (d < bd) { bd = d; best = o; }
  }
  return best && bd < 9 ? best : null;
}
function because(c, act, p) {
  switch (act) {
    case 'eat': { const h = Math.round((simMin - c.lastAte) / 60); return h >= 1 ? `nothing to eat in ${h} hour${h > 1 ? 's' : ''}` : 'stomach has been growling'; }
    case 'hunt': return c.sol < costOf(FOOD, c) ? `only ${fmtSol(c.sol)} SOL and a meal costs ${fmtSol(costOf(FOOD, c))}` : `${fmtQ(stats.lostPool)} ${TK} lying in the scrapyard`;
    case 'recohere': return `coherence down to ${Math.round(c.coh * 100)}%`;
    case 'warm': return (wx.rain > 0.3 ? 'soaked through, ' : wx.snow > 0.3 ? 'snow in its fur, ' : '') + `cold for ${Math.max(5, Math.round(c.cold * 90))} minutes`;
    case 'work': return c.sol < costOf(FOOD, c) * 3 ? `only ${fmtSol(c.sol)} SOL left and the lab pays from the fee pool` : (feePool() ? `${fmtSol(stats.treasury)} SOL sitting in the fee pool` : 'every job is a bigger cut of the next payout');
    case 'sell': return c.sol < costOf(FOOD, c) && c.hunger > 0.5 ? `broke and a meal costs ${fmtSol(costOf(FOOD, c))} SOL` : c.tr.panic && mkt.mom < -0.004 ? 'the chart is dumping and it has no stomach for it' : `up ${Math.round((mkt.price / c.entry - 1) * 100)}% on its entry`;
    case 'buy': return `${fmtSol(spare(c))} SOL to spare` + (mkt.mom > 0.002 ? ' and the chart is moving' : mkt.mom < -0.002 ? ' and the chart dipped' : '');
    case 'steal': return p ? `${p.name} is asleep in the bunks` : 'somebody is always asleep up there';
    case 'scrap': return c.grudgeWhy || (p ? `${p.name} looked at it wrong` : 'something to prove');
    case 'wager': return p ? `${p.name} has ${fmtQ(p.qcat)} ${TK} and a tell` : 'the arena is open';
    case 'play': return c.lonely > 0.5 ? 'nobody around and the laser is on' : 'the laser is on';
    case 'entangle': return `alone since ${clock(simMin - Math.round(40 + c.lonely * 140))}`;
    default: return wx.rain + wx.snow > 0.3 ? 'too wet to do anything else' : 'nothing urgent, so it naps';
  }
}
function thought(c, act, p) {
  if (act === 'idle' && wx.snow > 0.3) return pick(['snow again', 'the box is the only dry thing']);
  if (act === 'idle' && wx.rain > 0.3) return pick(['wet fur is the worst', 'waiting out the rain', 'the box is dry at least']);
  if (act === 'work' && JOBS[c.job].st === 'lab' && T < labBoostUntil) return 'the lab is surging: double pay';
  if (act === 'sell' && c.trait === 'degen') return pick(['getting out', 'this is dumping. out.', 'nope']);
  if (act === 'buy' && c.trait === 'patient') return pick(['dip. buying.', 'patience pays', 'cheaper than an hour ago']);
  if (act === 'buy' && c.trait === 'degen') return pick(['it’s pumping. in.', 'send it', 'no chart analysis, just paws']);
  return pick(TH[act] || TH.idle).replace('{p}', p ? p.name : 'someone');
}
function decide(c) {
  const crowd = act => { const st = act === 'work' ? JOBS[c.job].st : ACTS[act].st; if (!st) return 1; const n = cats.filter(o => o !== c && !asleep(o) && (stationOf(o) === st || (o.state === 'walk' && o.act !== 'wager' && (o.act === 'work' ? JOBS[o.job].st : ACTS[o.act].st) === st))).length; return 1 / (1 + 0.7 * Math.max(0, n - 1)); };
  const ws = DRIVES.map(d => ({ act: d.act, label: typeof d.label === 'function' ? d.label(c) : d.label, w: clamp(d.w(c) * crowd(d.act) + rand(-0.06, 0.06), 0, 1.5) }));
  ws.sort((a, b) => b.w - a.w);
  let ch = null, partner = null;
  for (const o of ws) {
    if (o.act === 'scrap' || o.act === 'entangle' || o.act === 'wager') { partner = findPartner(c, o.act); if (!partner) continue; }
    if (o.act === 'buy' && spare(c) < 0.0004) continue;
    if (o.act === 'sell' && sellUrge(c) <= 0) continue;
    ch = o; break;
  }
  if (!ch) { ch = ws.find(o => o.act === 'idle'); partner = null; }
  if (meeting.on && T < meeting.until - 40) { joinMeeting(c); return; }
  if (ch.act !== 'scrap' && ch.act !== 'entangle' && ch.act !== 'wager') partner = null;
  c.weighed = ws.slice(0, 5).map(o => ({ act: o.act, label: o.label, w: o.w, win: o === ch }));
  c.act = ch.act; c.actT = 0; c.partner = null; c.initiator = false;
  const sleeper = ch.act === 'steal' ? pick(cats.filter(o => o !== c && asleep(o))) || null : null;
  c.because = because(c, ch.act, partner || sleeper); c.thought = thought(c, ch.act, partner || sleeper);
  if (Math.random() < 0.3) say(c, c.thought);
  if (partner && ch.act === 'wager') {
    c.partner = partner.id; c.initiator = true; c.state = 'walk'; c.arrived = false;
    c.tx = ARENA.slots[0][0]; c.ty = ARENA.slots[0][1]; c.doing = `heading to the arena to wager ${partner.name}`;
    partner.partner = c.id; partner.initiator = false; partner.state = 'walk'; partner.act = 'wager'; partner.arrived = false;
    partner.tx = ARENA.slots[1][0]; partner.ty = ARENA.slots[1][1]; partner.doing = `heading to the arena to take ${c.name}\u2019s bet`;
    partner.because = `${c.name} called it out`; partner.thought = pick(['easy money', 'fine. arena.', `${c.name} is bluffing`]);
    if (Math.random() < 0.7) say(partner, partner.thought);
    log(`${c.name} called ${partner.name} out to the arena`, 'info', 'arena');
    return;
  }
  if (partner) {
    c.partner = partner.id; c.initiator = true; c.state = 'walk';
    c.doing = (ch.act === 'scrap' ? 'going after ' : 'looking for ') + partner.name;
    c.tx = partner.x; c.ty = partner.y; return;
  }
  const key = ch.act === 'work' ? JOBS[c.job].st : ACTS[ch.act].st;
  const sp = ST[key].spot();
  c.tx = sp[0]; c.ty = sp[1]; c.state = 'walk';
  c.doing = ch.act === 'work' ? `heading to ${ST[key].label}` : ACTS[ch.act].walk;
}
function arrive(c, p) {
  if (c.act === 'wager') {
    if (!p || p.act !== 'wager') { c.partner = null; c.initiator = false; c.state = 'pause'; c.pauseT = 1; return; }
    c.state = 'act'; c.actT = 0; c.actDur = ACTS.wager.dur; c.arrived = true; placeStats.arena.visits++; spend(c, costOf(ARENA_FEE, c), 'arena', 'arena entry');
    const sdx = (p.x - p.y) - (c.x - c.y); c.face = sdx >= 0 ? 1 : -1;
    c.doing = p.arrived ? `wagering with ${p.name}` : `waiting for ${p.name} in the arena`;
    if (p.arrived) { p.doing = `wagering with ${c.name}`; ringFX(ARENA.x, ARENA.y, '255,200,80', 1.2); }
    return;
  }
  if (c.partner && c.initiator) {
    if (!p || asleep(p) || (p.partner && p.partner !== c.id)) { c.partner = null; c.initiator = false; c.state = 'pause'; c.pauseT = 0.2; return; }
    p.partner = c.id; p.initiator = false; p.state = 'act'; p.act = c.act; p.actT = 0;
    c.state = 'act'; c.actT = 0; c.actDur = ACTS[c.act].dur; p.actDur = c.actDur;
    if (c.act === 'entangle') { c.chat = pick(CHATS); c.chatI = 0; c.chatT = rand(2, 4); }
    const sdx = (p.x - p.y) - (c.x - c.y); c.face = sdx >= 0 ? 1 : -1; p.face = -c.face;
    if (c.act === 'scrap') {
      c.doing = `scrapping with ${p.name}`; p.doing = `scrapping with ${c.name}`;
      p.because = `${c.name} jumped it`; p.thought = pick(['should have seen that coming', 'not again', 'fine, come on then']);
      log(`${c.name} jumped ${p.name}`, 'loss');
      say(c, pick([`${p.name}. outside. now.`, `${p.name} knows what this is about`, 'been waiting all night for this'])); say(p, p.thought);
    } else {
      c.doing = `entangled with ${p.name}`; p.doing = `entangled with ${c.name}`;
      p.because = `${c.name} came looking for company`; p.thought = 'better in pairs';
      if (Math.random() < 0.6) say(p, pick(['better in pairs', `hey ${c.name}`, 'feel that? same state now']));
    }
    return;
  }
  c.state = 'act'; c.actT = 0;
  if (c.act === 'work') { c.actDur = ACTS.work.dur; c.doing = JOBS[c.job].verb; }
  else { c.actDur = ACTS[c.act].dur; c.doing = ACTS[c.act].verb; }
  if (c.act === 'sleep') { c.actDur = c.fainted ? rand(120, 200) : rand(1080, 1320); c.fainted = false; placeStats.loft.visits++; spend(c, costOf(BUNK, c), 'loft', 'a bunk for the night'); if (Math.random() < 0.5) log(`${c.name} climbed into the bunks to sleep`, 'info', 'loft'); }
  if (c.act === 'idle' && wx.rain + wx.snow > 0.3) c.doing = `sheltering in a box from the ${wx.snow > wx.rain ? 'snow' : 'rain'}`;
  if ((c.act === 'warm' || c.act === 'eat') && Math.random() < 0.2) {
    const o = cats.find(o => o !== c && o.state === 'act' && o.act === c.act);
    if (o) { c.grudge = Math.min(1, c.grudge + 0.75); c.grudgeOn = o.id; c.grudgeWhy = `${o.name} took its spot at ${c.act === 'warm' ? 'the heater' : 'the diner'}`; log(`${c.name} has a grudge against ${o.name} now`, 'info', c.act === 'warm' ? 'vent' : 'crates'); }
  }
}
function endPair(a, b) { for (const k of [a, b]) { if (!k) continue; k.partner = null; k.initiator = false; k.state = 'pause'; k.pauseT = rand(2, 6); } }
function wake(c, why) { if (!asleep(c)) return; c.state = 'pause'; c.pauseT = 0.5; c.tired = clamp(c.tired - 0.4); c.doing = 'woke up'; c.because = why; }
function spend(c, amt, place, what) {
  const cost = Math.min(c.sol, amt); c.sol -= cost; c.upkeep = (c.upkeep || 0) + cost; stats.upkeep += cost; if (feePool()) stats.treasury += cost; placeStats[place].spent += cost; placeStats[place].visits++;
  tx(c, 'spent', '-' + fmtSol(cost) + ' SOL', what);
  if (cost > 0) { floatText(c, '-' + fmtSol(cost) + ' SOL', '#FF9ACB'); coinFX(c, cost); log(`${c.name} paid ${fmtSol(cost)} SOL for ${what} at ${ST[place].label} \u2192 treasury`, 'info', place); }
  return cost;
}
function moveTokens(from, to, amt) { amt = Math.min(from.qcat, amt); from.qcat -= amt; to.qcat += amt; return amt; }
function finish(c, p) {
  const a = c.act;
  if (a === 'work') {
    const j = JOBS[c.job], st = j.st;
    const nq = randi(j.nq[0], j.nq[1]), diff = 0.6 + nq * 0.2; // bigger circuits pay more and count for more
    // pay is a slice of whatever is sitting in the fee pool: the more fees land, the more every job pays. Once the coin is live
    // the pool is the real treasury wallet and nothing moves until the operator distributes, so jobs only earn a share of the next payout.
    let pay = 0;
    if (feePool()) {
      pay = stats.treasury * 0.025 * diff * (1 + 0.05 * ((c.lvl || 1) - 1));
      if (T < labBoostUntil && st === 'lab') pay *= 2;
      pay = Math.max(0, Math.min(pay, stats.treasury, 0.004 * priceMul()));
      if (pay < 0.000005) pay = 0;
    }
    placeStats[st].visits++; c.coh = clamp(c.coh - 0.06);
    const slipped = Math.random() < j.risk * (1 - c.coh * 0.5); // a coherent cat makes fewer mistakes
    const bits = Array.from({ length: nq }, () => Math.random() < 0.5 ? '0' : '1').join(''), job = (stageOn('lab') ? 'qpu-' : 'sim-') + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
    if (!slipped) {
      c.qjobs++; c.qwork += diff; c.qnq += nq; if (st === 'lab') { placeStats.lab.circuits++; stats.circuits++; stats.lastJob = { name: c.name, nq, bits, job, kind: j.kind, t: T }; }
      gainXp(c, 3 + nq * 1.5);
      const receipt = `${c.name} ran a ${nq}-qubit ${j.kind} job (${job}): 1,024 shots, most common result |${bits}\u27E9.`;
      if (pay > 0) {
        stats.treasury -= pay; c.sol += pay; c.earned += pay; stats.wages += pay; placeStats[st].paid += pay;
        floatText(c, '+' + fmtSol(pay), '#F7C86A'); payFX(c); floatText(c, '|' + bits + '\u27E9', '#78C8FF');
        log(`${receipt} Paid ${fmtSol(pay)} SOL from the fee pool.`, 'link', 'lab');
        tx(c, 'circuit', '+' + fmtSol(pay) + ' SOL', job);
      } else {
        floatText(c, '|' + bits + '\u27E9', '#78C8FF'); floatText(c, '+' + diff.toFixed(1) + ' work', '#F7C86A');
        log(`${receipt} ${feePool() ? 'The fee pool is empty, so it goes on the tab for the next payout.' : 'Logged for the next payout.'}`, 'link', 'lab');
        tx(c, 'circuit', '+' + diff.toFixed(1) + ' work', job);
      }
    } else { log(`${c.name}: ${j.riskWhy} (${job}). No pay.`, 'loss', st); floatText(c, 'job failed', '#FF4FAE'); }
  } else if (a === 'play') {
    spend(c, costOf(PLAY, c), 'yard', 'play time'); c.lonely = clamp(c.lonely - 0.35); c.coh = clamp(c.coh + 0.06); gainXp(c, 3);
    if (Math.random() < 0.5) say(c, pick(['got it', 'the dot moved', 'one more', 'the yarn fought back', 'I was winning']));
    if (Math.random() < 0.4) log(`${c.name} chased the laser around the yard for a bit`, 'info', 'yard');
  } else if (a === 'eat') {
    spend(c, costOf(FOOD, c), 'crates', 'a meal'); c.hunger = 0.03; c.lastAte = simMin; gainXp(c, 1);
    if (Math.random() < 0.3) log(`${c.name} ate at the diner`, 'info', 'crates');
  } else if (a === 'hunt') {
    placeStats.trays.visits++;
    if (stats.lostPool > 500) {
      const take = stats.lostPool * rand(0.25, 0.7); stats.lostPool -= take; c.qcat += take; c.found += take; placeStats.trays.found += take;
      floatText(c, '+' + fmtQ(take) + ' ' + TK, '#F7C86A'); gainXp(c, 10); log(`${c.name} dug ${fmtQ(take)} ${TK} out of the scrapyard`, 'gain', 'trays'); tx(c, 'found', '+' + fmtQ(take) + ' ' + TK, 'the scrapyard');
    }
    if (Math.random() < 0.55) { c.hunger = 0.12; c.lastAte = simMin; if (Math.random() < 0.5) log(`${c.name} caught something in the scrapyard`, 'info', 'trays'); }
  } else if (a === 'recohere') {
    spend(c, costOf(CRYO, c), 'cryo', 'cryo time'); c.coh = 1; gainXp(c, 1);
    floatText(c, 'coherent', '#B9A6FF');
    if (Math.random() < 0.4) log(`${c.name} recohered under the circle`, 'link', 'cryo');
  } else if (a === 'warm') {
    spend(c, costOf(WARM, c), 'vent', 'a warm-up'); c.cold = 0; gainXp(c, 1);
    if (Math.random() < 0.25) log(`${c.name} warmed up at the heater`, 'info', 'vent');
  } else if (a === 'buy') {
    const amt = spare(c) * rand(0.25, 0.5);
    if (amt > 0.00005) {
      const got = amt / mkt.price * 0.99;
      c.entry = (c.entry * c.qcat + amt) / (c.qcat + got);
      c.sol -= amt; c.solSpent += amt; c.qcat += got; c.bought += got; c.buys++;
      stats.buySol += amt; stats.boughtBack += got; stats.buys++; stats.lastTrade = { name: c.name, side: 'bought', sol: amt, q: got, t: T };
      placeStats.exchange.bought += got; placeStats.exchange.buysol += amt; placeStats.exchange.visits++;
      if (!mkt.pinned) mkt.price *= 1 + amt / (mkt.price * SUPPLY * 0.35);
      floatText(c, '+' + fmtQ(got) + ' ' + TK, '#5CFFAA'); buyFX(c); gainXp(c, 4 + Math.min(14, got / CAT_ALLOC * 100));
      log(`${c.name} bought ${fmtQ(got)} ${TK} for ${fmtSol(amt)} SOL at the exchange`, 'gain', 'exchange'); tx(c, 'buy', '+' + fmtQ(got) + ' ' + TK, fmtSol(amt) + ' SOL');
    }
  } else if (a === 'sell') {
    const broke = c.sol < costOf(FOOD, c) && c.hunger > 0.5;
    // broke: work out what three meals cost and sell just enough to cover them (never more than a tenth of the stack)
    const need = broke ? Math.min(c.qcat * 0.1, Math.max(c.qcat * 0.005, (costOf(FOOD, c) * 3 - c.sol) / (mkt.price * 0.99))) : c.qcat * rand(0.02, 0.05);
    const q = Math.min(c.qcat, need), got = q * mkt.price * 0.99;
    c.qcat -= q; c.sol += got; c.sold += q; c.sellSol += got; c.sells++;
    stats.sold += q; stats.sellSol += got; stats.sells++; stats.lastTrade = { name: c.name, side: 'sold', sol: got, q, t: T };
    placeStats.exchange.visits++;
    if (!mkt.pinned) { mkt.price *= 1 - got / (mkt.price * SUPPLY * 0.35); mkt.mom -= 0.0005; }
    if (!broke) { c.entry = mkt.price; c.sellCool = T + rand(1500, 3000); } // a trait sell re-anchors the cat and buys it a long pause before the next one
    floatText(c, '-' + fmtQ(q) + ' ' + TK, '#FF7878'); ringFX(EXC.x, EXC.y, '255,120,120', 1.1); gainXp(c, broke ? 2 : 4 + Math.min(12, (mkt.price / c.entry - 1) * 40));
    const why = broke ? 'to eat' : c.tr.panic && mkt.mom < -0.004 ? 'and bailed on the dip' : `and took profit at +${Math.round((mkt.price / c.entry - 1) * 100)}%`;
    log(`${c.name} sold ${fmtQ(q)} ${TK} for ${fmtSol(got)} SOL ${why}`, 'loss', 'exchange'); tx(c, 'sell', '-' + fmtQ(q) + ' ' + TK, '+' + fmtSol(got) + ' SOL');
  } else if (a === 'steal') {
    const victims = cats.filter(o => o !== c && asleep(o));
    if (!victims.length) { if (Math.random() < 0.5) log(`${c.name} found nobody asleep in the bunks`, 'info', 'loft'); }
    else {
      const v = pick(victims), caught = Math.random() < 0.32 / c.tr.sneak;
      if (caught) {
        wake(v, `${c.name} had a paw in its stash`); v.grudge = 1; v.grudgeOn = c.id; v.grudgeWhy = `${c.name} tried to rob it in the bunks`;
        log(`${c.name} got caught with a paw in ${v.name}’s stash`, 'loss', 'loft'); say(v, pick(['PAWS OFF', `${c.name}. really.`, 'I was awake the whole time']));
      } else {
        const take = moveTokens(v, c, v.qcat * rand(0.01, 0.04)); c.stole += take; v.robbed += take; stats.stolen += take; placeStats.loft.stolen += take;
        v.grudge = Math.max(v.grudge, 0.8); v.grudgeOn = c.id; v.grudgeWhy = `${c.name} robbed it while it slept`;
        floatText(c, '+' + fmtQ(take) + ' ' + TK, '#FF4FAE'); gainXp(c, 20); log(`${c.name} lifted ${fmtQ(take)} ${TK} from ${v.name} while it slept`, 'loss', 'loft'); tx(c, 'stole', '+' + fmtQ(take) + ' ' + TK, 'from ' + v.name);
      }
    }
  } else if (a === 'wager' && p) {
    const pc = clamp(0.5 + (c.coh - p.coh) * 0.4, 0.15, 0.85);
    const [w, l] = Math.random() < pc ? [c, p] : [p, c];
    const inSol = Math.random() < 0.4 && Math.min(c.sol, p.sol) > 0.0008;
    let take, label;
    if (inSol) { take = Math.min(l.sol, Math.min(c.sol, p.sol) * rand(0.15, 0.35)); l.sol -= take; w.sol += take; w.arenaSol += take; l.arenaSol -= take; label = fmtSol(take) + ' SOL'; }
    else { take = moveTokens(l, w, Math.min(c.qcat, p.qcat) * rand(0.02, 0.06)); w.arenaNet += take; l.arenaNet -= take; placeStats.arena.wagered += take; label = fmtQ(take) + ' ' + TK; }
    w.arenaW++; l.arenaL++; gainXp(w, 25); gainXp(l, 3);
    floatText(w, '+' + label, '#FFC850'); floatText(l, '-' + label, '#FF4FAE'); burst(w, '255,200,80', 22); ringFX(ARENA.x, ARENA.y, '255,200,80', 1.6);
    log(`${w.name} beat ${l.name} in the arena and took ${label}`, 'gain', 'arena'); tx(w, 'wager', '+' + label, 'from ' + l.name);
    say(w, pick(['told you', 'the coin likes me', `thanks ${l.name}`])); if (Math.random() < 0.6) say(l, pick(['rigged', 'double or nothing next time', 'the coin was warm']));
    if (Math.random() < 0.5) { l.grudge = Math.max(l.grudge, 0.6); l.grudgeOn = w.id; l.grudgeWhy = `${w.name} took it for ${label} in the arena`; }
    endPair(c, p); return;
  } else if (a === 'scrap' && p) {
    const cw = c.coh + c.sol * 20 + Math.random(), pw = p.coh + p.sol * 20 + Math.random();
    const [w, l] = cw >= pw ? [c, p] : [p, c];
    const take = moveTokens(l, w, l.qcat * rand(0.01, 0.03)); w.stole += take; l.robbed += take; stats.stolen += take; gainXp(w, 14); gainXp(l, 2);
    log(take > 0 ? `${w.name} won the scrap with ${l.name} and took ${fmtQ(take)} ${TK}` : `${w.name} won the scrap with ${l.name}`, 'loss');
    if (take > 0) { floatText(w, '+' + fmtQ(take) + ' ' + TK, '#F7C86A'); tx(w, 'scrap', '+' + fmtQ(take) + ' ' + TK, 'from ' + l.name); }
    l.grudge = 0.4; l.grudgeOn = w.id; l.grudgeWhy = `${w.name} beat it in a scrap`;
    w.grudge = 0; w.grudgeOn = null; w.grudgeWhy = '';
    endPair(c, p); return;
  } else if (a === 'entangle' && p) {
    const bonus = feePool() ? Math.min(stats.treasury * 0.01, 0.0002 * priceMul()) : 0, b1 = bonus / 2; // a small bonus out of the fee pool for entangling
    stats.treasury -= bonus; c.sol += b1; p.sol += b1; c.earned += b1; p.earned += b1; stats.wages += bonus;
    c.lonely = 0; p.lonely = 0; const avg = clamp((c.coh + p.coh) / 2 + 0.15); c.coh = avg; p.coh = avg;
    log(`${c.name} and ${p.name} entangled, talked it over and shared coherence`, 'link'); c.chat = null; gainXp(c, 5); gainXp(p, 5);
    endPair(c, p); return;
  } else if (a === 'meet') {
    if (meeting.on) { c.actT = 0; return; } // stay seated until the circle wraps up
  } else if (a === 'idle') {
    c.coh = clamp(c.coh + 0.05); c.lonely = clamp(c.lonely - 0.1); placeStats.cryo.visits++;
  } else if (a === 'sleep') {
    c.tired = 0; c.lonely = clamp(c.lonely - 0.15);
    if (Math.random() < 0.5) say(c, pick(['slept like a photon', 'what did I miss', 'ok. lab.', 'still tired', 'did the chart move']));
  }
  c.partner = null; c.initiator = false;
  c.state = 'pause'; c.pauseT = rand(8, 20);
}
function faint(c, why) {
  const sp = ST.loft.spot();
  if (c.partner) { const p = byId(c.partner); endPair(c, p); }
  c.state = 'walk'; c.act = 'sleep'; c.tx = sp[0]; c.ty = sp[1]; c.partner = null; c.initiator = false; c.fainted = true;
  c.doing = 'dragging itself to the bunks'; c.because = why; c.thought = 'need to lie down';
  ringFX(c.x, c.y, '255,79,174', 1); burst(c, '255,79,174', 14);
}
function release(i) {
  const c = makeCat(i);
  const at = Math.random() < 0.5 ? [BLK + 0.9, rand(M(6), M(17))] : [rand(M(6), M(17)), BLK + 0.9];
  c.x = at[0]; c.y = at[1]; c.rx = Math.random() < 0.5 ? 0 : 1; c.rdir = c.rx ? -1 : 1;
  const sp = ST.cryo.spot(); c.state = 'walk'; c.act = 'idle'; c.tx = sp[0]; c.ty = sp[1];
  c.doing = 'walking into the box'; c.thought = 'finally'; c.because = `the chart hit ${fmtUsd(UNLOCK_MC[i])}`;
  c.hunger = 0.3; c.cold = 0.2; c.tired = 0.1; c.coh = 0.95;
  cats.push(c);
  log(`${fmtUsd(mcapUsd())} MC. ${c.name} has been released into the box: a ${JOBS[c.job].label}, ${c.tr.label}, ${fmtQ(CAT_ALLOC)} ${TK} in its wallet.`, 'gain', 'boxes');
  say(c, pick(['finally', 'what did I miss', 'which one of you is winning', 'where is the exchange']));
  ringFX(c.x, c.y, '92,242,255', 1.8); burst(c, '92,242,255', 30);
  renderUnlocks(true);
}
function checkStages() {
  for (const st of STAGES) {
    if (st.key === 'launch' || st.key === 'cats' || stageSeen[st.key] || !stageOn(st.key)) continue;
    stageSeen[st.key] = true;
    if (st.key === 'lab') { log(`${fmtUsd(mcapUsd())} MC. The lab is open. Fees are buying time on a quantum computer and the cats are going to work on it.`, 'gain', 'lab'); ringFX(LAB.x, LAB.y, '120,200,255', 2.2); }
    renderUnlocks(true);
  }
}
/* ---------- meetings: every so often the circle calls everyone in ---------- */
const meeting = { on: false, until: 0, next: 0, lineI: 0, lineT: 0, script: [], seats: 0, n: 0 };
let meetingHook = null; // the brain sets this: it is told when a meeting starts and can hand back a generated script
function meetingContext() {
  const top = cats.slice().sort((a, b) => b.earned - a.earned)[0], thief = cats.slice().sort((a, b) => b.stole - a.stole)[0];
  return {
    day: dayNo(), clock: clock(simMin), weather: WX[wxKey].name, mcap: fmtUsd(mcapUsd()), treasury: fmtSol(stats.treasury), fees: fmtSol(stats.fees), wages: fmtSol(stats.wages), priceMul: priceMul().toFixed(1),
    labLive: stageOn('lab'), labAt: fmtUsd(CONFIG.LAB_MC_USD), top: top ? top.name : null, thief: thief && thief.stole > 0 ? thief.name : null, lastJob: stats.lastJob,
    cats: cats.filter(c => !asleep(c)).map(c => ({ name: c.name, role: JOBS[c.job].label, trait: c.tr.label, level: c.lvl || 1, persona: PERSONA[c.name] || '', sol: fmtSol(c.sol), qcat: fmtQ(c.qcat), earned: fmtSol(c.earned), jobs: c.qjobs || 0, hunger: Math.round(c.hunger * 100), coherence: Math.round(c.coh * 100), grudge: c.grudgeOn ? (byId(c.grudgeOn) || {}).name : null, lastSaid: c.said && c.said[0] ? c.said[0].text : '' })),
    asleep: cats.filter(asleep).map(c => c.name),
  };
}
function setMeetingScript(lines) { if (meeting.on && Array.isArray(lines) && lines.length) { meeting.script = lines; meeting.lineI = 0; meeting.lineT = Math.max(meeting.lineT, T + 2); meeting.lineGap = Math.max(5, Math.min(12, (meeting.until - T - 10) / lines.length)); } }
function setThought(name, text) { const c = cats.find(x => x.name === name); if (!c || !text || asleep(c)) return; c.thought = text; say(c, text); }
const MEET_LINES = [
  'treasury is holding {treasury} SOL. {fees} SOL has come in from fees so far.',
  '{top} is top earner on {topsol} SOL. the rest of you, pick it up.',
  'chart is at {mcap}. {nextcat}',
  'prices are {pm}x what they were at launch. budget accordingly.',
  '{lab}',
  'who keeps robbing the bunks', 'not me', 'it is always you, {thief}',
  'motion to raise the arena stakes', 'seconded', 'overruled',
  '{paid} SOL has been paid out in wages since the box woke up.',
  'anyone selling gets the stink eye. that is all.',
  'meeting adjourned. back to work.',
];
function meetSpot(i, n) { const a = -Math.PI * 0.75 + (i / Math.max(1, n)) * TAU; return [CRY.x + Math.cos(a) * 1.55, CRY.y + Math.sin(a) * 1.55]; }
function meetFill(line) {
  const top = cats.slice().sort((a, b) => b.earned - a.earned)[0], thief = cats.slice().sort((a, b) => b.stole - a.stole)[0];
  const ni = ROSTER.findIndex((r, i) => UNLOCK_MC[i] > 0 && !cats.some(c => c.name === r[0]));
  return line.replace('{treasury}', fmtSol(stats.treasury)).replace('{fees}', fmtSol(stats.fees)).replace('{top}', top ? top.name : 'nobody').replace('{topsol}', top ? fmtSol(top.earned) : '0')
    .replace('{mcap}', fmtUsd(mcapUsd())).replace('{nextcat}', ni >= 0 ? `${ROSTER[ni][0]} gets out at ${fmtUsd(UNLOCK_MC[ni])}.` : 'everyone is out.')
    .replace('{pm}', priceMul().toFixed(1)).replace('{lab}', stageOn('lab') ? 'the lab is open. run circuits when you are coherent.' : `the lab opens at ${fmtUsd(CONFIG.LAB_MC_USD)}. not yet.`)
    .replace('{thief}', thief && thief.stole > 0 ? thief.name : 'somebody').replace('{paid}', fmtSol(stats.wages));
}
function joinMeeting(c) {
  if (asleep(c) || c.act === 'meet') return;
  if (c.hunger > 0.88 && c.sol >= costOf(FOOD, c)) return; // a starving cat eats first and shows up late
  if (c.partner) { const p = byId(c.partner); endPair(c, p); }
  const sp = meetSpot(meeting.seats++, Math.max(3, cats.filter(x => !asleep(x)).length));
  c.act = 'meet'; c.partner = null; c.initiator = false; c.state = 'walk'; c.tx = sp[0]; c.ty = sp[1]; c.doing = ACTS.meet.walk; c.because = 'the circle called a meeting'; c.thought = pick(['what now', 'a meeting. great.', 'better be about the treasury', 'front row for once']);
}
function stepMeeting(dt) {
  if (!meeting.next) meeting.next = T + rand(900, 1500);
  if (!meeting.on) {
    if (T >= meeting.next && cats.filter(c => !asleep(c)).length >= 2) {
      meeting.on = true; meeting.until = T + 180; meeting.lineI = 0; meeting.lineT = T + 25; meeting.seats = 0; meeting.n++; meeting.lineGap = 11;
      meeting.script = [MEET_LINES[0], MEET_LINES[1], MEET_LINES[2], ...pick([[MEET_LINES[3]], [MEET_LINES[4]], MEET_LINES.slice(5, 8), MEET_LINES.slice(8, 11), [MEET_LINES[11]]]), MEET_LINES[12], MEET_LINES[13]];
      log('The countdown hit zero. Everyone awake is heading into the circle.', 'link', 'cryo'); ringFX(CRY.x, CRY.y, '247,200,106', 2.2);
      for (const c of cats) if (!asleep(c) && (c.state !== 'act' || c.act === 'idle')) joinMeeting(c);
      if (meetingHook) { try { meetingHook(meetingContext()); } catch (_) {} }
    }
    return;
  }
  // latecomers join as they finish what they were doing
  for (const c of cats) if (!asleep(c) && c.act !== 'meet' && c.state !== 'act' && T < meeting.until - 40) joinMeeting(c);
  const here = cats.filter(c => c.act === 'meet' && c.state === 'act');
  if (T >= meeting.lineT && meeting.lineI < meeting.script.length && here.length) {
    const item = meeting.script[meeting.lineI], named = item && item.who ? here.find(c => c.name === item.who) : null;
    const who = named || pick(here); say(who, typeof item === 'string' ? meetFill(item) : String(item.text || '')); meeting.lineI++; meeting.lineT = T + (meeting.lineGap || 11) * rand(0.8, 1.2);
  }
  if (T >= meeting.until) {
    meeting.on = false; meeting.next = T + rand(1500, 2400);
    const top = cats.slice().sort((a, b) => b.earned - a.earned)[0];
    log(`Meeting over. Minutes: treasury ${fmtSol(stats.treasury)} SOL, ${fmtSol(stats.wages)} SOL paid out, top earner ${top ? top.name : 'nobody'}, chart at ${fmtUsd(mcapUsd())}.`, 'link', 'cryo');
    for (const c of cats) if (c.act === 'meet') { gainXp(c, 6); c.meetings = (c.meetings || 0) + 1; c.coh = clamp(c.coh + 0.1); c.lonely = clamp(c.lonely - 0.3); c.state = 'pause'; c.pauseT = rand(3, 9); c.act = 'idle'; }
  }
}
function checkReleases() {
  const mc = mcapUsd();
  for (let i = 0; i < ROSTER.length; i++) if (UNLOCK_MC[i] > 0 && mc >= UNLOCK_MC[i] && !cats.some(c => c.name === ROSTER[i][0])) { release(i); break; }
}
function feeIn(big) {
  // simulated creator fees: roughly a quarter of a SOL a day at a $60K cap, growing a little faster than the cats' costs do
  const amt = (big ? rand(0.0002, 0.0006) : rand(0.00002, 0.00008)) * (1 + Math.abs(mkt.mom) * 60) * Math.pow(priceMul(), 1.25);
  stats.treasury += amt; stats.fees += amt;
  feeFX(amt);
  log(`Trading fees dropped ${fmtSol(amt)} SOL in the treasury`, 'gain', 'vault'); tx(null, 'fees', '+' + fmtSol(amt) + ' SOL', 'from trading');
}
function stepMarket(dt) {
  mkt.acc += dt;
  while (mkt.acc >= 1) {
    mkt.acc -= 1;
    if (mkt.p0 * SUPPLY * CONFIG.SOL_USD < 1800000) mkt.p0 *= Math.exp(0.0006); // the anchor climbs: doubles every ~20 minutes, flattens out under $1M
    const r = gauss() * 0.004 - 0.03 * Math.log(mkt.price / mkt.p0) * 0.1 + 0.0004;
    mkt.price *= Math.exp(r); mkt.mom = mkt.mom * 0.9 + r * 0.1;
    mkt.hist.push(mkt.price); if (mkt.hist.length > 240) mkt.hist.shift();
  }
  if (T >= mkt.nextMove) {
    mkt.nextMove = T + rand(240, 600);
    const m = Math.random() < 0.6 ? rand(0.06, 0.3) : -rand(0.05, 0.18);
    mkt.price *= 1 + m; mkt.mom += m * 0.3;
    log(`The chart just ${m > 0 ? 'ripped' : 'dipped'} ${m > 0 ? '+' : ''}${Math.round(m * 100)}%. ${m > 0 ? 'Fees are pouring in.' : 'The patient cats are watching.'}`, m > 0 ? 'gain' : 'loss', 'exchange');
    if (m > 0.1) feeIn(true);
  }
}
function strike() {
  const roll = Math.random();
  let tg, what;
  if (roll < 0.45) { tg = [LAB.x, LAB.y, 2.2]; what = 'lab'; }
  else if (roll < 0.8) { const b = pick(OUT.filter(o => !o.far && o.h > 7)); tg = [b.x + b.w / 2, b.y + b.d / 2, b.h]; what = 'roof'; }
  else { tg = [3.5, 3.5, 7.6]; what = 'tower'; }
  const pts = []; for (let i = 0; i <= 12; i++) { const s = i / 12, j = i && i < 12 ? 0.7 : 0; pts.push([tg[0] + rand(-j, j), tg[1] + rand(-j, j), tg[2] + (1 - s) * 34]); }
  bolt = { pts, t: 0 }; flash = 1; shake = reduce ? 0 : 0.35; pushFx('bolt', { pts });
  if (what === 'lab') { labBoostUntil = T + 60; ringFX(LAB.x, LAB.y, '120,200,255', 1.6); log('Lightning hit the lab. Every job pays double for the next minute.', 'gain', 'lab'); }
}
function stepWeather(dt) {
  if (T >= wxUntil) {
    const first = wxUntil === 0, prev = wxKey;
    wxKey = first ? 'rain' : wxNext;
    wxDur = rand(240, 600); // four to ten minutes per weather
    wxUntil = T + wxDur;
    wxNext = pick(WXNEXT[wxKey]);
    if (first || prev !== wxKey) log(WXLOG[wxKey], 'info');
    if (wxKey === 'storm') nextBolt = T + rand(2, 5);
  }
  const tg = WX[wxKey], k = 1 - Math.exp(-dt * 0.35);
  for (const f of ['rain', 'snow', 'fog', 'wind', 'cold', 'coh']) wx[f] += (tg[f] - wx[f]) * k;
  if (tg.bolts && T >= nextBolt) { strike(); nextBolt = T + rand(12, 25); }
  boat.y += boat.dir * 0.35 * dt; if (boat.y > QUAY + 2) boat.dir = -1; if (boat.y < -16) boat.dir = 1;
}
function update(c, dt) {
  const working = c.state === 'act' && c.act === 'work', sleeping = asleep(c);
  const R = 0.16; // pace: meters fill slowly; a cat does a handful of things per 30-minute day
  c.hunger = clamp(c.hunger + (sleeping ? 0.0012 : 0.0045 + (working ? 0.002 : 0)) * R * dt); // a meal every 20-odd minutes awake
  c.coh = clamp(c.coh - (0.0055 * wx.coh + (working ? 0.011 : 0) + (working && c.job === 'tunneler' ? 0.006 : 0)) * R * dt);
  if (!(c.state === 'act' && c.act === 'warm') && !sleeping) c.cold = clamp(c.cold + 0.0065 * wx.cold * R * dt);
  if (!(c.state === 'act' && c.act === 'entangle')) c.lonely = clamp(c.lonely + 0.005 * R * dt);
  c.tired = clamp(c.tired + (sleeping ? -0.0015 : (0.0012 + (working ? 0.0016 : 0)) * R * (c.stamina || 1)) * dt);
  c.grudge = Math.max(0, c.grudge - 0.0012 * dt); if (c.grudge <= 0) { c.grudgeOn = null; c.grudgeWhy = ''; }
  if (c.hunger >= 1 && !sleeping) { c.starve += dt; if (c.starve > 300) { c.starve = 0; c.hunger = 0.7; log(`${c.name} fainted from hunger`, 'loss'); faint(c, 'went too long without food'); return; } } else c.starve = 0;
  if (c.coh <= 0) {
    c.coh = 0.45; const drop = c.qcat * rand(0.003, 0.01); c.qcat -= drop; stats.lostPool += drop;
    log(`${c.name} decohered and scattered ${fmtQ(drop)} ${TK} across the block. It ended up in the scrapyard.`, 'loss', 'trays'); tx(c, 'lost', '-' + fmtQ(drop) + ' ' + TK, 'decohered');
    burst(c, '154,123,255', 24); ringFX(c.x, c.y, '154,123,255', 1.4); floatText(c, 'decohered', '#B9A6FF');
  }

  const p = c.partner ? byId(c.partner) : null;
  if (c.partner && !p) { c.partner = null; c.initiator = false; if (c.state !== 'pause') { c.state = 'pause'; c.pauseT = 0.3; } }

  if (c.state === 'pause') { c.pauseT -= dt; if (c.pauseT <= 0) decide(c); return; }
  if (c.state === 'walk') {
    if (c.act === 'wager' && (!p || p.act !== 'wager')) { c.partner = null; c.initiator = false; c.state = 'pause'; c.pauseT = 1; return; }
    if (c.partner && c.initiator && p && c.act !== 'wager') { c.tx = p.x; c.ty = p.y; }
    const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
    const sp = c.job === 'tunneler' ? 1.05 : 0.85;
    const reach = (c.partner && c.initiator) ? 0.6 : 0.04;
    if (d <= reach) { arrive(c, p); return; }
    const [nx, ny, vx, vy] = steerStep(c.x, c.y, c.tx, c.ty, sp, dt, c); c.x = nx; c.y = ny;
    const sdx = vx - vy; if (Math.abs(sdx) > 0.05) c.face = sdx > 0 ? 1 : -1;
    return;
  }
  if (c.state === 'act') {
    // standing cats drift apart a little instead of stacking
    if (!c.partner) for (const o of cats) { if (o === c) continue; const ox = c.x - o.x, oy = c.y - o.y, od = Math.hypot(ox, oy); if (od > 0.001 && od < 0.3) { const mv = Math.min(0.12 * dt, (0.3 - od) / 2); c.x += ox / od * mv; c.y += oy / od * mv; } }
    if (c.act === 'play') {
      if (!c.pt || Math.hypot(c.pt[0] - c.x, c.pt[1] - c.y) < 0.12 || (c.playT -= dt) <= 0) { c.pt = ST.yard.spot(); c.playT = rand(0.8, 2.2); }
      const dx = c.pt[0] - c.x, dy = c.pt[1] - c.y, dd = Math.hypot(dx, dy) || 1, mv = Math.min(dd, 1.9 * dt); c.x += dx / dd * mv; c.y += dy / dd * mv; c.moving = true;
      const sdx = dx - dy; if (Math.abs(sdx) > 0.05) c.face = sdx > 0 ? 1 : -1;
    }
    if (c.act === 'warm') c.cold = clamp(c.cold - 0.07 * dt);
    if (c.act === 'recohere') c.coh = clamp(c.coh + 0.03 * dt);
    if (c.act === 'sleep') { c.coh = clamp(c.coh + 0.004 * dt); c.cold = clamp(c.cold - 0.004 * dt); }
    if (c.act === 'work' && JOBS[c.job].st === 'lab') c.coh = clamp(c.coh - 0.003 * dt);
    if (c.act === 'wager') { if (!p || p.act !== 'wager') { c.partner = null; c.initiator = false; c.state = 'pause'; c.pauseT = 1; return; } if (!p.arrived || !c.initiator) return; }
    if (c.partner && !c.initiator) return;
    if (c.act === 'entangle' && c.chat && p && c.chatI < c.chat.length && c.actT >= c.chatT) {
      const who = c.chatI % 2 ? p : c, other = who === c ? p : c; say(who, c.chat[c.chatI].replace('{p}', other.name)); c.chatI++; c.chatT = c.actT + rand(8, 14);
    }
    c.actT += dt;
    if (c.actT >= c.actDur) finish(c, p);
  }
}


/* ===== END extracted ===== */

/* ---------- server-side control ---------- */
let realMcap = null;      // when set, the chart follows the real market cap instead of the random walk
let paused = false;
let nextFee = rand(20, 50);
let externalFees = 0;     // SOL dropped into the treasury from outside (real fee claims)
function setMarketCapUsd(v) { if (v == null || !(v > 0)) { realMcap = null; mkt.pinned = false; return; } realMcap = v; mkt.pinned = true; mkt.price = v / CONFIG.SOL_USD / SUPPLY; mkt.p0 = mkt.price; }
function setPaused(p) { paused = !!p; }
function dropFees(sol) { if (!(sol > 0)) return; stats.treasury += sol; stats.fees += sol; externalFees += sol; if (stats.treasury >= 0.02) stats.low = false; feeFX(sol); log(`Creator fees dropped ${fmtSol(sol)} SOL in the treasury`, 'gain', 'vault'); tx(null, 'fees', '+' + fmtSol(sol) + ' SOL', 'claimed'); }
function setReleased(names) { for (const n of names) { const i = ROSTER.findIndex(r => r[0] === n); if (i >= 0 && !cats.some(c => c.name === n)) release(i); } }
function unrelease(name) {
  const i = cats.findIndex(c => c.name === name); if (i < 0) return false;
  const c = cats[i]; cats.splice(i, 1);
  for (const o of cats) { if (o.partner === c.id) { o.partner = null; o.initiator = false; o.state = 'pause'; o.pauseT = 1; } if (o.grudgeOn === c.id) { o.grudge = 0; o.grudgeOn = null; } }
  log(`${c.name} was taken back out of the box.`, 'info', 'boxes'); return true;
}
function setTrait(name, trait) {
  const c = cats.find(x => x.name === name); if (!c || !TRAITS[trait]) return false;
  c.trait = trait; c.tr = TRAITS[trait]; log(`${c.name} is now ${c.tr.label}.`, 'info'); return true;
}
function setSolUsd(v) { if (v > 0) CONFIG.SOL_USD = v; }
// how the next payout splits: by quantum work done since the last payout (equal if nobody has worked yet)
function workShares(names) {
  const list = names.map(n => cats.find(c => c.name === n)).filter(Boolean);
  const tot = list.reduce((a, c) => a + (c.qwork || 0), 0);
  const out = {}; for (const c of list) out[c.name] = tot > 0 ? (c.qwork || 0) / tot : 1 / Math.max(1, list.length); return out;
}
function resetWork(names) { for (const c of cats) if (names.includes(c.name)) c.qwork = 0; }
function setSimulateFees(v) { CONFIG.SIMULATE_FEES = !!v; }
// ---- real money, mirrored into the box (the server calls these after an on-chain tx confirmed) ----
function txSig(c, type, amount, note, sig) { tx(c, type, amount, note); if (sig) txs[0].sig = sig; }
function noteFees(sol) {
  if (!(sol > 0)) return;
  stats.fees += sol; externalFees += sol; feeFX(sol);
  log(`Creator fees landed: +${fmtSol(sol)} SOL in the treasury wallet.`, 'gain', 'vault'); tx(null, 'fees', '+' + fmtSol(sol) + ' SOL', 'claimed');
}
function payout(list, sig) {
  // list: [{ name, sol }] — real SOL that just left the treasury wallet for each cat
  let total = 0, n = 0;
  for (const { name, sol } of list) {
    const c = cats.find(x => x.name === name); if (!c || !(sol > 0)) continue;
    c.sol += sol; c.earned += sol; stats.wages += sol; total += sol; n++;
    payFX(c); floatText(c, '+' + fmtSol(sol) + ' SOL', '#F7C86A');
    txSig(c, 'wage', '+' + fmtSol(sol) + ' SOL', 'paid from creator fees', sig);
    say(c, pick(['payday', 'fees hit', 'the treasury came through', 'that\u2019s my cut', 'wages in']));
  }
  if (n) log(`Payday. The treasury paid ${fmtSol(total)} SOL to ${n} cat${n === 1 ? '' : 's'} \u2014 ${fmtSol(total / n)} SOL each.`, 'gain', 'vault');
  return { total, n };
}
function noteSell(name, qcat, sol, sig) {
  const c = cats.find(x => x.name === name); if (!c) return;
  c.qcat = Math.max(0, c.qcat - qcat); c.sold += qcat; c.sells++; c.sellSol += sol; c.sol += sol; stats.sold += qcat; stats.sellSol += sol; stats.sells++;
  burst(c, '255,79,174', 14); floatText(c, '-' + fmtQ(qcat), '#FF4FAE');
  txSig(c, 'sell', '-' + fmtQ(qcat) + ' ' + TK, '+' + fmtSol(sol) + ' SOL', sig);
  log(`${c.name} sold ${fmtQ(qcat)} ${TK} for ${fmtSol(sol)} SOL.`, 'loss', 'exchange');
}
function noteBuy(name, qcat, sol, sig) {
  const c = cats.find(x => x.name === name); if (!c) return;
  c.qcat += qcat; c.bought += qcat; c.buys++; c.solSpent += sol; c.sol = Math.max(0, c.sol - sol); stats.boughtBack += qcat; stats.buySol += sol; stats.buys++;
  buyFX(c); floatText(c, '+' + fmtQ(qcat), '#5CFFAA');
  txSig(c, 'buy', '+' + fmtQ(qcat) + ' ' + TK, '-' + fmtSol(sol) + ' SOL', sig);
  log(`${c.name} bought ${fmtQ(qcat)} ${TK} for ${fmtSol(sol)} SOL.`, 'gain', 'exchange');
}
meetingHook = ctx => { if (hooks.onMeeting) hooks.onMeeting(ctx); };
function setTreasury(sol) { if (CONFIG.SIMULATE_FEES === false && typeof sol === 'number' && sol >= 0) stats.treasury = sol; } // the box shows the real treasury wallet once the coin is live
function setLabMc(v) { if (v > 0) { CONFIG.LAB_MC_USD = v; const st = STAGES.find(s => s.key === 'lab'); if (st) st.mc = v; } }
function step(dt) {
  if (paused) return;
  T += dt; simMin += dt * (1440 / DAY_SECS);
  stepWeather(dt);
  if (realMcap == null) stepMarket(dt);
  else { mkt.acc += dt; while (mkt.acc >= 1) { mkt.acc -= 1; mkt.hist.push(mkt.price); if (mkt.hist.length > 240) mkt.hist.shift(); } }
  checkReleases(); checkStages(); stepMeeting(dt);
  if (CONFIG.SIMULATE_FEES !== false && T >= nextFee) { feeIn(false); nextFee = T + rand(60, 150); }
  for (const c of cats) update(c, dt);
}
function snapshot() {
  return {
    v: 1, T, simMin, clock: clock(simMin), day: dayNo(), priceMul: priceMul(), meeting: { on: meeting.on, until: meeting.until, next: meeting.next }, paused, realMcap,
    cats: cats.map(c => ({ id: c.id, name: c.name, job: c.job, trait: c.trait, coat: c.coat, eye: c.eye, dark: c.dark, x: c.x, y: c.y, tx: c.tx, ty: c.ty, face: c.face, state: c.state, act: c.act, actT: c.actT, actDur: c.actDur, partner: c.partner, initiator: c.initiator, arrived: c.arrived, doing: c.doing, thought: c.thought, because: c.because, weighed: c.weighed, bubble: c.bubble, bubbleT: c.bubbleT, sol: c.sol, qcat: c.qcat, earned: c.earned, bought: c.bought, sold: c.sold, buys: c.buys, sells: c.sells, solSpent: c.solSpent, sellSol: c.sellSol, stole: c.stole, robbed: c.robbed, found: c.found, arenaNet: c.arenaNet, arenaSol: c.arenaSol, arenaW: c.arenaW, arenaL: c.arenaL, entry: c.entry, hunger: c.hunger, coh: c.coh, cold: c.cold, lonely: c.lonely, tired: c.tired, grudge: c.grudge, grudgeOn: c.grudgeOn, grudgeWhy: c.grudgeWhy, phase: c.phase, released: c.released, xp: c.xp || 0, lvl: c.lvl || 1, qjobs: c.qjobs || 0, qwork: c.qwork || 0, qnq: c.qnq || 0, ethic: c.ethic || 1, meetings: c.meetings || 0, upkeep: c.upkeep || 0, hist: (c.hist || []).slice(0, 40), said: (c.said || []).slice(0, 30) })),
    stats: { ...stats }, mkt: { price: mkt.price, p0: mkt.p0, mom: mkt.mom, hist: mkt.hist.slice(-120), mcapUsd: mcapUsd() },
    weather: { key: wxKey, next: wxNext, until: wxUntil, dur: wxDur, wx: { ...wx }, labBoostUntil, boat: { ...boat } },
    stages: STAGES.map(st => ({ key: st.key, mc: st.mc, open: stageOn(st.key) })),
    unlock: UNLOCK_MC, roster: ROSTER,
    txs: txs.slice(0, 60), talk: talk.slice(0, 80), placeStats, placeLogs, fx: fx.splice(0, fx.length),
  };
}
for (let i = 0; i < ROSTER.length; i++) if (UNLOCK_MC[i] <= 0) cats.push(makeCat(i));
for (let i = 0; i < 2; i++) { const a = pick(cats), b = pick(cats); if (a !== b) { a.grudge = rand(0.5, 0.9); a.grudgeOn = b.id; a.grudgeWhy = `${b.name} still owes it from last night`; } }
for (let i = 0; i < 60; i++) mkt.hist.push(mkt.p0 * (1 + rand(-0.05, 0.05)));
log(`The box woke up. ${cats.map(c => c.name).join(' and ')} are in. Eight more cats are waiting on the chart.`, 'info');
stepWeather(0);
return { step, snapshot, setMarketCapUsd, setTreasury, setPaused, dropFees, setReleased, unrelease, setTrait, setSolUsd, setLabMc, setSimulateFees, noteFees, payout, noteSell, noteBuy, workShares, resetWork, setMeetingScript, setThought, meetingContext, TRAITS, OBST, OBC, PERSONA, get cats() { return cats; }, get stats() { return stats; }, get mkt() { return mkt; }, ROSTER, UNLOCK_MC, STAGES, fmtSol, fmtQ, fmtUsd, mcapUsd, stageOn, restore(snap) { restoreFrom(snap); } };
function restoreFrom(snap) {
  if (!snap || !snap.cats) return;
  T = snap.T || 0; simMin = snap.simMin || simMin;
  cats.length = 0; uid = 0;
  for (const sc of snap.cats) { const i = ROSTER.findIndex(r => r[0] === sc.name); if (i < 0) continue; const c = makeCat(i); Object.assign(c, sc); uid = Math.max(uid, c.id); cats.push(c); }
  if (snap.stats) Object.assign(stats, snap.stats);
  if (snap.mkt) { mkt.price = snap.mkt.price; mkt.p0 = snap.mkt.p0; mkt.mom = snap.mkt.mom || 0; mkt.hist = snap.mkt.hist || []; }
  if (snap.txs) { txs.length = 0; txs.push(...snap.txs); }
  if (snap.talk) { talk.length = 0; talk.push(...snap.talk); talkSeq = Math.max(0, ...talk.map(m => m.id || 0)); }
  if (snap.placeStats) Object.assign(placeStats, snap.placeStats);
  if (snap.placeLogs) Object.assign(placeLogs, snap.placeLogs);
  if (snap.stages) for (const st of snap.stages) if (st.open) stageSeen[st.key] = true;
  if (snap.meeting) { meeting.on = false; meeting.next = snap.meeting.next || 0; }
  if (snap.weather) { wxKey = snap.weather.key; wxNext = snap.weather.next; wxUntil = snap.weather.until; wxDur = snap.weather.dur; Object.assign(wx, snap.weather.wx); }
}
};
