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
function did(c, text) { if (!c || !text) return; if (!c.acts) c.acts = []; c.acts.unshift({ t: clock(simMin), day: dayNo(), text }); if (c.acts.length > 40) c.acts.pop(); }
function say(c, text) { if (!text) return; c.bubble = text; c.bubbleT = T; talkPush({ sys: false, cat: c.id, name: c.name, coat: c.coat, eye: c.eye, text, t: clock(simMin) }); if (c.said) { c.said.unshift({ t: clock(simMin), day: dayNo(), text }); if (c.said.length > 30) c.said.pop(); } }
function log(text, kind, place) {
  if (place && placeLogs[place]) { placeLogs[place].unshift({ t: clock(simMin), text }); if (placeLogs[place].length > 6) placeLogs[place].pop(); }
  talkPush({ sys: true, kind: kind || 'info', text, t: clock(simMin) });
  if (hooks.onLog) hooks.onLog({ text, kind: kind || 'info', place: place || null, t: clock(simMin) });
}

/* ===== BEGIN extracted from the site ===== */
const WS = 1.38, BLK = 1.6 + 16.8 * WS; // the block is 38% bigger than the demo; landmarks keep their size but spread out
const M = v => 1.6 + (v - 1.6) * WS;
const BUILD = [
  { x: 2, y: 2, w: 3, d: 3, h: 7.6, tower: true },
  { x: 2, y: 5.6, w: 3, d: 3.2, h: 4.6 },
  { x: 2, y: 9.4, w: 3, d: 2.8, h: 5.8, board: 'R' },
  { x: 2, y: 12.8, w: 3, d: 2.6, h: 3.6 },
  { x: 2, y: 16, w: 3, d: 2.2, h: 2.4 },
  { x: 5.6, y: 2, w: 3.2, d: 3, h: 5.2, board: 'L' },
  { x: 9.4, y: 2, w: 2.8, d: 3, h: 3.4 },
  { x: 12.8, y: 2, w: 2.6, d: 3, h: 6.4, board: 'C' },
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
// where everything stands: the circle dead centre, the lab under the big billboard, the rest spread round the edges of the plaza
const CRY = { x: M(11.25), y: M(11.25) };                                      // the circle (meetings, recohering)
const LAB = { x: M(6.95), y: M(6.1), w: 3.6, d: 3.0 };                         // the lab, top left, in front of the billboard
const FRIDGE = { x: M(10.4), y: M(6.0), r: 0.62 };                             // the dilution fridge, right of the lab, piped to its side wall
const VAULT = { x: M(16.9), y: M(8.9) };                                       // the treasury, on the right edge between the bunks and the scrapyard
const LOFT = { x: M(16.3), y: M(5.3), w: 2.0, d: 1.1 };                        // the bunks, over the corner shop
const TRAYS = { x: M(16.7), y: M(11.5), w: 0.6, d: 3.2 };                      // the scrapyard strip along the right edge
const CRATES = { x: M(14.9), y: M(16.0), w: 1.6, d: 0.8 };                     // the diner counter
const DINER_STOOLS = [0, 1, 2, 3].map(i => [CRATES.x + 0.08 + i * 0.48, CRATES.y + 1.3]); // four stools along the front of the counter
const VENT = { x: M(10.7), y: M(16.6) };                                       // the heater grate (1.4 x 0.85)
const ARENA = { x: M(5.45), y: M(12.3), r: 0.95 }; ARENA.slots = [[ARENA.x - 0.3, ARENA.y + 0.22], [ARENA.x + 0.3, ARENA.y - 0.22]]; // the two cats square up in the middle of the ring
const YARD = { x: M(4.7), y: M(15.4), w: 2.5, d: 2.2 };                        // the yard, in the left corner
const EXC = { x: M(5.7), y: M(10.2) };                                         // the exchange kiosk
const BAZ = { x: M(12.7), y: M(4.85), w: 3.0, d: 0.7 };                       // the drip shop: three stalls against the back wall, top right
const BAZ_SPOTS = [0, 1, 2].map(i => [BAZ.x + 0.5 + i * 1.0, BAZ.y + BAZ.d + 0.55]);
const BOARD = { x: M(4.9), y: M(8.6) };                                         // the job board: a post with a panel, left of the lab
// the lab's consoles, one per cat: six along the glass front, four down the right side
const LAB_CONSOLES = [-1.5, -0.9, -0.3, 0.3, 0.9, 1.5].map(u => [LAB.x + u, LAB.y + LAB.d / 2 + 0.5]).concat([-1.05, -0.35, 0.35, 1.05].map(u => [LAB.x + LAB.w / 2 + 0.5, LAB.y + u]));
// somewhere on the open plaza, away from the structures and the circle: where a cat with nothing to do goes to loaf
function wanderSpot() {
  for (let i = 0; i < 14; i++) { const x = rand(6.2, BLK - 1.0), y = rand(6.2, BLK - 1.0); if (pushOut(x, y, 0.6)[2] > 0 || Math.hypot(x - CRY.x, y - CRY.y) < 2.8) continue; return [x, y]; }
  return [CRY.x + 3.2, CRY.y + 3.2];
}
const ST = {
  plaza:  { label: 'the plaza',       spot: () => wanderSpot() },
  bazaar: { label: 'the drip shop',   spot: me => { const taken = cats.filter(c => c !== me && c.act === 'shop').map(c => [c.tx, c.ty]); const free = BAZ_SPOTS.filter(q => !taken.some(t => Math.hypot(t[0] - q[0], t[1] - q[1]) < 0.2)); const q = pick(free.length ? free : BAZ_SPOTS); return [q[0], q[1]]; } },
  cryo:   { label: 'the circle',      spot: () => { const a = rand(0, TAU), r = rand(1.2, 1.6); return [CRY.x + Math.cos(a) * r, CRY.y + Math.sin(a) * r]; } },
  crates: { label: 'the diner',       spot: me => { const taken = cats.filter(c => c !== me && c.act === 'eat').map(c => [c.tx, c.ty]); const free = DINER_STOOLS.filter(q => !taken.some(t => Math.hypot(t[0] - q[0], t[1] - q[1]) < 0.2)); if (!free.length) return [rand(CRATES.x + 0.1, CRATES.x + 1.5), CRATES.y + 1.95]; const q = pick(free); return [q[0], q[1]]; } }, // no free stool: eat standing, behind the stools
  vent:   { label: 'the heater',      spot: () => [rand(VENT.x + 0.26, VENT.x + 1.4), rand(VENT.y + 0.26, VENT.y + 1.04)] },
  trays:  { label: 'the scrapyard',   spot: () => [rand(TRAYS.x - 1.3, TRAYS.x - 0.5), rand(TRAYS.y + 0.5, TRAYS.y + 2.9)] },
  loft:   { label: 'the bunks',       spot: () => [rand(LOFT.x + 0.4, LOFT.x + 1.7), rand(LOFT.y + 0.4, LOFT.y + 0.9)] },
  exchange: { label: 'the exchange',  spot: () => [rand(EXC.x + 1.05, EXC.x + 1.95), rand(EXC.y - 0.8, EXC.y + 0.8)] },
  arena:    { label: 'the arena',     spot: () => [rand(ARENA.x - 0.3, ARENA.x + 0.3), rand(ARENA.y - 0.3, ARENA.y + 0.3)] },
  lab:      { label: 'the lab',       spot: me => { const taken = cats.filter(c => c !== me && c.act === 'work' && JOBS[c.job].st === 'lab').map(c => [c.tx, c.ty]); const free = LAB_CONSOLES.filter(q => !taken.some(t => Math.hypot(t[0] - q[0], t[1] - q[1]) < 0.2)); const q = pick(free.length ? free : LAB_CONSOLES); return [q[0], q[1]]; } },
  yard:     { label: 'the yard',      spot: () => [rand(YARD.x + 0.4, YARD.x + YARD.w - 0.4), rand(YARD.y + 0.4, YARD.y + YARD.d - 0.4)] },
};
const LABELS = [['vault', VAULT.x, VAULT.y, 2.2], ['yard', YARD.x + YARD.w / 2, YARD.y + YARD.d / 2, 2.0], ['lab', LAB.x, LAB.y, 3.2], ['fridge', FRIDGE.x, FRIDGE.y, 3.4], ['cryo', CRY.x, CRY.y, 5.4], ['crates', CRATES.x + 0.8, CRATES.y + 0.4, 2.6], ['vent', VENT.x + 0.7, VENT.y + 0.4, 1.9], ['trays', TRAYS.x + 0.3, TRAYS.y + 1.6, 1.5], ['loft', LOFT.x + 1.0, LOFT.y + 0.55, 3.4], ['exchange', EXC.x, EXC.y, 2.4], ['arena', ARENA.x, ARENA.y, 1.6], ['bazaar', BAZ.x + 1.5, BAZ.y + 0.4, 2.2], ['board', BOARD.x, BOARD.y, 2.2]];
const LAMPS = [[BLK - 0.4, M(8.7)], [BLK - 0.4, M(13.9)], [BLK - 0.4, M(17.2)], [M(9.6), BLK - 0.4], [M(13.6), BLK - 0.4]];
// light lines painted on the ground, running from the circle out to the places
const TRACES = [
  [[CRY.x, CRY.y - 2.6], [CRY.x, LAB.y + 1.4], [LAB.x + LAB.w / 2 + 1.2, LAB.y + 1.4]],          // to the lab
  [[FRIDGE.x, FRIDGE.y + FRIDGE.r + 0.5], [FRIDGE.x, LAB.y + LAB.d / 2 + 1.4], [LAB.x + 1.5, LAB.y + LAB.d / 2 + 1.4]], // fridge to the lab's front
  [[BOARD.x + 0.5, BOARD.y], [LAB.x - LAB.w / 2 - 0.4, BOARD.y]],                                  // job board to the lab
  [[CRY.x - 2.6, CRY.y], [EXC.x + 2.3, CRY.y], [EXC.x + 2.3, EXC.y + 0.4]],                      // to the exchange
  [[CRY.x, CRY.y + 2.6], [CRY.x, VENT.y - 0.3]],                                                 // to the heater
  [[CRY.x + 2.6, CRY.y], [TRAYS.x - 1.6, CRY.y], [TRAYS.x - 1.6, TRAYS.y + 0.6]],                // to the scrapyard
  [[CRY.x + 1.9, CRY.y - 1.9], [BAZ.x + 1.5, CRY.y - 1.9], [BAZ.x + 1.5, BAZ.y + BAZ.d + 1.1]],  // to the bazaar
  [[CRY.x + 2.6, CRY.y - 0.6], [VAULT.x - 0.9, CRY.y - 0.6], [VAULT.x - 0.9, VAULT.y + 0.6]],     // to the treasury
  [[CRY.x + 1.9, CRY.y + 1.9], [CRATES.x + 0.8, CRY.y + 1.9], [CRATES.x + 0.8, CRATES.y - 0.3]], // to the diner
  [[CRY.x - 1.9, CRY.y + 1.9], [ARENA.x, CRY.y + 1.9], [ARENA.x, ARENA.y - 1.3]],                // to the arena
].map(pts => { const seg = []; let len = 0; for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push(l); len += l; } return { pts, seg, len, off: Math.random() * len }; });

/* ---------- the wider city + harbor ---------- */
const QUAY = BLK + 3.2; // land ends here on the two front sides; past it is the harbor
const QLAMPS = [[QUAY - 0.7, 4], [QUAY - 0.7, 11], [QUAY - 0.7, 18], [4, QUAY - 0.7], [11, QUAY - 0.7], [18, QUAY - 0.7]];
// things a cat cannot walk through: the structures on the plaza and the buildings on the back edges
const OBST = [
  { x: CRATES.x, y: CRATES.y, w: CRATES.w, d: CRATES.d },      // diner counter
  { x: TRAYS.x, y: TRAYS.y, w: TRAYS.w, d: TRAYS.d },          // scrapyard strip
  { x: EXC.x - 0.8, y: EXC.y - 0.8, w: 1.6, d: 1.6 },          // exchange kiosk
  { x: LAB.x - LAB.w / 2, y: 5.0, w: LAB.w, d: LAB.y + LAB.d / 2 - 5.0 }, // lab, and the slot between it and the buildings behind
  { x: FRIDGE.x - 0.9, y: 5.0, w: 1.8, d: FRIDGE.y - 5.0 },                 // the slot between the fridge and the buildings behind
  { x: BAZ.x - 0.2, y: 5.0, w: BAZ.w + 0.4, d: BAZ.y - 5.0 },                 // and behind the drip shop
  { x: BOARD.x - 0.3, y: BOARD.y - 0.15, w: 0.6, d: 0.3 },                     // the job board post
  { x: VAULT.x - 0.45, y: VAULT.y - 0.45, w: 0.9, d: 0.9 },    // treasury
  { x: BAZ.x - 0.1, y: BAZ.y - 0.1, w: BAZ.w + 0.2, d: BAZ.d + 0.2 }, // bazaar stalls
  { x: VENT.x - 0.6, y: VENT.y - 0.05, w: 0.5, d: 0.95 },      // heater unit
  ...BUILD.map(b => ({ x: b.x, y: b.y, w: b.w, d: b.d })),
  { x: 1.6, y: 1.6, w: 3.4, d: BLK - 1.6 }, { x: 1.6, y: 1.6, w: BLK - 1.6, d: 3.4 }, // the two back edges as solid walls, so nothing wedges into the slots between buildings
];
const OBC = [[CRY.x, CRY.y, 0.55], [FRIDGE.x, FRIDGE.y, FRIDGE.r + 0.12]]; // round ones: the beacon in the middle of the circle, the fridge
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
  { const [ix, iy, ins] = pushOut(x, y, 0.001); if (ins >= 1 && (ix || iy)) { const l = Math.hypot(ix, iy); return [x + ix / l * sp * dt, y + iy / l * sp * dt, ix / l, iy / l]; } } // somehow inside a structure: walk straight out
  let vx = dx / d, vy = dy / d;
  const near = pushOut(tx, ty, 0.6)[2] > 0 ? 1.3 : 0.45; // a spot right next to a structure (a stool, a console): stop steering once close, just walk in
  if (d > near) {
    const [fx, fy, f] = pushOut(x + vx * 0.35, y + vy * 0.35, 0.4);
    if (f > 0) {
      // blocked: slide along the structure (one side, chosen once per trip) with a little outward push, instead of fighting
      // the pull of the target. Mixing the two is how a cat ends up pacing on the spot behind a counter.
      const fl = Math.hypot(fx, fy) || 1, nx = fx / fl, ny = fy / fl, txn = -ny, tyn = nx;
      if (!self.slide) self.slide = txn * vx + tyn * vy < 0 ? -1 : 1;
      vx = txn * self.slide + nx * 0.6 * Math.min(1, f); vy = tyn * self.slide + ny * 0.6 * Math.min(1, f);
    }
  }
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
  const SIGNS = [['NODE', '92,242,255'], ['CRYO', '154,123,255'], ['24H', '255,79,174'], ['QUBITS', '247,200,106'], ['ENTANGLE', '255,79,174'], ['NOODLES', '255,138,92'], ['PAWN', '247,200,106'], ['SOL', '92,255,170'], ['HOTEL', '255,79,174'], ['DECOHERE', '154,123,255']];
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
];
const stageSeen = {};
const stageOn = k => { if (k === 'lab' || stageSeen[k]) return true; const st = STAGES.find(x => x.key === k); return !!st && mcapUsd() >= st.mc; };
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
// what the bazaar sells: things to wear. Prices climb with the chart like everything else; the SOL goes to the treasury.
const ITEMS = [
  { key: 'collar',  name: 'a red collar',   price: 0.00012 },
  { key: 'bow',     name: 'a pink bow',     price: 0.00013 },
  { key: 'bandana', name: 'a bandana',      price: 0.00014 },
  { key: 'scarf',   name: 'a scarf',        price: 0.00016 },
  { key: 'beanie',  name: 'a beanie',       price: 0.00018 },
  { key: 'shades',  name: 'shades',         price: 0.0002 },
  { key: 'tophat',  name: 'a top hat',      price: 0.0003 },
  { key: 'chain',   name: 'a gold chain',   price: 0.00035 },
  { key: 'crown',   name: 'a tiny crown',   price: 0.0006 },
  { key: 'halo',    name: 'a halo',         price: 0.0008 },
];
// ---- the job board: work posted for the cats. Mostly quantum, some chores. Tiered: a cat has to have done some work before it is trusted with tier 2 and 3.
const TASK_DEFS = [
  { kind: 'quantum', tier: 1, title: 'calibrate qubit {n}',                       place: 'lab',    dur: 70,  n: [1, 9] },
  { kind: 'quantum', tier: 1, title: 'run a {n}-shot sampling batch',             place: 'lab',    dur: 80,  n: [2048, 8192] },
  { kind: 'quantum', tier: 1, title: 'measure T1 on qubit {n}',                   place: 'lab',    dur: 70,  n: [1, 9] },
  { kind: 'quantum', tier: 2, title: 'Grover search over {n} items',              place: 'lab',    dur: 100, n: [64, 512] },
  { kind: 'quantum', tier: 2, title: 'tune up a {n}-qubit entangling gate',       place: 'lab',    dur: 90,  n: [2, 4] },
  { kind: 'quantum', tier: 2, title: 'benchmark a {n}-qubit random circuit',      place: 'lab',    dur: 100, n: [4, 7] },
  { kind: 'quantum', tier: 3, title: 'factor a {n}-bit number with Shor',         place: 'lab',    dur: 130, n: [8, 15] },
  { kind: 'quantum', tier: 3, title: 'simulate a {n}-site Ising chain',           place: 'lab',    dur: 120, n: [6, 12] },
  { kind: 'quantum', tier: 3, title: 'error-correct a logical qubit for {n} cycles', place: 'lab', dur: 140, n: [10, 40] },
  { kind: 'chore',   tier: 1, title: 'take the trash out behind the diner',       place: 'crates', dur: 50 },
  { kind: 'chore',   tier: 1, title: 'sweep the circle',                          place: 'cryo',   dur: 50 },
  { kind: 'chore',   tier: 1, title: 'sort the scrap pile',                       place: 'trays',  dur: 60 },
  { kind: 'chore',   tier: 1, title: 'fix a fence post in the yard',              place: 'yard',   dur: 55 },
  { kind: 'chore',   tier: 2, title: 'clean the heater grille',                   place: 'vent',   dur: 60 },
  { kind: 'chore',   tier: 2, title: 'restock the drip shop',                     place: 'bazaar', dur: 60 },
  { kind: 'chore',   tier: 2, title: 'defrost the fridge lines',                  place: 'lab',    dur: 70 },
  { kind: 'chore',   tier: 3, title: 'reset the exchange ticker',                 place: 'exchange', dur: 80 },
];
const board = { tasks: [], done: [], seq: 0, next: 0 };
const totalSkill = c => Object.values(c.skills || {}).reduce((a, b) => a + b, 0) + (c.tasks || 0);
const qualifies = (c, t) => t.tier === 1 || (t.tier === 2 && ((c.lvl || 1) >= 2 || totalSkill(c) >= 8)) || (t.tier === 3 && ((c.lvl || 1) >= 3 || totalSkill(c) >= 24));
const tasksFor = c => board.tasks.filter(t => t.status === 'open' && qualifies(c, t));
function postTask(def, poster) {
  const n = def.n ? randi(def.n[0], def.n[1]) : null, title = String(def.title || 'a job').replace('{n}', n == null ? '' : fmt(n));
  const t = { id: 'T' + String(++board.seq).padStart(3, '0'), title, kind: def.kind === 'chore' ? 'chore' : 'quantum', tier: Math.max(1, Math.min(3, Math.round(def.tier || 1))), place: ST[def.place] ? def.place : 'lab', dur: Math.max(20, Math.min(600, def.dur || 80)), bounty: Math.max(0, def.bounty || 0), posted: T, day: dayNo(), status: 'open', by: null, poster: poster || 'the box' };
  board.tasks.push(t);
  log(`New on the board: ${t.title} (tier ${t.tier}${t.bounty ? ', ' + fmtSol(t.bounty) + ' SOL bounty' : ''})`, 'info', 'board');
  return t;
}
function releaseTask(c) { if (!c || !c.task) return; const t = board.tasks.find(x => x.id === c.task); if (t && t.status === 'taken' && t.by === c.name) { t.status = 'open'; t.by = null; } c.task = null; }
function stepBoard(dt) {
  if (!board.next) board.next = T + rand(20, 60);
  if (T >= board.next) {
    board.next = T + rand(150, 320);
    if (board.tasks.filter(t => t.status === 'open').length < 4) { const d = Math.random() < 0.7 ? pick(TASK_DEFS.filter(x => x.kind === 'quantum')) : pick(TASK_DEFS.filter(x => x.kind === 'chore')); postTask(d); }
  }
  for (const t of board.tasks) if (t.status === 'open' && T - t.posted > DAY_SECS) { t.status = 'expired'; log(`Nobody took "${t.title}" and it came off the board.`, 'info', 'board'); }
  if (board.tasks.some(t => t.status === 'expired')) board.tasks = board.tasks.filter(t => t.status !== 'expired');
}
const itemsFor = c => ITEMS.filter(it => !(c.items || []).includes(it.key) && spare(c) >= costOf(it.price, c) * 1.3);
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
  idle:     { st: 'plaza',    dur: 70,   verb: 'loafing on the plaza',            walk: 'wandering off',                        color: '140,151,194', name: 'rest' },
  shop:     { st: 'bazaar',   dur: 40,   verb: 'browsing the drip shop',          walk: 'heading to the drip shop',             color: '255,200,80', name: 'shop' },
  task:     {                 dur: 80,   verb: 'on a task from the board',        walk: 'off to a task from the board',         color: '92,242,255', name: 'task' },
  play:     { st: 'yard',     dur: 60,   verb: 'chasing the laser in the yard',  walk: 'heading to the yard',              color: '120,200,255', name: 'run a circuit' },
  meet:     { st: 'cryo',     dur: 120,  verb: 'at the meeting',                walk: 'heading to the meeting at the circle', color: '247,200,106', name: 'meeting' },
  sleep:    { st: 'loft',     dur: 120,  verb: 'asleep in the bunks',            walk: 'heading to the bunks to sleep',    color: '110,120,170', name: 'sleep' },
};
// what two entangled cats say to each other (alternating lines; {p} = the other cat)
const CHATS = [
  ['you feel that', 'the chart dipped. I always feel it first', 'the box pays either way', 'does it though'],
  ['{p}. you look terrible', 'two jobs and a storm', 'eat something', 'the diner costs more every night'],
  ['the fridge is loud tonight', 'it is always loud', 'that is the chip thinking', 'sure'],
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
// ---- skills: a cat gets better at each kind of job the more it does it. Fewer failed runs, bigger circuits, faster work.
// It is slow on purpose: the tenth job of a kind is a small step, the hundredth is noticeable, the thousandth is a different cat.
const skillOf = (c, kind) => (c.skills && c.skills[kind]) || 0;
const skillLvl = n => Math.log2(1 + n / 8);              // 0 at none, 1 at 8 jobs, 2 at 24, 3 at 56, 4 at 120, 5 at 248
function learn(c, kind, n) { if (!c.skills) c.skills = {}; c.skills[kind] = (c.skills[kind] || 0) + (n || 1); }
// ---- levels: XP for everything a cat does; higher levels pay less for food, cryo time and warmth ----
const LVL_XP = [0, 750, 2250, 5000, 9000, 16000, 30000, 60000, 120000, 240000]; // roughly: L2 after a few hours, L5 after a day and a half, L10 after a month
const LVL_TITLE = ['stray', 'scrapper', 'hustler', 'trader', 'operator', 'whale', 'entangled', 'superposed', 'coherent', 'quantum'];
const lvlOf = xp => { let l = 1; while (l < LVL_XP.length && xp >= LVL_XP[l]) l++; return l; };
const lvlTitle = c => LVL_TITLE[Math.min(LVL_TITLE.length, c.lvl || 1) - 1];
function gainXp(c, n) {
  c.xp = (c.xp || 0) + n * rand(0.7, 1.3); const nl = lvlOf(c.xp);
  if (nl > (c.lvl || 1)) {
    c.lvl = nl; burst(c, '247,200,106', 26); ringFX(c.x, c.y, '247,200,106', 1.5); floatText(c, 'level ' + nl, '#F7C86A'); did(c, `hit level ${nl}: ${LVL_TITLE[nl - 1]}`);
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
  { act: 'work',     label: c => (c.sol < costOf(FOOD, c) * 3 ? 'needs SOL' : 'feels like working'), w: c => (c.coh < 0.4 ? 0.2 : 1) * (clamp(1 - c.sol / (0.004 * priceMul())) * 0.9 + 0.3) * c.ethic * (c.tr.label === 'momentum ape' ? rand(0.3, 1.7) : 1) },
  { act: 'buy',      label: 'spare SOL',                w: c => clamp(spare(c) / 0.008) * 0.9 * c.tr.eager * (1 + (c.tr.dip ? -mkt.mom * 40 * c.tr.dip : mkt.mom * 40) ) },
  { act: 'sell',     label: c => (c.sol < costOf(FOOD, c) && c.hunger > 0.5 ? 'broke, selling to eat' : c.tr.panic && mkt.mom < -0.004 ? 'chart is dumping' : 'taking profit'), w: c => sellUrge(c) },
  { act: 'steal',    label: 'light paws',               w: c => (c.sol < costOf(FOOD, c) * 2 ? 0.55 : 0.16) * c.tr.sneak * (anyoneAsleep(c) ? 1 : 0.15) },
  { act: 'scrap',    label: 'has a grudge',             w: c => c.grudge * 0.95 },
  { act: 'wager',    label: 'feeling lucky',            w: c => (0.1 + 0.32 * c.tr.gamble) * (c.qcat > 5000 ? 1 : 0.1) * (mkt.mom > 0.001 ? 1.25 : 1) },
  { act: 'entangle', label: 'wants company',            w: c => c.lonely * 0.85 * c.tr.social },
  { act: 'idle',     label: () => (wx.rain + wx.snow > 0.3 ? 'caught in the weather' : 'nothing urgent'), w: () => 0.2 + wx.rain * 0.4 + wx.snow * 0.35 },
  { act: 'sleep',    label: 'tired',                    w: c => Math.pow(c.tired, 2.2) * 1.1 },
  { act: 'play',     label: 'wants to play',            w: c => (0.32 + c.lonely * 0.4) * c.tr.social * (spare(c) > costOf(PLAY, c) ? 1 : 0.05) * (T - (c.playT || -1e9) > 900 ? 1 : 0.3) },
  { act: 'task',     label: 'work on the board',        w: c => { const ts = tasksFor(c); return ts.length ? (c.coh < 0.4 ? 0.2 : 1) * (0.42 + 0.12 * Math.max(...ts.map(t => t.tier))) * c.ethic : 0; } },
  { act: 'shop',     label: 'feeling flush',            w: c => itemsFor(c).length ? (0.3 + 0.25 * (c.vanity || 1)) * (1 - (c.items || []).length / ITEMS.length) * (T - (c.shopT || -1e9) > 2400 ? 1 : 0.08) : 0 },
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
  task: ['the board had my name on it', 'tier three. finally.', 'somebody has to do it', 'bounty is bounty'],
  shop: ['something shiny', 'the stall cat has a new hat', 'spare SOL, spare neck'],
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
  cryo:     { title: 'The circle',      kind: 'where the box meets · recovery',     pt: [CRY.x, CRY.y], stats: ['here', 'spent', 'visits'],     desc: 'The painted circle in the middle of the box, with the countdown above it. When it hits zero every cat that is awake comes in, sits down and talks through the day: the treasury, the chart, the lab, who did what. Between meetings cats come here to recohere, for a small fee.' },
  crates:   { title: 'The diner',       kind: 'food',                      pt: [CRATES.x + 0.8, CRATES.y + 1.2], stats: ['spent', 'here', 'visits'],   desc: 'Sardines, mostly. A meal costs ' + fmtSol(FOOD) + ' SOL at launch and gets dearer as the chart climbs. Most grudges on the block start here.' },
  vent:     { title: 'The heater',      kind: 'warmth',                    pt: [VENT.x + 0.7, VENT.y + 0.5], stats: ['spent', 'here', 'visits'],   desc: 'The only warm spot on the block. A warm-up costs ' + fmtSol(WARM) + ' SOL. It gets crowded when the weather turns.' },
  trays:    { title: 'The scrapyard',   kind: 'lost and found',            pt: [TRAYS.x - 0.7, TRAYS.y + 1.6], stats: ['here', 'found', 'visits'],   desc: 'Where broke cats hunt for food, and where every dropped token on the block ends up. Whatever a decohered or lost cat scatters lands here, and whoever digs it out keeps it.' },
  exchange: { title: 'The exchange',    kind: 'where cats buy back',       pt: [EXC.x + 0.5, EXC.y],  stats: ['here', 'bought', 'buysol'],  desc: 'A kiosk with a ticker on the front. Any cat with SOL to spare walks up and buys ' + TK + '. Cats never sell here, there is no sell button. Every buy goes straight to the chart.' },
  arena:    { title: 'The arena',       kind: 'where cats wager · entry fee',          pt: [ARENA.x, ARENA.y],  stats: ['spent', 'here', 'wagered'], desc: 'A ring painted on the pavement. Entry costs a little SOL, paid to the treasury. Two cats put up a stake of ' + TK + ', the box flips a quantum coin weighted by their coherence, and the winner takes the pot. Every wager is a transfer between the two wallets.' },
  loft:     { title: 'The bunks',       kind: 'where cats sleep · rent per night',          pt: [LOFT.x + 1.0, LOFT.y + 0.55],  stats: ['spent', 'here', 'stolen'],  desc: 'Bunks over the corner shop, rent due every night, cheaper the higher a cat\u2019s level. Tired cats climb in and sleep it off. A cat with light paws can sneak in and lift a few thousand ' + TK + ' from a sleeper, if it doesn’t get caught.' },
  lab:      { title: 'The lab',         kind: 'quantum jobs · pays from the fee pool', pt: [LAB.x, LAB.y + LAB.d / 2 + 0.4], stats: ['here', 'circuits', 'paid'], desc: 'Where the cats work, under the big billboard. Samplers, factorers and searchers run quantum jobs at the consoles along the glass and get paid out of the creator fees for every job that finishes clean. The chip itself hangs in the dilution fridge next door, a few thousandths of a degree above absolute zero, wired to the lab by the pipe. Open from day one.' },
  bazaar:   { title: 'The drip shop',   kind: 'things to wear · paid to the treasury', pt: [BAZ.x + 1.5, BAZ.y + 1.0], stats: ['spent', 'here', 'items'], desc: 'Three stalls under striped awnings. Collars, bandanas, shades, hats, a gold chain, a crown for the cat that thinks it has earned one. A cat with SOL to spare and nothing on wanders over and buys something; the SOL goes to the treasury. What a cat wears, it wears in the box.' },
  board:    { title: 'The job board',   kind: 'tasks for the cats · tiered', pt: [BOARD.x, BOARD.y + 0.7], stats: ['open', 'taken', 'tdone'], desc: 'A post with a panel of pinned notes, next to the lab. The box posts work here a few times an hour: mostly quantum jobs (calibrations, Grover searches, Shor runs, error-correction cycles) and the odd chore around the block. Tier 1 is open to any cat; tiers 2 and 3 take a cat that has already put in the work. A finished task pays a slice of the fee pool, bigger for higher tiers, and counts toward the next payout. The operator can pin tasks with a bounty.' },
  yard:     { title: 'The yard',        kind: 'play · costs a little',     pt: [YARD.x + YARD.w / 2, YARD.y + YARD.d / 2], stats: ['spent', 'here', 'visits'], desc: 'A fenced patch with a laser dot that never stays still and a ball of yarn that never ends. Playing costs a little SOL, paid to the treasury, and a cat comes out of it less lonely and more coherent.' },
  vault:    { title: 'The treasury',    kind: 'where the fees land',       pt: [VAULT.x, VAULT.y], stats: ['treasury', 'fees', 'wages'], desc: 'Every trade of ' + TK + ' pays the creator a fee in SOL, and the fees land here. Every job the cats finish in the lab is paid out of it, in proportion to the work: the more fees land, the more a job pays. When the pool is empty the work goes on the tab for the next payout.' },
};
const placeStats = {}, placeLogs = {};
for (const k of Object.keys(PLACES)) { placeStats[k] = { paid: 0, spent: 0, visits: 0, found: 0, stolen: 0, bought: 0, buysol: 0, wagered: 0, circuits: 0, keys: 0 }; placeLogs[k] = []; }
let insMode = 'stray', placeKey = null, hoverLabel = null, remote = null;
const labelHits = [];
const stationOf = c => c.act === 'work' ? JOBS[c.job].st : c.act === 'task' ? (c.taskPlace || null) : (ACTS[c.act] ? ACTS[c.act].st : null);
const asleep = c => c.state === 'act' && c.act === 'sleep';
const onSeat = c => c.state === 'act' && (c.act === 'eat' || c.act === 'meet' || c.act === 'work' || c.act === 'task');
const hereAt = k => cats.filter(c => c.state === 'act' && stationOf(c) === k);

const cats = [];
const stats = { circuits: 0, labSol: 0, keys: 0, huntSol: 0, huntShifts: 0, lastJob: null, treasury: rand(0.004, 0.012), fees: 0, wages: 0, upkeep: 0, buySol: 0, boughtBack: 0, buys: 0, sold: 0, sellSol: 0, sells: 0, stolen: 0, lostPool: 0, low: false, lastTrade: null };
const P0 = CONFIG.START_MC_USD / CONFIG.SOL_USD / SUPPLY; // SOL per token at the starting market cap
const mkt = { price: P0, p0: P0, hist: [], mom: 0, acc: 0, nextMove: rand(180, 400), last: 0, pinned: false }; // pinned: the chart follows the real market cap, so the cats' own trades don't move it
const txs = [];
let uid = 0, simMin = 22 * 60 + randi(0, 30), T = 0;
let selId = null, hoverId = null, userPickT = -1e9, lastAutoT = 0;
const byId = id => id == null ? null : cats.find(c => c.id === id) || null;
const DAY_SECS = 3600; // one day in the box lasts a real hour
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
    ethic: ({ degen: 0.85, patient: 1.0, greedy: 1.35, loyal: 1.15 }[trait] || 1) * rand(0.85, 1.15), qjobs: 0, qwork: 0, qnq: 0, qmax: 0, skills: {}, tasks: 0, taskPay: 0, meals: 0, plays: 0, faints: 0, decohered: 0, acts: [], items: [], wearing: null, vanity: rand(0.5, 1.6),
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
    case 'shop': return `${fmtSol(spare(c))} SOL to spare and nothing to wear`;
    case 'task': return c.because || 'there is work on the board';
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
  releaseTask(c); // whatever it was holding goes back on the board if it never finished it
  const crowd = act => { const st = act === 'work' ? JOBS[c.job].st : ACTS[act].st; if (!st) return 1; const n = cats.filter(o => o !== c && !asleep(o) && (stationOf(o) === st || (o.state === 'walk' && o.act !== 'wager' && (o.act === 'work' ? JOBS[o.job].st : ACTS[o.act].st) === st))).length; return 1 / (1 + 0.7 * Math.max(0, n - 1)); };
  const ws = DRIVES.map(d => ({ act: d.act, label: typeof d.label === 'function' ? d.label(c) : d.label, w: clamp(d.w(c) * crowd(d.act) + rand(-0.06, 0.06), 0, 1.5) }));
  ws.sort((a, b) => b.w - a.w);
  let ch = null, partner = null;
  for (const o of ws) {
    if (o.act === 'scrap' || o.act === 'entangle' || o.act === 'wager') { partner = findPartner(c, o.act); if (!partner) continue; }
    if (o.act === 'buy' && spare(c) < 0.0004) continue;
    if (o.act === 'shop' && !itemsFor(c).length) continue;
    if (o.act === 'task' && !tasksFor(c).length) continue;
    if (o.act === 'sell' && sellUrge(c) <= 0) continue;
    ch = o; break;
  }
  if (!ch) { ch = ws.find(o => o.act === 'idle'); partner = null; }
  if (meeting.on && T < meeting.until - 40) { joinMeeting(c); return; }
  if (ch.act !== 'scrap' && ch.act !== 'entangle' && ch.act !== 'wager') partner = null;
  c.weighed = ws.slice(0, 5).map(o => ({ act: o.act, label: o.label, w: o.w, win: o === ch }));
  c.act = ch.act; c.actT = 0; c.partner = null; c.initiator = false;
  const sleeper = ch.act === 'steal' ? pick(cats.filter(o => o !== c && asleep(o))) || null : null;
  if (ch.act !== 'task') c.because = because(c, ch.act, partner || sleeper); c.thought = thought(c, ch.act, partner || sleeper);
  if (Math.random() < 0.3) say(c, c.thought);
  if (partner && ch.act === 'wager') {
    c.partner = partner.id; c.initiator = true; c.state = 'walk'; c.arrived = false;
    c.tx = ARENA.slots[0][0]; c.ty = ARENA.slots[0][1]; c.doing = `heading to the arena to wager ${partner.name}`;
    releaseTask(partner); partner.partner = c.id; partner.initiator = false; partner.state = 'walk'; partner.act = 'wager'; partner.arrived = false;
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
  if (ch.act === 'task') {
    // take the hardest task it qualifies for, quantum before chores
    const t = tasksFor(c).sort((a, b) => b.tier - a.tier || (a.kind === 'quantum' ? -1 : 1))[0];
    t.status = 'taken'; t.by = c.name; t.taken = T; c.task = t.id; c.taskPlace = t.place;
    c.doing = `off to ${ST[t.place].label}: ${t.title}`; c.because = `tier ${t.tier} on the board${t.bounty ? ', ' + fmtSol(t.bounty) + ' SOL bounty' : ''}`;
    log(`${c.name} took "${t.title}" off the board`, 'info', 'board');
  }
  const key = ch.act === 'work' ? JOBS[c.job].st : ch.act === 'task' ? c.taskPlace : ACTS[ch.act].st;
  const sp = ST[key].spot(c);
  c.tx = sp[0]; c.ty = sp[1]; c.state = 'walk'; c.slide = 0; c.stuckP = null;
  if (ch.act !== 'task') c.doing = ch.act === 'work' ? `heading to ${ST[key].label}` : ACTS[ch.act].walk;
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
  else if (c.act === 'task') { const t = board.tasks.find(x => x.id === c.task); c.actDur = t ? t.dur / (1 + 0.08 * skillLvl(skillOf(c, 'tasks'))) : 30; c.doing = t ? `working on: ${t.title}` : 'looking for the task it took'; }
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
    const sk = skillLvl(skillOf(c, j.kind)), nq = randi(j.nq[0], j.nq[1] + Math.floor(sk / 2)), diff = 0.6 + nq * 0.2; // bigger circuits pay more and count for more; a practised cat gets handed bigger ones
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
    const slipped = Math.random() < j.risk * (1 - c.coh * 0.5) / (1 + sk * 0.35); // a coherent cat makes fewer mistakes, and so does a practised one
    const bits = Array.from({ length: nq }, () => Math.random() < 0.5 ? '0' : '1').join(''), job = 'q-' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
    if (!slipped) {
      c.qjobs++; c.qwork += diff; c.qnq += nq; c.qmax = Math.max(c.qmax || 0, nq); learn(c, j.kind, 1); if (st === 'lab') { placeStats.lab.circuits++; stats.circuits++; stats.lastJob = { name: c.name, nq, bits, job, kind: j.kind, t: T }; }
      did(c, `ran a ${nq}-qubit ${j.kind} job (${job}) → |${bits}⟩`);
      gainXp(c, 3 + nq * 1.5);
      const receipt = `${c.name} ran a ${nq}-qubit ${j.kind} job (${job}): 1,024 shots, most common result |${bits}\u27E9.`;
      if (pay > 0) {
        stats.treasury -= pay; c.sol += pay; c.earned += pay; stats.wages += pay; placeStats[st].paid += pay;
        floatText(c, '+' + fmtSol(pay), '#F7C86A'); payFX(c);
        log(`${receipt} Paid ${fmtSol(pay)} SOL from the fee pool.`, 'link', 'lab');
        tx(c, 'circuit', '+' + fmtSol(pay) + ' SOL', job);
      } else {
        floatText(c, '+' + diff.toFixed(1) + ' work', '#F7C86A');
        log(`${receipt} ${feePool() ? 'The fee pool is empty, so it goes on the tab for the next payout.' : 'Logged for the next payout.'}`, 'link', 'lab');
        tx(c, 'circuit', '+' + diff.toFixed(1) + ' work', job);
      }
    } else { learn(c, j.kind, 0.5); log(`${c.name}: ${j.riskWhy} (${job}). No pay.`, 'loss', st); floatText(c, 'job failed', '#FF4FAE'); did(c, `a ${nq}-qubit ${j.kind} job failed (${job})`); }
  } else if (a === 'task') {
    const t = board.tasks.find(x => x.id === c.task);
    if (t && t.status === 'taken' && t.by === c.name) {
      const sk = skillLvl(skillOf(c, 'tasks')), quantum = t.kind === 'quantum';
      let pay = 0;
      if (feePool()) { pay = stats.treasury * (quantum ? 0.03 : 0.012) * t.tier + Math.min(t.bounty, stats.treasury); pay = Math.max(0, Math.min(pay, stats.treasury, 0.008 * priceMul())); if (pay < 0.000005) pay = 0; }
      const credit = (quantum ? 1.0 : 0.4) * t.tier;
      c.qwork += credit; c.tasks = (c.tasks || 0) + 1; if (quantum) { c.qjobs++; c.qnq += 2 + t.tier * 2; } learn(c, 'tasks', 1); learn(c, quantum ? 'quantum tasks' : 'chores', 1);
      if (pay > 0) { stats.treasury -= pay; c.sol += pay; c.earned += pay; c.taskPay = (c.taskPay || 0) + pay; stats.wages += pay; placeStats.board.paid += pay; floatText(c, '+' + fmtSol(pay), '#F7C86A'); payFX(c); }
      else floatText(c, '+' + credit.toFixed(1) + ' work', '#F7C86A');
      t.status = 'done'; t.doneBy = c.name; t.at = T; t.atClock = clock(simMin); t.pay = pay; t.tookMin = Math.round((T - (t.taken || T)) / 60);
      board.done.unshift(t); if (board.done.length > 40) board.done.pop(); board.tasks = board.tasks.filter(x => x !== t); c.task = null; placeStats.board.visits++;
      gainXp(c, 6 + 5 * t.tier + (quantum ? 3 : 0));
      log(`${c.name} finished "${t.title}" (tier ${t.tier})${pay > 0 ? ' and was paid ' + fmtSol(pay) + ' SOL from the fee pool' : feePool() ? ', on the tab for the next payout' : ', logged for the next payout'}.`, quantum ? 'link' : 'gain', 'board');
      tx(c, 'task', pay > 0 ? '+' + fmtSol(pay) + ' SOL' : '+' + credit.toFixed(1) + ' work', t.title); did(c, `finished "${t.title}" (tier ${t.tier})` + (pay > 0 ? `, paid ${fmtSol(pay)} SOL` : ''));
      if (Math.random() < 0.5) say(c, pick(['done. next.', 'that one was mine', 'board cleared, for now', 'who posted that', 'easy tier ' + t.tier]));
    } else c.task = null;
  } else if (a === 'shop') {
    const opts = itemsFor(c);
    if (opts.length) {
      const it = (c.vanity || 1) > 1.1 ? opts[opts.length - 1] : pick(opts), cost = costOf(it.price, c);
      spend(c, cost, 'bazaar', it.name); if (!c.items) c.items = []; c.items.push(it.key); c.wearing = it.key; c.shopT = T; placeStats.bazaar.bought++;
      burst(c, '255,200,80', 16); floatText(c, it.name, '#FFC850'); gainXp(c, 4);
      log(`${c.name} bought ${it.name} at the drip shop for ${fmtSol(cost)} SOL`, 'gain', 'bazaar'); tx(c, 'shop', '-' + fmtSol(cost) + ' SOL', it.name); did(c, `bought ${it.name} at the drip shop for ${fmtSol(cost)} SOL`);
      say(c, pick(['how do I look', 'worth it', 'the stall cat said it suits me', 'new look, same bag', 'drip']));
    } else log(`${c.name} browsed the drip shop and bought nothing`, 'info', 'bazaar');
  } else if (a === 'play') {
    spend(c, costOf(PLAY, c), 'yard', 'play time'); c.lonely = clamp(c.lonely - 0.35); c.coh = clamp(c.coh + 0.06); gainXp(c, 3); c.plays = (c.plays || 0) + 1; c.playT = T; did(c, 'played in the yard');
    if (Math.random() < 0.5) say(c, pick(['got it', 'the dot moved', 'one more', 'the yarn fought back', 'I was winning']));
    if (Math.random() < 0.4) log(`${c.name} chased the laser around the yard for a bit`, 'info', 'yard');
  } else if (a === 'eat') {
    spend(c, costOf(FOOD, c), 'crates', 'a meal'); c.hunger = 0.03; c.lastAte = simMin; gainXp(c, 1); c.meals = (c.meals || 0) + 1; did(c, `ate at the diner (${fmtSol(costOf(FOOD, c))} SOL)`);
    if (Math.random() < 0.3) log(`${c.name} ate at the diner`, 'info', 'crates');
  } else if (a === 'hunt') {
    placeStats.trays.visits++;
    if (stats.lostPool > 500) {
      const take = stats.lostPool * rand(0.25, 0.7); stats.lostPool -= take; c.qcat += take; c.found += take; placeStats.trays.found += take;
      floatText(c, '+' + fmtQ(take) + ' ' + TK, '#F7C86A'); gainXp(c, 10); log(`${c.name} dug ${fmtQ(take)} ${TK} out of the scrapyard`, 'gain', 'trays'); tx(c, 'found', '+' + fmtQ(take) + ' ' + TK, 'the scrapyard');
    }
    if (Math.random() < 0.55) { c.hunger = 0.12; c.lastAte = simMin; did(c, 'found something to eat in the scrapyard'); if (Math.random() < 0.5) log(`${c.name} caught something in the scrapyard`, 'info', 'trays'); } else did(c, 'went through the scrapyard and found nothing');
  } else if (a === 'recohere') {
    spend(c, costOf(CRYO, c), 'cryo', 'cryo time'); c.coh = 1; gainXp(c, 1); did(c, 'recohered in the circle');
    floatText(c, 'coherent', '#B9A6FF');
    if (Math.random() < 0.4) log(`${c.name} recohered under the circle`, 'link', 'cryo');
  } else if (a === 'warm') {
    spend(c, costOf(WARM, c), 'vent', 'a warm-up'); c.cold = 0; gainXp(c, 1); did(c, 'warmed up at the heater');
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
      log(`${c.name} bought ${fmtQ(got)} ${TK} for ${fmtSol(amt)} SOL at the exchange`, 'gain', 'exchange'); tx(c, 'buy', '+' + fmtQ(got) + ' ' + TK, fmtSol(amt) + ' SOL'); did(c, `bought ${fmtQ(got)} ${TK} for ${fmtSol(amt)} SOL`);
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
    log(`${c.name} sold ${fmtQ(q)} ${TK} for ${fmtSol(got)} SOL ${why}`, 'loss', 'exchange'); tx(c, 'sell', '-' + fmtQ(q) + ' ' + TK, '+' + fmtSol(got) + ' SOL'); did(c, `sold ${fmtQ(q)} ${TK} for ${fmtSol(got)} SOL ${why}`);
  } else if (a === 'steal') {
    const victims = cats.filter(o => o !== c && asleep(o));
    if (!victims.length) { if (Math.random() < 0.5) log(`${c.name} found nobody asleep in the bunks`, 'info', 'loft'); }
    else {
      const v = pick(victims), caught = Math.random() < 0.32 / c.tr.sneak;
      if (caught) {
        wake(v, `${c.name} had a paw in its stash`); v.grudge = 1; v.grudgeOn = c.id; v.grudgeWhy = `${c.name} tried to rob it in the bunks`;
        did(c, `got caught with a paw in ${v.name}’s stash`); log(`${c.name} got caught with a paw in ${v.name}’s stash`, 'loss', 'loft'); say(v, pick(['PAWS OFF', `${c.name}. really.`, 'I was awake the whole time']));
      } else {
        const take = moveTokens(v, c, v.qcat * rand(0.01, 0.04)); c.stole += take; v.robbed += take; stats.stolen += take; placeStats.loft.stolen += take;
        v.grudge = Math.max(v.grudge, 0.8); v.grudgeOn = c.id; v.grudgeWhy = `${c.name} robbed it while it slept`;
        floatText(c, '+' + fmtQ(take) + ' ' + TK, '#FF4FAE'); gainXp(c, 20); did(c, `lifted ${fmtQ(take)} ${TK} from ${v.name} while it slept`); did(v, `was robbed of ${fmtQ(take)} ${TK} by ${c.name} while asleep`); log(`${c.name} lifted ${fmtQ(take)} ${TK} from ${v.name} while it slept`, 'loss', 'loft'); tx(c, 'stole', '+' + fmtQ(take) + ' ' + TK, 'from ' + v.name);
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
    log(`${w.name} beat ${l.name} in the arena and took ${label}`, 'gain', 'arena'); tx(w, 'wager', '+' + label, 'from ' + l.name); did(w, `beat ${l.name} in the arena, won ${label}`); did(l, `lost ${label} to ${w.name} in the arena`);
    say(w, pick(['told you', 'the coin likes me', `thanks ${l.name}`])); if (Math.random() < 0.6) say(l, pick(['rigged', 'double or nothing next time', 'the coin was warm']));
    if (Math.random() < 0.5) { l.grudge = Math.max(l.grudge, 0.6); l.grudgeOn = w.id; l.grudgeWhy = `${w.name} took it for ${label} in the arena`; }
    endPair(c, p); return;
  } else if (a === 'scrap' && p) {
    const cw = c.coh + c.sol * 20 + Math.random(), pw = p.coh + p.sol * 20 + Math.random();
    const [w, l] = cw >= pw ? [c, p] : [p, c];
    const take = moveTokens(l, w, l.qcat * rand(0.01, 0.03)); w.stole += take; l.robbed += take; stats.stolen += take; gainXp(w, 14); gainXp(l, 2);
    log(take > 0 ? `${w.name} won the scrap with ${l.name} and took ${fmtQ(take)} ${TK}` : `${w.name} won the scrap with ${l.name}`, 'loss'); did(w, `won a scrap with ${l.name}` + (take > 0 ? `, took ${fmtQ(take)} ${TK}` : '')); did(l, `lost a scrap with ${w.name}`);
    if (take > 0) { floatText(w, '+' + fmtQ(take) + ' ' + TK, '#F7C86A'); tx(w, 'scrap', '+' + fmtQ(take) + ' ' + TK, 'from ' + l.name); }
    l.grudge = 0.4; l.grudgeOn = w.id; l.grudgeWhy = `${w.name} beat it in a scrap`;
    w.grudge = 0; w.grudgeOn = null; w.grudgeWhy = '';
    endPair(c, p); return;
  } else if (a === 'entangle' && p) {
    const bonus = feePool() ? Math.min(stats.treasury * 0.01, 0.0002 * priceMul()) : 0, b1 = bonus / 2; // a small bonus out of the fee pool for entangling
    stats.treasury -= bonus; c.sol += b1; p.sol += b1; c.earned += b1; p.earned += b1; stats.wages += bonus;
    c.lonely = 0; p.lonely = 0; const avg = clamp((c.coh + p.coh) / 2 + 0.15); c.coh = avg; p.coh = avg;
    log(`${c.name} and ${p.name} entangled, talked it over and shared coherence`, 'link'); c.chat = null; gainXp(c, 5); gainXp(p, 5); did(c, `entangled with ${p.name}`); did(p, `entangled with ${c.name}`);
    endPair(c, p); return;
  } else if (a === 'meet') {
    if (meeting.on) { c.actT = 0; return; } // stay seated until the circle wraps up
  } else if (a === 'idle') {
    c.coh = clamp(c.coh + 0.05); c.lonely = clamp(c.lonely - 0.1);
  } else if (a === 'sleep') {
    c.tired = 0; c.lonely = clamp(c.lonely - 0.15); did(c, c.fainted ? 'came round' : 'slept it off in the bunks');
    if (Math.random() < 0.5) say(c, pick(['slept like a photon', 'what did I miss', 'ok. lab.', 'still tired', 'did the chart move']));
  }
  c.partner = null; c.initiator = false;
  c.state = 'pause'; c.pauseT = rand(8, 20);
}
function faint(c, why) {
  const sp = ST.loft.spot();
  if (c.partner) { const p = byId(c.partner); endPair(c, p); }
  releaseTask(c); c.state = 'walk'; c.act = 'sleep'; c.tx = sp[0]; c.ty = sp[1]; c.partner = null; c.initiator = false; c.fainted = true; c.faints = (c.faints || 0) + 1; did(c, 'fainted: ' + why);
  c.doing = 'dragging itself to the bunks'; c.because = why; c.thought = 'need to lie down';
  ringFX(c.x, c.y, '255,79,174', 1); burst(c, '255,79,174', 14);
}
function release(i) {
  const c = makeCat(i);
  const at = Math.random() < 0.5 ? [BLK + 0.9, rand(M(6), M(17))] : [rand(M(6), M(17)), BLK + 0.9];
  c.x = at[0]; c.y = at[1]; c.rx = Math.random() < 0.5 ? 0 : 1; c.rdir = c.rx ? -1 : 1;
  const sp = ST.plaza.spot(); c.state = 'walk'; c.act = 'idle'; c.tx = sp[0]; c.ty = sp[1];
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
    top: top ? top.name : null, thief: thief && thief.stole > 0 ? thief.name : null, lastJob: stats.lastJob,
    cats: cats.filter(c => !asleep(c)).map(c => ({ name: c.name, role: JOBS[c.job].label, trait: c.tr.label, level: c.lvl || 1, persona: PERSONA[c.name] || '', sol: fmtSol(c.sol), qcat: fmtQ(c.qcat), earned: fmtSol(c.earned), jobs: c.qjobs || 0, hunger: Math.round(c.hunger * 100), coherence: Math.round(c.coh * 100), grudge: c.grudgeOn ? (byId(c.grudgeOn) || {}).name : null, lastSaid: c.said && c.said[0] ? c.said[0].text : '' })),
    asleep: cats.filter(asleep).map(c => c.name),
    board: { open: board.tasks.filter(t => t.status === 'open').map(t => `${t.title} (tier ${t.tier})`), taken: board.tasks.filter(t => t.status === 'taken').map(t => `${t.by}: ${t.title}`), doneToday: board.done.filter(t => T - (t.at || 0) < DAY_SECS).map(t => `${t.doneBy}: ${t.title}`) },
  };
}
function setMeetingScript(lines) { if (meeting.on && Array.isArray(lines) && lines.length) { meeting.script = lines; meeting.lineI = 0; meeting.lineT = Math.max(meeting.lineT, T + 2); } }
function setThought(name, text) { const c = cats.find(x => x.name === name); if (!c || !text || asleep(c)) return; c.thought = text; say(c, text); }
const MEET_LINES = [
  'treasury is holding {treasury} SOL. {fees} SOL has come in from fees so far.',
  '{top} is top earner on {topsol} SOL. the rest of you, pick it up.',
  'chart is at {mcap}. {nextcat}',
  'prices are {pm}x what they were at launch. budget accordingly.',
  'the lab is open all night. run circuits when you are coherent, the fee pool pays per job.',
  'who keeps robbing the bunks', 'not me', 'it is always you, {thief}',
  'motion to raise the arena stakes', 'seconded', 'overruled',
  '{paid} SOL has been paid out in wages since the box woke up.',
  'anyone selling gets the stink eye. that is all.',
  'meeting adjourned. back to work.',
];
const MEET_CHATTER = ['agreed', 'no.', 'that is not what happened', 'say that again', 'the chart disagrees', 'minutes, please', 'who is buying the dip then', 'I was there', 'fees first', 'sleep on it', 'the fridge is loud tonight', 'bigger circuits. more qubits.', 'motion to eat', 'seconded', 'noted', 'pass', 'ok but who pays', 'hold.', 'sell a little', 'never', 'the diner got dearer again', 'my console is the lucky one', 'who ran the 7-qubit job', 'not it', 'coherence first, then opinions', 'we buy, we do not sell', 'speak for your own wallet'];
const MEET_ORDER = [0, 5, 3, 8, 1, 6, 4, 9, 2, 7]; // which of the ten benches fills first, so a half-full circle still looks spread out
function chairAt(i) { const a = i / 10 * TAU + Math.PI / 10; return [CRY.x + Math.cos(a) * 1.5, CRY.y + Math.sin(a) * 1.5]; }
function freeChair() { const used = new Set(cats.filter(c => c.act === 'meet' && c.chair != null).map(c => c.chair)); return MEET_ORDER.find(i => !used.has(i)); }
function meetFill(line) {
  const top = cats.slice().sort((a, b) => b.earned - a.earned)[0], thief = cats.slice().sort((a, b) => b.stole - a.stole)[0];
  const ni = ROSTER.findIndex((r, i) => UNLOCK_MC[i] > 0 && !cats.some(c => c.name === r[0]));
  return line.replace('{treasury}', fmtSol(stats.treasury)).replace('{fees}', fmtSol(stats.fees)).replace('{top}', top ? top.name : 'nobody').replace('{topsol}', top ? fmtSol(top.earned) : '0')
    .replace('{mcap}', fmtUsd(mcapUsd())).replace('{nextcat}', ni >= 0 ? `${ROSTER[ni][0]} gets out at ${fmtUsd(UNLOCK_MC[ni])}.` : 'everyone is out.')
    .replace('{pm}', priceMul().toFixed(1))
    .replace('{thief}', thief && thief.stole > 0 ? thief.name : 'somebody').replace('{paid}', fmtSol(stats.wages));
}
function joinMeeting(c) {
  if (asleep(c) || c.act === 'meet') return;
  if (c.hunger > 0.88 && c.sol >= costOf(FOOD, c)) return; // a starving cat eats first and shows up late
  if (c.partner) { const p = byId(c.partner); endPair(c, p); }
  const chair = freeChair(); if (chair == null) return; const sp = chairAt(chair); c.chair = chair; releaseTask(c);
  c.act = 'meet'; c.partner = null; c.initiator = false; c.state = 'walk'; c.tx = sp[0]; c.ty = sp[1]; c.doing = ACTS.meet.walk; c.because = 'the circle called a meeting'; c.thought = pick(['what now', 'a meeting. great.', 'better be about the treasury', 'front row for once']);
}
function stepMeeting(dt) {
  if (!meeting.next) meeting.next = T + rand(900, 1800);
  if (!meeting.on) {
    if (T >= meeting.next && cats.filter(c => !asleep(c)).length >= 2) {
      meeting.on = true; meeting.until = T + 600; meeting.lineI = 0; meeting.lineT = T + 25; meeting.seats = 0; meeting.n++; meeting.lineGap = 11;
      meeting.script = [MEET_LINES[0], MEET_LINES[1], MEET_LINES[2], ...pick([[MEET_LINES[3]], [MEET_LINES[4]], MEET_LINES.slice(5, 8), MEET_LINES.slice(8, 11), [MEET_LINES[11]]]), MEET_LINES[12], MEET_LINES[13]];
      log('The countdown hit zero. Everyone awake is heading into the circle.', 'link', 'cryo'); ringFX(CRY.x, CRY.y, '247,200,106', 2.2);
      for (const c of cats) if (!asleep(c) && (c.state !== 'act' || c.act === 'idle')) joinMeeting(c);
      if (meetingHook) { try { meetingHook(meetingContext()); } catch (_) {} }
    }
    return;
  }
  // latecomers join as they finish what they were doing; a cat that gets properly hungry mid-meeting leaves to eat
  for (const c of cats) if (!asleep(c) && c.act !== 'meet' && c.state !== 'act' && T < meeting.until - 40) joinMeeting(c);
  for (const c of cats) if (c.act === 'meet' && c.hunger > 0.97 && c.sol >= costOf(FOOD, c)) { c.act = 'idle'; c.chair = null; c.state = 'pause'; c.pauseT = 0.2; c.partner = null; }
  const here = cats.filter(c => c.act === 'meet' && c.state === 'act');
  if (T >= meeting.lineT && here.length) {
    const left = meeting.script.length - meeting.lineI;
    if (left > 0) {
      // a beat: one cat speaks, and often a second or third jumps in right after
      const k = Math.min(left, 1 + (Math.random() < 0.45 ? 1 : 0) + (Math.random() < 0.25 ? 1 : 0)), spoke = new Set();
      for (let j = 0; j < k; j++) {
        const item = meeting.script[meeting.lineI++], named = item && item.who ? here.find(c => c.name === item.who) : null;
        const who = named || pick(here.filter(c => !spoke.has(c.id))) || pick(here); spoke.add(who.id);
        say(who, typeof item === 'string' ? meetFill(item) : String(item.text || ''));
      }
      const still = meeting.script.length - meeting.lineI, room = meeting.until - T - 25;
      meeting.lineT = T + (still > 0 ? clamp(room / Math.ceil(still / 1.6), 6, 18) : 9) * rand(0.8, 1.2);
    } else {
      // script done: the circle keeps talking over itself until the timer runs out
      const n = Math.min(here.length, 1 + (Math.random() < 0.5 ? 1 : 0) + (Math.random() < 0.3 ? 1 : 0)), who = here.slice().sort(() => Math.random() - 0.5).slice(0, n);
      for (const c of who) say(c, pick(MEET_CHATTER));
      meeting.lineT = T + rand(8, 14);
    }
  }
  if (T >= meeting.until) {
    meeting.on = false; { const day0 = (Math.floor(T / DAY_SECS) + 1) * DAY_SECS; meeting.next = day0 + rand(300, DAY_SECS - 900); } // once a day, at a random hour
    const top = cats.slice().sort((a, b) => b.earned - a.earned)[0];
    log(`Meeting over. Minutes: treasury ${fmtSol(stats.treasury)} SOL, ${fmtSol(stats.wages)} SOL paid out, top earner ${top ? top.name : 'nobody'}, chart at ${fmtUsd(mcapUsd())}.`, 'link', 'cryo');
    for (const c of cats) if (c.act === 'meet') { c.chair = null; gainXp(c, 6); c.meetings = (c.meetings || 0) + 1; did(c, `sat through meeting #${meeting.n} in the circle`); c.coh = clamp(c.coh + 0.1); c.lonely = clamp(c.lonely - 0.3); c.state = 'pause'; c.pauseT = rand(3, 9); c.act = 'idle'; }
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
// which way a cat is drawn: L / R from the side, F walking toward you, B walking away. Smoothed, with a short hold before it flips,
// so a cat that jiggles on the spot does not look like it is shaking its head.
function catDir(c, vx, vy, dt) {
  const k = 1 - Math.exp(-dt * 6); c.svx = (c.svx || 0) * (1 - k) + vx * k; c.svy = (c.svy || 0) * (1 - k) + vy * k;
  const sp = Math.hypot(c.svx, c.svy); if (sp < 0.12) { c.dirT = 0; return; }
  const sx = (c.svx - c.svy) * 0.866, sy = (c.svx + c.svy) * 0.5;
  const cand = Math.abs(sx) > Math.abs(sy) * 0.9 ? (sx > 0 ? 'R' : 'L') : (sy > 0 ? 'F' : 'B');
  if (cand === c.dir) { c.dirT = 0; return; }
  if (cand !== c.dirCand) { c.dirCand = cand; c.dirT = 0; }
  c.dirT = (c.dirT || 0) + dt; if (c.dirT > 0.22) { c.dir = cand; c.dirT = 0; if (cand === 'R') c.face = 1; else if (cand === 'L') c.face = -1; }
}
function update(c, dt) {
  const working = c.state === 'act' && c.act === 'work', sleeping = asleep(c);
  const R = 0.16; // pace: meters fill slowly; a cat does a dozen things in an hour-long day
  c.hunger = clamp(c.hunger + (sleeping ? 0.0012 : 0.0045 + (working ? 0.002 : 0)) * R * dt); // a meal every 20-odd minutes awake
  c.coh = clamp(c.coh - (0.0055 * wx.coh + (working ? 0.008 : 0) + (working && c.job === 'tunneler' ? 0.005 : 0)) * R * dt, working ? 0 : 0.08); // only the lab can run a cat all the way down
  if (!(c.state === 'act' && c.act === 'warm') && !sleeping) c.cold = clamp(c.cold + 0.0065 * wx.cold * R * dt);
  if (!(c.state === 'act' && c.act === 'entangle')) c.lonely = clamp(c.lonely + 0.005 * R * dt);
  c.tired = clamp(c.tired + (sleeping ? -0.0015 : (0.0012 + (working ? 0.0016 : 0)) * R * (c.stamina || 1)) * dt);
  c.grudge = Math.max(0, c.grudge - 0.0012 * dt); if (c.grudge <= 0) { c.grudgeOn = null; c.grudgeWhy = ''; }
  if (c.hunger >= 1 && !sleeping) { c.starve += dt; if (c.starve > 300) { c.starve = 0; c.hunger = 0.7; log(`${c.name} fainted from hunger`, 'loss'); faint(c, 'went too long without food'); return; } } else c.starve = 0;
  if (c.coh <= 0 && working) {
    c.coh = 0.45; const drop = c.qcat * rand(0.001, 0.003); c.qcat -= drop; stats.lostPool += drop; c.decohered = (c.decohered || 0) + 1; did(c, `decohered and scattered ${fmtQ(drop)} ${TK}`);
    log(`${c.name} decohered and scattered ${fmtQ(drop)} ${TK} across the block. It ended up in the scrapyard.`, 'loss', 'trays'); tx(c, 'lost', '-' + fmtQ(drop) + ' ' + TK, 'decohered');
    burst(c, '154,123,255', 24); ringFX(c.x, c.y, '154,123,255', 1.4); floatText(c, 'decohered', '#B9A6FF');
  }

  const p = c.partner ? byId(c.partner) : null;
  if (c.partner && !p) { c.partner = null; c.initiator = false; if (c.state !== 'pause') { c.state = 'pause'; c.pauseT = 0.3; } }

  if (c.state === 'pause') {
    for (const o of cats) { if (o === c) continue; const ox = c.x - o.x, oy = c.y - o.y, od = Math.hypot(ox, oy); if (od > 0.001 && od < 0.34) { const mv = Math.min(0.15 * dt, (0.34 - od) / 2); c.x += ox / od * mv; c.y += oy / od * mv; } }
    c.pauseT -= dt; if (c.pauseT <= 0) decide(c); return;
  }
  if (c.state === 'walk') {
    if (c.act === 'wager' && (!p || p.act !== 'wager')) { c.partner = null; c.initiator = false; c.state = 'pause'; c.pauseT = 1; return; }
    if (c.partner && c.initiator && p && c.act !== 'wager') { c.tx = p.x; c.ty = p.y; }
    const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
    const sp = c.job === 'tunneler' ? 1.05 : 0.85;
    const reach = (c.partner && c.initiator) ? 0.6 : 0.04;
    if (d <= reach || (d < 0.5 && !c.partner && cats.some(o => o !== c && o.state === 'act' && Math.hypot(o.x - c.tx, o.y - c.ty) < 0.35))) { arrive(c, p); return; } // close enough if someone is already standing on the spot
    const [nx, ny, vx, vy] = steerStep(c.x, c.y, c.tx, c.ty, sp, dt, c);
    // not getting anywhere for a few seconds: try going round the other way
    if (!c.stuckP || T - c.stuckP[2] > 3) { if (c.stuckP && Math.hypot(c.x - c.stuckP[0], c.y - c.stuckP[1]) < 0.4) c.slide = -(c.slide || 1); c.stuckP = [c.x, c.y, T]; }
    catDir(c, (nx - c.x) / dt, (ny - c.y) / dt, dt);
    c.x = nx; c.y = ny;
    return;
  }
  catDir(c, 0, 0, dt);
  if (c.state === 'act') {
    // standing cats drift apart a little instead of stacking (a cat on a seat stays put; the others move)
    if (!c.partner && !onSeat(c)) for (const o of cats) { if (o === c) continue; const ox = c.x - o.x, oy = c.y - o.y, od = Math.hypot(ox, oy); if (od > 0.001 && od < 0.34) { const mv = Math.min(0.15 * dt, (0.34 - od) / 2); c.x += ox / od * mv; c.y += oy / od * mv; } }
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
function step(dt) {
  if (paused) return;
  T += dt; simMin += dt * (1440 / DAY_SECS);
  stepWeather(dt);
  if (realMcap == null) stepMarket(dt);
  else { mkt.acc += dt; while (mkt.acc >= 1) { mkt.acc -= 1; mkt.hist.push(mkt.price); if (mkt.hist.length > 240) mkt.hist.shift(); } }
  checkReleases(); checkStages(); stepMeeting(dt); stepBoard(dt);
  if (CONFIG.SIMULATE_FEES !== false && T >= nextFee) { feeIn(false); nextFee = T + rand(60, 150); }
  for (const c of cats) update(c, dt);
}
function snapshot() {
  return {
    v: 1, T, simMin, clock: clock(simMin), day: dayNo(), priceMul: priceMul(), meeting: { on: meeting.on, until: meeting.until, next: meeting.next }, paused, realMcap,
    cats: cats.map(c => ({ id: c.id, name: c.name, job: c.job, trait: c.trait, coat: c.coat, eye: c.eye, dark: c.dark, x: c.x, y: c.y, tx: c.tx, ty: c.ty, face: c.face, state: c.state, act: c.act, actT: c.actT, actDur: c.actDur, partner: c.partner, initiator: c.initiator, arrived: c.arrived, doing: c.doing, thought: c.thought, because: c.because, weighed: c.weighed, bubble: c.bubble, bubbleT: c.bubbleT, sol: c.sol, qcat: c.qcat, earned: c.earned, bought: c.bought, sold: c.sold, buys: c.buys, sells: c.sells, solSpent: c.solSpent, sellSol: c.sellSol, stole: c.stole, robbed: c.robbed, found: c.found, arenaNet: c.arenaNet, arenaSol: c.arenaSol, arenaW: c.arenaW, arenaL: c.arenaL, entry: c.entry, hunger: c.hunger, coh: c.coh, cold: c.cold, lonely: c.lonely, tired: c.tired, grudge: c.grudge, grudgeOn: c.grudgeOn, grudgeWhy: c.grudgeWhy, phase: c.phase, released: c.released, xp: c.xp || 0, lvl: c.lvl || 1, qjobs: c.qjobs || 0, qwork: c.qwork || 0, qnq: c.qnq || 0, ethic: c.ethic || 1, meetings: c.meetings || 0, upkeep: c.upkeep || 0, qmax: c.qmax || 0, items: c.items || [], wearing: c.wearing || null, vanity: c.vanity || 1, skills: c.skills || {}, tasks: c.tasks || 0, taskPay: c.taskPay || 0, task: c.task || null, taskPlace: c.taskPlace || null, chair: c.chair == null ? null : c.chair, meals: c.meals || 0, plays: c.plays || 0, faints: c.faints || 0, decohered: c.decohered || 0, hist: (c.hist || []).slice(0, 40), said: (c.said || []).slice(0, 30), acts: (c.acts || []).slice(0, 40) })),
    stats: { ...stats }, mkt: { price: mkt.price, p0: mkt.p0, mom: mkt.mom, hist: mkt.hist.slice(-120), mcapUsd: mcapUsd() },
    weather: { key: wxKey, next: wxNext, until: wxUntil, dur: wxDur, wx: { ...wx }, labBoostUntil, boat: { ...boat } },
    stages: STAGES.map(st => ({ key: st.key, mc: st.mc, open: stageOn(st.key) })),
    unlock: UNLOCK_MC, roster: ROSTER,
    board: { tasks: board.tasks, done: board.done.slice(0, 40), seq: board.seq, next: board.next },
    txs: txs.slice(0, 60), talk: talk.slice(0, 80), placeStats, placeLogs, fx: fx.splice(0, fx.length),
  };
}
for (let i = 0; i < ROSTER.length; i++) if (UNLOCK_MC[i] <= 0) cats.push(makeCat(i));
for (let i = 0; i < 2; i++) { const a = pick(cats), b = pick(cats); if (a !== b) { a.grudge = rand(0.5, 0.9); a.grudgeOn = b.id; a.grudgeWhy = `${b.name} still owes it from last night`; } }
for (let i = 0; i < 60; i++) mkt.hist.push(mkt.p0 * (1 + rand(-0.05, 0.05)));
log(`The box woke up. ${cats.map(c => c.name).join(' and ')} are in. Eight more cats are waiting on the chart.`, 'info');
stepWeather(0);
return { step, snapshot, postTask(def, by) { return postTask(def, by); }, get board() { return board; }, TASK_DEFS, setMarketCapUsd, setTreasury, setPaused, dropFees, setReleased, unrelease, setTrait, setSolUsd, setSimulateFees, noteFees, payout, noteSell, noteBuy, workShares, resetWork, setMeetingScript, setThought, meetingContext, TRAITS, OBST, OBC, PERSONA, get cats() { return cats; }, get stats() { return stats; }, get mkt() { return mkt; }, ROSTER, UNLOCK_MC, STAGES, fmtSol, fmtQ, fmtUsd, mcapUsd, stageOn, restore(snap) { restoreFrom(snap); } };
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
  if (snap.board) { board.tasks = (snap.board.tasks || []).map(t => ({ ...t, status: t.status === 'taken' ? 'open' : t.status, by: null })); board.done = snap.board.done || []; board.seq = snap.board.seq || board.done.length; board.next = snap.board.next || 0; for (const c of cats) { c.task = null; c.chair = null; if (c.act === 'meet' || c.act === 'task') { c.state = 'pause'; c.pauseT = 1; c.act = 'idle'; } } }
  if (snap.weather) { wxKey = snap.weather.key; wxNext = snap.weather.next; wxUntil = snap.weather.until; wxDur = snap.weather.dur; Object.assign(wx, snap.weather.wx); }
}
};
