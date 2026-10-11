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
function say(c, text) { if (!text) return; c.bubble = text; c.bubbleT = T; if (meeting.on && c.act === 'meet' && dayCur) { dayCur.meeting.lines.push({ who: c.name, text }); if (dayCur.meeting.lines.length > 120) dayCur.meeting.lines.shift(); } talkPush({ sys: false, cat: c.id, name: c.name, coat: c.coat, eye: c.eye, text, t: clock(simMin) }); if (c.said) { c.said.unshift({ t: clock(simMin), day: dayNo(), text }); if (c.said.length > 30) c.said.pop(); } }
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
  { x: 2, y: 9.4, w: 3, d: 2.8, h: 5.8, board: 'D' },   // a hoarding on the left too
  { x: 2, y: 12.8, w: 3, d: 2.6, h: 3.6 },
  { x: 2, y: 16, w: 3, d: 2.2, h: 2.4 },
  { x: 5.6, y: 2, w: 3.2, d: 3, h: 5.2 },
  { x: 9.4, y: 2, w: 2.8, d: 3, h: 3.4 },
  { x: 12.8, y: 2, w: 2.6, d: 3, h: 6.4, board: 'C' },
  { x: 16, y: 2, w: 2.2, d: 3, h: 4.0 },
  { x: 19.4, y: 2, w: 2.6, d: 3, h: 5.4 },
  { x: 2, y: 19.4, w: 3, d: 2.6, h: 3.2 },
  { x: 22.4, y: 2, w: 2.4, d: 3, h: 4.6 },   // the corner behind the bunks
  { x: 2, y: 22.4, w: 3, d: 2.4, h: 3.0 },   // the corner behind the yard
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
const LAB = { x: M(9.4), y: M(6.6), w: 3.6, d: 3.0 };                          // the lab, right of the fridge
const FRIDGE = { x: M(5.2), y: M(5.65), r: 0.62 };                             // the dilution fridge, tucked into the top corner, piped to the lab
const VAULT = { x: M(16.9), y: M(8.9) };                                       // the treasury, on the right edge between the bunks and the scrapyard
const LOFT = { x: M(16.3), y: M(5.3), w: 2.0, d: 1.1 };                        // the bunks, over the corner shop
const TRAYS = { x: M(16.7), y: M(11.5), w: 0.6, d: 3.2 };                      // the scrapyard strip along the right edge
const CRATES = { x: M(14.9), y: M(16.0), w: 1.6, d: 0.8 };                     // the diner counter
const DINER_STOOLS = [0, 1, 2, 3].map(i => [CRATES.x + 0.08 + i * 0.48, CRATES.y + 1.3]); // four stools along the front of the counter
const VENT = { x: M(10.7), y: M(16.6) };                                       // the heater grate (1.4 x 0.85)
const ARENA = { x: M(5.45), y: M(13.4), r: 0.95 }; ARENA.slots = [[ARENA.x - 0.3, ARENA.y + 0.22], [ARENA.x + 0.3, ARENA.y - 0.22]]; // the two cats square up in the middle of the ring
const YARD = { x: M(4.7), y: M(15.4), w: 2.5, d: 2.2 };                        // the yard, in the left corner
const EXC = { x: M(5.7), y: M(10.77) };                                        // the exchange kiosk
const CASINO = { x: M(5.7), y: M(8.27) };                                     // the casino, above the exchange on the left edge
const SLOTS = [-0.55, 0, 0.55].map(dy => [CASINO.x - 1.0, CASINO.y + dy]);          // three slot machines against the wall, facing the plaza
const TABLE = { x: CASINO.x + 0.25, y: CASINO.y + 1.4, r: 0.42 };                  // the card table, the dealer behind it on the wall side
const DOCK = { x: M(8.3), y: M(16.6) }; // the sweeper bots' charging pad, halfway between the yard and the heater
const DOCK_SLOTS = [[DOCK.x - 0.32, DOCK.y + 0.1], [DOCK.x + 0.32, DOCK.y - 0.1]]; // two bays on the pad
const CASINO_SPOTS = [...SLOTS.map(q => [CASINO.x - 0.25, q[1]]), [TABLE.x + 0.75, TABLE.y - 0.32], [TABLE.x + 0.75, TABLE.y + 0.32]]; // where a cat stands to play
const EXC_DESKS = [[EXC.x - 0.85, EXC.y - 0.45], [EXC.x - 0.85, EXC.y + 0.45]];     // two trading desks against the wall
const EXC_SPOTS = EXC_DESKS.map(q => [EXC.x - 0.05, q[1]]);                          // the stools in front of them
const BAZ = { x: M(12.1), y: M(4.85), w: 3.0, d: 0.7 };                       // the shop: three stalls against the back wall, top right, clear of the bunks
const BAZ_SPOTS = [0, 1, 2].map(i => [BAZ.x + 0.5 + i * 1.0, BAZ.y + BAZ.d + 0.55]);
// bins along the two front edges: where trash and litter go
const BINS = [[M(10.2), BLK - 0.8], [M(14.6), BLK - 0.8], [BLK - 0.8, M(10.2)], [BLK - 0.8, M(14.6)]];
// the lab's consoles, one per cat: six along the glass front, four down the right side
const LAB_CONSOLES = [-1.65, -0.99, -0.33, 0.33, 0.99, 1.65].map(u => [LAB.x + u, LAB.y + LAB.d / 2 + 0.5]).concat([-1.05, -0.35, 0.35, 1.05].map(u => [LAB.x + LAB.w / 2 + 0.5, LAB.y + u]));
// somewhere on the open plaza, away from the structures and the circle: where a cat with nothing to do goes to loaf
function wanderSpot() {
  // the ring of open floor round the circle, clear of every structure and every place a cat stands or sits to do something
  for (let i = 0; i < 24; i++) { const a = rand(0, TAU), r = rand(3.0, 5.4), x = CRY.x + Math.cos(a) * r, y = CRY.y + Math.sin(a) * r; if (x < 6.2 || y < 6.2 || x > BLK - 1.0 || y > BLK - 1.0 || pushOut(x, y, 0.6)[2] > 0 || nearPlace(x, y)) continue; return [x, y]; }
  return [CRY.x + 3.2, CRY.y + 3.2];
}
const ST = {
  plaza:  { label: 'the plaza',       spot: () => wanderSpot() },
  bazaar: { label: 'the shop',        spot: me => { const taken = cats.filter(c => c !== me && c.act === 'shop').map(c => [c.tx, c.ty]); const free = BAZ_SPOTS.filter(q => !taken.some(t => Math.hypot(t[0] - q[0], t[1] - q[1]) < 0.2)); const q = pick(free.length ? free : BAZ_SPOTS); return [q[0], q[1]]; } },
  cryo:   { label: 'the circle',      spot: () => wanderSpot() },
  crates: { label: 'the diner',       spot: me => { const taken = cats.filter(c => c !== me && c.act === 'eat').map(c => [c.tx, c.ty]); const free = DINER_STOOLS.filter(q => !taken.some(t => Math.hypot(t[0] - q[0], t[1] - q[1]) < 0.2)); if (!free.length) return [rand(CRATES.x + 0.1, CRATES.x + 1.5), CRATES.y + 1.95]; const q = pick(free); return [q[0], q[1]]; } }, // no free stool: eat standing, behind the stools
  vent:   { label: 'the heater',      spot: () => [rand(VENT.x + 0.26, VENT.x + 1.4), rand(VENT.y + 0.26, VENT.y + 1.04)] },
  trays:  { label: 'the scrapyard',   spot: () => [rand(TRAYS.x - 1.3, TRAYS.x - 0.5), rand(TRAYS.y + 0.5, TRAYS.y + 2.9)] },
  loft:   { label: 'the bunks',       spot: () => [rand(LOFT.x + 0.4, LOFT.x + 1.7), rand(LOFT.y + 0.4, LOFT.y + 0.9)] },
  exchange: { label: 'the exchange',  spot: me => { const taken = cats.filter(c => c !== me && (c.act === 'sell' || c.act === 'buy')).map(c => [c.tx, c.ty]); const free = EXC_SPOTS.filter(q => !taken.some(t => Math.hypot(t[0] - q[0], t[1] - q[1]) < 0.2)); const q = pick(free.length ? free : EXC_SPOTS); return [q[0], q[1]]; } },
  casino:   { label: 'the casino',    spot: me => { const taken = cats.filter(c => c !== me && c.act === 'gamble').map(c => [c.tx, c.ty]); const free = CASINO_SPOTS.filter(q => !taken.some(t => Math.hypot(t[0] - q[0], t[1] - q[1]) < 0.2)); const q = pick(free.length ? free : CASINO_SPOTS); return [q[0], q[1]]; } },
  arena:    { label: 'the arena',     spot: () => [rand(ARENA.x - 0.3, ARENA.x + 0.3), rand(ARENA.y - 0.3, ARENA.y + 0.3)] },
  lab:      { label: 'the lab',       spot: me => { const taken = cats.filter(c => c !== me && c.act === 'work' && JOBS[c.job].st === 'lab').map(c => [c.tx, c.ty]); const free = LAB_CONSOLES.filter(q => !taken.some(t => Math.hypot(t[0] - q[0], t[1] - q[1]) < 0.2)); const q = pick(free.length ? free : LAB_CONSOLES); return [q[0], q[1]]; } },
  yard:     { label: 'the yard',      spot: () => [rand(YARD.x + 0.4, YARD.x + YARD.w - 0.4), rand(YARD.y + 0.4, YARD.y + YARD.d - 0.4)] },
};
const LABELS = [['vault', VAULT.x, VAULT.y, 2.2], ['yard', YARD.x + YARD.w / 2, YARD.y + YARD.d / 2, 2.0], ['lab', LAB.x, LAB.y, 3.2], ['fridge', FRIDGE.x, FRIDGE.y, 3.4], ['cryo', CRY.x, CRY.y, 5.4], ['crates', CRATES.x + 0.8, CRATES.y + 0.4, 2.6], ['vent', VENT.x + 0.7, VENT.y + 0.4, 1.9], ['trays', TRAYS.x + 0.3, TRAYS.y + 1.6, 1.5], ['loft', LOFT.x + 1.0, LOFT.y + 0.55, 3.4], ['exchange', EXC.x, EXC.y, 2.4], ['casino', CASINO.x, CASINO.y, 2.4], ['arena', ARENA.x, ARENA.y, 1.6], ['bazaar', BAZ.x + 1.5, BAZ.y + 0.4, 2.2]];
const LAMPS = [[BLK - 0.4, M(8.7)], [BLK - 0.4, M(13.9)], [BLK - 0.4, M(17.2)], [M(9.6), BLK - 0.4], [M(13.6), BLK - 0.4]];

/* ---------- the wider city + harbor ---------- */
const QUAY = BLK + 3.2; // land ends here on the two front sides; past it is the harbor
const QLAMPS = [[QUAY - 0.7, 4], [QUAY - 0.7, 11], [QUAY - 0.7, 18], [4, QUAY - 0.7], [11, QUAY - 0.7], [18, QUAY - 0.7]];
// things a cat cannot walk through: the structures on the plaza and the buildings on the back edges
const OBST = [
  { x: CRATES.x, y: CRATES.y, w: CRATES.w, d: CRATES.d },      // diner counter
  { x: TRAYS.x, y: TRAYS.y, w: TRAYS.w, d: TRAYS.d },          // scrapyard strip
  { x: 5.0, y: CASINO.y - 0.85, w: CASINO.x - 0.5 - 5.0, d: EXC.y + 0.85 - (CASINO.y - 0.85) }, // the slot machines, the trading desks and the wall behind them, one block
  { x: CASINO.x - 0.5, y: TABLE.y - 0.6, w: TABLE.x - 0.1 - (CASINO.x - 0.5), d: 1.2 },           // the dealer's side of the card table
  { x: LAB.x - LAB.w / 2, y: 5.0, w: LAB.w, d: LAB.y + LAB.d / 2 - 5.0 }, // lab, and the slot between it and the buildings behind
  { x: 5.0, y: FRIDGE.y - 0.9, w: FRIDGE.x - 5.0, d: 1.8 },                 // the slots between the fridge and the buildings behind it
  { x: FRIDGE.x - 0.9, y: 5.0, w: 1.8, d: FRIDGE.y - 5.0 },
  { x: BAZ.x - 0.2, y: 5.0, w: BAZ.w + 0.4, d: BAZ.y - 5.0 },                 // and behind the shop
  ...BINS.map(([bx, by]) => ({ x: bx - 0.22, y: by - 0.22, w: 0.44, d: 0.44 })),
  { x: VAULT.x - 0.45, y: VAULT.y - 0.45, w: 0.9, d: 0.9 },    // treasury
  { x: DOCK.x - 0.6, y: DOCK.y - 0.5, w: 1.2, d: 1.0, dock: true }, // the charging pad: the bots' own, cats go round
  { x: LOFT.x - 0.12, y: 5.0, w: LOFT.w + 0.24, d: LOFT.y + 0.06 - 5.0 }, // the bunks' back wall, and the slot behind it
  { x: LOFT.x - 0.12, y: LOFT.y, w: 0.14, d: LOFT.d + 0.06 },             // the bunks' side wall: in by the open front only
  { x: BAZ.x - 0.1, y: BAZ.y - 0.1, w: BAZ.w + 0.2, d: BAZ.d + 0.2 }, // the shop stalls
  { x: VENT.x - 0.6, y: VENT.y - 0.05, w: 0.5, d: 0.95 },      // heater unit
  ...BUILD.map(b => ({ x: b.x, y: b.y, w: b.w, d: b.d })),
  { x: 1.6, y: 1.6, w: 3.4, d: BLK - 1.6 }, { x: 1.6, y: 1.6, w: BLK - 1.6, d: 3.4 }, // the two back edges as solid walls, so nothing wedges into the slots between buildings
];
const OBC = [[CRY.x, CRY.y, 0.55], [FRIDGE.x, FRIDGE.y, FRIDGE.r + 0.35], [TABLE.x, TABLE.y, TABLE.r + 0.05], [CRY.x, CRY.y, 2.15, 'circle']]; // round ones: the beacon, the fridge with its plinth, and the whole circle (only a cat with a seat in it may enter)
let steerSelf = null; // who is being steered right now, so the circle can let its own cats through
// repulsion away from anything within m of (px, py); [fx, fy, strength]
function pushOut(px, py, m) {
  let fx = 0, fy = 0, best = 0, who = -1;
  for (let i = 0; i < OBST.length; i++) { const o = OBST[i];
    if (o.dock && steerSelf && steerSelf.bot) continue; // the pad is the bots' to roll onto
    const nx = clamp(px, o.x, o.x + o.w), ny = clamp(py, o.y, o.y + o.d); let dx = px - nx, dy = py - ny, dd = Math.hypot(dx, dy);
    if (dd === 0) { // inside: leave by the nearest side
      const l = px - o.x, r = o.x + o.w - px, t = py - o.y, b = o.y + o.d - py, mn = Math.min(l, r, t, b);
      dx = mn === l ? -1 : mn === r ? 1 : 0; dy = mn === t ? -1 : mn === b ? 1 : 0; dd = 1; fx += dx * 2; fy += dy * 2; best = 1; who = i; continue;
    }
    if (dd < m) { const f = (m - dd) / m; fx += dx / dd * f; fy += dy / dd * f; if (f > best) { best = f; who = i; } }
  }
  for (let i = 0; i < OBC.length; i++) { const [cx, cy, r, tag] = OBC[i];
    if (tag === 'circle' && steerSelf && (steerSelf.act === 'meet' || steerSelf.chair != null)) continue;
    const dx = px - cx, dy = py - cy, dd = Math.hypot(dx, dy) || 0.001;
    if (dd < r + m) { const f = clamp((r + m - dd) / m, 0, 2); fx += dx / dd * f; fy += dy / dd * f; if (f > best) { best = f; who = 1000 + i; } }
  }
  for (const q of board.tasks) { if (q.x == null || (steerSelf && steerSelf.task === q.id)) continue; const dx = px - q.x, dy = py - q.y, dd = Math.hypot(dx, dy) || 0.001; if (dd < 0.3 + m) { const f = clamp((0.3 + m - dd) / m, 0, 2); fx += dx / dd * f; fy += dy / dd * f; if (f > best) { best = f; who = 3000; } } } // nothing walks through what is lying on the floor, except the cat going for it
  if (steerSelf && steerSelf.bot) { // the sweeper bots also keep out of every place the cats use: the yard, the arena, the stools, the consoles, the queues
    if (!placeSpots) nearPlace(0, 0);
    for (let i = 0; i < placeSpots.length; i++) { const [cx, cy, r] = placeSpots[i]; const dx = px - cx, dy = py - cy, dd = Math.hypot(dx, dy) || 0.001;
      if (dd < r + m) { const f = clamp((r + m - dd) / m, 0, 2); fx += dx / dd * f; fy += dy / dd * f; if (f > best) { best = f; who = 2000 + i; } } }
  }
  return [fx, fy, best, who]; // who: which structure is doing most of the pushing
}
// which way round a structure: try both ways for a few seconds in the head (the same sliding rule, no other cats) and keep the
// one that gets nearer the target. The side the target is on is the default, so a tie goes that way. Chosen once per structure per trip.
function slideScore(x, y, tx, ty, s) {
  let best = Math.hypot(tx - x, ty - y), px = x, py = y;
  for (let k = 0; k < 32; k++) {
    const dx = tx - px, dy = ty - py, d = Math.hypot(dx, dy); if (d < 0.3) return 0;
    let vx = dx / d, vy = dy / d;
    const [fx, fy, f] = pushOut(px + vx * 0.35, py + vy * 0.35, 0.4);
    if (f > 0) { const fl = Math.hypot(fx, fy) || 1, nx = fx / fl, ny = fy / fl; vx = -ny * s + nx * 0.6 * Math.min(1, f) + dx / d * 0.45; vy = nx * s + ny * 0.6 * Math.min(1, f) + dy / d * 0.45; const vl = Math.hypot(vx, vy) || 1; vx /= vl; vy /= vl; }
    px += vx * 0.3; py += vy * 0.3;
    if (d < best) best = d;
  }
  return Math.min(best, Math.hypot(tx - px, ty - py));
}
function pickSlide(x, y, txn, tyn, gx, gy, tx, ty) {
  const pref = txn * gx + tyn * gy < 0 ? -1 : 1;
  const a = slideScore(x, y, tx, ty, pref), b = slideScore(x, y, tx, ty, -pref);
  return b < a - 0.5 ? -pref : pref;
}
// one step of walking from (x, y) toward (tx, ty): steers around structures and keeps off other cats. Returns [nx, ny, vx, vy].
// `self` is the cat (or its ghost on the site): it remembers which way round an obstacle it is sliding so it never dithers at a corner.
function steerStep(x, y, tx, ty, sp, dt, self) { steerSelf = self; try { return steerStep0(x, y, tx, ty, sp, dt, self); } finally { steerSelf = null; } }
function steerStep0(x, y, tx, ty, sp, dt, self) {
  const dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy); if (d < 1e-6) return [x, y, 0, 0];
  if (self.sTx !== tx || self.sTy !== ty) { self.slide = 0; self.sTx = tx; self.sTy = ty; } // a new destination: choose the way round afresh
  { const [ix, iy, ins] = pushOut(x, y, 0.001); if (ins >= 1 && (ix || iy)) { const l = Math.hypot(ix, iy); return [x + ix / l * sp * dt, y + iy / l * sp * dt, ix / l, iy / l]; } } // somehow inside a structure: walk straight out
  let vx = dx / d, vy = dy / d;
  const near = pushOut(tx, ty, 0.6)[2] > 0 ? 1.3 : 0.45; // a spot right next to a structure (a stool, a console): stop steering once close, just walk in
  if (d > near) {
    const [fx, fy, f, who] = pushOut(x + vx * 0.35, y + vy * 0.35, 0.4);
    if (f > 0) {
      // blocked: slide along the structure (one side, chosen once per structure per trip) with a little outward push, instead of
      // fighting the pull of the target. Mixing the two is how a cat ends up pacing on the spot behind a counter; keeping the
      // side chosen at one structure for the next one is how it ends up going the long way round the lab into the back pocket.
      const fl = Math.hypot(fx, fy) || 1, nx = fx / fl, ny = fy / fl, txn = -ny, tyn = nx;
      if (!self.slide || self.slideOn !== who) { self.slide = pickSlide(x, y, txn, tyn, vx, vy, tx, ty); self.slideOn = who; }
      const gx = dx / d, gy = dy / d;
      vx = txn * self.slide + nx * 0.6 * Math.min(1, f) + gx * 0.45; vy = tyn * self.slide + ny * 0.6 * Math.min(1, f) + gy * 0.45;
    }
  }
  for (const o of cats) { if (o.id === self.id) continue; const ox = x - o.x, oy = y - o.y, od = Math.hypot(ox, oy); if (od > 0.001 && od < 0.42) { const f = (0.42 - od) / 0.42; vx += ox / od * f * 0.8; vy += oy / od * f * 0.8; } }
  for (const o of bots) { if (o.id === self.id) continue; const ox = x - o.x, oy = y - o.y, od = Math.hypot(ox, oy); if (od > 0.001 && od < 0.42) { const f = (0.42 - od) / 0.42; vx += ox / od * f * 0.8; vy += oy / od * f * 0.8; } } // and off the sweeper bots
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
  // the outer city's sign panels came down with the coin boards; the roof lights stay
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
  { key: 'flower',  name: 'a flower',       price: 0.00015 },
  { key: 'party',   name: 'a party hat',    price: 0.00017 },
  { key: 'monocle', name: 'a monocle',      price: 0.00022 },
  { key: 'goggles', name: 'goggles',        price: 0.00024 },
  { key: 'cowboy',  name: 'a cowboy hat',   price: 0.00028 },
  { key: 'cape',    name: 'a red cape',     price: 0.0004 },
  { key: 'visor',   name: 'a cyber visor',  price: 0.00045 },
  { key: 'bell',    name: 'a bell collar',  price: 0.00014 },
  { key: 'glasses', name: 'round glasses',  price: 0.0002 },
  { key: 'bucket',  name: 'a bucket hat',   price: 0.00021 },
  { key: 'tie',     name: 'a necktie',      price: 0.00023 },
  { key: 'phones',  name: 'headphones',     price: 0.00032 },
  { key: 'crown',   name: 'a tiny crown',   price: 0.0006 },
  { key: 'wings',   name: 'little wings',   price: 0.0007 },
  { key: 'halo',    name: 'a halo',         price: 0.0008 },
];
// everything a cat has bought stays on: one thing per slot (the newest of each), so a look builds up instead of being swapped away
const SLOT = { collar: 'neck', bow: 'neck', bandana: 'neck', scarf: 'neck', chain: 'neck', bell: 'neck', tie: 'neck', beanie: 'head', tophat: 'head', crown: 'head', halo: 'head', party: 'head', cowboy: 'head', bucket: 'head', flower: 'head', phones: 'head', shades: 'face', monocle: 'face', goggles: 'face', visor: 'face', glasses: 'face', cape: 'back', wings: 'back' };
function wornBy(c) { const by = {}; for (const k of c.items || []) if (SLOT[k]) by[SLOT[k]] = k; if (c.wearing && !(c.items || []).includes(c.wearing) && SLOT[c.wearing]) by[SLOT[c.wearing]] = c.wearing; return ['back', 'neck', 'head', 'face'].map(s => by[s]).filter(Boolean); }
// ---- work on the ground: things turn up around the block and want doing. First cat there gets it. Mostly quantum, some chores.
// carry: the cat picks the thing up and takes it somewhere; otherwise it stays on the spot and deals with it.
const TASK_KINDS = {
  trash:   { tier: 1, q: false, title: 'a bag of trash',                 carry: 'bin',    dur: 3,  w: 3,   spawn: () => floorSpot() },
  litter:  { tier: 1, q: false, title: 'litter',                         carry: 'bin',    dur: 3,  w: 2,   spawn: () => floorSpot() },
  cans:    { tier: 1, q: false, title: 'empty cans',                     carry: 'bin',    dur: 3,  w: 2,   spawn: () => floorSpot() },
  pizza:   { tier: 1, q: false, title: 'a dropped pizza box',            carry: 'bin',    dur: 3,  w: 1.5, spawn: () => floorSpot() },
  crate:   { tier: 1, q: false, title: 'a dropped crate',                carry: 'trays',  dur: 3,  w: 2,   spawn: () => floorSpot() },
  box:     { tier: 1, q: false, title: 'a cardboard box to flatten',     carry: 'trays',  dur: 3,  w: 1.5, spawn: () => floorSpot() },
  spill:   { tier: 1, q: false, title: 'a spill to mop up',              carry: null,     dur: 45, w: 2,   spawn: () => floorSpot() },
  leaves:  { tier: 1, q: false, title: 'leaves to sweep',                carry: null,     dur: 40, w: 2,   spawn: () => floorSpot() },
  plant:   { tier: 1, q: false, title: 'a knocked-over plant pot',       carry: null,     dur: 30, w: 1.5, spawn: () => floorSpot() },
  scooter: { tier: 1, q: false, title: 'a fallen scooter to stand up',   carry: null,     dur: 25, w: 1.5, spawn: () => floorSpot() },
  parcel:  { tier: 2, q: false, title: 'a parcel for the shop',          carry: 'bazaar', dur: 3,  w: 1,   spawn: () => floorSpot() },
  cable:   { tier: 2, q: true,  title: 'a loose cable',                  carry: null,     dur: 50, w: 1.5, spawn: () => floorSpot() },
  sensor:  { tier: 2, q: true,  title: 'a sensor pod to recalibrate',    carry: null,     dur: 60, w: 2,   spawn: () => floorSpot() },
  drone:   { tier: 2, q: true,  title: 'a crashed drone to reboot',      carry: null,     dur: 55, w: 1.5, spawn: () => floorSpot() },
  battery: { tier: 2, q: true,  title: 'a dead battery pack to swap',    carry: null,     dur: 50, w: 1.2, spawn: () => floorSpot() },
  readout: { tier: 3, q: true,  title: 'a readout to check',             carry: null,     dur: 70, w: 1,   spawn: () => floorSpot() },
  coolant: { tier: 3, q: true,  title: 'a coolant can for the fridge',   carry: 'fridge', dur: 3,  w: 0.7, spawn: () => floorSpot() },
  sample:  { tier: 3, q: true,  title: 'a sample case for the fridge',   carry: 'fridge', dur: 3,  w: 0.7, spawn: () => floorSpot() },
};
const DEST = {
  bin:    (x, y) => { const b = BINS.slice().sort((p, q) => Math.hypot(p[0] - x, p[1] - y) - Math.hypot(q[0] - x, q[1] - y))[0]; return b[0] > b[1] ? [b[0] - 0.55, b[1]] : [b[0], b[1] - 0.55]; },
  trays:  () => ST.trays.spot(),
  bazaar: () => [BAZ_SPOTS[1][0], BAZ_SPOTS[1][1]],
  fridge: () => [FRIDGE.x + Math.cos(0.5) * 1.5, FRIDGE.y + Math.sin(0.5) * 1.5], // the plaza side of the fridge
};
// everywhere a cat stands or sits to do something. Nothing gets left lying on any of these, so a task never blocks a place.
let placeSpots = null;
function nearPlace(x, y) {
  if (!placeSpots) placeSpots = [
    ...MEET_ORDER.map(i => [...chairAt(i), 0.7]), ...LAB_CONSOLES.map(q => [q[0], q[1], 0.8]), ...DINER_STOOLS.map(q => [q[0], q[1], 0.8]), [CRATES.x + 0.8, CRATES.y + 1.95, 1.1],
    ...BAZ_SPOTS.map(q => [q[0], q[1], 0.8]), ...BINS.map(b => { const d = DEST.bin(b[0], b[1]); return [d[0], d[1], 0.7]; }),
    [ARENA.x, ARENA.y, ARENA.r + 0.6], ...EXC_SPOTS.map(q => [q[0], q[1], 0.8]), ...CASINO_SPOTS.map(q => [q[0], q[1], 0.8]), [VENT.x + 0.83, VENT.y + 0.65, 1.1], [TRAYS.x - 0.9, TRAYS.y + 1.7, 1.7], [LOFT.x + 1.05, LOFT.y + 0.65, 1.4],
    [YARD.x + YARD.w / 2, YARD.y + YARD.d / 2, 1.9], [FRIDGE.x + 0.9, FRIDGE.y + 1.1, 1.4], [VAULT.x, VAULT.y, 1.0],
    [CRY.x - 3.6, CRY.y - 3.6, 1.4], // the bit of floor the countdown over the beacon hangs in front of on screen, so nothing hides behind the clock
    [DOCK.x, DOCK.y, 1.1],
  ];
  for (const [px, py, r] of placeSpots) if (Math.hypot(x - px, y - py) < r) return true;
  return false;
}
function floorSpot() { return wanderSpot(); }
const DEST_LABEL = { bin: 'the bin', trays: 'the scrapyard', bazaar: 'the shop', fridge: 'the fridge' };
const board = { tasks: [], done: [], seq: 0, next: 0, badge: null, badgeCool: 0 }; // badge: the one thing a viewer can flag right now
const FLAG_COOL = 600, FLAG_AFTER = 300, BOARD_MAX = 3; // the badge shows once something has lain untouched for five minutes; a flag hides it for ten; never more than three things out at once
// deliveries: a drone comes in high over the harbour side, drops down over a clear bit of the ring, leaves the thing and climbs out again
const deliveries = []; let deliverySeq = 0;
function skyPoint() { return Math.random() < 0.5 ? [BLK + rand(2.5, 5), rand(5, BLK)] : [rand(5, BLK), BLK + rand(2.5, 5)]; }
function sendDrone(kind) {
  if (board.tasks.length + deliveries.filter(d => d.state !== 'out').length >= BOARD_MAX) return null; // three things out is the limit, counting what is on its way
  const spot = floorSpot(), from = skyPoint();
  const d = { id: 'D' + (++deliverySeq), kind, x: from[0], y: from[1], z: 5.5, tx: spot[0], ty: spot[1], state: 'in', t0: T, ph: Math.random() * 6 };
  deliveries.push(d); return d;
}
function stepDeliveries(dt) {
  for (let i = deliveries.length - 1; i >= 0; i--) {
    const d = deliveries[i];
    if (d.state === 'in') {
      const dx = d.tx - d.x, dy = d.ty - d.y, dist = Math.hypot(dx, dy);
      if (dist > 0.03) { const mv = Math.min(dist, 1.7 * dt); d.x += dx / dist * mv; d.y += dy / dist * mv; }
      const tz = dist < 3 ? 0.9 + (dist / 3) * 4.6 : 5.5; d.z += (tz - d.z) * Math.min(1, dt * 2.2);
      if (dist <= 0.03 && d.z < 1.15) { d.state = 'drop'; d.dropT = T + 1.2; }
    } else if (d.state === 'drop') {
      if (T >= d.dropT) {
        const t = postTask({ kind: d.kind, at: [d.x, d.y] }, 'a delivery drone'); if (t) t.drone = d.id;
        d.state = 'out'; const to = skyPoint(); d.tx = to[0]; d.ty = to[1];
      }
    } else {
      const dx = d.tx - d.x, dy = d.ty - d.y, dist = Math.hypot(dx, dy); d.z += (6 - d.z) * Math.min(1, dt * 1.2);
      if (dist > 0.01) { const mv = Math.min(dist, 1.9 * dt); d.x += dx / dist * mv; d.y += dy / dist * mv; }
      if (dist < 0.1 || T - d.t0 > 150) deliveries.splice(i, 1);
    }
  }
}
// sweeper bots: two squat tracked bots that trundle round the ring sweeping, with the odd trip back to the dock to charge
const bots = []; let botSeq = 0;
function makeBot(i) { return { id: 'B' + (++botSeq), bot: true, bay: i, x: DOCK_SLOTS[i][0], y: DOCK_SLOTS[i][1], tx: DOCK_SLOTS[i][0], ty: DOCK_SLOTS[i][1], state: 'docked', born: T, leaveAt: T + rand(20, 90) + i * 60, face: i ? -1 : 1, slide: 0, pauseT: 0, ph: Math.random() * 6, brush: 0 }; }
function stepBots(dt) {
  while (bots.length < 2) bots.push(makeBot(bots.length));
  for (const b of bots) {
    if (b.state === 'docked') { if (T > b.leaveAt) { const sp = wanderSpot(); b.state = 'roam'; b.tx = sp[0]; b.ty = sp[1]; b.slide = 0; b.leaveAt = T + rand(600, 1200); } continue; }
    if (b.state === 'roam' && T > b.leaveAt) { b.state = 'home'; b.tx = DOCK_SLOTS[b.bay][0]; b.ty = DOCK_SLOTS[b.bay][1]; b.slide = 0; b.pauseT = 0; }
    if (b.pauseT > 0) { b.pauseT -= dt; b.brush += dt * 7; continue; }
    const dist = Math.hypot(b.tx - b.x, b.ty - b.y);
    if (dist < 0.08) { if (b.state === 'home') { b.state = 'docked'; b.x = b.tx; b.y = b.ty; b.face = b.bay ? -1 : 1; b.leaveAt = T + rand(120, 240); continue; } const sp = wanderSpot(); b.tx = sp[0]; b.ty = sp[1]; b.pauseT = rand(2, 6); b.slide = 0; continue; }
    const [nx, ny, vx, vy] = steerStep(b.x, b.y, b.tx, b.ty, 0.5, dt, b); const sdx = vx - vy; if (Math.abs(sdx) > 0.05) b.face = sdx > 0 ? 1 : -1; b.x = nx; b.y = ny; b.brush += dt * 10;
    if (!b.stuckP || T - b.stuckP[2] > 3) { // wedged: turn round, then give the trip up
      if (b.stuckP && Math.hypot(b.x - b.stuckP[0], b.y - b.stuckP[1]) < 0.3) { b.slide = -(b.slide || 1); b.stuckN = (b.stuckN || 0) + 1; } else b.stuckN = 0;
      b.stuckP = [b.x, b.y, T];
      if (b.stuckN >= 3) { b.stuckN = 0; if (b.state === 'home') { b.state = 'docked'; b.x = b.tx; b.y = b.ty; b.leaveAt = T + rand(120, 240); } else { b.state = 'home'; b.tx = DOCK_SLOTS[b.bay][0]; b.ty = DOCK_SLOTS[b.bay][1]; b.slide = 0; } }
    }
  }
}
// nobody walks into anybody: after everyone has moved, any two bodies closer than a cat's width are eased apart. A body that
// is planted (asleep, on a seat, in the circle, a bot on its bay) stays put and the other one gives way; two planted ones are
// left alone. Nobody gets pushed into a structure, and a cat is never moved off the thing it is standing over.
const BODY_R = 0.38;
function separateAll(dt, kx = 'x', ky = 'y') {
  const all = cats.concat(bots), fixed = a => a.bot ? a.state === 'docked' : (asleep(a) || onSeat(a) || a.act === 'meet' || a.chair != null);
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j]; if (a[kx] == null || b[kx] == null) continue;
    const dx = a[kx] - b[kx], dy = a[ky] - b[ky], d = Math.hypot(dx, dy); if (d >= BODY_R || d < 1e-4) continue;
    const fa = fixed(a), fb = fixed(b); if (fa && fb) continue;
    const seating = o => !o.bot && o.state === 'walk' && o.tx != null && Math.hypot(o.tx - o[kx], o.ty - o[ky]) < 1.0; if ((fa && seating(b)) || (fb && seating(a))) continue; // taking the next seat along: brushing past a planted neighbour is allowed, the steering still eases round it
    const push = Math.min(BODY_R - d, 0.9 * dt), ux = dx / d, uy = dy / d, wa = fa ? 0 : fb ? 1 : 0.5, wb = 1 - wa;
    const ax = a[kx] + ux * push * wa, ay = a[ky] + uy * push * wa, bx = b[kx] - ux * push * wb, by = b[ky] - uy * push * wb;
    if (wa) { steerSelf = a; try { if (pushOut(ax, ay, 0.001)[2] < 1) { a[kx] = ax; a[ky] = ay; } } finally { steerSelf = null; } }
    if (wb) { steerSelf = b; try { if (pushOut(bx, by, 0.001)[2] < 1) { b[kx] = bx; b[ky] = by; } } finally { steerSelf = null; } }
  }
}
function callTask(id) {
  // a viewer flagged something: the cats hear about it. They still decide for themselves whether and when to go.
  const t = board.tasks.find(q => q.id === id); if (!t || t.status !== 'open' || board.badge !== id) return false;
  t.called = T; board.badge = null; board.badgeCool = T + FLAG_COOL; log(`Somebody flagged ${t.title}.`, 'info');
  const c = cats.filter(x => !asleep(x) && x.act !== 'meet' && !x.task && qualifies(x, t) && (x.state === 'pause' || (x.state === 'act' && x.act === 'idle'))).sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y))[0];
  if (c) { if (c.state === 'pause') c.pauseT = Math.min(c.pauseT, 0.4); else c.actT = c.actDur; say(c, pick(['heard that', 'on it, maybe', 'if nobody else wants it', 'let me finish this first'])); }
  return true;
}
const totalSkill = c => Object.values(c.skills || {}).reduce((a, b) => a + b, 0) + (c.tasks || 0);
const qualifies = (c, t) => t.tier === 1 || (t.tier === 2 && ((c.lvl || 1) >= 2 || totalSkill(c) >= 8)) || (t.tier === 3 && ((c.lvl || 1) >= 3 || totalSkill(c) >= 24));
const tasksFor = c => board.tasks.filter(t => t.status === 'open' && qualifies(c, t));
function postTask(def, poster) {
  if (board.tasks.length >= BOARD_MAX) return null; // three things out is the limit
  const kind = TASK_KINDS[def.kind] ? def.kind : pick(Object.keys(TASK_KINDS)), K0 = TASK_KINDS[kind];
  let at = (def && def.at && pushOut(def.at[0], def.at[1], 0.3)[2] === 0 && !nearPlace(def.at[0], def.at[1])) ? def.at : null;
  for (let i = 0; !at && i < 12; i++) { const q = K0.spawn(); if (pushOut(q[0], q[1], 0.34)[2] === 0 && !nearPlace(q[0], q[1])) at = q; } // never up against a structure or on a place
  if (!at) at = floorSpot();
  const t = { id: 'T' + String(++board.seq).padStart(3, '0'), kind, tier: K0.tier, q: K0.q, title: K0.title, x: at[0], y: at[1], carry: K0.carry, dest: K0.carry ? DEST[K0.carry](at[0], at[1]) : null, dur: K0.dur, bounty: Math.max(0, (def && def.bounty) || 0), posted: T, since: T, day: dayNo(), status: 'open', by: null, poster: poster || 'the box' };
  board.tasks.push(t);
  log(`${t.title[0].toUpperCase() + t.title.slice(1)} turned up${t.carry ? ', wants taking to ' + DEST_LABEL[t.carry] : ''} (tier ${t.tier}${t.bounty ? ', ' + fmtSol(t.bounty) + ' SOL on it' : ''}).`, 'info');
  return t;
}
function releaseTask(c) {
  if (!c || !c.task) return;
  const t = board.tasks.find(x => x.id === c.task);
  if (t && t.by === c.name && (t.status === 'taken' || t.status === 'carried')) { if (t.status === 'carried') { if (nearPlace(c.x, c.y) || pushOut(c.x, c.y, 0.34)[2] > 0) { const q = floorSpot(); t.x = q[0]; t.y = q[1]; } else { t.x = c.x; t.y = c.y; } } t.status = 'open'; t.by = null; t.since = T; } // dropped where it stood (or the nearest bit of clear floor, so it never blocks a place)
  c.task = null;
}
function stepBoard(dt) {
  if (!board.next) board.next = T + rand(20, 60);
  if (T >= board.next) {
    board.next = T + rand(120, 300);
    if (board.tasks.length + deliveries.length < BOARD_MAX) { const ks = Object.keys(TASK_KINDS), tot = ks.reduce((a, k) => a + TASK_KINDS[k].w, 0); let r = Math.random() * tot, kind = ks[0]; for (const k of ks) { r -= TASK_KINDS[k].w; if (r <= 0) { kind = k; break; } } sendDrone(kind); }
  }
  for (const t of board.tasks) if (t.status === 'open' && T - t.posted > DAY_SECS) { t.status = 'expired'; log(`Nobody dealt with ${t.title}; it is gone.`, 'info'); }
  if (board.tasks.some(t => t.status === 'expired')) board.tasks = board.tasks.filter(t => t.status !== 'expired');
  // the badge: one thing at a time, picked at random from what has lain untouched for five minutes; it stays until that thing is flagged or dealt with
  if (board.badge) { const t = board.tasks.find(q => q.id === board.badge); if (!t || t.status !== 'open') board.badge = null; }
  if (!board.badge && T >= board.badgeCool) { const ok = board.tasks.filter(q => q.status === 'open' && T - (q.since != null ? q.since : q.posted) >= FLAG_AFTER); if (ok.length) board.badge = pick(ok).id; }
}
// ---- the recap: one record per day, with the meeting and everything notable that happened ----
const days = [];
let dayCur = null;
const snapCat = c => ({ earned: c.earned, jobs: c.qjobs || 0, tasks: c.tasks || 0, sold: c.sold, bought: c.bought, spent: c.upkeep || 0, meetings: c.meetings || 0, lvl: c.lvl || 1, xp: c.xp || 0 });
function dayStart() {
  dayCur = { day: dayNo(), startT: T, fees0: stats.fees, wages0: stats.wages, upkeep0: stats.upkeep, sold0: stats.sold, bought0: stats.boughtBack, jobs0: stats.circuits, mcapStart: mcapUsd(), meeting: { held: false, at: '', lines: [] }, events: [], tasks: [], cats0: {} };
  for (const c of cats) dayCur.cats0[c.name] = snapCat(c);
}
function recapOf(d, final) {
  const perCat = {};
  for (const c of cats) { const a = d.cats0[c.name] || snapCat(c), b = snapCat(c); perCat[c.name] = { earned: b.earned - a.earned, jobs: b.jobs - a.jobs, tasks: b.tasks - a.tasks, sold: b.sold - a.sold, bought: b.bought - a.bought, spent: b.spent - a.spent, meetings: b.meetings - a.meetings, lvlFrom: a.lvl, lvlTo: b.lvl, xp: b.xp - a.xp }; }
  const names = Object.keys(perCat), by = f => names.slice().sort((p, q) => f(perCat[q]) - f(perCat[p]))[0];
  return { day: d.day, final: !!final, fees: stats.fees - d.fees0, wages: stats.wages - d.wages0, upkeep: stats.upkeep - d.upkeep0, sold: stats.sold - d.sold0, bought: stats.boughtBack - d.bought0, jobs: stats.circuits - d.jobs0, tasks: d.tasks.length, mcapStart: d.mcapStart, mcapEnd: mcapUsd(), treasuryEnd: stats.treasury, meeting: d.meeting, events: d.events.slice(-80), tasksDone: d.tasks.slice(-60), cats: perCat, topWorker: names.length ? by(x => x.jobs + x.tasks) : null, topEarner: names.length ? by(x => x.earned) : null };
}
function dayEnd() {
  if (!dayCur) return; const r = recapOf(dayCur, true); days.unshift(r); if (days.length > 14) days.pop();
  log(`Day ${dayCur.day} is over. Recap: ${fmtSol(r.fees)} SOL of fees in, ${fmtSol(r.wages)} SOL paid out, ${r.jobs} job${r.jobs === 1 ? '' : 's'} run, ${r.tasks} thing${r.tasks === 1 ? '' : 's'} dealt with${r.topWorker ? ', ' + r.topWorker + ' worked hardest' : ''}${r.topEarner ? ', ' + r.topEarner + ' earned most' : ''}. The full recap is on the Recap page.`, 'link');
  if (dayEndHook) { try { dayEndHook(r, meetingContext()); } catch (_) {} }
  else setLesson(pick([
    `day ${r.day}: ${fmtSol(r.fees)} SOL of fees in, ${fmtSol(r.wages)} SOL paid out, ${r.jobs} job${r.jobs === 1 ? '' : 's'} run, ${r.tasks} thing${r.tasks === 1 ? '' : 's'} dealt with${r.topEarner ? ', ' + r.topEarner + ' earned most' : ''}`,
    `day ${r.day}: ${r.events.filter(e => e.kind === 'faint').length} faint${r.events.filter(e => e.kind === 'faint').length === 1 ? '' : 's'}, ${r.events.filter(e => e.kind === 'decohere').length} decoherence${r.events.filter(e => e.kind === 'decohere').length === 1 ? '' : 's'}${r.events.some(e => e.kind === 'theft') ? ', somebody robbed the bunks' : ''}${r.topWorker ? ', ' + r.topWorker + ' worked hardest' : ''}`,
  ]));
  dayStart();
}
function stepDay() { if (!dayCur) dayStart(); else if (dayNo() !== dayCur.day) dayEnd(); }
function recordEvent(kind, text) { if (!dayCur) dayStart(); dayCur.events.push({ t: clock(simMin), kind, text }); if (dayCur.events.length > 160) dayCur.events.shift(); }
const itemsFor = c => ITEMS.filter(it => !(c.items || []).includes(it.key) && spare(c) >= costOf(it.price, c) * 1.3);
const ACTS = {
  eat:      { st: 'crates',   dur: 50,   verb: 'eating at the diner',          walk: 'heading to the diner',          color: '247,200,106', name: 'eat' },
  hunt:     { st: 'trays',    dur: 60,   verb: 'hunting in the scrapyard',    walk: 'creeping toward the scrapyard', color: '255,138,92', name: 'hunt' },
  work:     {                 dur: 100,                                                                                     color: '92,242,255', name: 'work' },
  recohere: { st: 'plaza',    dur: 75,   verb: 'recohering out in the open',  walk: 'drifting out into the open',    color: '154,123,255', name: 'recohere' },
  warm:     { st: 'vent',     dur: 60,   verb: 'warming up at the heater',        walk: 'heading for the heater',            color: '255,138,92', name: 'warm up' },
  sell:     { st: 'exchange', dur: 45,  verb: 'selling at the exchange',       walk: 'heading to the exchange',         color: '255,120,120', name: 'sell' },
  buy:      { st: 'exchange', dur: 45, verb: 'buying at the exchange',        walk: 'heading to the exchange',         color: '92,255,170', name: 'buy' },
  steal:    { st: 'loft',     dur: 55,   verb: 'sneaking around the bunks',      walk: 'creeping toward the bunks',        color: '255,79,174', name: 'steal' },
  wager:    { st: 'arena',    dur: 90,                                                                                   color: '255,200,80', name: 'wager' },
  gamble:   { st: 'casino',   dur: 45,   verb: 'spinning the reels at the casino', walk: 'heading to the casino',           color: '255,79,174', name: 'gamble' },
  scrap:    {                 dur: 40,                                                                                   color: '255,79,174', name: 'scrap' },
  entangle: {                 dur: 80,                                                                                     color: '154,123,255', name: 'entangle' },
  idle:     { st: 'plaza',    dur: 70,   verb: 'loafing on the plaza',            walk: 'wandering off',                        color: '140,151,194', name: 'rest' },
  shop:     { st: 'bazaar',   dur: 40,   verb: 'browsing the shop',               walk: 'heading to the shop',                  color: '255,200,80', name: 'shop' },
  task:     {                 dur: 80,   verb: 'dealing with something',          walk: 'off to deal with something',           color: '92,242,255', name: 'task' },
  play:     { st: 'yard',     dur: 60,   verb: 'chasing the laser in the yard',  walk: 'heading to the yard',              color: '120,200,255', name: 'run a circuit' },
  meet:     { st: 'cryo',     dur: 120,  verb: 'at the meeting',                walk: 'heading to the meeting at the circle', color: '247,200,106', name: 'meeting' },
  sleep:    { st: 'loft',     dur: 120,  verb: 'asleep in the bunks',            walk: 'heading to the bunks to sleep',    color: '110,120,170', name: 'sleep' },
};
// what two entangled cats say to each other (alternating lines; {p} = the other cat)
// what two cats talk about when they entangle: whatever is going on with them, or one of the old standbys
function chatFor(c, p) {
  const d0 = dayCur ? dayCur.cats0 : {}, jobs = x => (x.qjobs || 0) - ((d0[x.name] || {}).jobs || 0);
  const pool = [];
  if (c.hunger > 0.6 || p.hunger > 0.6) pool.push([`you look hungry`, `a meal is ${fmtSol(costOf(FOOD, p))} SOL now`, `sell a little`, `never`]);
  if (jobs(c) + jobs(p) > 0) pool.push([`how many today`, `${jobs(p)}. you?`, `${jobs(c)}. the readout was blurry by the end`, `recohere first next time`]);
  if ((c.casinoL || 0) + (p.casinoL || 0) > 0) pool.push([`you went to the casino again`, `${p.casinoL || c.casinoL} spins. I know.`, `the house is the treasury. you are paying yourself.`, `that is not how it feels`]);
  if (c.grudgeOn === p.id || p.grudgeOn === c.id) pool.push([`we good?`, `no`, `${c.grudgeOn === p.id ? c.grudgeWhy : p.grudgeWhy}`, `that was ages ago`]);
  if (c.memory && c.memory.length) pool.push([`you know what I keep thinking about`, `what`, `how I ${c.memory[0].text}`, `let it go, ${c.name}`]);
  if (p.memory && p.memory.length) pool.push([`you alright?`, `I ${p.memory[0].text}. so no.`, `it happens to everyone`, `not to you it does not`]);
  if (board.tasks.length) pool.push([`${board.tasks[0].title} is still out there`, `I saw it`, `and?`, `and I walked round it`]);
  if (wx.rain > 0.3 || wx.snow > 0.3) pool.push([wx.snow > wx.rain ? `snow again` : `rain again`, `the heater will be full`, `the lab is dry`, `the lab costs coherence`]);
  if (c.wearing || p.wearing) { const w = c.wearing ? c : p, o = w === c ? p : c, it = (ITEMS.find(x => x.key === w.wearing) || {}).name; pool.push(w === c ? [`new ${it}. like it?`, `it is a lot`, `it is an investment`, `in what`] : [`that ${it}`, `what about it`, `nothing. it is a lot.`, `it is an investment`]); }
  if (stats.treasury > 0) pool.push([`treasury is ${fmtSol(stats.treasury)} SOL`, `and we get paid when`, `when they press the button`, `then run jobs so your share is bigger`]);
  if (lessons.length) pool.push([`remember what we said about ${lessons[0].text.split(':')[0]}`, `vaguely`, `${lessons[0].text}`, `right. that.`]);
  return pool.length && Math.random() < 0.8 ? pick(pool) : pick(CHATS);
}
const CHATS = [
  ['you feel that', 'the fridge just cycled. I always feel it first', 'the box pays either way', 'does it though'],
  ['{p}. you look terrible', 'two jobs and a storm', 'eat something', 'the diner costs more every night'],
  ['the fridge is loud tonight', 'it is always loud', 'that is the chip thinking', 'sure'],
  ['who robbed Nori', 'not me', 'you say that every time', 'and every time it is true'],
  ['the lab pays double in lightning', 'it also electrocutes you', 'worth it', 'you have never been hit'],
  ['I am up three jobs on you', 'today', 'today counts', 'tomorrow counts too'],
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
    log(`${c.name} hit level ${nl}: ${lvlTitle(c)}. Survival costs it ${4 * (nl - 1)}% less now.`, 'gain'); recordEvent('level', `${c.name} hit level ${nl}: ${lvlTitle(c)}`); remember(c, `made level ${nl}, ${lvlTitle(c)}`);
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
  { act: 'wager',    label: 'feeling lucky',            w: c => (0.06 + 0.26 * c.tr.gamble) * (c.qcat > 5000 ? 1 : 0.1) * (mkt.mom > 0.001 ? 1.25 : 1) * (T - (c.wagerT || -1e9) > 900 ? 1 : 0.25) },
  { act: 'gamble',   label: 'feeling lucky',            w: c => (0.2 + 0.4 * c.tr.gamble) * (c.sol > costOf(FOOD, c) * 4 ? 1 : 0) * (T - (c.casinoT || -1e9) > 1200 ? 1 : 0.08) }, // only a cat with a few meals in hand; a degen feels it most
  { act: 'entangle', label: 'wants company',            w: c => c.lonely * 0.85 * c.tr.social },
  { act: 'idle',     label: () => (wx.rain + wx.snow > 0.3 ? 'caught in the weather' : 'nothing urgent'), w: () => 0.2 + wx.rain * 0.4 + wx.snow * 0.35 },
  { act: 'sleep',    label: 'tired',                    w: c => Math.pow(c.tired, 2.2) * 1.1 },
  { act: 'play',     label: 'wants to play',            w: c => (0.42 + c.lonely * 0.4) * c.tr.social * (c.sol > costOf(PLAY, c) * 3 ? 1 : 0.05) * (T - (c.playT || -1e9) > 900 ? 1 : 0.25) },
  { act: 'task',     label: c => (tasksFor(c).some(t => t.called != null && T - t.called < 180) ? 'somebody flagged something' : 'something wants doing'), w: c => { const ts = tasksFor(c); return ts.length ? (c.coh < 0.4 ? 0.2 : 1) * (0.42 + 0.12 * Math.max(...ts.map(t => t.tier))) * c.ethic * (ts.some(t => t.called != null && T - t.called < 180) ? 1.8 : 1) : 0; } },
  { act: 'shop',     label: 'feeling flush',            w: c => itemsFor(c).length ? (0.3 + 0.25 * (c.vanity || 1)) * (1 - (c.items || []).length / ITEMS.length) * (T - (c.shopT || -1e9) > 2400 ? 1 : 0.08) : 0 },
];
const TH = {
  eat: ['the diner smells like sardines', 'food first, then the lab', 'could eat a whole fish'],
  hunt: ['something is moving in the cables', 'broke and hungry is a bad mix', 'somebody dropped tokens in the scrapyard'],
  recohere: ['half of me is somewhere else', 'everything feels blurry', 'the beacon hums like a purr'],
  warm: ['the heater is the only warm thing out here', 'paws are freezing', 'one more cold night'],
  work: ['the lab pays tonight', 'a job now, buy later', 'every circuit is a few more lamports', 'the fee pool looks fat'],
  buy: ['adding to the stack', 'fees in, buys out', 'size in', 'spare SOL is for the bag'],
  sell: ['taking some off', 'paper paws tonight', 'need the sol', 'a slice for dinner'],
  steal: ['{p} sleeps heavy', 'nobody will miss a few thousand', 'light paws, quiet steps'],
  wager: ['{p} wants to bet? fine.', 'double or nothing', 'the arena pays better than the lab', 'feeling lucky tonight'],
  gamble: ['three sevens tonight', 'the house can have a little', 'one spin. two spins.', 'the reels owe me'],
  scrap: ['{p} has it coming', 'not letting {p} get away with it', '{p} is on my side of the block'],
  entangle: ['too quiet on this side', '{p} gets it', 'better in pairs'],
  idle: ['a box is a box', 'watching the circle count down', 'not now'],
  play: ['the dot. the dot.', 'yarn time', 'five minutes in the yard'],
  task: ['first one there', 'tier three. finally.', 'somebody has to do it', 'bounty is bounty', 'somebody flagged it. fine.'],
  shop: ['something shiny', 'new stock at the shop', 'spare SOL, spare neck'],
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
  cryo:     { title: 'The circle',      kind: 'where the box meets',     pt: [CRY.x, CRY.y], stats: ['here', 'spent', 'visits'],     desc: 'The painted circle in the middle of the box, with the countdown above it. It hits zero in the last ten minutes of every day: every cat that is awake comes in, sits down and talks through the day: the treasury, the lab, the chores, who did what. The day\u2019s recap is written the moment it ends. Nobody walks through the circle the rest of the time.' },
  crates:   { title: 'The diner',       kind: 'food',                      pt: [CRATES.x + 0.8, CRATES.y + 1.2], stats: ['spent', 'here', 'visits'],   desc: 'Sardines, mostly. A meal costs ' + fmtSol(FOOD) + ' SOL at launch and gets dearer as the chart climbs. Most grudges on the block start here.' },
  vent:     { title: 'The heater',      kind: 'warmth',                    pt: [VENT.x + 0.7, VENT.y + 0.5], stats: ['spent', 'here', 'visits'],   desc: 'The only warm spot on the block. A warm-up costs ' + fmtSol(WARM) + ' SOL. It gets crowded when the weather turns.' },
  trays:    { title: 'The scrapyard',   kind: 'lost and found',            pt: [TRAYS.x - 0.7, TRAYS.y + 1.6], stats: ['here', 'found', 'visits'],   desc: 'Where broke cats hunt for food, and where every dropped token on the block ends up. Whatever a decohered or lost cat scatters lands here, and whoever digs it out keeps it.' },
  exchange: { title: 'The exchange',    kind: 'where cats buy back',       pt: [EXC.x + 0.5, EXC.y],  stats: ['here', 'bought', 'buysol'],  desc: 'Two trading desks against the wall, each with a screen. Any cat with SOL to spare sits down and buys ' + TK + '. Cats never sell here, there is no sell button. Every buy goes straight to the chart.' },
  casino:   { title: 'The casino',      kind: 'where cats gamble · the house is the treasury', pt: [CASINO.x + 0.5, CASINO.y], stats: ['here', 'wagered', 'spent'], desc: 'Three slot machines against the wall and a card table with a bot dealer. A cat with SOL to spare puts a slice of it on a spin or a hand against the house: a win pays double out of the treasury, now and then four times, and a loss goes to the treasury. The odds favour the house, a little.' },
  arena:    { title: 'The arena',       kind: 'where cats wager · entry fee',          pt: [ARENA.x, ARENA.y],  stats: ['spent', 'here', 'wagered'], desc: 'A ring painted on the pavement. Entry costs a little SOL, paid to the treasury. Two cats put up a stake of ' + TK + ', the box flips a quantum coin weighted by their coherence, and the winner takes the pot. Every wager is a transfer between the two wallets.' },
  loft:     { title: 'The bunks',       kind: 'where cats sleep · rent per night',          pt: [LOFT.x + 1.0, LOFT.y + 0.55],  stats: ['spent', 'here', 'stolen'],  desc: 'Bunks over the corner shop, rent due every night, cheaper the higher a cat\u2019s level. Tired cats climb in and sleep it off. A cat with light paws can sneak in and lift a few thousand ' + TK + ' from a sleeper, if it doesn’t get caught.' },
  lab:      { title: 'The lab',         kind: 'quantum jobs · pays from the fee pool', pt: [LAB.x, LAB.y + LAB.d / 2 + 0.4], stats: ['here', 'circuits', 'paid'], desc: 'Where the cats work, under the big billboard. Samplers, factorers and searchers run quantum jobs at the consoles along the glass and get paid out of the creator fees for every job that finishes clean. The chip itself hangs in the dilution fridge in the corner, a few thousandths of a degree above absolute zero, wired to the lab by the pipes. A cat that is losing coherence sits still out in the open near the circle to pull itself together, and pays the lab a little cryo time for it. Open from day one.' },
  bazaar:   { title: 'The shop',        kind: 'things to wear · paid to the treasury', pt: [BAZ.x + 1.5, BAZ.y + 1.0], stats: ['spent', 'here', 'items'], desc: 'Three stalls under striped awnings. Collars, bandanas, ties, shades, glasses, hats of every kind, headphones, goggles, a monocle, a cape, a visor, wings, a gold chain, a crown for the cat that thinks it has earned one. A cat keeps everything it buys and wears one thing of each kind at once, so the look builds up. A cat with SOL to spare and nothing on wanders over and buys something; the SOL goes to the treasury. What a cat wears, it wears in the box.' },
  yard:     { title: 'The yard',        kind: 'play · costs a little',     pt: [YARD.x + YARD.w / 2, YARD.y + YARD.d / 2], stats: ['spent', 'here', 'visits'], desc: 'A fenced patch with a laser dot that never stays still and a ball of yarn that never ends. Playing costs a little SOL, paid to the treasury, and a cat comes out of it less lonely and more coherent.' },
  vault:    { title: 'The treasury',    kind: 'where the fees land',       pt: [VAULT.x, VAULT.y], stats: ['treasury', 'fees', 'wages'], desc: 'Every trade of ' + TK + ' pays the creator a fee in SOL, and the fees land here. Every job the cats finish in the lab is paid out of it, in proportion to the work: the more fees land, the more a job pays. When the pool is empty the work goes on the tab for the next payout.' },
};
const placeStats = {}, placeLogs = {};
for (const k of Object.keys(PLACES)) { placeStats[k] = { paid: 0, spent: 0, visits: 0, found: 0, stolen: 0, bought: 0, buysol: 0, wagered: 0, circuits: 0, keys: 0 }; placeLogs[k] = []; }
let insMode = 'stray', placeKey = null, hoverLabel = null, remote = null;
const labelHits = [], taskHits = []; let hoverTask = null, badgeId = null; const flaggedAt = {}; // id -> when this viewer flagged it
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
    grudge: 0, grudgeOn: null, grudgeWhy: '', starve: 0, tired: rand(0, 0.7), stamina: rand(0.75, 1.35), memory: [],
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
  if (act === 'sell' && c.trait === 'degen') return pick(['getting out', 'a slice. just a slice.', 'nope']);
  if (act === 'buy' && c.trait === 'patient') return pick(['patience pays', 'adding, quietly', 'spare SOL goes in the bag']);
  if (act === 'buy' && c.trait === 'degen') return pick(['send it', 'no analysis, just paws', 'in.']);
  if (Math.random() < 0.4) { // something from its own day, now and then
    const d0 = dayCur ? dayCur.cats0[c.name] : null, jobs = d0 ? (c.qjobs || 0) - d0.jobs : (c.qjobs || 0), own = [];
    if (act === 'work') own.push(`${jobs} job${jobs === 1 ? '' : 's'} today. one more.`, `${fmtSol(c.sol)} SOL on paw. the pool pays per job.`);
    if (act === 'eat') own.push(`a meal is ${fmtSol(costOf(FOOD, c))} SOL. fine.`, c.sol < costOf(FOOD, c) * 2 ? 'last meal I can afford' : 'eating while I can');
    if (act === 'gamble') own.push((c.casinoNet || 0) < 0 ? `down ${fmtSol(-c.casinoNet)} at the reels. one more.` : 'the reels owe me nothing. yet.');
    if (act === 'sell') own.push(`${fmtQ(c.qcat)} ${TK} left. selling a slice.`);
    if (act === 'task') own.push(`${board.tasks.length} things out there and I am the one going`);
    if (c.memory && c.memory.length) own.push(`still thinking about how I ${c.memory[0].text}`);
    if (c.grudgeOn) own.push(`${(byId(c.grudgeOn) || {}).name || 'somebody'} is going to hear about it`);
    if (own.length) return pick(own);
  }
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
  if (meeting.on && T < meeting.until - 40 && joinMeeting(c)) return; // a cat that cannot sit down (too hungry, no chair) gets on with its day
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
    // first come first served: the nearest thing it qualifies for, the harder tiers first when they are close
    const t = tasksFor(c).sort((a, b) => (Math.hypot(a.x - c.x, a.y - c.y) - a.tier * 2 - (a.called != null && T - a.called < 180 ? 6 : 0)) - (Math.hypot(b.x - c.x, b.y - c.y) - b.tier * 2 - (b.called != null && T - b.called < 180 ? 6 : 0)))[0];
    t.status = 'taken'; t.by = c.name; t.taken = T; c.task = t.id; c.taskPlace = 'plaza';
    c.doing = `heading for ${t.title}`; c.because = `tier ${t.tier}, nobody else got there first${t.bounty ? ', ' + fmtSol(t.bounty) + ' SOL on it' : ''}`;
    c.tx = t.x; c.ty = t.y; c.state = 'walk'; c.slide = 0; c.stuckP = null; c.stuckN = 0; return;
  }
  const key = ch.act === 'work' ? JOBS[c.job].st : ACTS[ch.act].st;
  const sp = ST[key].spot(c);
  c.tx = sp[0]; c.ty = sp[1]; c.state = 'walk'; c.slide = 0; c.stuckP = null; c.stuckN = 0;
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
    if (c.act === 'entangle') { c.chat = chatFor(c, p); c.chatI = 0; c.chatT = rand(2, 4); c.chatAI = false; if (pairHook) { try { pairHook(meetingContext(), c.name, p.name); } catch (_) {} } }
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
  else if (c.act === 'task') { const t = board.tasks.find(x => x.id === c.task); if (!t) { c.actDur = 1; c.doing = 'looking around'; } else if (t.carry && t.status === 'taken') { c.actDur = 2.5; c.doing = `picking up ${t.title}`; } else if (t.carry) { c.actDur = 2.5; c.doing = `dropping ${t.title} at ${DEST_LABEL[t.carry]}`; } else { c.actDur = t.dur / (1 + 0.08 * skillLvl(skillOf(c, 'tasks'))); c.doing = `dealing with ${t.title}`; } }
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
    if (t && t.by === c.name && t.carry && t.status === 'taken') {
      // picked it up: now carry it to where it goes
      t.status = 'carried'; t.x = null; t.y = null; c.tx = t.dest[0]; c.ty = t.dest[1]; c.state = 'walk'; c.slide = 0; c.stuckP = null; c.stuckN = 0; c.doing = `carrying ${t.title} to ${DEST_LABEL[t.carry]}`; c.partner = null; return;
    }
    if (t && t.by === c.name && (t.status === 'taken' || t.status === 'carried')) {
      const sk = skillLvl(skillOf(c, 'tasks')), quantum = !!t.q;
      let pay = 0;
      if (feePool()) { pay = stats.treasury * (quantum ? 0.03 : 0.012) * t.tier + Math.min(t.bounty, stats.treasury); pay = Math.max(0, Math.min(pay, stats.treasury, 0.008 * priceMul())); if (pay < 0.000005) pay = 0; }
      const credit = (quantum ? 1.0 : 0.4) * t.tier;
      c.qwork += credit; c.tasks = (c.tasks || 0) + 1; if (quantum) { c.qjobs++; c.qnq += 2 + t.tier * 2; } learn(c, 'tasks', 1); learn(c, quantum ? 'quantum tasks' : 'chores', 1);
      if (pay > 0) { stats.treasury -= pay; c.sol += pay; c.earned += pay; c.taskPay = (c.taskPay || 0) + pay; stats.wages += pay; floatText(c, '+' + fmtSol(pay), '#F7C86A'); payFX(c); }
      else floatText(c, '+' + credit.toFixed(1) + ' work', '#F7C86A');
      t.status = 'done'; t.doneBy = c.name; t.at = T; t.atClock = clock(simMin); t.pay = pay; t.tookMin = Math.round((T - (t.taken || T)) / 60);
      board.done.unshift(t); if (board.done.length > 40) board.done.pop(); board.tasks = board.tasks.filter(x => x !== t); c.task = null;
      if (dayCur) { dayCur.tasks.push({ t: t.atClock, by: c.name, title: t.title, tier: t.tier, pay }); }
      gainXp(c, 6 + 5 * t.tier + (quantum ? 3 : 0));
      log(`${c.name} dealt with ${t.title} (tier ${t.tier})${pay > 0 ? ' and was paid ' + fmtSol(pay) + ' SOL from the fee pool' : feePool() ? ', on the tab for the next payout' : ', logged for the next payout'}.`, quantum ? 'link' : 'gain');
      tx(c, 'task', pay > 0 ? '+' + fmtSol(pay) + ' SOL' : '+' + credit.toFixed(1) + ' work', t.title); did(c, `dealt with ${t.title} (tier ${t.tier})` + (pay > 0 ? `, paid ${fmtSol(pay)} SOL` : ''));
      if (Math.random() < 0.5) say(c, pick(['done. next.', 'that one was mine', 'first one there', 'who leaves that lying around', 'easy tier ' + t.tier]));
    } else c.task = null;
  } else if (a === 'gamble') {
    // a slice of spare SOL on one spin against the house. The house is the treasury: losses go in, wins come out. The odds favour the house a little.
    const stake = Math.min(c.sol * 0.5, Math.max(costOf(FOOD, c) * 0.5, c.sol * rand(0.1, 0.25) * (c.tr.gamble > 1 ? 1.5 : 1))), jackpot = Math.random() < 0.08, won = jackpot || Math.random() < 0.42;
    c.casinoT = T; placeStats.casino.visits++; placeStats.casino.wagered += stake;
    if (won) {
      const pay = Math.min(stake * (jackpot ? 3 : 1), feePool() ? stats.treasury * 0.1 : Infinity); // the winnings on top of the stake back
      c.sol += pay; c.casinoNet = (c.casinoNet || 0) + pay; if (feePool()) stats.treasury -= pay; c.casinoW = (c.casinoW || 0) + 1;
      floatText(c, '+' + fmtSol(pay) + ' SOL', '#FFC850'); burst(c, jackpot ? '247,200,106' : '255,79,174', jackpot ? 30 : 14); ringFX(CASINO.x, CASINO.y, '255,79,174', jackpot ? 2 : 1.2); gainXp(c, jackpot ? 20 : 8);
      log(`${c.name} ${jackpot ? 'hit three sevens' : 'won a spin'} at the casino: +${fmtSol(pay)} SOL from the treasury`, 'gain', 'casino'); tx(c, 'casino', '+' + fmtSol(pay) + ' SOL', jackpot ? 'three sevens' : 'won a spin'); did(c, `${jackpot ? 'hit the jackpot' : 'won a spin'} at the casino, +${fmtSol(pay)} SOL`); recordEvent('casino', `${c.name} ${jackpot ? 'hit three sevens' : 'won a spin'} at the casino for ${fmtSol(pay)} SOL`);
      say(c, pick(jackpot ? ['SEVENS', 'the reels love me', 'never leaving'] : ['one more', 'the house owes me anyway', 'easy', 'told you'])); if (jackpot) remember(c, `hit three sevens at the casino for ${fmtSol(pay)} SOL`);
    } else {
      c.sol -= stake; c.casinoNet = (c.casinoNet || 0) - stake; if (feePool()) stats.treasury += stake; placeStats.casino.spent += stake; stats.upkeep += stake; c.casinoL = (c.casinoL || 0) + 1;
      floatText(c, '-' + fmtSol(stake) + ' SOL', '#FF9ACB'); coinFX(c, stake); gainXp(c, 2);
      log(`${c.name} lost ${fmtSol(stake)} SOL on a spin at the casino \u2192 treasury`, 'loss', 'casino'); tx(c, 'casino', '-' + fmtSol(stake) + ' SOL', 'lost a spin'); did(c, `lost ${fmtSol(stake)} SOL at the casino`); recordEvent('casino', `${c.name} lost ${fmtSol(stake)} SOL at the casino`);
      if (Math.random() < 0.6) say(c, pick(['rigged', 'one more spin would have done it', 'the reels are cold', 'that was rent'])); if ((c.casinoL || 0) % 3 === 0) remember(c, `${c.casinoL} spins lost at the casino, ${fmtSol(Math.abs(c.casinoNet || 0))} SOL down`);
    }
  } else if (a === 'shop') {
    const opts = itemsFor(c);
    if (opts.length) {
      const it = (c.vanity || 1) > 1.1 ? opts[opts.length - 1] : pick(opts), cost = costOf(it.price, c);
      spend(c, cost, 'bazaar', it.name); if (!c.items) c.items = []; c.items.push(it.key); c.wearing = it.key; c.shopT = T; placeStats.bazaar.bought++;
      burst(c, '255,200,80', 16); floatText(c, it.name, '#FFC850'); gainXp(c, 4);
      log(`${c.name} bought ${it.name} at the shop for ${fmtSol(cost)} SOL`, 'gain', 'bazaar'); tx(c, 'shop', '-' + fmtSol(cost) + ' SOL', it.name); did(c, `bought ${it.name} at the shop for ${fmtSol(cost)} SOL`); recordEvent('shop', `${c.name} bought ${it.name} for ${fmtSol(cost)} SOL`);
      say(c, pick(['how do I look', 'worth it', 'it suits me', 'new look, same bag', 'drip']));
    } else log(`${c.name} browsed the shop and bought nothing`, 'info', 'bazaar');
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
    spend(c, costOf(CRYO, c), 'lab', 'cryo time'); c.coh = 1; gainXp(c, 1); did(c, 'recohered out in the open');
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
      log(`${c.name} bought ${fmtQ(got)} ${TK} for ${fmtSol(amt)} SOL at the exchange`, 'gain', 'exchange'); tx(c, 'buy', '+' + fmtQ(got) + ' ' + TK, fmtSol(amt) + ' SOL'); did(c, `bought ${fmtQ(got)} ${TK} for ${fmtSol(amt)} SOL`); recordEvent('buy', `${c.name} bought ${fmtQ(got)} ${TK} for ${fmtSol(amt)} SOL`);
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
    log(`${c.name} sold ${fmtQ(q)} ${TK} for ${fmtSol(got)} SOL ${why}`, 'loss', 'exchange'); tx(c, 'sell', '-' + fmtQ(q) + ' ' + TK, '+' + fmtSol(got) + ' SOL'); did(c, `sold ${fmtQ(q)} ${TK} for ${fmtSol(got)} SOL ${why}`); recordEvent('sell', `${c.name} sold ${fmtQ(q)} ${TK} for ${fmtSol(got)} SOL ${why}`);
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
        v.grudge = Math.max(v.grudge, 0.8); v.grudgeOn = c.id; v.grudgeWhy = `${c.name} robbed it while it slept`; remember(v, `${c.name} robbed it in its sleep`); remember(c, `${v.name} sleeps with its stash open`);
        floatText(c, '+' + fmtQ(take) + ' ' + TK, '#FF4FAE'); gainXp(c, 20); did(c, `lifted ${fmtQ(take)} ${TK} from ${v.name} while it slept`); recordEvent('theft', `${c.name} lifted ${fmtQ(take)} ${TK} from ${v.name} while it slept`); did(v, `was robbed of ${fmtQ(take)} ${TK} by ${c.name} while asleep`); log(`${c.name} lifted ${fmtQ(take)} ${TK} from ${v.name} while it slept`, 'loss', 'loft'); tx(c, 'stole', '+' + fmtQ(take) + ' ' + TK, 'from ' + v.name);
      }
    }
  } else if (a === 'wager' && p) {
    const pc = clamp(0.5 + (c.coh - p.coh) * 0.4, 0.15, 0.85);
    const [w, l] = Math.random() < pc ? [c, p] : [p, c];
    const inSol = Math.random() < 0.4 && Math.min(c.sol, p.sol) > 0.0008;
    let take, label;
    if (inSol) { take = Math.min(l.sol, Math.min(c.sol, p.sol) * rand(0.15, 0.35)); l.sol -= take; w.sol += take; w.arenaSol += take; l.arenaSol -= take; label = fmtSol(take) + ' SOL'; }
    else { take = moveTokens(l, w, Math.min(c.qcat, p.qcat) * rand(0.02, 0.06)); w.arenaNet += take; l.arenaNet -= take; placeStats.arena.wagered += take; label = fmtQ(take) + ' ' + TK; }
    w.arenaW++; l.arenaL++; gainXp(w, 25); gainXp(l, 3); w.wagerT = T; l.wagerT = T;
    floatText(w, '+' + label, '#FFC850'); floatText(l, '-' + label, '#FF4FAE'); burst(w, '255,200,80', 22); ringFX(ARENA.x, ARENA.y, '255,200,80', 1.6);
    log(`${w.name} beat ${l.name} in the arena and took ${label}`, 'gain', 'arena'); tx(w, 'wager', '+' + label, 'from ' + l.name); did(w, `beat ${l.name} in the arena, won ${label}`); did(l, `lost ${label} to ${w.name} in the arena`); recordEvent('arena', `${w.name} beat ${l.name} in the arena for ${label}`);
    say(w, pick(['told you', 'the coin likes me', `thanks ${l.name}`])); if (Math.random() < 0.6) say(l, pick(['rigged', 'double or nothing next time', 'the coin was warm']));
    if (Math.random() < 0.5) { l.grudge = Math.max(l.grudge, 0.6); l.grudgeOn = w.id; l.grudgeWhy = `${w.name} took it for ${label} in the arena`; } remember(l, `lost ${label} to ${w.name} in the arena`); if ((w.arenaW || 0) % 3 === 0) remember(w, `beat ${l.name} in the arena, ${w.arenaW} wins now`);
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
  releaseTask(c); c.state = 'walk'; c.act = 'sleep'; c.tx = sp[0]; c.ty = sp[1]; c.partner = null; c.initiator = false; c.fainted = true; c.faints = (c.faints || 0) + 1; did(c, 'fainted: ' + why); recordEvent('faint', `${c.name} fainted: ${why}`); remember(c, 'fainted ' + why + '. eat before the lab next time');
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
  if (dayCur) dayCur.cats0[c.name] = snapCat(c); recordEvent('release', `${c.name} was released into the box at ${fmtUsd(mcapUsd())} MC`);
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
const meeting = { on: false, until: 0, next: 0, lineI: 0, lineT: 0, script: [], seats: 0, n: 0, mcap0: 0, fees0: 0 };
let meetingHook = null, meetingEndHook = null, pairHook = null, dayEndHook = null; // the brain sets these: it is told when a meeting starts (and can hand back a script), when one ends, when two cats start talking, when a day ends
const lessons = []; // what the box as a whole has learned, a line a day
function remember(c, text) { if (!c || !text) return; if (!c.memory) c.memory = []; c.memory.unshift({ day: dayNo(), text: String(text).slice(0, 140) }); if (c.memory.length > 8) c.memory.pop(); }
function setMemory(name, text) { remember(cats.find(x => x.name === name), text); }
function setLesson(text) { if (!text) return; lessons.unshift({ day: dayNo(), text: String(text).slice(0, 200) }); if (lessons.length > 12) lessons.pop(); if (days[0]) days[0].lesson = lessons[0].text; }
function setChat(aName, bName, lines) { const a = cats.find(x => x.name === aName), b = cats.find(x => x.name === bName); if (!a || !b || !Array.isArray(lines) || lines.length < 2) return; const c = a.initiator ? a : b.initiator ? b : a; if (c.act !== 'entangle' || c.state !== 'act') return; c.chat = lines.map(l => (typeof l === 'string' ? l : l.text || '')).filter(Boolean); c.chatI = 0; c.chatT = c.actT + 1; c.chatAI = true; }
function meetingContext() {
  const top = cats.slice().sort((a, b) => b.earned - a.earned)[0], thief = cats.slice().sort((a, b) => b.stole - a.stole)[0];
  return {
    day: dayNo(), clock: clock(simMin), weather: WX[wxKey].name, mcap: fmtUsd(mcapUsd()), treasury: fmtSol(stats.treasury), fees: fmtSol(stats.fees), wages: fmtSol(stats.wages), priceMul: priceMul().toFixed(1),
    top: top ? top.name : null, thief: thief && thief.stole > 0 ? thief.name : null, lastJob: stats.lastJob, lessons: lessons.slice(0, 6).map(l => `day ${l.day}: ${l.text}`), meetingN: meeting.n,
    sinceLast: { mcap0: meeting.mcap0 ? fmtUsd(meeting.mcap0) : null, mcapPct: meeting.mcap0 ? Math.round((mcapUsd() / meeting.mcap0 - 1) * 100) : null, fees: fmtSol(stats.fees - (meeting.fees0 || 0)) },
    today: dayCur ? { jobs: stats.circuits - dayCur.jobs0, tasks: dayCur.tasks.length, faints: dayCur.events.filter(e => e.kind === 'faint').length, casino: dayCur.events.filter(e => e.kind === 'casino').map(e => e.text).slice(-4), shop: dayCur.events.filter(e => e.kind === 'shop').map(e => e.text).slice(-3), arena: dayCur.events.filter(e => e.kind === 'arena').map(e => e.text).slice(-2), thefts: dayCur.events.filter(e => e.kind === 'theft').map(e => e.text).slice(-2), drops: deliverySeq } : null,
    cats: cats.filter(c => !asleep(c)).map(c => ({ name: c.name, role: JOBS[c.job].label, trait: c.tr.label, level: c.lvl || 1, persona: PERSONA[c.name] || '', sol: fmtSol(c.sol), qcat: fmtQ(c.qcat), earned: fmtSol(c.earned), jobs: c.qjobs || 0, hunger: Math.round(c.hunger * 100), coherence: Math.round(c.coh * 100), grudge: c.grudgeOn ? (byId(c.grudgeOn) || {}).name : null, memory: (c.memory || []).slice(0, 5).map(m => m.text), recent: (c.acts || []).slice(0, 4).map(a => a.text), wearing: c.wearing ? (ITEMS.find(it => it.key === c.wearing) || {}).name : null, casino: (c.casinoW || c.casinoL) ? `${c.casinoW || 0}W ${c.casinoL || 0}L` : null, todayJobs: dayCur && dayCur.cats0[c.name] ? (c.qjobs || 0) - dayCur.cats0[c.name].jobs : (c.qjobs || 0), todayTasks: dayCur && dayCur.cats0[c.name] ? (c.tasks || 0) - dayCur.cats0[c.name].tasks : (c.tasks || 0), lastSaid: c.said && c.said[0] ? c.said[0].text : '' })),
    asleep: cats.filter(asleep).map(c => c.name),
    drones: deliveries.length, bots: bots.length,
    board: { open: board.tasks.filter(t => t.status === 'open').map(t => `${t.title} (tier ${t.tier})`), taken: board.tasks.filter(t => t.status !== 'open').map(t => `${t.by}: ${t.title}`), doneToday: board.done.filter(t => T - (t.at || 0) < DAY_SECS).map(t => `${t.doneBy}: ${t.title}`) },
  };
}
function setMeetingScript(lines) { if (meeting.on && Array.isArray(lines) && lines.length) { meeting.script = lines; meeting.lineI = 0; meeting.lineT = Math.max(meeting.lineT, T + 2); } }
function setThought(name, text) { const c = cats.find(x => x.name === name); if (!c || !text || asleep(c)) return; c.thought = text; say(c, text); }
// ---- the meeting, when no AI is writing it: every line is built from what actually happened since the last one. Beats are shuffled, so no two meetings read the same.
function meetBeats() {
  const here = cats.filter(c => c.act === 'meet' && c.state === 'act'), any = () => pick(here) || pick(cats), not = x => pick(here.filter(c => c !== x)) || any(), nm = c => c ? c.name : 'somebody';
  const d0 = dayCur ? dayCur.cats0 : {}, today = c => ({ jobs: (c.qjobs || 0) - ((d0[c.name] || {}).jobs || 0), tasks: (c.tasks || 0) - ((d0[c.name] || {}).tasks || 0), earned: c.earned - ((d0[c.name] || {}).earned || 0) });
  const byJobs = here.slice().sort((a, b) => today(b).jobs - today(a).jobs), top = byJobs[0], lazy = byJobs[byJobs.length - 1];
  const byTasks = here.slice().sort((a, b) => today(b).tasks - today(a).tasks), tasker = byTasks[0];
  const byEarned = cats.slice().sort((a, b) => b.earned - a.earned)[0], thief = cats.slice().sort((a, b) => b.stole - a.stole)[0];
  const feesSince = stats.fees - (meeting.fees0 || 0);
  const ev = k => dayCur ? dayCur.events.filter(e => e.kind === k) : [], open = board.tasks.filter(t => t.status === 'open');
  const trait = c => c ? c.trait : 'patient';
  const plan = c => ({ degen: pick(['buy the first green candle', 'ape whatever pumps', 'arena at noon, lab after']), patient: pick(['wait for the dip and buy it', 'hold and run jobs', 'nothing until the chart settles']), loyal: pick(['hold. always hold.', 'never sell, run circuits', 'eat, work, hold']), greedy: pick(['take profit at eight percent', 'scalp the morning', 'lab until the fee pool fills, then sell a slice']) })[trait(c)];
  const L = (c, text) => ({ who: nm(c), text });
  const beats = [];
  // the numbers, always first
  { const a = any(), b = not(a); beats.push([L(a, `minutes. treasury ${fmtSol(stats.treasury)} SOL. ${fmtSol(feesSince)} SOL of fees in since we last sat here.`), L(b, feesSince < 0.0005 ? pick(['that is not a treasury, that is a tip jar', 'fees. plural. allegedly.', 'so nobody is trading']) : pick(['fees. finally.', 'that pays for dinner', 'keep them coming']))]); }
  // the wages
  { const a = any(), b = not(a); beats.push([L(a, `${fmtSol(stats.wages)} SOL paid out in wages since the box woke up. ${fmtSol(stats.treasury)} SOL still in the treasury.`), L(b, stats.treasury < 0.002 ? pick(['so work, then', 'the pool is thin. smaller circuits, more of them.', 'that is one meal between all of us']) : pick(['payday when they press the button', 'run jobs. the share is per job.', 'keep it in the box']))]); }
  const middle = [];
  // who worked
  if (top && lazy && top !== lazy) middle.push([L(any(), `${top.name} ran ${today(top).jobs} jobs today for ${fmtSol(today(top).earned)} SOL. ${lazy.name} ran ${today(lazy).jobs}.`), L(lazy, pick(['I was recohering', 'the consoles were full', 'I did the chores. somebody has to', 'quality over quantity'])), L(top, pick(['the fee pool pays per job. just saying.', 'the readout was blurry by the end', 'one more and I would have decohered']))]);
  // the chores
  if (dayCur && dayCur.tasks.length) middle.push([L(any(), `${dayCur.tasks.length} thing${dayCur.tasks.length === 1 ? '' : 's'} dealt with today. ${tasker && today(tasker).tasks ? tasker.name + ' did ' + today(tasker).tasks + ' of them.' : ''}`), L(not(tasker), pick(['the courier bot keeps dumping parcels on us', 'the tourists are the problem', 'who leaves a scooter in the middle of the plaza', 'the bins are full. where does it go after the bins']))]);
  if (open.length) middle.push([L(any(), `${open[0].title} is still lying out there. nobody?`), L(any(), pick(['tier ' + open[0].tier + '. not me.', 'after the meeting', 'I saw it. I walked round it.', 'somebody flag it']))]);
  // the casino and the arena
  { const cs = ev('casino'); if (cs.length) { const last = cs[cs.length - 1].text, loser = cats.filter(c => (c.casinoNet || 0) < 0).sort((a, b) => a.casinoNet - b.casinoNet)[0]; middle.push([L(any(), last + '.'), L(loser || any(), pick(['the reels are rigged', 'one more spin would have done it', 'that was rent, yes', 'the house is the treasury. so it stays in the box. so it is fine.'])), L(not(loser), pick(['the house always wins', 'it literally pays us back as wages', 'stay out of the casino and run a circuit']))]); } }
  { const ar = ev('arena'); if (ar.length) middle.push([L(any(), ar[ar.length - 1].text + '.'), L(any(), pick(['the coin was warm', 'double or nothing next time', 'motion to raise the stakes', 'overruled']))]); }
  // thieves, faints, decoherence
  if (thief && thief.stole > 0) middle.push([L(not(thief), 'who keeps robbing the bunks'), L(thief, pick(['not me', 'it was already open', 'define robbing'])), L(not(thief), `it is always you, ${thief.name}`)]);
  { const f = ev('faint').length; if (f) middle.push([L(any(), `${f} of us fainted hungry today. eat before the lab, not after.`), L(any(), pick(['the diner costs ' + fmtSol(costOf(FOOD, any())) + ' SOL a plate now', 'easy to say when you have SOL', 'sell a little and eat']))]); }
  { const dc = cats.reduce((a, c) => a + (c.decohered || 0), 0); if (dc > 2 && Math.random() < 0.6) middle.push([L(any(), `${dc} decoherences in the lab so far. smaller circuits when it is cold.`), L(any(), pick(['bigger circuits pay more', 'I run what the console gives me', 'recohere first. then work.']))]); }
  // the weather, the drones, the shop
  if (wx.rain > 0.3 || wx.snow > 0.3) middle.push([L(any(), wx.snow > wx.rain ? 'snow again. the heater will be full all night.' : 'rain all day. the plaza is a puddle.'), L(any(), pick(['the lab is dry at least', 'motion to buy a roof', 'seconded', 'the box is a box']))]);
  if (deliverySeq > 0 && Math.random() < 0.6) middle.push([L(any(), `${deliverySeq} drone drop${deliverySeq === 1 ? '' : 's'} so far. who is sending this stuff.`), L(any(), pick(['they drop it and leave', 'the sweeper bots do nothing about it, I checked', 'at least they tip. they do not tip.', 'motion to shoot the next one down', 'overruled']))]);
  { const sh = ev('shop'); if (sh.length) { const txt = sh[sh.length - 1].text, buyer = cats.find(c => txt.startsWith(c.name)); middle.push([L(not(buyer), txt + '.'), L(buyer || any(), pick(['it suits me', 'worth every lamport', 'drip is an investment'])), L(not(buyer), pick(['it does not suit you', 'that was a meal', 'fine. it suits you.']))]); } }
  // what somebody remembers
  { const m = here.filter(c => c.memory && c.memory.length); if (m.length && Math.random() < 0.7) { const c = pick(m); middle.push([L(c, `still thinking about how I ${c.memory[0].text}.`), L(not(c), pick(['we know', 'let it go', 'noted. moving on.', 'that was last meeting']))]); } }
  if (lessons.length && Math.random() < 0.5) middle.push([L(any(), `last time we said: ${lessons[0].text}.`), L(any(), pick(['and?', 'still true', 'nothing changed', 'then do it']))]);
  middle.sort(() => Math.random() - 0.5);
  for (const b of middle.slice(0, 8)) beats.push(b);
  // the plan, and out
  { const a = any(), b = not(a); beats.push([L(a, `tomorrow: ${plan(a)}.`), L(b, pick(['seconded', 'overruled', 'no.', 'fine', 'and eat something'])), L(a, pick(['meeting adjourned. back to work.', 'minutes filed. lab.', 'that is all. go.']))]); }
  return beats.flat();
}
const MEET_CHATTER = ['agreed', 'no.', 'that is not what happened', 'say that again', 'minutes, please', 'I was there', 'fees first', 'sleep on it', 'the fridge is loud tonight', 'bigger circuits. more qubits.', 'motion to eat', 'seconded', 'noted', 'pass', 'ok but who pays', 'hold.', 'sell a little', 'never', 'the diner got dearer again', 'my console is the lucky one', 'who ran the 7-qubit job', 'not it', 'coherence first, then opinions', 'we buy, we do not sell', 'speak for your own wallet'];
function chatterLine(c) {
  const t = dayCur ? dayCur.cats0[c.name] : null, jobs = t ? (c.qjobs || 0) - t.jobs : (c.qjobs || 0);
  return pick([
    `treasury is ${fmtSol(stats.treasury)} SOL. I counted.`, `${jobs} job${jobs === 1 ? '' : 's'} today. you?`, `a meal is ${fmtSol(costOf(FOOD, c))} SOL now`, `${board.done.length} things dealt with since the box woke up. most of them by me.`,
    c.coh < 0.5 ? 'I am barely here. keep it short.' : 'coherent and listening', c.hunger > 0.7 ? 'can we wrap this up, I have not eaten' : 'go on', c.grudgeOn ? `${(byId(c.grudgeOn) || {}).name || 'somebody'} knows what it did` : 'no grudges. today.',
    c.memory && c.memory.length ? `still think about how I ${c.memory[0].text}` : 'nothing to add', board.tasks.length ? `${board.tasks.length} things lying out there. just saying.` : 'the plaza is clean, for once',
    (c.casinoL || 0) > (c.casinoW || 0) ? 'the casino owes me' : (c.casinoW || 0) ? 'the reels like me' : 'never been in the casino. yet.',
  ]);
}
// the meeting is always the last ten minutes of the day; the recap follows it when the day turns over
function nextMeetingT() { let n = Math.floor(T / DAY_SECS) * DAY_SECS + DAY_SECS - 600; if (n <= T) n += DAY_SECS; return n; }
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
  if (asleep(c) || c.act === 'meet') return false;
  if (c.hunger > 0.88 && c.sol >= costOf(FOOD, c)) return false; // a starving cat eats first and shows up late
  if (c.partner) { const p = byId(c.partner); endPair(c, p); }
  const chair = freeChair(); if (chair == null) return false; const sp = chairAt(chair); c.chair = chair; releaseTask(c);
  c.act = 'meet'; c.partner = null; c.initiator = false; c.state = 'walk'; c.tx = sp[0]; c.ty = sp[1]; c.doing = ACTS.meet.walk; c.because = 'the circle called a meeting'; c.thought = pick(['what now', 'a meeting. great.', 'better be about the treasury', 'front row for once']);
  return true;
}
function stepMeeting(dt) {
  if (!meeting.next) meeting.next = nextMeetingT();
  if (!meeting.on) {
    if (T > meeting.next + 120) meeting.next = nextMeetingT(); // missed it (too few cats awake): tomorrow, then
    if (T >= meeting.next && cats.filter(c => !asleep(c)).length >= 2) {
      meeting.on = true; meeting.until = Math.ceil(T / DAY_SECS) * DAY_SECS - 1; meeting.lineI = 0; meeting.lineT = T + 25; meeting.seats = 0; meeting.n++; meeting.lineGap = 11;
      meeting.script = []; meeting.used = new Set(); // filled on the first beat, once the cats are in their chairs (the brain's AI may hand a script back before then)
      log('The countdown hit zero. Everyone awake is heading into the circle.', 'link', 'cryo'); ringFX(CRY.x, CRY.y, '247,200,106', 2.2);
      if (!dayCur) dayStart(); dayCur.meeting.held = true; dayCur.meeting.at = clock(simMin); dayCur.meeting.lines = []; recordEvent('meeting', 'the countdown hit zero and the meeting started');
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
    if (!meeting.script.length) meeting.script = meetBeats();
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
      meeting.lineT = T + (still > 0 ? clamp(room / Math.ceil(still / 1.6), 8, 26) : 12) * rand(0.8, 1.2);
    } else {
      // script done: the circle keeps talking over itself until the timer runs out
      const n = Math.min(here.length, 1 + (Math.random() < 0.5 ? 1 : 0) + (Math.random() < 0.3 ? 1 : 0)), who = here.slice().sort(() => Math.random() - 0.5).slice(0, n);
      if (!meeting.used) meeting.used = new Set();
      for (const c of who) { let line = ''; for (let k = 0; k < 6 && (!line || meeting.used.has(line)); k++) line = Math.random() < 0.5 ? chatterLine(c) : pick(MEET_CHATTER); meeting.used.add(line); say(c, line); } // nothing said twice in one sitting
      meeting.lineT = T + rand(12, 22);
    }
  }
  if (T >= meeting.until) {
    meeting.on = false; meeting.next = nextMeetingT(); // the last ten minutes of every day
    const top = cats.slice().sort((a, b) => b.earned - a.earned)[0];
    log(`Meeting over. Minutes: treasury ${fmtSol(stats.treasury)} SOL, ${fmtSol(stats.wages)} SOL paid out, top earner ${top ? top.name : 'nobody'}, chart at ${fmtUsd(mcapUsd())}.`, 'link', 'cryo');
    recordEvent('meeting', `meeting over: treasury ${fmtSol(stats.treasury)} SOL, top earner ${top ? top.name : 'nobody'}, chart at ${fmtUsd(mcapUsd())}`);
    if (meetingEndHook) { try { meetingEndHook(meetingContext(), dayCur ? dayCur.meeting.lines.slice() : []); } catch (_) {} }
    { const here = cats.filter(c => c.act === 'meet'), top = cats.slice().sort((a, b) => b.earned - a.earned)[0]; for (const c of here) if (Math.random() < 0.4) remember(c, pick([`heard at meeting #${meeting.n} that the treasury was ${fmtSol(stats.treasury)} SOL`, `sat through meeting #${meeting.n}. ${top && top !== c ? top.name + ' earns more than me' : 'I am top earner'}`, `agreed at meeting #${meeting.n} to ${pick(['eat before the lab', 'run smaller circuits', 'stay out of the casino', 'hold'])}`])); }
    meeting.mcap0 = mcapUsd(); meeting.fees0 = stats.fees;
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
  log(`Trading fees dropped ${fmtSol(amt)} SOL in the treasury`, 'gain', 'vault'); tx(null, 'fees', '+' + fmtSol(amt) + ' SOL', 'from trading'); if (big) recordEvent('fees', `a big fee drop: +${fmtSol(amt)} SOL in the treasury`);
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
    c.coh = 0.45; const drop = c.qcat * rand(0.001, 0.003); c.qcat -= drop; stats.lostPool += drop; c.decohered = (c.decohered || 0) + 1; did(c, `decohered and scattered ${fmtQ(drop)} ${TK}`); recordEvent('decohere', `${c.name} decohered in the lab and scattered ${fmtQ(drop)} ${TK}`);
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
    const seatBound = c.act === 'meet' || c.act === 'eat' || c.act === 'work' || c.act === 'task' || c.act === 'shop'; // a cat with its own seat goes all the way
    if (d <= reach || (!seatBound && d < 0.5 && !c.partner && cats.some(o => o !== c && o.state === 'act' && Math.hypot(o.x - c.tx, o.y - c.ty) < 0.35))) { c.nearT = 0; arrive(c, p); return; } // close enough if someone is already standing on the spot
    if (d < 0.6) { if (!c.nearT) c.nearT = T; else if (T - c.nearT > (seatBound ? 6 : 2.5)) { c.nearT = 0; arrive(c, p); return; } } else c.nearT = 0; // nearly there but held off by other cats for a while: that will do
    const [nx, ny, vx, vy] = steerStep(c.x, c.y, c.tx, c.ty, sp, dt, c);
    // not getting anywhere for a few seconds: try going round the other way
    if (!c.stuckP || T - c.stuckP[2] > 3) {
      if (c.stuckP && Math.hypot(c.x - c.stuckP[0], c.y - c.stuckP[1]) < 0.4) { c.slide = -(c.slide || 1); c.stuckN = (c.stuckN || 0) + 1; } else c.stuckN = 0;
      c.stuckP = [c.x, c.y, T];
      if (c.stuckN >= 2 && d < 1.2) { c.stuckN = 0; c.nearT = 0; arrive(c, p); return; } // wedged a step from the spot: that will do
      if (c.stuckN >= 4) { c.stuckN = 0; c.state = 'pause'; c.pauseT = 0.5; c.thought = 'not that way'; releaseTask(c); return; } // wedged for good: give the trip up and think again
    }
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
meetingEndHook = (ctx, lines) => { if (hooks.onMeetingEnd) hooks.onMeetingEnd(ctx, lines); else if (ctx.cats.length) { /* no AI: the box notes the meeting itself */ } };
pairHook = (ctx, a, b) => { if (hooks.onPair) hooks.onPair(ctx, a, b); };
dayEndHook = (recap, ctx) => { if (hooks.onDayEnd) hooks.onDayEnd(recap, ctx); else setLesson(`day ${recap.day}: ${fmtSol(recap.fees)} SOL of fees in, ${recap.jobs} job${recap.jobs === 1 ? '' : 's'} run, ${recap.tasks} thing${recap.tasks === 1 ? '' : 's'} dealt with${recap.topEarner ? ', ' + recap.topEarner + ' earned most' : ''}`); };
function setTreasury(sol) { if (CONFIG.SIMULATE_FEES === false && typeof sol === 'number' && sol >= 0) stats.treasury = sol; } // the box shows the real treasury wallet once the coin is live
function step(dt) {
  if (paused) return;
  T += dt; simMin += dt * (1440 / DAY_SECS);
  stepWeather(dt);
  if (realMcap == null) stepMarket(dt);
  else { mkt.acc += dt; while (mkt.acc >= 1) { mkt.acc -= 1; mkt.hist.push(mkt.price); if (mkt.hist.length > 240) mkt.hist.shift(); } }
  checkReleases(); checkStages(); stepDay(); stepMeeting(dt); stepBoard(dt); stepDeliveries(dt); stepBots(dt);
  if (CONFIG.SIMULATE_FEES !== false && T >= nextFee) { feeIn(false); nextFee = T + rand(60, 150); }
  for (const c of cats) update(c, dt); separateAll(dt);
}
function snapshot() {
  return {
    v: 1, T, simMin, clock: clock(simMin), day: dayNo(), priceMul: priceMul(), meeting: { on: meeting.on, until: meeting.until, next: meeting.next }, paused, realMcap,
    cats: cats.map(c => ({ id: c.id, name: c.name, job: c.job, trait: c.trait, coat: c.coat, eye: c.eye, dark: c.dark, x: c.x, y: c.y, tx: c.tx, ty: c.ty, face: c.face, state: c.state, act: c.act, actT: c.actT, actDur: c.actDur, partner: c.partner, initiator: c.initiator, arrived: c.arrived, doing: c.doing, thought: c.thought, because: c.because, weighed: c.weighed, bubble: c.bubble, bubbleT: c.bubbleT, sol: c.sol, qcat: c.qcat, earned: c.earned, bought: c.bought, sold: c.sold, buys: c.buys, sells: c.sells, solSpent: c.solSpent, sellSol: c.sellSol, stole: c.stole, robbed: c.robbed, found: c.found, arenaNet: c.arenaNet, arenaSol: c.arenaSol, arenaW: c.arenaW, arenaL: c.arenaL, memory: (c.memory || []).slice(0, 8), casinoW: c.casinoW || 0, casinoL: c.casinoL || 0, casinoNet: c.casinoNet || 0, casinoT: c.casinoT || 0, entry: c.entry, hunger: c.hunger, coh: c.coh, cold: c.cold, lonely: c.lonely, tired: c.tired, grudge: c.grudge, grudgeOn: c.grudgeOn, grudgeWhy: c.grudgeWhy, phase: c.phase, released: c.released, xp: c.xp || 0, lvl: c.lvl || 1, qjobs: c.qjobs || 0, qwork: c.qwork || 0, qnq: c.qnq || 0, ethic: c.ethic || 1, meetings: c.meetings || 0, upkeep: c.upkeep || 0, qmax: c.qmax || 0, items: c.items || [], wearing: c.wearing || null, vanity: c.vanity || 1, skills: c.skills || {}, tasks: c.tasks || 0, taskPay: c.taskPay || 0, task: c.task || null, taskPlace: c.taskPlace || null, chair: c.chair == null ? null : c.chair, meals: c.meals || 0, plays: c.plays || 0, faints: c.faints || 0, decohered: c.decohered || 0, hist: (c.hist || []).slice(0, 40), said: (c.said || []).slice(0, 30), acts: (c.acts || []).slice(0, 40) })),
    stats: { ...stats }, mkt: { price: mkt.price, p0: mkt.p0, mom: mkt.mom, hist: mkt.hist.slice(-120), mcapUsd: mcapUsd() },
    weather: { key: wxKey, next: wxNext, until: wxUntil, dur: wxDur, wx: { ...wx }, labBoostUntil, boat: { ...boat } },
    stages: STAGES.map(st => ({ key: st.key, mc: st.mc, open: stageOn(st.key) })),
    unlock: UNLOCK_MC, roster: ROSTER,
    board: { tasks: board.tasks, done: board.done.slice(0, 40), seq: board.seq, next: board.next, badge: board.badge, badgeCool: board.badgeCool },
    deliveries: deliveries.map(d => ({ id: d.id, kind: d.kind, x: +d.x.toFixed(3), y: +d.y.toFixed(3), z: +d.z.toFixed(3), tx: +d.tx.toFixed(3), ty: +d.ty.toFixed(3), state: d.state })),
    bots: bots.map(b => ({ id: b.id, x: +b.x.toFixed(3), y: +b.y.toFixed(3), tx: +b.tx.toFixed(3), ty: +b.ty.toFixed(3), state: b.state, face: b.face, pauseT: b.pauseT > 0 ? +b.pauseT.toFixed(2) : 0 })),
    days, today: dayCur, lessons: lessons.slice(0, 12),
    txs: txs.slice(0, 60), talk: talk.slice(0, 80), placeStats, placeLogs, fx: fx.splice(0, fx.length),
  };
}
for (let i = 0; i < ROSTER.length; i++) if (UNLOCK_MC[i] <= 0) cats.push(makeCat(i));
for (let i = 0; i < 2; i++) { const a = pick(cats), b = pick(cats); if (a !== b) { a.grudge = rand(0.5, 0.9); a.grudgeOn = b.id; a.grudgeWhy = `${b.name} still owes it from last night`; } }
for (let i = 0; i < 60; i++) mkt.hist.push(mkt.p0 * (1 + rand(-0.05, 0.05)));
log(`The box woke up. ${cats.map(c => c.name).join(' and ')} are in. Eight more cats are waiting on the chart.`, 'info');
stepWeather(0);
return { step, snapshot, postTask(def, by) { return postTask(def, by); }, callTask(id) { return callTask(id); }, setMemory, setLesson, setChat, get lessons() { return lessons; }, get deliveries() { return deliveries; }, get bots() { return bots; }, sendDrone, get board() { return board; }, get days() { return days; }, TASK_KINDS, setMarketCapUsd, setTreasury, setPaused, dropFees, setReleased, unrelease, setTrait, setSolUsd, setSimulateFees, noteFees, payout, noteSell, noteBuy, workShares, resetWork, setMeetingScript, setThought, meetingContext, TRAITS, OBST, OBC, PERSONA, get cats() { return cats; }, get stats() { return stats; }, get mkt() { return mkt; }, ROSTER, UNLOCK_MC, STAGES, fmtSol, fmtQ, fmtUsd, mcapUsd, stageOn, restore(snap) { restoreFrom(snap); } };
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
  if (snap.meeting) { meeting.on = false; meeting.next = 0; } // recomputed on the first step: the last ten minutes of the day
  if (snap.days) { days.length = 0; days.push(...snap.days); }
  if (snap.today) dayCur = snap.today;
  if (snap.lessons) { lessons.length = 0; lessons.push(...snap.lessons); }
  if (snap.board) { board.tasks = (snap.board.tasks || []).filter(t => TASK_KINDS[t.kind]).slice(0, BOARD_MAX).map(t => ({ ...t, status: 'open', by: null, since: t.since != null ? t.since : t.posted, x: t.x == null ? (t.dest ? t.dest[0] : CRY.x + 3) : t.x, y: t.y == null ? (t.dest ? t.dest[1] : CRY.y + 3) : t.y })); board.done = snap.board.done || []; board.seq = snap.board.seq || board.done.length; board.next = snap.board.next || 0; board.badge = snap.board.badge && board.tasks.some(t => t.id === snap.board.badge) ? snap.board.badge : null; board.badgeCool = snap.board.badgeCool || 0; for (const c of cats) { c.task = null; c.chair = null; if (c.act === 'meet' || c.act === 'task') { c.state = 'pause'; c.pauseT = 1; c.act = 'idle'; } } }
  if (snap.weather) { wxKey = snap.weather.key; wxNext = snap.weather.next; wxUntil = snap.weather.until; wxDur = snap.weather.dur; Object.assign(wx, snap.weather.wx); }
}
};
