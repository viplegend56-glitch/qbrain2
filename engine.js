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
const renderUnlocks = () => {};
// talk + log + ledger
const talk = []; let talkSeq = 0;
function talkPush(m) { m.id = ++talkSeq; talk.unshift(m); if (talk.length > 80) talk.pop(); }
function say(c, text) { if (!text) return; c.bubble = text; c.bubbleT = T; talkPush({ sys: false, cat: c.id, name: c.name, coat: c.coat, eye: c.eye, text, t: clock(simMin) }); }
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
  { x: 2, y: 9.4, w: 3, d: 2.8, h: 5.8 },
  { x: 2, y: 12.8, w: 3, d: 2.6, h: 3.6 },
  { x: 2, y: 16, w: 3, d: 2.2, h: 2.4 },
  { x: 5.6, y: 2, w: 3.2, d: 3, h: 5.2 },
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
  rig:    { label: 'the rig',         spot: () => [rand(M(6.4), M(8.4)), rand(M(9.3), M(10.2))] },
  relay:  { label: 'the relay',       spot: () => [rand(M(14.0), M(16.0)), rand(M(8.5), M(9.4))] },
  tunnel: { label: 'the tunnel',      spot: () => [rand(M(7.9), M(9.1)), rand(M(15.5), M(16.3))] },
  cryo:   { label: 'the cryostat',    spot: () => { const a = rand(0, TAU), r = rand(1.3, 1.65); return [M(11.6) + Math.cos(a) * r, M(11.6) + Math.sin(a) * r]; } },
  crates: { label: 'the crates',      spot: () => [rand(M(15.0), M(16.6)), rand(M(15.5), M(16.4))] },
  vent:   { label: 'the vent',        spot: () => [rand(M(11.8), M(12.9)), rand(M(16.3), M(16.9))] },
  trays:  { label: 'the cable trays', spot: () => [rand(M(15.6), M(16.2)), rand(M(10.4), M(12.8))] },
  boxes:  { label: 'the boxes',       spot: () => [rand(M(9.4), M(11.1)), rand(M(7.3), M(8.1))] },
  loft:   { label: 'the loft',        spot: () => [rand(M(17.1), M(17.7)), rand(M(5.6), M(6.0))] },
  exchange: { label: 'the exchange',  spot: () => [rand(M(6.9), M(7.6)), rand(M(10.9), M(12.1))] },
  arena:    { label: 'the arena',     spot: () => [rand(M(9.0), M(10.0)), rand(M(12.1), M(13.1))] },
  lab:      { label: 'the lab',       spot: () => [rand(M(13.6), M(14.6)), rand(M(11.4), M(11.75))] },
};
const ARENA = { x: M(9.5), y: M(12.6), r: 0.95, slots: [[M(9.0), M(12.95)], [M(10.0), M(12.25)]] };
const LABELS = [['vault', M(13.2), M(13.3), 2.2], ['rig', M(6.9), M(8.1), 2.7], ['relay', M(14.9), M(7.0), 4.4], ['cryo', M(11.6), M(11.6), 5.4], ['tunnel', M(7.6), M(14.75), 2.8], ['crates', M(15.8), M(14.6), 1.8], ['vent', M(12.3), M(16.5), 0.7], ['trays', M(16.9), M(11.6), 1.3], ['boxes', M(9.9), M(6.5), 1.4], ['loft', M(17.4), M(5.8), 1.8], ['exchange', M(6.1), M(11.5), 2.4], ['arena', M(9.5), M(12.6), 1.6], ['lab', M(14.1), M(10.55), 2.4]];
const LAMPS = [[BLK - 0.4, M(6.5)], [BLK - 0.4, M(12)], [BLK - 0.4, M(17.2)], [M(6.5), BLK - 0.4], [M(12), BLK - 0.4]];
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
const VAULT = { x: M(13.2), y: M(13.3) };
const EXC = { x: M(6.1), y: M(11.5) }, LAB = { x: M(14.1), y: M(10.55) }, CRY = { x: M(11.6), y: M(11.6) }, TUN = { x: M(7.6), y: M(14.75) }, VENT = { x: M(11.6), y: M(16.1) };
const CITY_BLOCKS = [[-20, -20, false], [0, -20, false], [-20, 0, false], [-40, -40, true], [-20, -40, true], [0, -40, true], [-40, -20, true], [-40, 0, true]];
const OUT = [];
(function genCity() {
  let sd = 20261010;
  const r = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
  for (const [bx0, by0, far] of CITY_BLOCKS) {
    const near = bx0 === -20 && by0 === -20;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      if (r() < 0.12) continue;
      const w = 2.4 + r() * 1.2, d = 2.4 + r() * 1.2;
      const x = bx0 + 1.9 + i * 4.1 + r() * (3.6 - w), y = by0 + 1.9 + j * 4.1 + r() * (3.6 - d);
      const h = far ? 9 + r() * 15 : near ? 6 + r() * 9 : 3 + r() * 8;
      const b = { x, y, w, d, h, far, win: [], light: h > 8 && r() < 0.6, ph: r() * 10 };
      const n = far ? 5 : 12;
      for (let k = 0; k < n; k++) { const f = r() < 0.5 ? 'L' : 'R', len = f === 'L' ? w : d; b.win.push({ f, u: (f === 'L' ? x : y) + 0.25 + r() * (len - 0.7), z: 0.5 + r() * (h - 1.2), on: r() < 0.6, c: WINC[Math.floor(r() * WINC.length)], ph: r() * 100 }); }
      OUT.push(b);
    }
  }
  const SIGNS = [['QPU', '92,242,255'], ['CRYO', '154,123,255'], ['24H', '255,79,174'], ['QUBITS', '247,200,106'], ['ENTANGLE', '255,79,174']];
  const cand = OUT.filter(b => !b.far && b.h > 6 && b.w > 2.8);
  for (let i = 0; i < SIGNS.length && cand.length; i++) { const b = cand.splice(Math.floor(r() * cand.length), 1)[0]; b.sign = { text: SIGNS[i][0], c: SIGNS[i][1] }; }
})();
OUT.sort((a, b) => (a.x + a.w / 2 + a.y + a.d / 2) - (b.x + b.w / 2 + b.y + b.d / 2));
const SHIM = [];
for (let i = 0; i < 70; i++) SHIM.push(Math.random() < 0.5 ? { x: rand(QUAY + 0.8, 46), y: rand(-40, 46), ph: rand(0, TAU) } : { x: rand(-40, 46), y: rand(QUAY + 0.8, 46), ph: rand(0, TAU) });
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
const WXNEXT = { clear: ['drizzle', 'fog', 'snow', 'drizzle', 'storm', 'clear'], drizzle: ['rain', 'clear', 'rain', 'snow'], rain: ['storm', 'drizzle', 'clear', 'storm'], storm: ['rain', 'clear', 'drizzle'], fog: ['clear', 'drizzle', 'storm'], snow: ['clear', 'fog', 'snow', 'storm'] };
const WXLOG = { clear: 'The sky cleared over the block.', drizzle: 'A drizzle started. Strays are looking for cover.', rain: 'Rain rolled in off the harbor.', storm: 'A decoherence storm hit the block. Coherence is draining fast.', fog: 'Fog came in off the harbor.', snow: 'It started snowing. The vent is going to be crowded.' };
let wxNext = 'rain', wxDur = 1, wxKey = 'clear', wxUntil = 0, nextBolt = 0, flash = 0, shake = 0, bolt = null, relayBoostUntil = 0;
const wx = { rain: 0, snow: 0, fog: 0.04, wind: 0.15, cold: 1, coh: 1 };
const drops = [], flakes = [], splashes = [], ripples = [];
const WXEFF = {
  clear: 'Calm night. Nothing working against the strays.',
  drizzle: 'A little colder than usual.',
  rain: 'Cold builds fast and the relay gets slick.',
  storm: 'Coherence drains fast. Lightning can hit the relay.',
  fog: 'Coherence drains a bit faster.',
  snow: 'Cold builds very fast. The vent gets crowded.',
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
const SUPPLY = 1e9, CAT_ALLOC = 1e6; // 1% of supply, 0.1% per cat
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
  { key: 'launch', title: 'Launch', mc: 0, blurb: 'Two cats, the rig, the relay, the exchange. They work for fees and trade.' },
  { key: 'cats', title: 'The cats', mc: 10000, mcEnd: 500000, blurb: 'Eight more cats are released as the chart climbs: $10K, $20K, $30K, $50K, $100K, $150K, $300K, $500K.' },
  { key: 'lab', title: 'The lab', mc: CONFIG.LAB_MC_USD, blurb: 'A real quantum computer behind the cryostat. Fees buy time on it and the cats start running quantum work, with every job receipt on the page.' },
];
const stageSeen = {};
const stageOn = k => { if (stageSeen[k]) return true; const st = STAGES.find(x => x.key === k); return !!st && mcapUsd() >= st.mc; };
const ROSTER = [
  ['Miso', 'miner', 'degen'], ['Qubit', 'tunneler', 'greedy'], ['Nori', 'cooler', 'patient'], ['Pixel', 'runner', 'degen'], ['Mochi', 'miner', 'loyal'],
  ['Static', 'tunneler', 'degen'], ['Olive', 'cooler', 'loyal'], ['Photon', 'runner', 'patient'], ['Biscuit', 'miner', 'greedy'], ['Echo', 'cooler', 'patient'],
];
const JOBS = {
  miner:    { label: 'miner',    st: 'rig',    verb: 'digging qubits at the rig',       pay: [0.0012, 0.003],  risk: 0,    riskWhy: '',                   did: 'dug {n} out of the rig' },
  runner:   { label: 'runner',   st: 'relay',  verb: 'running qubits over the relay',   pay: [0.0016, 0.0042],  risk: 0.08, riskWhy: 'slipped off the relay and dropped the pay', did: 'ran a load over the relay for {n}' },
  tunneler: { label: 'tunneler', st: 'tunnel', verb: 'slipping through the tunnel',     pay: [0.0028, 0.007],  risk: 0.14, riskWhy: 'got turned around in the tunnel', did: 'came back through the tunnel with {n}' },
  cooler:   { label: 'cooler',   st: 'cryo',   verb: 'keeping the cryostat cold',       pay: [0.001, 0.0024], risk: 0,    riskWhy: '',                   did: 'kept the cryostat cold for {n}' },
};
const ACTS = {
  eat:      { st: 'crates',   dur: 14,   verb: 'eating at the crates',          walk: 'heading to the crates',          color: '247,200,106', name: 'eat' },
  hunt:     { st: 'trays',    dur: 16,   verb: 'hunting in the cable trays',    walk: 'creeping toward the cable trays', color: '255,138,92', name: 'hunt' },
  work:     {                 dur: 28,                                                                                     color: '92,242,255', name: 'work' },
  recohere: { st: 'cryo',     dur: 20,   verb: 'recohering under the cryostat', walk: 'drifting toward the cryostat',    color: '154,123,255', name: 'recohere' },
  warm:     { st: 'vent',     dur: 16,   verb: 'warming up at the vent',        walk: 'heading for the vent',            color: '255,138,92', name: 'warm up' },
  sell:     { st: 'exchange', dur: 12,  verb: 'selling at the exchange',       walk: 'heading to the exchange',         color: '255,120,120', name: 'sell' },
  buy:      { st: 'exchange', dur: 12, verb: 'buying at the exchange',        walk: 'heading to the exchange',         color: '92,255,170', name: 'buy' },
  steal:    { st: 'loft',     dur: 14,   verb: 'sneaking around the loft',      walk: 'creeping toward the loft',        color: '255,79,174', name: 'steal' },
  wager:    { st: 'arena',    dur: 24,                                                                                   color: '255,200,80', name: 'wager' },
  scrap:    {                 dur: 10,                                                                                   color: '255,79,174', name: 'scrap' },
  entangle: {                 dur: 22,                                                                                     color: '154,123,255', name: 'entangle' },
  idle:     { st: 'boxes',    dur: 18,   verb: 'curled up in a box',            walk: 'wandering to the boxes',          color: '140,151,194', name: 'rest' },
  circuit:  { st: 'lab',      dur: 30,  verb: 'running a circuit in the lab',   walk: 'heading to the lab',              color: '120,200,255', name: 'run a circuit' },
  sleep:    { st: 'loft',     dur: 120,  verb: 'asleep in the loft',            walk: 'heading to the loft to sleep',    color: '110,120,170', name: 'sleep' },
};
const FOOD = 0.0006, CRYO = 0.0004, WARM = 0.0003, RESERVE = 0.0016;
const spare = c => Math.max(0, c.sol - RESERVE);
function sellUrge(c) {
  if (c.qcat < 20000) return 0;
  let w = 0;
  if (c.sol < FOOD && c.hunger > 0.5 && c.tr.label !== 'diamond paws') w = 0.6;
  if (c.tr.tp && mkt.price > c.entry * c.tr.tp) w = Math.max(w, 0.7);
  if (c.tr.panic && mkt.mom < -0.004) w = Math.max(w, 0.62);
  return w;
}
const anyoneAsleep = c => cats.some(o => o !== c && asleep(o));
const DRIVES = [
  { act: 'eat',      label: 'hungry',                   w: c => c.hunger * 1.25 * (c.sol >= FOOD ? 1 : 0.15) },
  { act: 'hunt',     label: 'broke and hungry',         w: c => c.hunger * (c.sol < FOOD ? 1.2 : 0.3) + (stats.lostPool > 2000 ? 0.25 : 0) },
  { act: 'recohere', label: 'decohering',               w: c => (1 - c.coh) * 1.3 * (c.sol >= CRYO ? 1 : 0.45) },
  { act: 'warm',     label: 'cold',                     w: c => c.cold * 0.95 * (c.sol >= WARM ? 1 : 0.4) },
  { act: 'work',     label: 'needs SOL',                w: c => clamp(1 - c.sol / 0.012) * 1.05 + 0.12 },
  { act: 'buy',      label: 'spare SOL',                w: c => clamp(spare(c) / 0.008) * 0.9 * c.tr.eager * (1 + (c.tr.dip ? -mkt.mom * 40 * c.tr.dip : mkt.mom * 40) ) },
  { act: 'sell',     label: c => (c.sol < FOOD && c.hunger > 0.5 ? 'broke, selling to eat' : c.tr.panic && mkt.mom < -0.004 ? 'chart is dumping' : 'taking profit'), w: c => sellUrge(c) },
  { act: 'steal',    label: 'light paws',               w: c => (c.sol < FOOD * 2 ? 0.55 : 0.16) * c.tr.sneak * (anyoneAsleep(c) ? 1 : 0.15) },
  { act: 'scrap',    label: 'has a grudge',             w: c => c.grudge * 0.95 },
  { act: 'wager',    label: 'feeling lucky',            w: c => (0.1 + 0.32 * c.tr.gamble) * (c.qcat > 50000 ? 1 : 0.1) * (mkt.mom > 0.001 ? 1.25 : 1) },
  { act: 'entangle', label: 'wants company',            w: c => c.lonely * 0.85 * c.tr.social },
  { act: 'idle',     label: () => (wx.rain + wx.snow > 0.3 ? 'caught in the weather' : 'nothing urgent'), w: () => 0.2 + wx.rain * 0.4 + wx.snow * 0.35 },
  { act: 'sleep',    label: 'tired',                    w: c => c.tired * 1.0 },
  { act: 'circuit',  label: 'coherent, lab is open',    w: c => (stageOn('lab') && stats.treasury > 0.01 ? 0.3 + c.coh * 0.45 : 0) },
];
const TH = {
  eat: ['the crates smell like sardines', 'food first, then the shift', 'could eat a whole fish'],
  hunt: ['something is moving in the cables', 'broke and hungry is a bad mix', 'somebody dropped tokens in the trays'],
  recohere: ['half of me is somewhere else', 'everything feels blurry', 'the cryostat hums like a purr'],
  warm: ['the vent is the only warm thing out here', 'paws are freezing', 'one more cold night'],
  work: ['the rig pays tonight', 'a shift now, buy later', 'every shift is a few more lamports'],
  buy: ['chart looks cheap from down here', 'adding to the stack', 'fees in, buys out', 'size in'],
  sell: ['taking some off', 'green is green', 'paper paws tonight', 'need the sol'],
  steal: ['{p} sleeps heavy', 'nobody will miss a few thousand', 'light paws, quiet steps'],
  wager: ['{p} wants to bet? fine.', 'double or nothing', 'the arena pays better than the rig', 'feeling lucky tonight'],
  scrap: ['{p} has it coming', 'not letting {p} get away with it', '{p} is on my side of the block'],
  entangle: ['too quiet on this side', '{p} gets it', 'better in pairs'],
  idle: ['a box is a box', 'watching the relay blink', 'not now'],
  circuit: ['let\u2019s see what the machine says', 'five qubits, one thousand shots', 'superposition is a job now'],
  sleep: ['eyes won’t stay open', 'the loft. now.', 'wake me if the chart moves'],
};

const fmtSol = v => (v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v >= 0.01 ? v.toFixed(3) : v >= 0.001 ? v.toFixed(4) : v.toFixed(5));
const fmtQ = v => (v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e4 ? (v / 1e3).toFixed(1) + 'K' : Math.round(v).toLocaleString('en-US'));
const fmtUsd = v => (v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : v >= 1e5 ? '$' + Math.round(v / 1e3) + 'K' : v >= 1e4 ? '$' + (v / 1e3).toFixed(1) + 'K' : v >= 1e3 ? '$' + (v / 1e3).toFixed(2) + 'K' : '$' + Math.round(v));
const mcapUsd = () => mkt.price * SUPPLY * CONFIG.SOL_USD;
const fmtPrice = () => fmtUsd(mcapUsd()) + ' MC';
const fmtKeys = v => (v >= 1e12 ? (v / 1e12).toFixed(2) + 'T' : v >= 1e9 ? (v / 1e9).toFixed(1) + 'G' : v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.round(v).toLocaleString('en-US'));
const PLACES = {
  rig:      { title: 'The rig',         kind: 'job site for miners',       pt: [M(7.2), M(9.6)],   stats: ['here', 'paid', 'visits'],    desc: 'A stack of qubits bolted to the pavement. Miners dig at it all night for steady SOL, and nothing here can go wrong.' },
  relay:    { title: 'The relay',       kind: 'job site for runners',      pt: [M(15.0), M(8.6)],  stats: ['here', 'paid', 'visits'],    desc: 'Two pylons with a live beam between them. Runners carry loads across the wire for better pay, but the wire is slick, worse in the rain, and a slip drops the whole shift’s pay back into the treasury. When lightning hits it, runners earn double.' },
  tunnel:   { title: 'The tunnel',      kind: 'job site for tunnelers',    pt: [M(8.3), M(15.4)],  stats: ['here', 'paid', 'found'],     desc: 'A portal to somewhere nobody talks about. Tunnelers come back with the best pay on the block, but a cat that gets turned around in there drops part of its ' + TK + ' stack on the way out. It ends up in the cable trays.' },
  cryo:     { title: 'The cryostat',    kind: 'job site and recovery',     pt: [M(11.6), M(11.6)], stats: ['here', 'paid', 'spent'],     desc: 'The block’s dilution fridge. Coolers keep it cold for pay, and any cat can spend a little SOL to recohere underneath it.' },
  crates:   { title: 'The crates',      kind: 'food',                      pt: [M(15.8), M(15.6)], stats: ['here', 'spent', 'visits'],   desc: 'Sardines, mostly. A meal costs ' + fmtSol(FOOD) + ' SOL. Most grudges on the block start here.' },
  vent:     { title: 'The vent',        kind: 'warmth',                    pt: [M(12.3), M(16.6)], stats: ['here', 'spent', 'visits'],   desc: 'The only warm spot on the block. A warm-up costs ' + fmtSol(WARM) + ' SOL. It gets crowded when the weather turns.' },
  trays:    { title: 'The cable trays', kind: 'lost and found',            pt: [M(16.0), M(11.6)], stats: ['here', 'found', 'visits'],   desc: 'Where broke cats hunt for food, and where every dropped token on the block ends up. Whatever a decohered or lost cat scatters lands here, and whoever digs it out keeps it.' },
  exchange: { title: 'The exchange',    kind: 'where cats buy back',       pt: [M(6.6), M(11.5)],  stats: ['here', 'bought', 'buysol'],  desc: 'A kiosk with a ticker on the front. Any cat with SOL to spare walks up and buys ' + TK + '. Cats never sell here, there is no sell button. Every buy goes straight to the chart.' },
  arena:    { title: 'The arena',       kind: 'where cats wager',          pt: [M(9.5), M(12.6)],  stats: ['here', 'wagered', 'visits'], desc: 'A ring painted on the pavement. Two cats put up a stake of ' + TK + ', the box flips a quantum coin weighted by their coherence, and the winner takes the pot. Every wager is a transfer between the two wallets.' },
  boxes:    { title: 'The boxes',       kind: 'shelter',                   pt: [M(10.2), M(7.6)],  stats: ['here', 'visits', 'visits'],  desc: 'Cardboard. Free and dry. Soaked cats wait out the weather here.' },
  loft:     { title: 'The loft',        kind: 'where cats sleep',          pt: [M(17.4), M(5.8)],  stats: ['here', 'visits', 'stolen'],  desc: 'A warm attic over the corner shop. Tired cats climb in and sleep it off. A cat with light paws can sneak in and lift a few thousand ' + TK + ' from a sleeper, if it doesn’t get caught.' },
  lab:      { title: 'The lab',         kind: 'quantum compute',           pt: [M(14.1), M(10.55)], stats: ['here', 'circuits', 'spent'], stage: 'lab',  desc: 'A real quantum computer, rented by the second. When the lab is open, fees buy time on it and coherent cats run circuits: a few qubits, a thousand shots, a result, a job receipt you can check. It doesn\u2019t solve anything useful yet. It is real.' },
  vault:    { title: 'The treasury',    kind: 'where the fees land',       pt: [M(13.2), M(13.3)], stats: ['treasury', 'fees', 'wages'], desc: 'Every trade of ' + TK + ' pays a fee in SOL, and the fees land here. Every shift on the block is paid out of it. When it runs low, shifts pay half.' },
};
const placeStats = {}, placeLogs = {};
for (const k of Object.keys(PLACES)) { placeStats[k] = { paid: 0, spent: 0, visits: 0, found: 0, stolen: 0, bought: 0, buysol: 0, wagered: 0, circuits: 0, keys: 0 }; placeLogs[k] = []; }
let insMode = 'stray', placeKey = null, hoverLabel = null, remote = null;
const labelHits = [];
const stationOf = c => c.act === 'work' ? JOBS[c.job].st : (ACTS[c.act] ? ACTS[c.act].st : null);
const asleep = c => c.state === 'act' && c.act === 'sleep';
const hereAt = k => cats.filter(c => c.state === 'act' && stationOf(c) === k);

const cats = [];
const stats = { circuits: 0, labSol: 0, keys: 0, huntSol: 0, huntShifts: 0, lastJob: null, treasury: rand(0.1, 0.25), fees: 0, wages: 0, upkeep: 0, buySol: 0, boughtBack: 0, buys: 0, sold: 0, sellSol: 0, sells: 0, stolen: 0, lostPool: 0, low: false, lastTrade: null };
const P0 = CONFIG.START_MC_USD / CONFIG.SOL_USD / SUPPLY; // SOL per token at the starting market cap
const mkt = { price: P0, p0: P0, hist: [], mom: 0, acc: 0, nextMove: rand(180, 400), last: 0 };
const txs = [];
let uid = 0, simMin = 22 * 60 + randi(0, 30), T = 0;
let selId = null, hoverId = null, userPickT = -1e9, lastAutoT = 0;
const byId = id => id == null ? null : cats.find(c => c.id === id) || null;
const DAY_SECS = 1800; // one day in the box lasts 30 real minutes
const dayNo = () => Math.floor(T / DAY_SECS) + 1;
const clock = m => { m = ((Math.floor(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };
function tx(c, type, amount, note) { txs.unshift({ t: clock(simMin), cat: c ? c.name : 'the box', type, amount, note: note || '' }); if (txs.length > 60) txs.pop(); }

function makeCat(i) {
  const [name, job, trait] = ROSTER[i], coat = COATS[i % COATS.length];
  const sp = ST[pick(Object.keys(ST))].spot();
  return {
    id: ++uid, name, job, trait, tr: TRAITS[trait], coat: coat.c, eye: coat.e, dark: !!coat.d,
    x: sp[0], y: sp[1], tx: sp[0], ty: sp[1], face: Math.random() < 0.5 ? 1 : -1,
    sol: rand(0.0008, 0.008), qcat: CAT_ALLOC, earned: 0, bought: 0, solSpent: 0, stole: 0, robbed: 0, found: 0, buys: 0, sells: 0, sold: 0, sellSol: 0, entry: P0, arenaNet: 0, arenaSol: 0, arenaW: 0, arenaL: 0, arrived: false, released: T,
    hunger: rand(0, 0.75), coh: rand(0.35, 1), cold: rand(0, 0.6), lonely: rand(0, 0.6),
    grudge: 0, grudgeOn: null, grudgeWhy: '', starve: 0, tired: rand(0, 0.7),
    rx: (i + 0.5) / ROSTER.length, rdir: Math.random() < 0.5 ? 1 : -1, rsp: rand(0.012, 0.022),
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
    if (act === 'wager' && (o.qcat < 50000 || o.state === 'act')) continue;
    const d = Math.hypot(o.x - c.x, o.y - c.y);
    if (d < bd) { bd = d; best = o; }
  }
  return best && bd < 9 ? best : null;
}
function because(c, act, p) {
  switch (act) {
    case 'eat': { const h = Math.round((simMin - c.lastAte) / 60); return h >= 1 ? `nothing to eat in ${h} hour${h > 1 ? 's' : ''}` : 'stomach has been growling'; }
    case 'hunt': return c.sol < FOOD ? `only ${fmtSol(c.sol)} SOL and a meal costs ${fmtSol(FOOD)}` : `${fmtQ(stats.lostPool)} ${TK} lying in the trays`;
    case 'recohere': return `coherence down to ${Math.round(c.coh * 100)}%`;
    case 'warm': return (wx.rain > 0.3 ? 'soaked through, ' : wx.snow > 0.3 ? 'snow in its fur, ' : '') + `cold for ${Math.max(5, Math.round(c.cold * 90))} minutes`;
    case 'work': return c.sol < 0.004 ? `only ${fmtSol(c.sol)} SOL left` : (c.job === 'tunneler' ? 'the tunnel pays best' : 'the shift pays tonight');
    case 'sell': return c.sol < FOOD && c.hunger > 0.5 ? `broke and a meal costs ${fmtSol(FOOD)} SOL` : c.tr.panic && mkt.mom < -0.004 ? 'the chart is dumping and it has no stomach for it' : `up ${Math.round((mkt.price / c.entry - 1) * 100)}% on its entry`;
    case 'buy': return `${fmtSol(spare(c))} SOL to spare` + (mkt.mom > 0.002 ? ' and the chart is moving' : mkt.mom < -0.002 ? ' and the chart dipped' : '');
    case 'steal': return p ? `${p.name} is asleep in the loft` : 'somebody is always asleep up there';
    case 'scrap': return c.grudgeWhy || (p ? `${p.name} looked at it wrong` : 'something to prove');
    case 'wager': return p ? `${p.name} has ${fmtQ(p.qcat)} ${TK} and a tell` : 'the arena is open';
    case 'circuit': return `coherence at ${Math.round(c.coh * 100)}% and the lab is paying`;
    case 'entangle': return `alone since ${clock(simMin - Math.round(40 + c.lonely * 140))}`;
    default: return wx.rain + wx.snow > 0.3 ? 'too wet to do anything else' : 'nothing urgent, so it naps';
  }
}
function thought(c, act, p) {
  if (act === 'idle' && wx.snow > 0.3) return pick(['snow again', 'the box is the only dry thing']);
  if (act === 'idle' && wx.rain > 0.3) return pick(['wet fur is the worst', 'waiting out the rain', 'the box is dry at least']);
  if (act === 'work' && c.job === 'runner' && T < relayBoostUntil) return 'the relay pays double right now';
  if (act === 'sell' && c.trait === 'degen') return pick(['getting out', 'this is dumping. out.', 'nope']);
  if (act === 'buy' && c.trait === 'patient') return pick(['dip. buying.', 'patience pays', 'cheaper than an hour ago']);
  if (act === 'buy' && c.trait === 'degen') return pick(['it’s pumping. in.', 'send it', 'no chart analysis, just paws']);
  return pick(TH[act]).replace('{p}', p ? p.name : 'someone');
}
function decide(c) {
  const ws = DRIVES.map(d => ({ act: d.act, label: typeof d.label === 'function' ? d.label(c) : d.label, w: clamp(d.w(c) + rand(-0.06, 0.06), 0, 1.5) }));
  ws.sort((a, b) => b.w - a.w);
  let ch = null, partner = null;
  for (const o of ws) {
    if (o.act === 'scrap' || o.act === 'entangle' || o.act === 'wager') { partner = findPartner(c, o.act); if (!partner) continue; }
    if (o.act === 'buy' && spare(c) < 0.0004) continue;
    if (o.act === 'sell' && sellUrge(c) <= 0) continue;
    ch = o; break;
  }
  if (!ch) { ch = ws.find(o => o.act === 'idle'); partner = null; }
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
    c.state = 'act'; c.actT = 0; c.actDur = ACTS.wager.dur; c.arrived = true; placeStats.arena.visits++;
    const sdx = (p.x - p.y) - (c.x - c.y); c.face = sdx >= 0 ? 1 : -1;
    c.doing = p.arrived ? `wagering with ${p.name}` : `waiting for ${p.name} in the arena`;
    if (p.arrived) { p.doing = `wagering with ${c.name}`; ringFX(ARENA.x, ARENA.y, '255,200,80', 1.2); }
    return;
  }
  if (c.partner && c.initiator) {
    if (!p || asleep(p) || (p.partner && p.partner !== c.id)) { c.partner = null; c.initiator = false; c.state = 'pause'; c.pauseT = 0.2; return; }
    p.partner = c.id; p.initiator = false; p.state = 'act'; p.act = c.act; p.actT = 0;
    c.state = 'act'; c.actT = 0; c.actDur = ACTS[c.act].dur; p.actDur = c.actDur;
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
  if (c.act === 'sleep') { c.actDur = rand(80, 140); placeStats.loft.visits++; if (Math.random() < 0.5) log(`${c.name} climbed into the loft to sleep`, 'info', 'loft'); }
  if (c.act === 'idle' && wx.rain + wx.snow > 0.3) c.doing = `sheltering in a box from the ${wx.snow > wx.rain ? 'snow' : 'rain'}`;
  if ((c.act === 'warm' || c.act === 'eat') && Math.random() < 0.2) {
    const o = cats.find(o => o !== c && o.state === 'act' && o.act === c.act);
    if (o) { c.grudge = Math.min(1, c.grudge + 0.75); c.grudgeOn = o.id; c.grudgeWhy = `${o.name} took its spot at ${c.act === 'warm' ? 'the vent' : 'the crates'}`; log(`${c.name} has a grudge against ${o.name} now`, 'info', c.act === 'warm' ? 'vent' : 'crates'); }
  }
}
function endPair(a, b) { for (const k of [a, b]) { if (!k) continue; k.partner = null; k.initiator = false; k.state = 'pause'; k.pauseT = rand(2, 6); } }
function wake(c, why) { if (!asleep(c)) return; c.state = 'pause'; c.pauseT = 0.5; c.tired = clamp(c.tired - 0.4); c.doing = 'woke up'; c.because = why; }
function spend(c, amt, place, what) { const cost = Math.min(c.sol, amt); c.sol -= cost; stats.upkeep += cost; stats.treasury += cost; placeStats[place].spent += cost; placeStats[place].visits++; tx(c, 'spent', '-' + fmtSol(cost) + ' SOL', what); return cost; }
function moveTokens(from, to, amt) { amt = Math.min(from.qcat, amt); from.qcat -= amt; to.qcat += amt; return amt; }
function finish(c, p) {
  const a = c.act;
  if (a === 'work') {
    const j = JOBS[c.job], st = j.st;
    let pay = rand(j.pay[0], j.pay[1]);
    if (c.job === 'runner' && T < relayBoostUntil) pay *= 2;
    const low = stats.treasury < 0.02;
    if (low) pay /= 2;
    if (low && !stats.low) { stats.low = true; log('The treasury is running low. Shifts pay half until fees come in.', 'loss', 'vault'); }
    pay = Math.max(0, Math.min(pay, stats.treasury));
    placeStats[st].visits++; c.coh = clamp(c.coh - 0.06);
    const slipped = Math.random() < j.risk * (c.job === 'runner' ? 1 + wx.rain : 1);
    if (pay > 0 && !slipped) {
      stats.treasury -= pay; c.sol += pay; c.earned += pay; stats.wages += pay; placeStats[st].paid += pay;
      floatText(c, '+' + fmtSol(pay), '#F7C86A'); payFX(c);
      log(`${c.name} ${j.did.replace('{n}', fmtSol(pay) + ' SOL')}`, 'gain', st); tx(c, 'wage', '+' + fmtSol(pay) + ' SOL', ST[st].label);
    } else if (slipped) {
      if (c.job === 'tunneler') { const drop = c.qcat * rand(0.004, 0.012); c.qcat -= drop; stats.lostPool += drop; placeStats.trays.found += 0; log(`${c.name} ${j.riskWhy} and scattered ${fmtQ(drop)} ${TK}. It ended up in the cable trays.`, 'loss', st); tx(c, 'lost', '-' + fmtQ(drop) + ' ' + TK, 'the tunnel'); burst(c, '255,79,174', 14); }
      else { log(`${c.name} ${j.riskWhy}`, 'loss', st); floatText(c, 'slipped', '#FF4FAE'); }
    } else log(`${c.name} finished a shift at ${ST[st].label}, but the treasury is empty`, 'loss', st);
  } else if (a === 'circuit') {
    const cost = Math.min(stats.treasury, 0.002), pay = Math.min(stats.treasury - cost, rand(0.0015, 0.0035));
    stats.treasury -= cost + pay; stats.labSol += cost; placeStats.lab.spent += cost; placeStats.lab.visits++; placeStats.lab.circuits++; stats.circuits++;
    c.sol += pay; c.earned += pay; stats.wages += pay; placeStats.lab.paid += pay;
    const nq = randi(2, 5), bits = Array.from({ length: nq }, () => Math.random() < 0.5 ? '0' : '1').join(''), job = 'qc-' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
    stats.lastJob = { name: c.name, nq, bits, job, t: T };
    floatText(c, '|' + bits + '\u27E9', '#78C8FF'); ringFX(LAB.x, LAB.y, '120,200,255', 1.3);
    log(`${c.name} ran a ${nq}-qubit circuit in the lab: 1,024 shots, most common result |${bits}\u27E9, job ${job}. ${fmtSol(cost)} SOL of compute.`, 'link', 'lab'); tx(c, 'circuit', '+' + fmtSol(pay) + ' SOL', job);
  } else if (a === 'eat') {
    spend(c, FOOD, 'crates', 'a meal'); c.hunger = 0.03; c.lastAte = simMin;
    if (Math.random() < 0.3) log(`${c.name} ate at the crates`, 'info', 'crates');
  } else if (a === 'hunt') {
    placeStats.trays.visits++;
    if (stats.lostPool > 500) {
      const take = stats.lostPool * rand(0.25, 0.7); stats.lostPool -= take; c.qcat += take; c.found += take; placeStats.trays.found += take;
      floatText(c, '+' + fmtQ(take), '#F7C86A'); log(`${c.name} dug ${fmtQ(take)} ${TK} out of the cable trays`, 'gain', 'trays'); tx(c, 'found', '+' + fmtQ(take) + ' ' + TK, 'the cable trays');
    }
    if (Math.random() < 0.55) { c.hunger = 0.12; c.lastAte = simMin; if (Math.random() < 0.5) log(`${c.name} caught something in the cable trays`, 'info', 'trays'); }
  } else if (a === 'recohere') {
    spend(c, CRYO, 'cryo', 'cryo time'); c.coh = 1;
    floatText(c, 'coherent', '#B9A6FF');
    if (Math.random() < 0.4) log(`${c.name} recohered under the cryostat`, 'link', 'cryo');
  } else if (a === 'warm') {
    spend(c, WARM, 'vent', 'a warm-up'); c.cold = 0;
    if (Math.random() < 0.25) log(`${c.name} warmed up at the vent`, 'info', 'vent');
  } else if (a === 'buy') {
    const amt = spare(c) * rand(0.6, 0.95);
    if (amt > 0.0002) {
      const got = amt / mkt.price * 0.99;
      c.entry = (c.entry * c.qcat + amt) / (c.qcat + got);
      c.sol -= amt; c.solSpent += amt; c.qcat += got; c.bought += got; c.buys++;
      stats.buySol += amt; stats.boughtBack += got; stats.buys++; stats.lastTrade = { name: c.name, side: 'bought', sol: amt, q: got, t: T };
      placeStats.exchange.bought += got; placeStats.exchange.buysol += amt; placeStats.exchange.visits++;
      mkt.price *= 1 + amt / (mkt.price * SUPPLY * 0.35);
      floatText(c, '+' + fmtQ(got), '#5CFFAA'); buyFX(c);
      log(`${c.name} bought ${fmtQ(got)} ${TK} for ${fmtSol(amt)} SOL at the exchange`, 'gain', 'exchange'); tx(c, 'buy', '+' + fmtQ(got) + ' ' + TK, fmtSol(amt) + ' SOL');
    }
  } else if (a === 'sell') {
    const broke = c.sol < FOOD && c.hunger > 0.5;
    const q = c.qcat * (broke ? rand(0.008, 0.015) : rand(0.02, 0.05)), got = q * mkt.price * 0.99;
    c.qcat -= q; c.sol += got; c.sold += q; c.sellSol += got; c.sells++;
    stats.sold += q; stats.sellSol += got; stats.sells++; stats.lastTrade = { name: c.name, side: 'sold', sol: got, q, t: T };
    placeStats.exchange.visits++;
    mkt.price *= 1 - got / (mkt.price * SUPPLY * 0.35); mkt.mom -= 0.0005;
    floatText(c, '-' + fmtQ(q), '#FF7878'); ringFX(EXC.x, EXC.y, '255,120,120', 1.1);
    const why = broke ? 'to eat' : c.tr.panic && mkt.mom < -0.004 ? 'and bailed on the dip' : `and took profit at +${Math.round((mkt.price / c.entry - 1) * 100)}%`;
    log(`${c.name} sold ${fmtQ(q)} ${TK} for ${fmtSol(got)} SOL ${why}`, 'loss', 'exchange'); tx(c, 'sell', '-' + fmtQ(q) + ' ' + TK, '+' + fmtSol(got) + ' SOL');
  } else if (a === 'steal') {
    const victims = cats.filter(o => o !== c && asleep(o));
    if (!victims.length) { if (Math.random() < 0.5) log(`${c.name} found nobody asleep in the loft`, 'info', 'loft'); }
    else {
      const v = pick(victims), caught = Math.random() < 0.32 / c.tr.sneak;
      if (caught) {
        wake(v, `${c.name} had a paw in its stash`); v.grudge = 1; v.grudgeOn = c.id; v.grudgeWhy = `${c.name} tried to rob it in the loft`;
        log(`${c.name} got caught with a paw in ${v.name}’s stash`, 'loss', 'loft'); say(v, pick(['PAWS OFF', `${c.name}. really.`, 'I was awake the whole time']));
      } else {
        const take = moveTokens(v, c, v.qcat * rand(0.01, 0.04)); c.stole += take; v.robbed += take; stats.stolen += take; placeStats.loft.stolen += take;
        v.grudge = Math.max(v.grudge, 0.8); v.grudgeOn = c.id; v.grudgeWhy = `${c.name} robbed it while it slept`;
        floatText(c, '+' + fmtQ(take), '#FF4FAE'); log(`${c.name} lifted ${fmtQ(take)} ${TK} from ${v.name} while it slept`, 'loss', 'loft'); tx(c, 'stole', '+' + fmtQ(take) + ' ' + TK, 'from ' + v.name);
      }
    }
  } else if (a === 'wager' && p) {
    const pc = clamp(0.5 + (c.coh - p.coh) * 0.4, 0.15, 0.85);
    const [w, l] = Math.random() < pc ? [c, p] : [p, c];
    const inSol = Math.random() < 0.4 && Math.min(c.sol, p.sol) > 0.0008;
    let take, label;
    if (inSol) { take = Math.min(l.sol, Math.min(c.sol, p.sol) * rand(0.15, 0.35)); l.sol -= take; w.sol += take; w.arenaSol += take; l.arenaSol -= take; label = fmtSol(take) + ' SOL'; }
    else { take = moveTokens(l, w, Math.min(c.qcat, p.qcat) * rand(0.02, 0.06)); w.arenaNet += take; l.arenaNet -= take; placeStats.arena.wagered += take; label = fmtQ(take) + ' ' + TK; }
    w.arenaW++; l.arenaL++;
    floatText(w, '+' + label, '#FFC850'); floatText(l, '-' + label, '#FF4FAE'); burst(w, '255,200,80', 22); ringFX(ARENA.x, ARENA.y, '255,200,80', 1.6);
    log(`${w.name} beat ${l.name} in the arena and took ${label}`, 'gain', 'arena'); tx(w, 'wager', '+' + label, 'from ' + l.name);
    say(w, pick(['told you', 'the coin likes me', `thanks ${l.name}`])); if (Math.random() < 0.6) say(l, pick(['rigged', 'double or nothing next time', 'the coin was warm']));
    if (Math.random() < 0.5) { l.grudge = Math.max(l.grudge, 0.6); l.grudgeOn = w.id; l.grudgeWhy = `${w.name} took it for ${label} in the arena`; }
    endPair(c, p); return;
  } else if (a === 'scrap' && p) {
    const cw = c.coh + c.sol * 20 + Math.random(), pw = p.coh + p.sol * 20 + Math.random();
    const [w, l] = cw >= pw ? [c, p] : [p, c];
    const take = moveTokens(l, w, l.qcat * rand(0.01, 0.03)); w.stole += take; l.robbed += take; stats.stolen += take;
    log(take > 0 ? `${w.name} won the scrap with ${l.name} and took ${fmtQ(take)} ${TK}` : `${w.name} won the scrap with ${l.name}`, 'loss');
    if (take > 0) { floatText(w, '+' + fmtQ(take), '#F7C86A'); tx(w, 'scrap', '+' + fmtQ(take) + ' ' + TK, 'from ' + l.name); }
    l.grudge = 0.4; l.grudgeOn = w.id; l.grudgeWhy = `${w.name} beat it in a scrap`;
    w.grudge = 0; w.grudgeOn = null; w.grudgeWhy = '';
    endPair(c, p); return;
  } else if (a === 'entangle' && p) {
    const bonus = Math.min(rand(0.0004, 0.0012), stats.treasury), b1 = bonus / 2;
    stats.treasury -= bonus; c.sol += b1; p.sol += b1; c.earned += b1; p.earned += b1; stats.wages += bonus;
    c.lonely = 0; p.lonely = 0; const avg = clamp((c.coh + p.coh) / 2 + 0.15); c.coh = avg; p.coh = avg;
    log(`${c.name} and ${p.name} entangled and shared coherence`, 'link');
    endPair(c, p); return;
  } else if (a === 'idle') {
    c.coh = clamp(c.coh + 0.05); c.lonely = clamp(c.lonely - 0.1); placeStats.boxes.visits++;
  } else if (a === 'sleep') {
    c.tired = 0; c.lonely = clamp(c.lonely - 0.15);
    if (Math.random() < 0.5) say(c, pick(['slept like a photon', 'what did I miss', 'ok. shift.', 'still tired', 'did the chart move']));
  }
  c.partner = null; c.initiator = false;
  c.state = 'pause'; c.pauseT = rand(2.5, 8);
}
function faint(c, why) {
  const sp = ST.loft.spot();
  if (c.partner) { const p = byId(c.partner); endPair(c, p); }
  c.state = 'walk'; c.act = 'sleep'; c.tx = sp[0]; c.ty = sp[1]; c.partner = null; c.initiator = false;
  c.doing = 'dragging itself to the loft'; c.because = why; c.thought = 'need to lie down';
  ringFX(c.x, c.y, '255,79,174', 1); burst(c, '255,79,174', 14);
}
function release(i) {
  const c = makeCat(i);
  const at = Math.random() < 0.5 ? [BLK + 0.9, rand(M(6), M(17))] : [rand(M(6), M(17)), BLK + 0.9];
  c.x = at[0]; c.y = at[1]; c.rx = Math.random() < 0.5 ? 0 : 1; c.rdir = c.rx ? -1 : 1;
  const sp = ST.boxes.spot(); c.state = 'walk'; c.act = 'idle'; c.tx = sp[0]; c.ty = sp[1];
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
function checkReleases() {
  const mc = mcapUsd();
  for (let i = 0; i < ROSTER.length; i++) if (UNLOCK_MC[i] > 0 && mc >= UNLOCK_MC[i] && !cats.some(c => c.name === ROSTER[i][0])) { release(i); break; }
}
function feeIn(big) {
  const amt = (big ? rand(0.06, 0.2) : rand(0.012, 0.055)) * (1 + Math.abs(mkt.mom) * 60);
  stats.treasury += amt; stats.fees += amt; if (stats.treasury >= 0.02) stats.low = false;
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
  if (roll < 0.45) { tg = [M(14.9), M(7.1), 3.5]; what = 'relay'; }
  else if (roll < 0.8) { const b = pick(OUT.filter(o => !o.far && o.h > 7)); tg = [b.x + b.w / 2, b.y + b.d / 2, b.h]; what = 'roof'; }
  else { tg = [3.5, 3.5, 7.6]; what = 'tower'; }
  const pts = []; for (let i = 0; i <= 12; i++) { const s = i / 12, j = i && i < 12 ? 0.7 : 0; pts.push([tg[0] + rand(-j, j), tg[1] + rand(-j, j), tg[2] + (1 - s) * 34]); }
  bolt = { pts, t: 0 }; flash = 1; shake = reduce ? 0 : 0.35; pushFx('bolt', { pts });
  if (what === 'relay') { relayBoostUntil = T + 60; ringFX(M(15), M(7.6), '92,242,255', 1.6); log('Lightning hit the relay. Runners earn double for the next minute.', 'gain', 'relay'); }
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
  const R = 0.3; // pace: meters fill about three times slower than the demo did
  c.hunger = clamp(c.hunger + (sleeping ? 0.004 : 0.0095 + (working ? 0.004 : 0)) * R * dt);
  c.coh = clamp(c.coh - (0.0055 * wx.coh + (working ? 0.011 : 0) + (working && c.job === 'tunneler' ? 0.006 : 0)) * R * dt);
  if (!(c.state === 'act' && c.act === 'warm') && !sleeping) c.cold = clamp(c.cold + 0.0065 * wx.cold * R * dt);
  if (!(c.state === 'act' && c.act === 'entangle')) c.lonely = clamp(c.lonely + 0.005 * R * dt);
  c.tired = clamp(c.tired + (sleeping ? -0.012 : (0.0042 + (working ? 0.005 : 0)) * R) * dt);
  c.grudge = Math.max(0, c.grudge - 0.0012 * dt); if (c.grudge <= 0) { c.grudgeOn = null; c.grudgeWhy = ''; }
  if (c.hunger >= 1 && !sleeping) { c.starve += dt; if (c.starve > 40) { c.starve = 0; c.hunger = 0.85; log(`${c.name} fainted from hunger`, 'loss'); faint(c, 'went too long without food'); return; } } else c.starve = 0;
  if (c.coh <= 0) {
    c.coh = 0.45; const drop = c.qcat * rand(0.003, 0.01); c.qcat -= drop; stats.lostPool += drop;
    log(`${c.name} decohered and scattered ${fmtQ(drop)} ${TK} across the block. It ended up in the cable trays.`, 'loss', 'trays'); tx(c, 'lost', '-' + fmtQ(drop) + ' ' + TK, 'decohered');
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
    const mv = Math.min(d, sp * dt); c.x += dx / d * mv; c.y += dy / d * mv;
    const sdx = dx - dy; if (Math.abs(sdx) > 0.01) c.face = sdx > 0 ? 1 : -1;
    return;
  }
  if (c.state === 'act') {
    if (c.act === 'warm') c.cold = clamp(c.cold - 0.07 * dt);
    if (c.act === 'recohere') c.coh = clamp(c.coh + 0.03 * dt);
    if (c.act === 'sleep') { c.coh = clamp(c.coh + 0.004 * dt); c.cold = clamp(c.cold - 0.004 * dt); }
    if (c.act === 'circuit') c.coh = clamp(c.coh - 0.004 * dt);
    if (c.act === 'wager') { if (!p || p.act !== 'wager') { c.partner = null; c.initiator = false; c.state = 'pause'; c.pauseT = 1; return; } if (!p.arrived || !c.initiator) return; }
    if (c.partner && !c.initiator) return;
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
function setMarketCapUsd(v) { if (v == null || !(v > 0)) { realMcap = null; return; } realMcap = v; mkt.price = v / CONFIG.SOL_USD / SUPPLY; mkt.p0 = mkt.price; }
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
function setLabMc(v) { if (v > 0) { CONFIG.LAB_MC_USD = v; const st = STAGES.find(s => s.key === 'lab'); if (st) st.mc = v; } }
function step(dt) {
  if (paused) return;
  T += dt; simMin += dt * (1440 / DAY_SECS);
  stepWeather(dt);
  if (realMcap == null) stepMarket(dt);
  else { mkt.acc += dt; while (mkt.acc >= 1) { mkt.acc -= 1; mkt.hist.push(mkt.price); if (mkt.hist.length > 240) mkt.hist.shift(); } }
  checkReleases(); checkStages();
  if (CONFIG.SIMULATE_FEES !== false && T >= nextFee) { feeIn(false); nextFee = T + rand(60, 150); }
  for (const c of cats) update(c, dt);
}
function snapshot() {
  return {
    v: 1, T, simMin, clock: clock(simMin), day: dayNo(), paused, realMcap,
    cats: cats.map(c => ({ id: c.id, name: c.name, job: c.job, trait: c.trait, coat: c.coat, eye: c.eye, dark: c.dark, x: c.x, y: c.y, tx: c.tx, ty: c.ty, face: c.face, state: c.state, act: c.act, actT: c.actT, actDur: c.actDur, partner: c.partner, initiator: c.initiator, arrived: c.arrived, doing: c.doing, thought: c.thought, because: c.because, weighed: c.weighed, bubble: c.bubble, bubbleT: c.bubbleT, sol: c.sol, qcat: c.qcat, earned: c.earned, bought: c.bought, sold: c.sold, buys: c.buys, sells: c.sells, solSpent: c.solSpent, sellSol: c.sellSol, stole: c.stole, robbed: c.robbed, found: c.found, arenaNet: c.arenaNet, arenaSol: c.arenaSol, arenaW: c.arenaW, arenaL: c.arenaL, entry: c.entry, hunger: c.hunger, coh: c.coh, cold: c.cold, lonely: c.lonely, tired: c.tired, grudge: c.grudge, grudgeOn: c.grudgeOn, grudgeWhy: c.grudgeWhy, phase: c.phase, released: c.released })),
    stats: { ...stats }, mkt: { price: mkt.price, p0: mkt.p0, mom: mkt.mom, hist: mkt.hist.slice(-120), mcapUsd: mcapUsd() },
    weather: { key: wxKey, next: wxNext, until: wxUntil, dur: wxDur, wx: { ...wx }, relayBoostUntil, boat: { ...boat } },
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
return { step, snapshot, setMarketCapUsd, setPaused, dropFees, setReleased, unrelease, setTrait, setSolUsd, setLabMc, setSimulateFees, noteFees, payout, noteSell, noteBuy, TRAITS, get cats() { return cats; }, get stats() { return stats; }, get mkt() { return mkt; }, ROSTER, UNLOCK_MC, STAGES, fmtSol, fmtQ, fmtUsd, mcapUsd, stageOn, restore(snap) { restoreFrom(snap); } };
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
  if (snap.weather) { wxKey = snap.weather.key; wxNext = snap.weather.next; wxUntil = snap.weather.until; wxDur = snap.weather.dur; Object.assign(wx, snap.weather.wx); }
}
};
