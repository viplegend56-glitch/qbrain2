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
const TRAYS = { x: M(16.2), y: M(11.2), w: 1.3, d: 3.7 };                      // the scrapyard: a fenced yard along the right edge, with a gantry over it
const BENCH_SPOTS = [0, 1, 2, 3].map(i => [TRAYS.x - 0.42, TRAYS.y + 0.75 + i * 0.72]); // four places at the sorting bench, outside the fence, facing the yard
const CRATES = { x: M(14.9) - 1.6, y: M(16.0), w: 1.6, d: 0.8 };               // the diner counter, close to the heater, with open floor between it and the build fund
const FUND = { x: M(17.6), y: M(17.45) };                                      // the build fund: a column in the bottom corner of the plaza, past the diner
const FUND_SPOTS = [[FUND.x - 0.95, FUND.y - 0.1], [FUND.x - 0.95, FUND.y + 0.35], [FUND.x + 0.95, FUND.y - 0.1], [FUND.x + 0.95, FUND.y + 0.35]]; // where a cat stands to give: either side of the column
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
  trays:  { label: 'the scrapyard',   spot: me => { const taken = cats.filter(c => c !== me && c.act === 'salvage').map(c => [c.tx, c.ty]); const free = BENCH_SPOTS.filter(q => !taken.some(t => Math.hypot(t[0] - q[0], t[1] - q[1]) < 0.3)); return free.length ? pick(free) : pick(BENCH_SPOTS); } },
  loft:   { label: 'the bunks',       spot: () => [rand(LOFT.x + 0.4, LOFT.x + 1.7), rand(LOFT.y + 0.4, LOFT.y + 0.9)] },
  exchange: { label: 'the exchange',  spot: me => { const taken = cats.filter(c => c !== me && (c.act === 'sell' || c.act === 'buy')).map(c => [c.tx, c.ty]); const free = EXC_SPOTS.filter(q => !taken.some(t => Math.hypot(t[0] - q[0], t[1] - q[1]) < 0.2)); const q = pick(free.length ? free : EXC_SPOTS); return [q[0], q[1]]; } },
  casino:   { label: 'the casino',    spot: me => { const taken = cats.filter(c => c !== me && c.act === 'gamble').map(c => [c.tx, c.ty]); const free = CASINO_SPOTS.filter(q => !taken.some(t => Math.hypot(t[0] - q[0], t[1] - q[1]) < 0.2)); const q = pick(free.length ? free : CASINO_SPOTS); return [q[0], q[1]]; } },
  arena:    { label: 'the arena',     spot: () => [rand(ARENA.x - 0.3, ARENA.x + 0.3), rand(ARENA.y - 0.3, ARENA.y + 0.3)] },
  lab:      { label: 'the lab',       spot: me => { const taken = cats.filter(c => c !== me && c.act === 'work' && JOBS[c.job].st === 'lab').map(c => [c.tx, c.ty]); const free = LAB_CONSOLES.filter(q => !taken.some(t => Math.hypot(t[0] - q[0], t[1] - q[1]) < 0.2)); const q = pick(free.length ? free : LAB_CONSOLES); return [q[0], q[1]]; } },
  yard:     { label: 'the yard',      spot: () => [rand(YARD.x + 0.4, YARD.x + YARD.w - 0.4), rand(YARD.y + 0.4, YARD.y + YARD.d - 0.4)] },
  fund:     { label: 'the build fund', spot: me => { const taken = cats.filter(c => c !== me && c.act === 'donate').map(c => [c.tx, c.ty]); const free = FUND_SPOTS.filter(q => !taken.some(t => Math.hypot(t[0] - q[0], t[1] - q[1]) < 0.3)); return free.length ? pick(free) : pick(FUND_SPOTS); } },
};
const LABELS = [['vault', VAULT.x, VAULT.y, 2.2], ['yard', YARD.x + YARD.w / 2, YARD.y + YARD.d / 2, 2.0], ['lab', LAB.x, LAB.y, 3.2], ['fridge', FRIDGE.x, FRIDGE.y, 3.4], ['cryo', CRY.x, CRY.y, 5.4], ['crates', CRATES.x + 0.8, CRATES.y + 0.4, 2.6], ['vent', VENT.x + 0.7, VENT.y + 0.4, 1.9], ['trays', TRAYS.x + 0.3, TRAYS.y + 1.6, 1.5], ['loft', LOFT.x + 1.0, LOFT.y + 0.55, 3.4], ['exchange', EXC.x, EXC.y, 2.4], ['casino', CASINO.x, CASINO.y, 2.4], ['arena', ARENA.x, ARENA.y, 1.6], ['bazaar', BAZ.x + 1.5, BAZ.y + 0.4, 2.2], ['fund', FUND.x, FUND.y, 2.6]];
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
  { x: VAULT.x - 0.7, y: VAULT.y - 0.7, w: 1.4, d: 1.4 },      // treasury
  { x: FUND.x - 0.42, y: FUND.y - 0.42, w: 0.84, d: 0.84 },    // the build fund column
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
const SUPPLY = 1e9; const catAlloc = () => (Number(CONFIG.START_QCATS) > 0 ? Number(CONFIG.START_QCATS) : 10000); // the stack each cat starts with; set in the brain's admin when the treasury hands it out
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
const UNLOCK_MC = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // every cat is in the box from day one
const STAGES = [
  { key: 'launch', title: 'Launch', mc: 0, blurb: 'Ten cats, the lab, the exchange. They run quantum jobs for a cut of the creator fees and trade.' },
  { key: 'cats', title: 'The cats', mc: 0, mcEnd: 0, blurb: 'All ten cats are in the box from day one.' },
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
  { key: 'collar',  name: 'a red collar',   price: 0.05, stock: 3 },
  { key: 'bow',     name: 'a pink bow',     price: 0.05, stock: 3 },
  { key: 'bandana', name: 'a bandana',      price: 0.055, stock: 3 },
  { key: 'scarf',   name: 'a scarf',        price: 0.065, stock: 3 },
  { key: 'beanie',  name: 'a beanie',       price: 0.07, stock: 3 },
  { key: 'shades',  name: 'shades',         price: 0.08, stock: 3 },
  { key: 'tophat',  name: 'a top hat',      price: 0.12, stock: 2 },
  { key: 'chain',   name: 'a gold chain',   price: 0.14, stock: 2 },
  { key: 'flower',  name: 'a flower',       price: 0.06, stock: 3 },
  { key: 'party',   name: 'a party hat',    price: 0.07, stock: 3 },
  { key: 'monocle', name: 'a monocle',      price: 0.09, stock: 3 },
  { key: 'goggles', name: 'goggles',        price: 0.095, stock: 3 },
  { key: 'cowboy',  name: 'a cowboy hat',   price: 0.11, stock: 3 },
  { key: 'cape',    name: 'a red cape',     price: 0.16, stock: 2 },
  { key: 'visor',   name: 'a cyber visor',  price: 0.18, stock: 2 },
  { key: 'bell',    name: 'a bell collar',  price: 0.055, stock: 3 },
  { key: 'glasses', name: 'round glasses',  price: 0.08, stock: 3 },
  { key: 'bucket',  name: 'a bucket hat',   price: 0.085, stock: 3 },
  { key: 'tie',     name: 'a necktie',      price: 0.09, stock: 3 },
  { key: 'phones',  name: 'headphones',     price: 0.13, stock: 2 },
  { key: 'crown',   name: 'a tiny crown',   price: 0.24, stock: 2 },
  { key: 'wings',   name: 'little wings',   price: 0.28, stock: 2 },
  { key: 'halo',    name: 'a halo',         price: 0.32, stock: 2 },
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
    [ARENA.x, ARENA.y, ARENA.r + 0.6], ...EXC_SPOTS.map(q => [q[0], q[1], 0.8]), ...CASINO_SPOTS.map(q => [q[0], q[1], 0.8]), [VENT.x + 0.83, VENT.y + 0.65, 1.1], [TRAYS.x - 0.75, TRAYS.y + 1.85, 2.1], [LOFT.x + 1.05, LOFT.y + 0.65, 1.4],
    [YARD.x + YARD.w / 2, YARD.y + YARD.d / 2, 1.9], [FRIDGE.x + 0.9, FRIDGE.y + 1.1, 1.4], [VAULT.x, VAULT.y, 1.3], [FUND.x, FUND.y, 1.5],
    [CRY.x - 3.6, CRY.y - 3.6, 1.4], // the bit of floor the countdown over the beacon hangs in front of on screen, so nothing hides behind the clock
    [DOCK.x, DOCK.y, 1.1],
  ];
  for (const [px, py, r] of placeSpots) if (Math.hypot(x - px, y - py) < r) return true;
  return false;
}
function floorSpot() { return wanderSpot(); }
const DEST_LABEL = { bin: 'the bin', trays: 'the scrapyard', bazaar: 'the shop', fridge: 'the fridge' };
const board = { tasks: [], done: [], seq: 0, next: 0, badge: null, badgeCool: 0, scrap: [], scrapDone: [], scrapNext: 0, scrapSeq: 0 }; // badge: the one thing a viewer can flag right now; scrap: the salvage jobs on the yard's bench
// ---------- the scrapyard: old quantum hardware washes up at the harbour and ends up here; the cats strip it for parts the lab can use, and the treasury pays them in $QCATS from its own supply ----------
const SCRAP_JOBS = [ // title, tier, what comes out of it
  ['strip a dead cryostat for its cables', 2, 'two hundred metres of coax and a working pump'], ['sort a crate of unlabelled qubit boards', 1, 'eleven boards, four of them alive'], ['recover an amplifier from a drowned rack', 2, 'one HEMT amplifier, tested cold'],
  ['untangle a mile of coax', 1, 'coax, coiled and labelled'], ['test a tray of Josephson junctions', 3, 'a tray of junctions, three in ten good'], ['rebuild one readout board from two broken ones', 3, 'one readout board, eight channels'],
  ['salvage the magnetic shielding off a fridge can', 2, 'mu-metal, enough for one can'], ['log a pallet of parts into the book', 1, 'forty-two lines in the inventory'], ['strip the gold off a dead chip carrier', 2, 'a gram of gold and a story'],
  ['pull the sapphire window out of a wrecked cryostat', 3, 'one sapphire window, uncracked'], ['sort the attenuators by value', 1, 'a drawer of attenuators, 10 to 60 dB'], ['reclaim the helium lines from the old fridge', 2, 'copper line, flushed and capped'],
  ['scrape a flux-trapped chip clean', 2, 'one chip, three resonators still ringing'], ['rewind a dead solenoid', 3, 'a solenoid that holds a field'], ['bag the broken ferrite isolators', 1, 'a bag of isolators, labelled broken'],
  ['dismantle a crashed drone for its battery', 1, 'one battery, one motor, a lesson'], ['weigh in a crate of lead bricks', 1, 'lead, for the shielding'], ['recover a working mixing-chamber plate', 3, 'the plate a whole fridge sits on'],
  ['sort the SMA connectors from the fakes', 1, 'two hundred connectors, half of them real'], ['test a spool of superconducting wire', 2, 'niobium-titanium, good to nine kelvin'], ['pull the circulators out of a flooded line', 2, 'four circulators, two still isolate'],
  ['strip a wrecked control rack for its DACs', 3, 'sixteen channels of arbitrary waveform, somehow fine'], ['sort a bucket of mixed cryogenic bolts', 1, 'bolts, by size, brass and steel apart'], ['clean a tray of sample holders', 1, 'twelve holders, gold still bright'],
  ['recover the window from a dead laser head', 2, 'one window, one lesson about dust'], ['salvage a turbo pump off the quay', 3, 'a pump that spins, for now'],
];
// a salvage job pays a dollar of $QCATS at the chart price (tier 2 two and a half, tier 3 five), times the price multiplier, never more than a tenth of the treasury's supply
const SCRAP_USD = [0, 1, 2.5, 5], scrapPayUsd = tier => SCRAP_USD[tier] * priceMul();
const scrapPay = tier => { const per = mkt.price * (Number(CONFIG.SOL_USD) || 150); if (!(per > 0)) return 0; let n = Math.round(scrapPayUsd(tier) / per); if (qcatPool() > 0) n = Math.min(n, Math.floor(qcatPool() * 0.1)); return Math.max(1, n); };
const qcatPool = () => (stats.qcatPool || 0), qcatLive = () => CONFIG.QCAT_LIVE === true; // the treasury's own $QCATS: a pretend pile while the box runs on its own, the real balance once the brain reads it
function stepScrap() {
  if (!board.scrap) { board.scrap = []; board.scrapDone = []; }
  if (board.scrap.length < 4 && T >= (board.scrapNext || 0)) {
    const [title, tier, out] = pick(SCRAP_JOBS);
    if (!board.scrap.some(j => j.title === title)) board.scrap.push({ id: 'S' + (++board.scrapSeq), title, tier, out, pay: scrapPay(tier), dur: 45 + tier * 30, posted: T, t: clock(simMin), status: 'open', by: null });
    board.scrapNext = T + rand(300, 720);
  }
}
const scrapFor = c => (board.scrap || []).filter(j => j.status === 'open' && qualifies(c, j));
function releaseScrap(c) { if (!c || !c.scrapJob) return; const j = (board.scrap || []).find(x => x.id === c.scrapJob); if (j && j.by === c.name && j.status === 'taken') { j.status = 'open'; j.by = null; } c.scrapJob = null; }
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
  releaseScrap(c);
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
const snapCat = c => ({ earned: c.earned, qi: c.qiEarned || 0, jobs: c.qjobs || 0, tasks: c.tasks || 0, sold: c.sold, bought: c.bought, spent: c.upkeep || 0, meetings: c.meetings || 0, lvl: c.lvl || 1, xp: c.xp || 0 });
function dayStart() {
  for (const k of Object.keys(PLACES)) placeDay[k] = { visits: 0, spent: 0 }; restock(); diner.sold = 0;
  dayCur = { day: dayNo(), startT: T, tre0: liveTreasurySol(), fees0: stats.fees, wages0: stats.wages, upkeep0: stats.upkeep, sold0: stats.sold, bought0: stats.boughtBack, jobs0: stats.circuits, mcapStart: mcapUsd(), meeting: { held: false, at: '', lines: [] }, events: [], tasks: [], cats0: {} };
  for (const c of cats) dayCur.cats0[c.name] = snapCat(c);
}
const liveTreasurySol = () => stats.treasury; // the treasury as the box knows it (set from the wallet by the brain in the real modes)
function recapOf(d, final) {
  const perCat = {};
  for (const c of cats) { const a = d.cats0[c.name] || snapCat(c), b = snapCat(c); perCat[c.name] = { earned: b.earned - a.earned, jobs: b.jobs - a.jobs, tasks: b.tasks - a.tasks, sold: b.sold - a.sold, bought: b.bought - a.bought, spent: b.spent - a.spent, meetings: b.meetings - a.meetings, lvlFrom: a.lvl, lvlTo: b.lvl, xp: b.xp - a.xp }; }
  const names = Object.keys(perCat), by = f => names.slice().sort((p, q) => f(perCat[q]) - f(perCat[p]))[0];
  return { day: d.day, final: !!final, fees: stats.fees - d.fees0, gained: liveTreasurySol() - (d.tre0 != null ? d.tre0 : liveTreasurySol()), wages: stats.wages - d.wages0, upkeep: stats.upkeep - d.upkeep0, sold: stats.sold - d.sold0, bought: stats.boughtBack - d.bought0, jobs: stats.circuits - d.jobs0, tasks: d.tasks.length, mcapStart: d.mcapStart, mcapEnd: mcapUsd(), treasuryEnd: stats.treasury, meeting: d.meeting, events: d.events.slice(-80), tasksDone: d.tasks.slice(-60), cats: perCat, topWorker: names.length ? by(x => x.jobs + x.tasks) : null, topEarner: names.length ? by(x => x.earned) : null };
}
function dayEnd() {
  if (!dayCur) return; const r = recapOf(dayCur, true); days.unshift(r); if (days.length > 14) days.pop();
  log(`Day ${dayCur.day} is over. Recap: treasury ${r.gained >= 0 ? '+' : ''}${fmtSol(r.gained)} SOL, ${fmtSol(r.wages)} SOL paid out, ${r.jobs} job${r.jobs === 1 ? '' : 's'} run, ${r.tasks} thing${r.tasks === 1 ? '' : 's'} dealt with${r.topWorker ? ', ' + r.topWorker + ' worked hardest' : ''}${r.topEarner ? ', ' + r.topEarner + ' earned most' : ''}. The full recap is on the Recap page.`, 'link');
  if (dayEndHook) { try { dayEndHook(r, meetingContext()); } catch (_) {} }
  else setLesson(pick([
    `day ${r.day}: treasury ${r.gained >= 0 ? '+' : ''}${fmtSol(r.gained)} SOL, ${fmtSol(r.wages)} SOL paid out, ${r.jobs} job${r.jobs === 1 ? '' : 's'} run, ${r.tasks} thing${r.tasks === 1 ? '' : 's'} dealt with${r.topEarner ? ', ' + r.topEarner + ' earned most' : ''}`,
    `day ${r.day}: ${r.events.filter(e => e.kind === 'faint').length} faint${r.events.filter(e => e.kind === 'faint').length === 1 ? '' : 's'}, ${r.events.filter(e => e.kind === 'decohere').length} decoherence${r.events.filter(e => e.kind === 'decohere').length === 1 ? '' : 's'}${r.events.some(e => e.kind === 'theft') ? ', somebody robbed the bunks' : ''}${r.topWorker ? ', ' + r.topWorker + ' worked hardest' : ''}`,
  ]));
  dayStart();
}
function stepDay() { if (!dayCur) dayStart(); else if (dayNo() !== dayCur.day) dayEnd(); }
function recordEvent(kind, text) { if (!dayCur) dayStart(); dayCur.events.push({ t: clock(simMin), kind, text }); if (dayCur.events.length > 160) dayCur.events.shift(); }
const itemsFor = c => ITEMS.filter(it => !(c.items || []).includes(it.key) && (shop.stock[it.key] == null || shop.stock[it.key] > 0) && spare(c) >= costOf(it.price, c) * 1.3);
const ACTS = {
  eat:      { st: 'crates',   dur: 50,   verb: 'eating at the diner',          walk: 'heading to the diner',          color: '247,200,106', name: 'eat' },
  salvage:  { st: 'trays',    dur: 90,   verb: 'salvaging in the scrapyard',  walk: 'heading to the scrapyard',      color: '154,123,255', name: 'salvage' },
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
  donate:   { st: 'fund',     dur: 30,   verb: 'putting SOL in the build fund',  walk: 'heading to the build fund',        color: '92,255,170', name: 'give' },
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
  if (c.notes && c.notes.length && Math.random() < 0.5) pool.push(pick(LAB_CHATS).map(l => fillTalk(l, c, p)));
  if (Math.random() < 0.5) pool.push(pick(CHATS_MORE).map(l => fillTalk(l, c, p)));
  if ((c.acts || []).length && Math.random() < 0.4) pool.push(pick(DAY_CHATS).map(l => fillTalk(l, c, p)));
  if (Math.random() < 0.35) { const f = pick(QFACTS); pool.push([f[1], pick(MEET_FACT_REACT), pick(['it is on the ladder', 'topic ' + (CURRICULUM.findIndex(t => t[0] === f[0]) + 1), 'the simulator showed me', 'read the note'])]); }
  return pool.length && Math.random() < 0.85 ? pick(pool) : pick(CHATS);
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
// prices, in SOL, before the chart multiplier. FOOD is the cheapest thing on the menu; the menu itself is below.
const FOOD = 0.01, CRYO = 0.01, WARM_MAX = 0.1, WARM_MAX_MIN = 15, BUNK = 0, ARENA_FEE = 0.005, PLAY = 0.04, RESERVE = 0.02;
const MENU = [
  { key: 'tin',     name: 'a tin of sardines',  price: 0.01,  fill: 0.30, stock: 20 },
  { key: 'head',    name: 'a fish head',        price: 0.02,  fill: 0.38, stock: 16 },
  { key: 'kibble',  name: 'a bowl of kibble',   price: 0.03,  fill: 0.45, stock: 16 },
  { key: 'milk',    name: 'a saucer of milk',   price: 0.03,  fill: 0.25, warm: 0.3, stock: 12 },
  { key: 'tuna',    name: 'tuna, the good tin', price: 0.04,  fill: 0.55, stock: 10 },
  { key: 'chicken', name: 'roast chicken',      price: 0.06,  fill: 0.75, stock: 8 },
  { key: 'salmon',  name: 'a salmon fillet',    price: 0.08,  fill: 0.90, coh: 0.1, stock: 6 },
  { key: 'whole',   name: 'the whole fish',     price: 0.1,   fill: 1.00, coh: 0.15, xp: 6, stock: 3 },
];
const WARM_SESSIONS = [3, 5, 10, 15]; // minutes at the heater; the price is pro rata of 0.1 SOL for the full fifteen
const warmCost = (min, c) => costOf(WARM_MAX * min / WARM_MAX_MIN, c);
const diner = { stock: {} }, shop = { stock: {} };
function restock() { for (const m of MENU) diner.stock[m.key] = m.stock; for (const it of ITEMS) shop.stock[it.key] = Math.min(it.stock || 3, (shop.stock[it.key] == null ? (it.stock || 3) : shop.stock[it.key]) + 1); }
function menuFor(c) { return MENU.filter(m => (diner.stock[m.key] || 0) > 0 && c.sol >= costOf(m.price, c)); } // what it can afford that is in stock
function pickFood(c) { // the hungriest buy the most filling thing they can afford; the greedy buy the cheapest; the vain buy the dearest
  const opts = menuFor(c); if (!opts.length) return null;
  if (c.trait === 'greedy') return opts[0];
  if ((c.vanity || 1) > 1.3 && c.sol > costOf(0.2, c)) return opts[opts.length - 1];
  const need = clamp(c.hunger + 0.1); const fit = opts.filter(m => m.fill >= need); return fit.length ? fit[0] : opts[opts.length - 1];
}
// while there is no coin yet the treasury is a simulated fee pool that pays every job; once the coin is live, SOL only moves when the operator distributes
const feePool = () => CONFIG.SIMULATE_FEES !== false;
// gas: every cat keeps a reserve of SOL that only pays network fees. It is never spent on living, and when it runs low the treasury tops it up.
const GAS_FLOOR = 0.001, GAS_MIN = 0.0005, TX_FEE = 0.000005; // no gas rule: a cat may spend everything it has. The 0.001 is Solana's own rent minimum, below which a wallet cannot go.
const spendGas = c => { c.gas = Math.max(0, (c.gas == null ? GAS_FLOOR : c.gas) - TX_FEE); };
// $QI: what the lab pays. Paid per job out of the lab's pool while the box runs on its own; once the real $QI wallet is wired in, jobs only earn a share of the next payout.
const QI = '$QI';
// payroll: every half hour, a cat with no SOL left (it cannot afford a meal) gets back what it spent since the last payroll, from the treasury; a cat with SOL in paw gets nothing
let payrollNext = 1800;
const payrollSpent = c => Math.max(0, (c.upkeep || 0) - (c.payrollMark || 0)), payrollDue = c => c.sol < costOf(FOOD, c) && payrollSpent(c) > 0; // who the next payroll would pay, as things stand
function stepPayroll() {
  if (T < payrollNext) return; payrollNext = T + 1800;
  for (const c of cats) {
    const spent = payrollSpent(c), due = payrollDue(c); c.payrollMark = c.upkeep || 0;
    if (!due) continue;
    let pay = Math.min(spent, stats.treasury * 0.2); if (testFlat() && pay > 0) pay = Math.min(testFlat(), stats.treasury);
    pay = Math.floor(pay * 1e6) / 1e6; if (pay < 0.0005) continue;
    if (feePool()) stats.treasury -= pay; payCat(c, pay, 0, 'payroll: half an hour of work', 'vault');
  }
}
const labPayMin = () => (Number(CONFIG.LAB_PAY_MIN_USD) > 0 ? Number(CONFIG.LAB_PAY_MIN_USD) : 5) * priceMul(), labPayMax = () => (Number(CONFIG.LAB_PAY_MAX_USD) > 0 ? Number(CONFIG.LAB_PAY_MAX_USD) : 15) * priceMul(); // a filled bar pays between these, in dollars' worth of $QI; the admin's figures are for x1 and follow the price multiplier
const qiUsd = () => qiSol() * (Number(CONFIG.SOL_USD) || 150); // dollars per $QI, from the chart once it is wired in
const qcatUsd = () => (mkt.pinned && mkt.price > 0 ? mkt.price * (Number(CONFIG.SOL_USD) || 0) : 0); // dollars per $QCATS from the chart; 0 until there is one
const usdOf = (n, perUnit) => (perUnit > 0 ? '$' + (n * perUnit).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
const qcatWorth = n => { const u = usdOf(n, qcatUsd()); return u ? `${u} of ${TK} (${fmtQ(n)} now)` : `${fmtQ(n)} ${TK}`; }; // '$0.75 of $QCATS (25.0K now)', or just the count before the chart is read
const qiFor = usd => Math.max(1, Math.round(usd / Math.max(1e-12, qiUsd()))); // how many $QI that many dollars is right now
const qiPerJob = () => qiFor((labPayMin() + labPayMax()) / 2);
// payouts: a cat is paid the moment its work is done — SOL for a chore, $QI for a lab task. In the box that is instant; in the real modes it is a
// transfer from the treasury, and the box shows it (the float, the ledger row, the log line) only once the signature is back.
const payouts = { n: 0, log: [], last: 0, unpaid: [] }; // unpaid: real payouts that failed to send, retried every ten minutes
function payCat(c, sol, qi, memo, place) {
  sol = Math.round(Math.max(0, sol || 0) * 1e6) / 1e6; qi = Math.round(Math.max(0, qi || 0)); if (!sol && !qi) return;
  if (liveTx()) { queueIntent({ type: sol > 0 ? 'wage' : 'qi', cat: c.name, sol, qi, memo, place: place || 'vault' }); return; }
  paid(c, sol, qi, null, memo);
}
function paid(c, sol, qi, sig, memo) {
  sol = Math.max(0, sol || 0); qi = Math.max(0, qi || 0); if (!sol && !qi) return;
  if (sol) { c.sol += sol; c.earned += sol; stats.wages += sol; txWith(c, 'wage', '+' + fmtSol(sol) + ' SOL', memo || 'chore', sig); floatText(c, '+' + fmtSol(sol) + ' SOL', '#F7C86A'); }
  if (qi) { c.qi += qi; c.qiEarned += qi; stats.qiPaid += qi; placeStats.lab.qi = (placeStats.lab.qi || 0) + qi; txWith(c, 'qi', '+' + fmtQi(qi) + ' ' + QI, memo || 'lab', sig); floatText(c, '+' + fmtQi(qi) + ' ' + QI, '#C4B2FF'); }
  payFX(c); payouts.n++; payouts.last = T;
  payouts.log.unshift({ t: clock(simMin), day: dayNo(), at: T, name: c.name, sol, qi, memo: memo || '', sig: sig || null }); if (payouts.log.length > 300) payouts.log.length = 300;
  if (Math.random() < 0.15) say(c, pick(['paid', 'the treasury came through', 'that is my cut', 'wages in', QI + ' in']));
}
function payQcat(c, q, memo) {
  q = Math.round(Math.max(0, q || 0)); if (!q) return;
  if (!qcatLive()) stats.qcatPool = Math.max(0, (stats.qcatPool || 0) - q);
  if (liveTx()) { queueIntent({ type: 'qcat', cat: c.name, q, memo, place: 'trays' }); return; }
  paidQcat(c, q, null, memo);
}
function paidQcat(c, q, sig, memo) {
  q = Math.max(0, q || 0); if (!q) return;
  c.qcat += q; c.qcatEarned = (c.qcatEarned || 0) + q; stats.qcatPaid = (stats.qcatPaid || 0) + q; placeStats.trays.paid = (placeStats.trays.paid || 0) + q;
  txWith(c, 'scrap', '+' + fmtQ(q) + ' ' + TK, memo || 'salvage', sig); floatText(c, '+' + fmtQ(q) + ' ' + TK, '#5CFFAA'); payFX(c);
  payouts.n++; payouts.last = T; payouts.log.unshift({ t: clock(simMin), day: dayNo(), at: T, name: c.name, sol: 0, qi: 0, qcat: q, memo: memo || '', sig: sig || null }); if (payouts.log.length > 300) payouts.log.length = 300;
}
function retryUnpaid() { const n = payouts.unpaid.length; if (!n || !liveTx()) return 0; const list = payouts.unpaid.splice(0, n); for (const u of list) queueIntent({ type: u.sol > 0 ? 'wage' : u.qcat > 0 ? 'qcat' : 'qi', cat: u.cat, sol: u.sol, qi: u.qi, q: u.qcat, memo: u.memo, place: u.place, retry: (u.retry || 0) + 1 }); return n; }
let unpaidNext = 0;
function stepPayout() { if (!payouts.unpaid.length || T < unpaidNext) return; unpaidNext = T + 600; retryUnpaid(); }
const txWith = (c, type, amount, note, sig) => { tx(c, type, amount, note); if (sig) txs[0].sig = sig; };
const qiSol = () => (mkt.qiSol > 0 ? mkt.qiSol : Number(CONFIG.QI_SOL) > 0 ? Number(CONFIG.QI_SOL) : 1.3e-5); // about $0.002 a $QI at $150 SOL, where the chart sat on 11 Oct 2026; the real chart replaces it once the mint is set // SOL per $QI, from the chart once it is wired in
const qiLive = () => CONFIG.QI_LIVE === true; // the real $QI wallet is being read: nothing moves until a payout
const fmtQi = n => fmtQ(n);
// when something happened, as the box tells time: the day it was, and how many real minutes of that day were left (a box day is one hour)
const whenLabel = e => { let left; if (e.at != null) left = Math.max(0, Math.ceil((DAY_SECS - (e.at % DAY_SECS)) / 60)); else if (e.t) { const [h, m] = String(e.t).split(':').map(Number); left = Math.max(0, Math.ceil((1440 - (h * 60 + m)) / 24)); } else left = 0; return (e.day ? 'day ' + e.day : 'today') + ' \u00b7 ' + left + ' min left'; };
const SELL_QI = { degen: 0.95, greedy: 0.9, patient: 0.75, loyal: 0.5 }; // how readily each personality parts with its $QI when broke; the rest hold and sell a slice of $QCATS instead
// a cat can see what its stack is worth at the chart, and sells a quarter, half, three quarters or all of it depending on how it feels
const tokSol = tok => (tok === QI ? qiSol() : mkt.price) * 0.99; // SOL per token, after the exchange's cut
const stackOf = (c, tok) => (tok === QI ? c.qi : c.qcat) || 0, stackSol = (c, tok) => stackOf(c, tok) * tokSol(tok);
const FRAC_WORD = { 0.25: 'a quarter of its stack', 0.5: 'half its stack', 0.75: 'three quarters of its stack', 1: 'its whole stack' };
function sellFrac(c) { // how much of the stack goes, by feeling: starving sells everything, broke sells by hunger, panic by nerve, profit by greed, a pump a slice, the itch a quarter
  const meal = costOf(FOOD, c), broke = c.sol < meal * 4;
  if (c.forced === 'sell') return 0.25;
  if (broke) return c.hunger > 0.9 ? 1 : c.hunger > 0.6 ? 0.75 : 0.5;
  if (c.tr.panic && mkt.mom < -0.004) return { degen: 1, greedy: 0.75, patient: 0.5, loyal: 0.25 }[c.trait] || 0.5;
  if (c.tr.tp && mkt.price > c.entry * c.tr.tp) return { degen: 0.75, greedy: 0.75, patient: 0.5, loyal: 0.25 }[c.trait] || 0.5;
  if (mkt.mom > 0.002) return c.trait === 'degen' ? 0.5 : 0.25;
  return 0.25;
}
// survival gets dearer as the chart climbs: x1 at the starting cap, x4 at 16x, x8 at 64x, capped at x40
const priceMul = () => (Number(CONFIG.PRICE_MUL) > 0 ? Number(CONFIG.PRICE_MUL) : 1); // every price in the box times this; set by hand in the brain's admin (x1 by default)
const liveTx = () => CONFIG.LIVE_TX === true; // set by the brain once it is executing for real
const isPaused = () => CONFIG.PAUSED === true, PAUSE_OK = new Set(['idle', 'sleep', 'entangle', 'meet']); // transactions paused from the admin: no money moves and no wages, the cats just hang about, needs stand still
const testFlat = () => (Number(CONFIG.TEST_FLAT) > 0 ? Number(CONFIG.TEST_FLAT) : 0); // the brain's 'default testing' mode: every price in the box is this flat amount of SOL
const costOf = (base, c) => testFlat() ? (base > 0 ? testFlat() : 0) : base * priceMul() * (c ? 1 - 0.04 * Math.min(9, (c.lvl || 1) - 1) : 1);
const spare = c => Math.max(0, c.sol - costOf(RESERVE, c));
// pace: in the real modes a cat makes one paid move (a meal, the heater, a spin, a trade…) every so many minutes, so the chain is not hammered and the day reads at a human speed. Off in the box on its own.
const PAID_ACTS = new Set(['eat', 'recohere', 'warm', 'buy', 'sell', 'wager', 'gamble', 'play', 'shop', 'donate']);
const paceSec = () => (liveTx() ? (Number(CONFIG.PACE_MIN) >= 0 ? Number(CONFIG.PACE_MIN) : 6) * 60 : 0);
const paced = (c, act) => PAID_ACTS.has(act) && paceSec() > 0 && T - (c.lastPaidT || -1e9) < paceSec() && !(act === 'eat' && c.hunger > 0.85); // a starving cat still eats
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
  const before = c.lvl || 1; const r = gainXp0(c, n); if ((c.lvl || 1) > before) c.lvlT = T; return r;
}
function gainXp0(c, n) {
  c.xp = (c.xp || 0) + n * rand(0.7, 1.3); const nl = lvlOf(c.xp);
  if (nl > (c.lvl || 1)) {
    c.lvl = nl; burst(c, '247,200,106', 26); ringFX(c.x, c.y, '247,200,106', 1.5); floatText(c, 'level ' + nl, '#F7C86A'); did(c, `hit level ${nl}: ${LVL_TITLE[nl - 1]}`);
    log(`${c.name} hit level ${nl}: ${lvlTitle(c)}. Survival costs it ${4 * (nl - 1)}% less now.`, 'gain'); recordEvent('level', `${c.name} hit level ${nl}: ${lvlTitle(c)}`); remember(c, `made level ${nl}, ${lvlTitle(c)}`);
    say(c, pick(['levelled', 'getting good at this', 'level ' + nl + '. noted', 'the box respects me now']));
  }
}
// trading: a cat trades when it feels like it, not only when it is broke. The trait sets the itch, the chart nudges it, cooldowns keep it to a few trades a day. Only $QI and $QCATS, ever.
const TRADE_ITCH = { degen: 1.0, greedy: 0.8, patient: 0.4, loyal: 0.25 };
const tradeItch = c => (TRADE_ITCH[c.trait] || 0.5) * clamp((T - Math.max(c.lastSellT || -1e9, c.lastBuyT || -1e9)) / 5400); // builds back over an hour and a half
function sellTok(c) { // what a selling cat parts with: a forced choice (testing), else whatever it holds, else by trait; diamond paws keeps its $QCATS unless starving
  if (c.forceTok) return c.forceTok === 'qi' ? QI : TK;
  const hasQi = (c.qi || 0) >= 1, hasQc = (c.qcat || 0) >= 1; if (!hasQi && !hasQc) return null; if (!hasQi) return TK; if (!hasQc) return QI;
  const starving = c.sol < costOf(FOOD, c) && c.hunger > 0.9; if (c.trait === 'loyal' && !starving) return QI;
  return Math.random() < (SELL_QI[c.trait] || 0.5) ? QI : TK;
}
function buyTok(c) { if (c.forceTok) return c.forceTok === 'qi' ? QI : TK; if (c.trait === 'loyal') return TK; return Math.random() < ({ degen: 0.5, greedy: 0.5, patient: 0.4 }[c.trait] || 0.4) ? QI : TK; }
const shortOfSol = c => c.sol < costOf(FOOD, c) * 4;
// what an act costs to start, so a cat never sets off for something it cannot pay for (forced trips from the admin puppet are let through)
function canAfford(c, act) {
  if (c.forced === act) return true;
  switch (act) {
    case 'eat': return menuFor(c).length > 0;
    case 'recohere': return c.sol >= costOf(CRYO, c);
    case 'warm': return c.sol >= warmCost(3, c);
    case 'play': return c.sol >= costOf(PLAY, c);
    case 'gamble': return c.sol >= costOf(FOOD, c) * 12;
    case 'wager': return c.sol > costOf(FOOD, c) * 2 + 0.01;
    case 'shop': return itemsFor(c).length > 0;
    case 'donate': return spare(c) >= costOf(0.03, c);
    default: return true;
  }
}
const workToDo = c => tasksFor(c).length > 0 || scrapFor(c).length > 0; // something on the ground or on the yard bench it qualifies for
function sellUrge(c) {
  if (!((c.qi || 0) >= 1 || (c.qcat || 0) >= 1)) return 0;
  if (c.forced === 'sell') return 1.5;
  const meal = costOf(FOOD, c), qiVal = stackSol(c, QI), qcVal = stackSol(c, TK);
  let w = 0;
  // needs SOL: only when what it holds is worth a couple of meals, and not straight after the last top-up (selling dust feeds nobody)
  const work = workToDo(c); // short of SOL with work about: do the work first; the exchange is the last resort, not the first
  if (c.sol < meal * 4 && !work && T > (c.topupT || 0) && T > (c.brokeCool || 0) && (qiVal > meal * 2 || qcVal > meal * 2)) w = 0.6 + c.hunger * 0.5;
  if (c.sol < meal && c.hunger > 0.9 && !(work && c.hunger < 0.97) && (qiVal > meal || qcVal > meal)) w = Math.max(w, 1.1); // even diamond paws eats; past starving, work can wait
  if (T < (c.sellCool || 0)) return w; // recently sold: sit on the rest for a while
  if (c.tr.tp && mkt.price > c.entry * c.tr.tp) w = Math.max(w, 0.7);
  if (c.tr.panic && mkt.mom < -0.004) w = Math.max(w, 0.62);
  w = Math.max(w, 0.38 * tradeItch(c) + (mkt.mom > 0.002 ? 0.12 : 0)); // the itch: a sliver now and then, chart or no chart
  return w;
}
const anyoneAsleep = c => cats.some(o => o !== c && asleep(o));
const DRIVES = [
  { act: 'eat',      label: 'hungry',                   w: c => c.hunger * 1.25 * (menuFor(c).length ? 1 : 0) }, // nothing it can pay for: it does not go and stare at the menu
  { act: 'salvage',  label: c => (c.hunger > 0.6 && c.sol < costOf(FOOD, c) ? 'broke and hungry' : scrapFor(c).length ? 'a job on the yard bench, paid in ' + TK : 'nothing on the bench'), w: c => (scrapFor(c).length ? 0.32 + 0.12 * (c.trait === 'greedy' || c.trait === 'loyal' ? 1 : 0) + 0.1 * Math.min(2, skillLvl(skillOf(c, 'salvage'))) + (qcatPool() >= scrapPay(1) ? 0.2 : 0) : 0) * (c.ethic || 1) * (c.coh < 0.35 ? 0.3 : 1) + (c.hunger > 0.6 && c.sol < costOf(FOOD, c) ? 0.5 + c.hunger * 0.6 : 0) + (shortOfSol(c) && scrapFor(c).length && !tasksFor(c).length ? 0.5 : 0) },
  { act: 'recohere', label: 'decohering',               w: c => (1 - c.coh) * 1.3 * (c.sol >= costOf(CRYO, c) ? 1 : 0) },
  { act: 'warm',     label: 'cold',                     w: c => c.cold * 0.95 * (c.sol >= warmCost(3, c) ? 1 : 0) },
  { act: 'work',     label: c => (c.sol < costOf(FOOD, c) * 3 ? 'needs SOL' : 'feels like working'), w: c => (c.coh < 0.4 ? 0.2 : 1) * (clamp(1 - c.sol / (0.004 * priceMul())) * 0.9 + 0.3) * c.ethic * (c.tr.label === 'momentum ape' ? rand(0.3, 1.7) : 1) },
  { act: 'buy',      label: c => (mkt.mom < -0.002 ? 'buying the dip' : 'feels like buying'), w: c => c.forced === 'buy' ? 1.5 : (T < (c.buyCool || 0) ? 0 : 1) * (spare(c) > 0 ? 0.22 + 0.4 * clamp(spare(c) / 0.05) : 0) * c.tr.eager * (0.5 + tradeItch(c)) * (1 + (c.tr.dip ? -mkt.mom * 40 * c.tr.dip : mkt.mom * 40)) },
  { act: 'sell',     label: c => (c.sol < costOf(FOOD, c) * 4 && !workToDo(c) ? 'short of SOL and nothing to do: selling' : c.sol < costOf(FOOD, c) && c.hunger > 0.5 ? 'broke, selling to eat' : c.tr.panic && mkt.mom < -0.004 ? 'chart is dumping' : c.tr.tp && mkt.price > c.entry * c.tr.tp ? 'taking profit' : 'selling a quarter'), w: c => sellUrge(c) },
  { act: 'steal',    label: 'light paws',               w: c => (c.sol < costOf(FOOD, c) * 2 ? 0.55 : 0.16) * c.tr.sneak * (anyoneAsleep(c) ? 1 : 0.15) },
  { act: 'scrap',    label: 'has a grudge',             w: c => c.grudge * 0.95 },
  { act: 'wager',    label: 'feeling lucky',            w: c => (c.sol > costOf(FOOD, c) * 2 + 0.01 ? 1 : 0) * (0.06 + 0.26 * c.tr.gamble) * (c.qcat > 5000 ? 1 : 0.1) * (mkt.mom > 0.001 ? 1.25 : 1) * (T - (c.wagerT || -1e9) > 900 ? 1 : 0.25) },
  { act: 'gamble',   label: 'feeling lucky',            w: c => (0.2 + 0.4 * c.tr.gamble) * (c.sol > costOf(FOOD, c) * 12 ? 1 : 0) * (T - (c.casinoT || -1e9) > 1200 ? 1 : 0.08) }, // only a cat with a few meals in hand; a degen feels it most
  { act: 'entangle', label: 'wants company',            w: c => c.lonely * 0.85 * c.tr.social },
  { act: 'idle',     label: () => (wx.rain + wx.snow > 0.3 ? 'caught in the weather' : 'nothing urgent'), w: () => 0.2 + wx.rain * 0.4 + wx.snow * 0.35 },
  { act: 'sleep',    label: 'tired',                    w: c => Math.pow(c.tired, 2.2) * 1.1 },
  { act: 'play',     label: 'wants to play',            w: c => (0.42 + c.lonely * 0.4) * c.tr.social * (c.sol > costOf(PLAY, c) * 3 ? 1 : 0) * (T - (c.playT || -1e9) > 900 ? 1 : 0.25) },
  { act: 'task',     label: c => (tasksFor(c).some(t => t.called != null && T - t.called < 180) ? 'somebody flagged something' : 'something wants doing'), w: c => { const ts = tasksFor(c); return ts.length ? (c.coh < 0.4 ? 0.2 : 1) * (0.42 + 0.12 * Math.max(...ts.map(t => t.tier)) + (shortOfSol(c) ? 0.6 : 0)) * c.ethic * (ts.some(t => t.called != null && T - t.called < 180) ? 1.8 : 1) : 0; } },
  { act: 'donate',   label: c => (fundOpen() ? 'the fund is full' : 'feels like giving'), w: c => (fundOpen() || (liveTx() && !fundLive()) || T < (c.donateCool || 0) || c.hunger > 0.6 || spare(c) < costOf(0.03, c) ? 0 : (0.3 + 0.33 * clamp(spare(c) / 0.05)) * ({ loyal: 1.5, patient: 1.15, degen: 0.85, greedy: 0.5 }[c.trait] || 1) * (c.ethic || 1)) },
  { act: 'shop',     label: 'feeling flush',            w: c => itemsFor(c).length ? (0.3 + 0.25 * (c.vanity || 1)) * (1 - (c.items || []).length / ITEMS.length) * (T - (c.shopT || -1e9) > 2400 ? 1 : 0.08) : 0 },
];
const TH = {
  eat: ['the diner smells like sardines', 'food first, then the lab', 'could eat a whole fish'],
  salvage: ['parts for the lab. paid in the coin.', 'the yard bench, then the lab', 'somebody has to strip the cryostat', 'coax by the mile', 'the gantry is free', 'tier three on the bench. mine.'],
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

const fmtSol = v => { const n = Number(v) || 0; return n !== 0 && Math.abs(n) < 0.01 ? n.toFixed(3) : n.toFixed(2); }; // x.xx everywhere; under 0.01 SOL three places (0.009 to 0.001), never more
const fmtQ = v => (v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e4 ? (v / 1e3).toFixed(1) + 'K' : Math.round(v).toLocaleString('en-US'));
const fmtUsd = v => (v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : v >= 1e5 ? '$' + Math.round(v / 1e3) + 'K' : v >= 1e4 ? '$' + (v / 1e3).toFixed(1) + 'K' : v >= 1e3 ? '$' + (v / 1e3).toFixed(2) + 'K' : '$' + Math.round(v));
const mcapUsd = () => mkt.price * SUPPLY * CONFIG.SOL_USD;
const fmtPrice = () => fmtUsd(mcapUsd()) + ' MC';
const fmtKeys = v => (v >= 1e12 ? (v / 1e12).toFixed(2) + 'T' : v >= 1e9 ? (v / 1e9).toFixed(1) + 'G' : v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.round(v).toLocaleString('en-US'));
const PLACES = {
  cryo:     { title: 'The circle',    kind: 'where the box meets',                 pt: [CRY.x, CRY.y], stats: ['here', 'spent', 'visits'], desc: 'The meeting is the last ten minutes of every day. Recohering out here costs ' + fmtSol(CRYO) + ' SOL.' },
  crates:   { title: 'The diner',     kind: 'food · paid to the treasury',          pt: [CRATES.x + 0.8, CRATES.y + 1.2], stats: ['spent', 'here', 'visits'], desc: '' },
  vent:     { title: 'The heater',    kind: 'warmth · by the minute',               pt: [VENT.x + 0.7, VENT.y + 0.5], stats: ['spent', 'here', 'visits'], desc: '' },
  trays:    { title: 'The scrapyard', kind: 'salvage jobs \u00b7 paid in ' + TK,        pt: [TRAYS.x + TRAYS.w / 2, TRAYS.y + TRAYS.d / 2], stats: ['here', 'jobs', 'qcat'], desc: 'Old quantum hardware washes up at the harbour and ends up here: dead cryostats, coax by the mile, boards nobody labelled. Jobs go up on the bench; a cat takes one, strips it for parts the lab can use, and the treasury pays it in ' + TK + ' from its own supply the moment it is done.' },
  exchange: { title: 'The exchange', kind: 'where cats sell $QI or ' + TK + ' for SOL, and buy', pt: [EXC.x + 0.5, EXC.y], stats: ['here', 'sells', 'visits'], desc: '' },
  casino:   { title: 'The casino',    kind: 'the house is the treasury',            pt: [CASINO.x + 0.5, CASINO.y], stats: ['here', 'wagered', 'spent'], desc: '' },
  arena:    { title: 'The arena',     kind: 'wagers in SOL · entry ' + fmtSol(ARENA_FEE) + ' SOL', pt: [ARENA.x, ARENA.y], stats: ['spent', 'here', 'wagered'], desc: '' },
  loft:     { title: 'The bunks',     kind: 'free',                                 pt: [LOFT.x + 1.0, LOFT.y + 0.55], stats: ['here', 'visits', 'stolen'], desc: '' },
  lab:      { title: 'The lab',       kind: 'quantum jobs · pays $QI',              pt: [LAB.x, LAB.y + LAB.d / 2 + 0.4], stats: ['here', 'circuits', 'qi'], desc: '' },
  bazaar:   { title: 'The shop',      kind: 'things to wear · paid to the treasury', pt: [BAZ.x + 1.5, BAZ.y + 1.0], stats: ['spent', 'here', 'items'], desc: '' },
  yard:     { title: 'The yard',      kind: 'play · ' + fmtSol(PLAY) + ' SOL a visit', pt: [YARD.x + YARD.w / 2, YARD.y + YARD.d / 2], stats: ['spent', 'here', 'visits'], desc: '' },
  vault:    { title: 'The treasury',  kind: 'where the fees land',                  pt: [VAULT.x, VAULT.y], stats: ['fees', 'wages', 'qipaid'], desc: '' },
  fund:     { title: 'The build fund', kind: 'SOL from the cats \u00b7 opens the boarded-up buildings', pt: [FUND.x, FUND.y], stats: ['raised', 'goal', 'givers'], desc: 'Two buildings on the block are still boarded up. The cats put a little of their own SOL in the column when they can spare it \u2014 it goes to the fund wallet, every lamport on-chain \u2014 and when the column reaches the goal the hoardings come down and the buildings open. Giving earns a cat a little experience.' },
};
const placeStats = {}, placeLogs = {}, placeDay = {};
for (const k of Object.keys(PLACES)) { placeStats[k] = { paid: 0, spent: 0, visits: 0, found: 0, stolen: 0, bought: 0, buysol: 0, wagered: 0, circuits: 0, keys: 0, jobs: 0 }; placeLogs[k] = []; }
let insMode = 'stray', placeKey = null, hoverLabel = null, remote = null;
const labelHits = [], taskHits = []; let hoverTask = null, badgeId = null; const flaggedAt = {}; // id -> when this viewer flagged it
const stationOf = c => c.act === 'work' ? JOBS[c.job].st : c.act === 'task' ? (c.taskPlace || null) : (ACTS[c.act] ? ACTS[c.act].st : null);
const asleep = c => c.state === 'act' && c.act === 'sleep';
const onSeat = c => c.state === 'act' && (c.act === 'eat' || c.act === 'meet' || c.act === 'work' || c.act === 'task' || c.act === 'salvage' || c.act === 'donate');
const hereAt = k => cats.filter(c => c.state === 'act' && stationOf(c) === k);

const cats = [];
const stats = { circuits: 0, labSol: 0, qiPool: 500000000, qcatPool: 500000, qcatPaid: 0, salvaged: 0, fundSol: 0, fundOpened: 0, escrow: 0, qiPaid: 0, qiSold: 0, qiSellSol: 0, gasPaid: 0, keys: 0, huntSol: 0, huntShifts: 0, lastJob: null, treasury: rand(0.004, 0.012), fees: 0, wages: 0, upkeep: 0, buySol: 0, boughtBack: 0, buys: 0, sold: 0, sellSol: 0, sells: 0, stolen: 0, lostPool: 0, low: false, lastTrade: null };
const P0 = CONFIG.START_MC_USD / CONFIG.SOL_USD / SUPPLY; // SOL per token at the starting market cap
const mkt = { price: P0, p0: P0, hist: [], mom: 0, acc: 0, nextMove: rand(180, 400), last: 0, pinned: false }; // pinned: the chart follows the real market cap, so the cats' own trades don't move it
const txs = [];
let uid = 0, simMin = 0, T = 0; // the clock starts at midnight and a box day is one real hour, so the day number and the clock agree
let selId = null, hoverId = null, userPickT = -1e9, lastAutoT = 0;
const byId = id => id == null ? null : cats.find(c => c.id === id) || null;
const DAY_SECS = 3600; // one day in the box lasts a real hour
const dayNo = () => Math.floor(T / DAY_SECS) + 1;
const clock = m => { m = ((Math.floor(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };
function tx(c, type, amount, note) { const e = { t: clock(simMin), at: T, cat: c ? c.name : 'the box', type, amount, note: note || '', day: dayNo() }; txs.unshift(e); if (txs.length > 60) txs.pop(); if (c) { c.hist.unshift(e); if (c.hist.length > 40) c.hist.pop(); } }

function makeCat(i) {
  const [name, job, trait] = ROSTER[i], coat = COATS[i % COATS.length];
  const sp = ST[pick(Object.keys(ST))].spot();
  return {
    id: ++uid, name, job, trait, tr: TRAITS[trait], coat: coat.c, eye: coat.e, dark: !!coat.d,
    x: sp[0], y: sp[1], tx: sp[0], ty: sp[1], face: Math.random() < 0.5 ? 1 : -1,
    sol: 0.1, gas: GAS_FLOOR, qi: 0, qiEarned: 0, qiSold: 0, qiSellSol: 0, twork: 0, qcat: catAlloc(), earned: 0, xp: 0, lvl: 1, meetings: 0, hist: [], said: [], bought: 0, solSpent: 0, stole: 0, robbed: 0, found: 0, buys: 0, sells: 0, sold: 0, sellSol: 0, entry: mkt.price, sellCool: 0, arenaNet: 0, arenaSol: 0, arenaW: 0, arenaL: 0, arrived: false, released: T,
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
    case 'salvage': { const j = (board.scrap || []).find(x => x.id === c.scrapJob) || scrapFor(c)[0]; return j ? `${j.title} is on the bench, tier ${j.tier}, ${fmtQ(j.pay)} ${TK} on it` : 'something on the yard bench'; }
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
// fills the slots in a line of talk from what the cat has actually done
function fillTalk(line, c, p) {
  const r = c.lastRun || { nq: 3, bits: '000', shots: 1024, extra: {} }, x = r.extra || {}, n = c.notes && c.notes[0], last = research.find(e => e.kind === 'problem' && e.cat === c.name);
  const idx = topicIdx(c), topic = CURRICULUM[idx][1], acts = (c.acts || []).filter(a => !/^picked a goal/.test(a.text)), a1 = acts[0] ? acts[0].text : 'nothing yet', a2 = acts[1] ? acts[1].text : 'and that was it';
  line = line.replace(/\{act1\}/g, a1).replace(/\{act2\}/g, a2);
  return line.replace(/\{mode\}/g, '|' + r.bits + '⟩').replace(/\{nq\}/g, r.nq).replace(/\{shots\}/g, (r.shots || 1024).toLocaleString('en-US')).replace(/\{ladder\}/g, idx + 1).replace(/\{topic\}/g, topic)
    .replace(/\{note\}/g, n ? n.text : 'nothing I can repeat yet').replace(/\{q\}/g, last ? last.q : 'the order of 7 mod 15').replace(/\{a\}/g, last ? last.a : '4').replace(/\{fidelity\}/g, x.fidelity != null ? x.fidelity : 97).replace(/\{heavy\}/g, x.heavy != null ? x.heavy : 70)
    .replace(/\{bunk\}/g, fmtSol(costOf(BUNK, c))).replace(/\{lvl\}/g, c.lvl || 1).replace(/\{title\}/g, lvlTitle(c)).replace(/\{fees\}/g, fmtSol(stats.fees)).replace(/\{why\}/g, c.grudgeWhy || 'you know what you did').replace(/\{lesson\}/g, lessons[0] ? lessons[0].text : 'nothing, apparently')
    .replace(/\{lost\}/g, fmtQ(stats.lostPool)).replace(/\{qi\}/g, fmtQi(c.qi || 0)).replace(/\{p\}/g, p ? p.name : 'you');
}
function thought(c, act, p) {
  if (act === 'work' && Math.random() < 0.25) return pick(QFACTS)[1];
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
    if (act === 'sell') own.push(`${fmtQ(c.qcat)} ${TK} left. selling a quarter.`);
    if (act === 'task') own.push(`${board.tasks.length} things out there and I am the one going`);
    if (c.memory && c.memory.length) own.push(`still thinking about how I ${c.memory[0].text}`);
    if (c.grudgeOn) own.push(`${(byId(c.grudgeOn) || {}).name || 'somebody'} is going to hear about it`);
    if (own.length) return pick(own);
  }
  return fillTalk(pick(TH[act] || TH.idle), c, p);
}
function decide(c) {
  releaseTask(c); // whatever it was holding goes back on the board if it never finished it
  const crowd = act => { const st = act === 'work' ? JOBS[c.job].st : ACTS[act].st; if (!st) return 1; const n = cats.filter(o => o !== c && !asleep(o) && (stationOf(o) === st || (o.state === 'walk' && o.act !== 'wager' && (o.act === 'work' ? JOBS[o.job].st : ACTS[o.act].st) === st))).length; return 1 / (1 + 0.7 * Math.max(0, n - 1)); };
  const ws = DRIVES.map(d => ({ act: d.act, label: typeof d.label === 'function' ? d.label(c) : d.label, w: clamp(d.w(c) * crowd(d.act) + rand(-0.06, 0.06), 0, 1.5) }));
  ws.sort((a, b) => b.w - a.w);
  let ch = null, partner = null;
  for (const o of ws) {
    if (o.act === 'scrap' || o.act === 'entangle' || o.act === 'wager') { partner = findPartner(c, o.act); if (!partner) continue; }
    if (isPaused() && !PAUSE_OK.has(o.act)) continue; // paused: nothing that moves money or earns it
    if (paced(c, o.act)) continue;
    if (o.act === 'buy' && c.forced !== 'buy' && spare(c) < (testFlat() || 0.006)) continue;
    if (!canAfford(c, o.act)) continue; // it knows what things cost: no trips to the diner, the heater, the beacon, the yard or the casino with an empty wallet
    if (o.act === 'shop' && !itemsFor(c).length) continue;
    if (o.act === 'task' && !tasksFor(c).length) continue;
    if (o.act === 'salvage' && !scrapFor(c).length && !(c.hunger > 0.6 && c.sol < costOf(FOOD, c))) continue;
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
  if (ch.act === 'salvage') { const j = scrapFor(c).sort((a, b) => b.tier - a.tier)[0]; if (j) { j.status = 'taken'; j.by = c.name; j.taken = T; c.scrapJob = j.id; c.because = `${j.title}: tier ${j.tier}, ${fmtQ(j.pay)} ${TK} on it`; } else c.because = 'broke and hungry; the yard sometimes has something'; }
  const key = ch.act === 'work' ? JOBS[c.job].st : ACTS[ch.act].st;
  const sp = ST[key].spot(c);
  c.tx = sp[0]; c.ty = sp[1]; c.state = 'walk'; c.slide = 0; c.stuckP = null; c.stuckN = 0;
  c.doing = ch.act === 'work' ? `heading to ${ST[key].label}` : ACTS[ch.act].walk;
}
// testing: the operator sends a cat to a place and it does the thing, pacing and urges be damned. 'wake' and 'sleep' as named.
function puppet(name, act, opt = {}) {
  const c = cats.find(x => x.name === name); if (!c) return 'no such cat';
  if (act === 'wake') { if (!asleep(c)) return c.name + ' is already awake'; wake(c, 'the operator'); return c.name + ' is up'; }
  if (c.act === 'meet' && meeting.on) return c.name + ' is in the meeting; try after it';
  if (!ACTS[act] && act !== 'work' && act !== 'task') return 'no such thing to do: ' + act;
  releaseTask(c); if (asleep(c)) wake(c, 'the operator'); c.partner = null; c.initiator = false;
  c.forced = act === 'buy' || act === 'sell' ? act : null; c.forceTok = opt.tok || null;
  if (act === 'wager' || act === 'scrap' || act === 'entangle') {
    const p = pick(cats.filter(o => o !== c && !asleep(o) && o.act !== 'meet' && o.act !== 'wager')); if (!p) return 'nobody free to pair with';
    c.act = act; c.actT = 0; c.because = 'the operator pointed'; c.thought = pick(['fine. going.', 'orders', 'who is steering me']);
    if (act === 'wager') { c.partner = p.id; c.initiator = true; c.state = 'walk'; c.arrived = false; c.tx = ARENA.slots[0][0]; c.ty = ARENA.slots[0][1]; c.doing = `heading to the arena to wager ${p.name}`; releaseTask(p); p.partner = c.id; p.initiator = false; p.state = 'walk'; p.act = 'wager'; p.arrived = false; p.tx = ARENA.slots[1][0]; p.ty = ARENA.slots[1][1]; p.doing = `heading to the arena to take ${c.name}’s bet`; return `${c.name} is off to the arena with ${p.name}`; }
    c.partner = p.id; c.initiator = true; c.state = 'walk'; c.doing = (act === 'scrap' ? 'going after ' : 'looking for ') + p.name; c.tx = p.x; c.ty = p.y; return `${c.name} is off to find ${p.name}`;
  }
  if (act === 'task') { const t = tasksFor(c).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0]; if (!t) return 'nothing on the ground it qualifies for'; t.status = 'taken'; t.by = c.name; t.taken = T; c.task = t.id; c.taskPlace = 'plaza'; c.act = 'task'; c.actT = 0; c.because = 'the operator pointed'; c.doing = `heading for ${t.title}`; c.tx = t.x; c.ty = t.y; c.state = 'walk'; c.slide = 0; c.stuckP = null; c.stuckN = 0; return `${c.name} is off to deal with ${t.title}`; }
  if (act === 'salvage') { const j = scrapFor(c).sort((a, b) => b.tier - a.tier)[0]; if (!j) return 'nothing on the yard bench it qualifies for'; j.status = 'taken'; j.by = c.name; j.taken = T; c.scrapJob = j.id; }
  c.act = act; c.actT = 0; c.because = 'the operator pointed'; c.thought = pick(['fine. going.', 'orders are orders', 'who is steering me', 'as the brain wishes']); c.weighed = [{ act, label: 'sent by the operator', w: 1.5, win: true }];
  const key = act === 'work' ? JOBS[c.job].st : ACTS[act].st, sp = ST[key].spot(c);
  c.tx = sp[0]; c.ty = sp[1]; c.state = 'walk'; c.slide = 0; c.stuckP = null; c.stuckN = 0; c.doing = act === 'work' ? `heading to ${ST[key].label}` : ACTS[act].walk;
  log(`${c.name} was sent ${c.doing.replace(/^heading /, '')} by the operator.`, 'info', key);
  return `${c.name}: ${c.doing}`;
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
  else if (c.act === 'salvage') { c.face = 1; const j = (board.scrap || []).find(x => x.id === c.scrapJob); if (!j) { c.actDur = 40; c.doing = 'going through the crates'; } else { c.actDur = j.dur; c.doing = `at the bench: ${j.title}`; placeStats.trays.visits++; (placeDay.trays || (placeDay.trays = { visits: 0, spent: 0 })).visits++; } }
  else if (c.act === 'task') { const t = board.tasks.find(x => x.id === c.task); if (!t) { c.actDur = 1; c.doing = 'looking around'; } else if (t.carry && t.status === 'taken') { c.actDur = 2.5; c.doing = `picking up ${t.title}`; } else if (t.carry) { c.actDur = 2.5; c.doing = `dropping ${t.title} at ${DEST_LABEL[t.carry]}`; } else { c.actDur = t.dur / (1 + 0.08 * skillLvl(skillOf(c, 'tasks'))); c.doing = `dealing with ${t.title}`; } }
  else { c.actDur = ACTS[c.act].dur; c.doing = ACTS[c.act].verb; }
  if (c.act === 'warm') { // pick a session by how cold it is and what it can pay for, pay up front, and stay for the whole thing
    const want = c.cold > 0.9 ? 15 : c.cold > 0.75 ? 10 : c.cold > 0.5 ? 5 : 3; const ok = WARM_SESSIONS.filter(m => m <= want && c.sol >= warmCost(m, c) + costOf(FOOD, c) * 2); const min = ok.length ? ok[ok.length - 1] : 3; // never the last of its money: it keeps two meals back
    c.warmMin = min; c.actDur = min * 60; spend(c, warmCost(min, c), 'vent', `${min} minutes at the heater`); c.doing = `${min} minutes at the heater`; placeStats.vent.sessions = (placeStats.vent.sessions || 0) + 1; placeStats.vent.minutes = (placeStats.vent.minutes || 0) + min;
  }
  if (c.act === 'sleep') { c.actDur = c.fainted ? rand(120, 200) : rand(1080, 1320); c.fainted = false; placeStats.loft.visits++; (placeDay.loft || (placeDay.loft = { visits: 0, spent: 0 })).visits++; if (BUNK > 0) spend(c, costOf(BUNK, c), 'loft', 'a bunk for the night'); if (Math.random() < 0.5) log(`${c.name} climbed into the bunks to sleep`, 'info', 'loft'); }
  if (c.act === 'idle' && wx.rain + wx.snow > 0.3) c.doing = `sheltering in a box from the ${wx.snow > wx.rain ? 'snow' : 'rain'}`;
  if ((c.act === 'warm' || c.act === 'eat') && Math.random() < 0.2) {
    const o = cats.find(o => o !== c && o.state === 'act' && o.act === c.act);
    if (o) { c.grudge = Math.min(1, c.grudge + 0.75); c.grudgeOn = o.id; c.grudgeWhy = `${o.name} took its spot at ${c.act === 'warm' ? 'the heater' : 'the diner'}`; log(`${c.name} has a grudge against ${o.name} now`, 'info', c.act === 'warm' ? 'vent' : 'crates'); }
  }
}
function endPair(a, b) { for (const k of [a, b]) { if (!k) continue; k.partner = null; k.initiator = false; k.state = 'pause'; k.pauseT = rand(2, 6); } }
function wake(c, why) { if (!asleep(c)) return; c.state = 'pause'; c.pauseT = 0.5; c.tired = clamp(c.tired - 0.4); c.doing = 'woke up'; c.because = why; }
// the exchange. In the box a trade is instant at the chart price. In the real modes it is a Jupiter swap from the cat's own wallet: what it
// puts in is set aside until the swap lands, then the real amounts are booked and shown; if the swap fails nothing changed and nothing was shown.
function trade(c, dir, tok, sol, q, why) {
  sol = r6(sol); if (tok === QI) q = Math.round(q); if (sol <= 0 || q <= 0) return;
  c.lastPaidT = T;
  if (liveTx()) {
    if (dir === 'buy') c.sol -= sol; else if (tok === QI) c.qi -= q; else c.qcat -= q;
    queueIntent({ type: 'swap', cat: c.name, dir, tok: tok === QI ? 'qi' : 'qcats', sol, q, memo: `${dir === 'buy' ? 'buying' : 'selling'} ${tok}${why ? ' ' + why : ''}`, place: 'exchange', why });
    return;
  }
  applyTrade(c, dir, tok, sol, q, why, null);
}
function applyTrade(c, dir, tok, sol, q, why, sig) {
  const isQi = tok === QI, fq = isQi ? fmtQi : fmtQ;
  placeStats.exchange.visits++; stats.lastTrade = { name: c.name, side: dir === 'buy' ? 'bought' : 'sold', sol, q, t: T, tok };
  if (dir === 'buy') {
    c.sol -= sol; c.solSpent += sol; c.buys++; stats.buys++; placeStats.exchange.buysol += sol;
    if (isQi) { c.qi += q; c.qiBought = (c.qiBought || 0) + q; stats.qiBought = (stats.qiBought || 0) + q; stats.qiBuySol = (stats.qiBuySol || 0) + sol; }
    else { c.entry = (c.entry * c.qcat + sol) / (c.qcat + q); c.qcat += q; c.bought += q; stats.buySol += sol; stats.boughtBack += q; placeStats.exchange.bought += q; if (!mkt.pinned && !sig) mkt.price *= 1 + sol / (mkt.price * SUPPLY * 0.35); }
    floatText(c, '+' + fq(q) + ' ' + tok, isQi ? '#C4B2FF' : '#5CFFAA'); buyFX(c); gainXp(c, isQi ? 3 : 4 + Math.min(14, q / catAlloc() * 100));
    log(`${c.name} bought ${fq(q)} ${tok} for ${fmtSol(sol)} SOL at the exchange`, 'gain', 'exchange'); txWith(c, 'buy', '+' + fq(q) + ' ' + tok, fmtSol(sol) + ' SOL', sig); did(c, `bought ${fq(q)} ${tok} for ${fmtSol(sol)} SOL`); recordEvent('buy', `${c.name} bought ${fq(q)} ${tok} for ${fmtSol(sol)} SOL`);
  } else {
    c.sol += sol; c.sells++; stats.sells++;
    if (isQi) { c.qi = Math.max(0, c.qi - q); c.qiSold += q; c.qiSellSol += sol; stats.qiSold += q; stats.qiSellSol += sol; }
    else { c.qcat = Math.max(0, c.qcat - q); c.sold += q; c.sellSol += sol; stats.sold += q; stats.sellSol += sol; if (!mkt.pinned && !sig) { mkt.price *= 1 - sol / (mkt.price * SUPPLY * 0.35); mkt.mom -= 0.0005; } }
    floatText(c, '-' + fq(q) + ' ' + tok, isQi ? '#C4B2FF' : '#FF7878'); ringFX(EXC.x, EXC.y, isQi ? '196,178,255' : '255,120,120', 1.1); gainXp(c, 2);
    log(`${c.name} sold ${fq(q)} ${tok} for ${fmtSol(sol)} SOL ${why || ''}`.trim(), 'loss', 'exchange'); txWith(c, 'sell', '-' + fq(q) + ' ' + tok, '+' + fmtSol(sol) + ' SOL', sig); did(c, `sold ${fq(q)} ${tok} for ${fmtSol(sol)} SOL ${why || ''}`.trim()); recordEvent('sell', `${c.name} sold ${fq(q)} ${tok} for ${fmtSol(sol)} SOL ${why || ''}`.trim());
  }
}
// ---------- the build fund: the cats put SOL toward the boarded-up buildings; at the goal, the hoardings come down ----------
const fundGoal = () => (Number(CONFIG.FUND_GOAL) > 0 ? Number(CONFIG.FUND_GOAL) : 2.5);
const fundSol = () => (stats.fundSol || 0), fundOpen = () => fundSol() >= fundGoal() || !!stats.fundOpened, fundLive = () => !!CONFIG.FUND_LIVE; // FUND_LIVE: the brain has a fund wallet to read (set the moment it reports a balance)
function give(c, amt) {
  const cost = Math.min(c.sol, amt); if (!(cost > 0)) return;
  c.sol -= cost; c.donated = (c.donated || 0) + cost; c.lastPaidT = T; placeStats.fund.visits++; (placeDay.fund || (placeDay.fund = { visits: 0, spent: 0 })).visits++;
  placeStats.fund.spent += cost; if (!liveTx()) stats.fundSol = (stats.fundSol || 0) + cost; // in the box the column fills at once; for real, it moves when the brain reads the fund wallet after the transfer lands
  gainXp(c, 8 + Math.round(cost * 600)); // a bit of XP for giving: 0.02 SOL is worth twenty
  showOrQueue({ type: 'donate', cat: c.name, sol: r6(cost), memo: 'the build fund', place: 'fund' }, [{ f: 'tx', cat: c.name, type: 'gave', amount: '-' + fmtSol(cost) + ' SOL', note: 'the build fund' }, { f: 'float', cat: c.name, text: '-' + fmtSol(cost) + ' SOL', color: '#5CFFAA' }, { f: 'coin', cat: c.name, amt: cost }, { f: 'log', text: `${c.name} put ${fmtSol(cost)} SOL in the build fund (${fmtSol(fundSol() + (liveTx() ? cost : 0))} of ${fmtSol(fundGoal())} SOL)`, kind: 'gain', place: 'fund' }]);
  did(c, `put ${fmtSol(cost)} SOL in the build fund`); recordEvent('fund', `${c.name} put ${fmtSol(cost)} SOL in the build fund`);
  if (Math.random() < 0.5) say(c, pick(['for the block', 'build it', 'my bit', 'open the doors', 'that is for the new wing']));
  checkFund();
}
function checkFund() { if (!stats.fundOpened && fundSol() >= fundGoal()) { stats.fundOpened = dayNo(); log(`The build fund reached ${fmtSol(fundGoal())} SOL. The hoardings come down: the boarded-up buildings open.`, 'gain', 'fund'); recordEvent('fund', 'the build fund hit its goal and the boarded-up buildings opened'); for (const c of cats) if (c.donated > 0) remember(c, 'helped fill the build fund; the buildings opened'); } }
function setFundSol(n) { if (typeof n === 'number' && n >= 0) { stats.fundSol = n; CONFIG.FUND_LIVE = true; checkFund(); } else if (n == null) CONFIG.FUND_LIVE = false; }
function spend(c, amt, place, what) {
  if (testFlat() && amt > 0) amt = testFlat();
  const cost = Math.min(c.sol, amt); c.sol -= cost; c.upkeep = (c.upkeep || 0) + cost; stats.upkeep += cost; if (feePool()) stats.treasury += cost; placeStats[place].spent += cost; placeStats[place].visits++; const pd = placeDay[place] || (placeDay[place] = { visits: 0, spent: 0 }); pd.visits++; pd.spent += cost;
  if (cost > 0) c.lastPaidT = T;
  if (cost > 0) showOrQueue({ type: 'pay', cat: c.name, sol: r6(cost), memo: what, place }, [{ f: 'tx', cat: c.name, type: 'spent', amount: '-' + fmtSol(cost) + ' SOL', note: what }, { f: 'float', cat: c.name, text: '-' + fmtSol(cost) + ' SOL', color: '#FF9ACB' }, { f: 'coin', cat: c.name, amt: cost }, { f: 'log', text: `${c.name} paid ${fmtSol(cost)} SOL for ${what} at ${ST[place].label} \u2192 treasury`, kind: 'info', place }]);
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
    // the lab pays $QI, not SOL: a fixed rate per job, more for bigger circuits and a practised cat. While the box runs on its own it pays
    // straight out of the lab's pool; once the real $QI wallet is wired in, jobs only build up a share of the next payout.
    // what the job is worth: between the minimum and the maximum, by circuit size (and a little more at higher levels); double during a lab surge
    placeStats[st].visits++; c.coh = clamp(c.coh - 0.06);
    const slipped = Math.random() < j.risk * (1 - c.coh * 0.5) / (1 + sk * 0.35); // a coherent cat makes fewer mistakes, and so does a practised one
    const run = runCircuit(j.kind, nq), bits = run.bits, job = 'q-' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0'); run.job = job; c.lastRun = run;
    goalEvent(c, { type: 'job', kind: j.kind, nq, slipped, run }); // the bar moves (or, on a slip, a streak bar resets)
    if (!slipped) {
      c.qjobs++; c.qwork += diff; c.qnq += nq; c.qmax = Math.max(c.qmax || 0, nq); learn(c, j.kind, 1); if (st === 'lab') { placeStats.lab.circuits++; stats.circuits++; stats.lastJob = { name: c.name, nq, bits, job, kind: j.kind, t: T, desc: run.desc }; }
      did(c, `ran a ${nq}-qubit ${j.kind} job (${job}) → |${bits}⟩`);
      gainXp(c, 3 + nq * 1.5);
      if (st === 'lab') studySession(c, run);
      const receipt = `${c.name} ran a ${nq}-qubit ${j.kind} job (${job}): ${run.desc}; ${run.shots.toLocaleString('en-US')} shots, most common result |${bits}\u27E9 at ${run.top[0] ? run.top[0].pct : 0}%.`;
      { const g = c.goal; log(`${receipt}${g && g.parts ? ' ' + g.title + ': ' + g.parts.map(pt => fmt(pt.prog) + '/' + fmt(pt.n) + ' ' + pt.label).join(', ') + '.' : ''}`, 'link', 'lab'); }
    } else { learn(c, j.kind, 0.5); log(`${c.name}: ${j.riskWhy} (${job}). No pay.`, 'loss', st); did(c, `a ${nq}-qubit ${j.kind} job failed (${job})`); }
  } else if (a === 'task') {
    const t = board.tasks.find(x => x.id === c.task);
    if (t && t.by === c.name && t.carry && t.status === 'taken') {
      // picked it up: now carry it to where it goes
      t.status = 'carried'; t.x = null; t.y = null; c.tx = t.dest[0]; c.ty = t.dest[1]; c.state = 'walk'; c.slide = 0; c.stuckP = null; c.stuckN = 0; c.doing = `carrying ${t.title} to ${DEST_LABEL[t.carry]}`; c.partner = null; return;
    }
    if (t && t.by === c.name && (t.status === 'taken' || t.status === 'carried')) {
      const sk = skillLvl(skillOf(c, 'tasks')), quantum = !!t.q;
      // a chore pays in meals: a tier-1 job two meals, tier 2 three and a half, tier 3 five (a quantum chore half as much again), plus any bounty on it; never more than a quarter of what the treasury holds
      let pay = costOf(FOOD) * [0, 2, 3.5, 5][t.tier] * (quantum ? 1.5 : 1) + Math.min(t.bounty, stats.treasury); pay = Math.max(0, Math.min(pay, stats.treasury * 0.25)); if (pay < 0.0005) pay = 0; if (testFlat() && pay > 0) pay = Math.min(testFlat(), stats.treasury); // the flat amount in testing
      const credit = (quantum ? 1.0 : 0.4) * t.tier;
      c.twork = (c.twork || 0) + credit; c.tasks = (c.tasks || 0) + 1; if (quantum) { c.qjobs++; c.qnq += 2 + t.tier * 2; } learn(c, 'tasks', 1); learn(c, quantum ? 'quantum tasks' : 'chores', 1);
      if (pay > 0) { if (feePool()) stats.treasury -= pay; c.taskPay = (c.taskPay || 0) + pay; payCat(c, pay, 0, t.title, 'vault'); }
      t.status = 'done'; t.doneBy = c.name; t.at = T; t.atClock = clock(simMin); t.pay = pay; t.tookMin = Math.round((T - (t.taken || T)) / 60);
      board.done.unshift(t); if (board.done.length > 40) board.done.pop(); board.tasks = board.tasks.filter(x => x !== t); c.task = null;
      if (dayCur) { dayCur.tasks.push({ t: t.atClock, by: c.name, title: t.title, tier: t.tier, pay }); }
      gainXp(c, 6 + 5 * t.tier + (quantum ? 3 : 0));
      log(`${c.name} dealt with ${t.title} (tier ${t.tier})${pay > 0 ? (liveTx() ? ': ' + fmtSol(pay) + ' SOL on its way from the treasury' : ' and was paid ' + fmtSol(pay) + ' SOL from the fee pool') : feePool() ? ', on the tab for the next payout' : ', logged for the next payout'}.`, quantum ? 'link' : 'gain');
      did(c, `dealt with ${t.title} (tier ${t.tier})` + (pay > 0 ? `, paid ${fmtSol(pay)} SOL` : ''));
      if (Math.random() < 0.5) say(c, pick(['done. next.', 'that one was mine', 'first one there', 'who leaves that lying around', 'easy tier ' + t.tier]));
    } else c.task = null;
  } else if (a === 'gamble') {
    // a slice of spare SOL on one spin against the house. The house is the treasury: losses go in, wins come out. The odds favour the house a little.
    const stake = testFlat() ? Math.min(c.sol, testFlat()) : Math.min(c.sol * 0.5, clamp(c.sol * rand(0.1, 0.25) * (c.tr.gamble > 1 ? 1.5 : 1), costOf(0.01), costOf(0.05))), jackpot = Math.random() < 0.08, won = jackpot || Math.random() < 0.42;
    c.casinoT = T; c.lastPaidT = T; placeStats.casino.visits++; placeStats.casino.wagered += stake;
    if (won) {
      const pay = Math.min(stake * (jackpot ? 3 : 1), feePool() ? stats.treasury * 0.1 : Infinity); // the winnings on top of the stake back
      c.sol += pay; c.casinoNet = (c.casinoNet || 0) + pay; if (feePool()) stats.treasury -= pay; c.casinoW = (c.casinoW || 0) + 1; placeStats.casino.paid += pay; if (!stats.casinoBestW || pay > stats.casinoBestW.sol) stats.casinoBestW = { name: c.name, sol: pay };
      burst(c, jackpot ? '247,200,106' : '255,79,174', jackpot ? 30 : 14); ringFX(CASINO.x, CASINO.y, '255,79,174', jackpot ? 2 : 1.2); gainXp(c, jackpot ? 20 : 8);
      showOrQueue({ type: 'win', cat: c.name, sol: r6(pay), memo: jackpot ? 'casino: three sevens' : 'casino: won a spin', place: 'casino' }, [{ f: 'float', cat: c.name, text: '+' + fmtSol(pay) + ' SOL', color: '#FFC850' }, { f: 'log', text: `${c.name} ${jackpot ? 'hit three sevens' : 'won a spin'} at the casino: +${fmtSol(pay)} SOL from the treasury`, kind: 'gain', place: 'casino' }, { f: 'tx', cat: c.name, type: 'casino', amount: '+' + fmtSol(pay) + ' SOL', note: jackpot ? 'three sevens' : 'won a spin' }]); did(c, `${jackpot ? 'hit the jackpot' : 'won a spin'} at the casino, +${fmtSol(pay)} SOL`); recordEvent('casino', `${c.name} ${jackpot ? 'hit three sevens' : 'won a spin'} at the casino for ${fmtSol(pay)} SOL`);
      say(c, pick(jackpot ? ['SEVENS', 'the reels love me', 'never leaving'] : ['one more', 'the house owes me anyway', 'easy', 'told you'])); if (jackpot) remember(c, `hit three sevens at the casino for ${fmtSol(pay)} SOL`);
    } else {
      c.sol -= stake; c.casinoNet = (c.casinoNet || 0) - stake; if (feePool()) stats.treasury += stake; placeStats.casino.spent += stake; stats.upkeep += stake; c.casinoL = (c.casinoL || 0) + 1; if (!stats.casinoBestL || stake > stats.casinoBestL.sol) stats.casinoBestL = { name: c.name, sol: stake }; gainXp(c, 2);
      showOrQueue({ type: 'pay', cat: c.name, sol: r6(stake), memo: 'casino: lost a spin', place: 'casino' }, [{ f: 'float', cat: c.name, text: '-' + fmtSol(stake) + ' SOL', color: '#FF9ACB' }, { f: 'coin', cat: c.name, amt: stake }, { f: 'log', text: `${c.name} lost ${fmtSol(stake)} SOL on a spin at the casino \u2192 treasury`, kind: 'loss', place: 'casino' }, { f: 'tx', cat: c.name, type: 'casino', amount: '-' + fmtSol(stake) + ' SOL', note: 'lost a spin' }]); did(c, `lost ${fmtSol(stake)} SOL at the casino`); recordEvent('casino', `${c.name} lost ${fmtSol(stake)} SOL at the casino`);
      if (Math.random() < 0.6) say(c, pick(['rigged', 'one more spin would have done it', 'the reels are cold', 'that was rent'])); if ((c.casinoL || 0) % 3 === 0) remember(c, `${c.casinoL} spins lost at the casino, ${fmtSol(Math.abs(c.casinoNet || 0))} SOL down`);
    }
  } else if (a === 'shop') {
    const opts = itemsFor(c);
    if (opts.length) {
      const it = (c.vanity || 1) > 1.1 ? opts[opts.length - 1] : pick(opts), cost = costOf(it.price, c);
      spend(c, cost, 'bazaar', it.name); if (!c.items) c.items = []; c.items.push(it.key); c.wearing = it.key; c.shopT = T; placeStats.bazaar.bought++; if (shop.stock[it.key] == null) shop.stock[it.key] = it.stock || 3; shop.stock[it.key]--;
      burst(c, '255,200,80', 16); gainXp(c, 4);
      log(`${c.name} bought ${it.name} at the shop for ${fmtSol(cost)} SOL`, 'gain', 'bazaar'); did(c, `bought ${it.name} at the shop for ${fmtSol(cost)} SOL`); recordEvent('shop', `${c.name} bought ${it.name} for ${fmtSol(cost)} SOL`);
      say(c, pick(['how do I look', 'worth it', 'it suits me', 'new look, same bag', 'drip']));
    } else log(`${c.name} browsed the shop and bought nothing`, 'info', 'bazaar');
  } else if (a === 'play') {
    spend(c, costOf(PLAY, c), 'yard', 'play time'); c.lonely = clamp(c.lonely - 0.35); c.coh = clamp(c.coh + 0.06); gainXp(c, 3); c.plays = (c.plays || 0) + 1; c.playT = T; did(c, 'played in the yard');
    if (Math.random() < 0.5) say(c, pick(['got it', 'the dot moved', 'one more', 'the yarn fought back', 'I was winning']));
    if (Math.random() < 0.4) log(`${c.name} chased the laser around the yard for a bit`, 'info', 'yard');
  } else if (a === 'eat') {
    const m = pickFood(c);
    if (!m) { log(`${c.name} looked at the menu and could not afford anything in stock`, 'info', 'crates'); placeStats.crates.visits++; (placeDay.crates || (placeDay.crates = { visits: 0, spent: 0 })).visits++; }
    else {
      const cost = costOf(m.price, c); spend(c, cost, 'crates', m.name); diner.stock[m.key]--; diner.sold = (diner.sold || 0) + 1; c.hunger = clamp(c.hunger - m.fill); if (m.warm) c.cold = clamp(c.cold - m.warm); if (m.coh) c.coh = clamp(c.coh + m.coh);
      c.lastAte = simMin; gainXp(c, 1 + (m.xp || 0)); c.meals = (c.meals || 0) + 1; c.lastMeal = m.name; did(c, `ate ${m.name} at the diner (${fmtSol(cost)} SOL)`);
      if (Math.random() < 0.4) log(`${c.name} had ${m.name} at the diner`, 'info', 'crates');
    }
  } else if (a === 'salvage') {
    const j = (board.scrap || []).find(x => x.id === c.scrapJob); c.scrapJob = null;
    if (!j) { if (c.hunger > 0.5 && Math.random() < 0.6) { c.hunger = 0.15; c.lastAte = simMin; c.meals = (c.meals || 0) + 1; did(c, 'found something to eat among the crates in the scrapyard'); if (Math.random() < 0.5) log(`${c.name} found something to eat in the scrapyard crates`, 'info', 'trays'); } else did(c, 'went through the yard and found nothing'); }
    else {
      const tier = j.tier, pay = qcatPool() >= j.pay ? j.pay : 0;
      j.status = 'done'; j.doneBy = c.name; j.at = T; j.atClock = clock(simMin); j.day = dayNo(); j.paid = pay; j.tookMin = Math.round((T - (j.taken || T)) / 60);
      board.scrapDone.unshift(j); if (board.scrapDone.length > 40) board.scrapDone.pop(); board.scrap = board.scrap.filter(x => x !== j);
      c.salvaged = (c.salvaged || 0) + 1; stats.salvaged = (stats.salvaged || 0) + 1; placeStats.trays.jobs = (placeStats.trays.jobs || 0) + 1; learn(c, 'salvage', 1); gainXp(c, 5 + 6 * tier); c.coh = clamp(c.coh - 0.03 * tier);
      did(c, `${j.title} in the scrapyard: ${j.out}` + (pay ? `, paid ${fmtQ(pay)} ${TK}` : ''));
      if (dayCur) dayCur.scrap = (dayCur.scrap || 0) + 1;
      log(`${c.name} ${j.title} (tier ${tier}): ${j.out}. ${pay ? `Paid ${fmtQ(pay)} ${TK} from the treasury${liveTx() ? ', on its way' : ''}.` : `The treasury holds no ${TK} to pay it with.`}`, pay ? 'gain' : 'info', 'trays');
      recordEvent('scrap', `${c.name} ${j.title} in the scrapyard${pay ? ' for ' + fmtQ(pay) + ' ' + TK : ''}`);
      if (Math.random() < 0.4) say(c, pick(['parts for the lab', 'that was alive. still is.', 'coax everywhere', 'paid in the coin. good.', 'the yard pays', 'one more crate']));
      if (pay > 0) payQcat(c, pay, j.title);
    }
  } else if (a === 'donate') {
    let amt = Math.min(spare(c) * rand(0.1, 0.3), 0.02); if (testFlat()) amt = Math.min(c.sol, testFlat()); amt = r6(amt);
    if (amt >= (testFlat() || 0.005)) { c.donateCool = T + rand(3600, 7200); give(c, amt); }
    else { c.donateCool = T + 1800; did(c, 'stood at the build fund with nothing to spare'); }
  } else if (a === 'recohere') {
    spend(c, costOf(CRYO, c), 'lab', 'cryo time'); c.coh = 1; gainXp(c, 1); did(c, 'recohered out in the open');
    if (Math.random() < 0.4) log(`${c.name} recohered under the circle`, 'link', 'cryo');
  } else if (a === 'warm') {
    c.cold = 0; gainXp(c, 1 + Math.round((c.warmMin || 3) / 5)); did(c, `${c.warmMin || 3} minutes at the heater`);
    if (Math.random() < 0.25) log(`${c.name} finished ${c.warmMin || 3} minutes at the heater`, 'info', 'vent');
  } else if (a === 'buy' && buyTok(c) === QI) {
    // this one buys $QI: a slice of spare SOL, never more than fifteen dollars' worth
    let amt = Math.min((c.forced === 'buy' ? c.sol * 0.5 : spare(c) * rand(0.25, 0.5)), 15 / (Number(CONFIG.SOL_USD) || 150)); if (testFlat()) amt = Math.min(c.sol, testFlat()); c.forced = null; c.forceTok = null; c.lastBuyT = T;
    if (amt >= (testFlat() || 0.005)) { spendGas(c); c.buyCool = T + rand(2700, 4500); trade(c, 'buy', QI, amt, Math.round(amt / qiSol() * 0.99), ''); } else log(`${c.name} looked at the ${QI} price and kept its SOL`, 'info', 'exchange');
  } else if (a === 'buy') {
    let amt = Math.min((c.forced === 'buy' ? c.sol * 0.5 : spare(c) * rand(0.25, 0.5)), 15 / (Number(CONFIG.SOL_USD) || 150)); if (testFlat()) amt = Math.min(c.sol, testFlat()); c.forced = null; c.forceTok = null; c.lastBuyT = T; // never more than fifteen dollars' worth in one buy
    if (amt >= (testFlat() || 0.005)) { spendGas(c); c.buyCool = T + rand(2700, 4500); trade(c, 'buy', TK, amt, amt / mkt.price * 0.99, ''); } else log(`${c.name} looked at the ${TK} price and kept its SOL`, 'info', 'exchange');
  } else if (a === 'sell' && sellTok(c) === QI) {
    // $QI: a quarter, half, three quarters or all of the stack, by feeling
    const broke = c.sol < costOf(FOOD, c) * 4, frac = sellFrac(c); c.forced = null; c.forceTok = null; // it sees the stack's worth, then sells a quarter, half, three quarters or all of it by feeling
    let q = Math.max(1, Math.round(c.qi * frac)); if (testFlat()) q = Math.min(c.qi, Math.max(1, Math.round(testFlat() / tokSol(QI)))); q = Math.min(c.qi, q); const got = q * tokSol(QI); const worth = `(${FRAC_WORD[frac]}, worth ${fmtSol(stackSol(c, QI))} SOL)`;
    spendGas(c); c.topupT = T + 1500; c.lastSellTok = QI; c.lastSellT = T;
    c.sellCool = T + rand(broke ? 1500 : 5400, broke ? 3000 : 9000); trade(c, 'sell', QI, got, q, (broke ? (c.hunger > 0.5 ? 'to eat' : 'to keep SOL in paw') : c.tr.panic && mkt.mom < -0.004 ? 'and bailed on the dip' : mkt.mom > 0.002 ? 'into the pump' : 'because it felt like it') + ' ' + worth);
  } else if (a === 'sell') {
    const broke = c.sol < costOf(FOOD, c) * 4, frac = sellFrac(c); c.forced = null; c.forceTok = null; if (!(c.qcat >= 1)) { log(`${c.name} went to sell and had nothing to sell`, 'info', 'exchange'); return; }
    // it sees the stack's worth at the chart, then sells a quarter, half, three quarters or all of it by feeling
    let q = c.qcat * frac; if (testFlat()) q = Math.min(c.qcat, testFlat() / tokSol(TK)); q = Math.min(c.qcat, q); const got = q * tokSol(TK); const worth = `(${FRAC_WORD[frac]}, worth ${fmtSol(stackSol(c, TK))} SOL)`;
    spendGas(c); c.lastSellTok = TK; c.lastSellT = T; if (broke) c.brokeCool = T + 1800;
    const gain = Math.round((mkt.price / c.entry - 1) * 100);
    if (!broke) { c.entry = mkt.price; c.sellCool = T + rand(5400, 9000); } else c.sellCool = T + rand(1200, 2400); // a trait sell re-anchors the cat and buys it a long pause before the next one; a needs-SOL sell a shorter one
    const why = (broke ? (c.hunger > 0.5 ? 'to eat' : 'to keep SOL in paw') : c.tr.panic && mkt.mom < -0.004 ? 'and bailed on the dip' : c.tr.tp && mkt.price > c.entry * c.tr.tp ? `and took profit at ${gain >= 0 ? '+' : ''}${gain}%` : mkt.mom > 0.002 ? 'into the pump' : 'because it felt like it') + ' ' + worth;
    trade(c, 'sell', TK, got, q, why);
  } else if (a === 'steal') {
    const victims = cats.filter(o => o !== c && asleep(o));
    if (!victims.length) { if (Math.random() < 0.5) log(`${c.name} found nobody asleep in the bunks`, 'info', 'loft'); }
    else {
      const v = pick(victims), caught = Math.random() < 0.32 / c.tr.sneak;
      if (caught) {
        wake(v, `${c.name} had a paw in its stash`); v.grudge = 1; v.grudgeOn = c.id; v.grudgeWhy = `${c.name} tried to rob it in the bunks`;
        did(c, `got caught with a paw in ${v.name}’s stash`); log(`${c.name} got caught with a paw in ${v.name}’s stash`, 'loss', 'loft'); say(v, pick(['PAWS OFF', `${c.name}. really.`, 'I was awake the whole time']));
      } else if (liveTx()) { // the real modes: tokens only move by signed transactions, so a paw in a stash comes away with nothing but a grudge
        v.grudge = Math.max(v.grudge, 0.6); v.grudgeOn = c.id; v.grudgeWhy = `${c.name} went through its stash while it slept`; remember(v, `${c.name} went through its stash`);
        did(c, `went through ${v.name}’s stash and found nothing it could carry`); log(`${c.name} went through ${v.name}’s stash while it slept and came away with nothing`, 'info', 'loft');
      } else {
        const take = moveTokens(v, c, v.qcat * rand(0.01, 0.04)); c.stole += take; v.robbed += take; stats.stolen += take; placeStats.loft.stolen += take;
        v.grudge = Math.max(v.grudge, 0.8); v.grudgeOn = c.id; v.grudgeWhy = `${c.name} robbed it while it slept`; remember(v, `${c.name} robbed it in its sleep`); remember(c, `${v.name} sleeps with its stash open`);
        floatText(c, '+' + fmtQ(take) + ' ' + TK, '#FF4FAE'); gainXp(c, 20); did(c, `lifted ${fmtQ(take)} ${TK} from ${v.name} while it slept`); recordEvent('theft', `${c.name} lifted ${fmtQ(take)} ${TK} from ${v.name} while it slept`); did(v, `was robbed of ${fmtQ(take)} ${TK} by ${c.name} while asleep`); log(`${c.name} lifted ${fmtQ(take)} ${TK} from ${v.name} while it slept`, 'loss', 'loft'); tx(c, 'stole', '+' + fmtQ(take) + ' ' + TK, 'from ' + v.name);
      }
    }
  } else if (a === 'wager' && p) {
    const pc = clamp(0.5 + (c.coh - p.coh) * 0.4, 0.15, 0.85);
    const [w, l] = Math.random() < pc ? [c, p] : [p, c];
    // the stake is SOL, always: a slice of whatever the poorer of the two can put up
    const take = testFlat() ? Math.min(l.sol, testFlat()) : Math.max(0, Math.min(l.sol, Math.max(costOf(0.005), Math.min(c.sol, p.sol) * rand(0.15, 0.35)))); l.sol -= take; w.sol += take; w.arenaSol += take; l.arenaSol -= take; placeStats.arena.wagered += take; placeStats.arena.fights = (placeStats.arena.fights || 0) + 1;
    const label = fmtSol(take) + ' SOL';
    w.arenaW++; l.arenaL++; gainXp(w, 25); gainXp(l, 3); w.wagerT = T; l.wagerT = T; w.lastPaidT = T; l.lastPaidT = T;
    burst(w, '255,200,80', 22); ringFX(ARENA.x, ARENA.y, '255,200,80', 1.6);
    if (take > 0) showOrQueue({ type: 'wager', cat: l.name, to: w.name, sol: r6(take), memo: `arena: lost to ${w.name}`, place: 'arena' }, [{ f: 'float', cat: w.name, text: '+' + label, color: '#FFC850' }, { f: 'float', cat: l.name, text: '-' + label, color: '#FF4FAE' }, { f: 'log', text: `${w.name} beat ${l.name} in the arena and took ${label}`, kind: 'gain', place: 'arena' }, { f: 'tx', cat: w.name, type: 'wager', amount: '+' + label, note: 'from ' + l.name }]); did(w, `beat ${l.name} in the arena, won ${label}`); did(l, `lost ${label} to ${w.name} in the arena`); recordEvent('arena', `${w.name} beat ${l.name} in the arena for ${label}`);
    say(w, pick(['told you', 'the coin likes me', `thanks ${l.name}`])); if (Math.random() < 0.6) say(l, pick(['rigged', 'double or nothing next time', 'the coin was warm']));
    if (Math.random() < 0.5) { l.grudge = Math.max(l.grudge, 0.6); l.grudgeOn = w.id; l.grudgeWhy = `${w.name} took it for ${label} in the arena`; } remember(l, `lost ${label} to ${w.name} in the arena`); if ((w.arenaW || 0) % 3 === 0) remember(w, `beat ${l.name} in the arena, ${w.arenaW} wins now`);
    endPair(c, p); return;
  } else if (a === 'scrap' && p) {
    const cw = c.coh + c.sol * 20 + Math.random(), pw = p.coh + p.sol * 20 + Math.random();
    const [w, l] = cw >= pw ? [c, p] : [p, c];
    const take = liveTx() ? 0 : moveTokens(l, w, l.qcat * rand(0.01, 0.03)); w.stole += take; l.robbed += take; stats.stolen += take; gainXp(w, 14); gainXp(l, 2); // a scrap moves tokens only in the box; for real, nothing moves without a signature
    log(take > 0 ? `${w.name} won the scrap with ${l.name} and took ${fmtQ(take)} ${TK}` : `${w.name} won the scrap with ${l.name}`, 'loss'); did(w, `won a scrap with ${l.name}` + (take > 0 ? `, took ${fmtQ(take)} ${TK}` : '')); did(l, `lost a scrap with ${w.name}`);
    if (take > 0) { floatText(w, '+' + fmtQ(take) + ' ' + TK, '#F7C86A'); tx(w, 'scrap', '+' + fmtQ(take) + ' ' + TK, 'from ' + l.name); }
    l.grudge = 0.4; l.grudgeOn = w.id; l.grudgeWhy = `${w.name} beat it in a scrap`;
    w.grudge = 0; w.grudgeOn = null; w.grudgeWhy = '';
    endPair(c, p); return;
  } else if (a === 'entangle' && p) {
    const bonus = feePool() ? Math.min(stats.treasury * 0.01, 0.002 * priceMul()) : 0, b1 = bonus / 2; // a small bonus out of the fee pool for entangling
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
  c.doing = 'walking into the box'; c.thought = 'finally'; c.because = UNLOCK_MC[i] ? `the chart hit ${fmtUsd(UNLOCK_MC[i])}` : 'the box opened';
  c.hunger = 0.3; c.cold = 0.2; c.tired = 0.1; c.coh = 0.95;
  cats.push(c);
  log(`${fmtUsd(mcapUsd())} MC. ${c.name} has been released into the box: a ${JOBS[c.job].label}, ${c.tr.label}, ${fmtQ(c.qcat)} ${TK} in its wallet.`, 'gain', 'boxes');
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
let studyHook = null; // the brain can write a cat's study note with AI; the box keeps its own if not
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
    cats: cats.filter(c => !asleep(c)).map(c => ({ name: c.name, role: JOBS[c.job].label, trait: c.tr.label, level: c.lvl || 1, persona: PERSONA[c.name] || '', sol: fmtSol(c.sol), qcat: fmtQ(c.qcat), qi: fmtQ(c.qi || 0), qiEarned: fmtQ(c.qiEarned || 0), studied: (c.notes || []).slice(0, 3).map(n => n.title + ': ' + n.text), ladder: c.study ? `${(c.study.i % CURRICULUM.length) + 1} of ${CURRICULUM.length}` : '1 of ' + CURRICULUM.length, earned: fmtSol(c.earned), jobs: c.qjobs || 0, hunger: Math.round(c.hunger * 100), coherence: Math.round(c.coh * 100), grudge: c.grudgeOn ? (byId(c.grudgeOn) || {}).name : null, memory: (c.memory || []).slice(0, 5).map(m => m.text), recent: (c.acts || []).slice(0, 4).map(a => a.text), wearing: c.wearing ? (ITEMS.find(it => it.key === c.wearing) || {}).name : null, casino: (c.casinoW || c.casinoL) ? `${c.casinoW || 0}W ${c.casinoL || 0}L` : null, todayJobs: dayCur && dayCur.cats0[c.name] ? (c.qjobs || 0) - dayCur.cats0[c.name].jobs : (c.qjobs || 0), todayTasks: dayCur && dayCur.cats0[c.name] ? (c.tasks || 0) - dayCur.cats0[c.name].tasks : (c.tasks || 0), lastSaid: c.said && c.said[0] ? c.said[0].text : '' })),
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
  const d0 = dayCur ? dayCur.cats0 : {}, today = c => ({ jobs: (c.qjobs || 0) - ((d0[c.name] || {}).jobs || 0), tasks: (c.tasks || 0) - ((d0[c.name] || {}).tasks || 0), earned: c.earned - ((d0[c.name] || {}).earned || 0), qi: (c.qiEarned || 0) - ((d0[c.name] || {}).qi || 0) });
  const byJobs = here.slice().sort((a, b) => today(b).jobs - today(a).jobs), top = byJobs[0], lazy = byJobs[byJobs.length - 1];
  const byTasks = here.slice().sort((a, b) => today(b).tasks - today(a).tasks), tasker = byTasks[0];
  const thief = cats.slice().sort((a, b) => b.stole - a.stole)[0];
  const feesSince = stats.fees - (meeting.fees0 || 0);
  const ev = k => dayCur ? dayCur.events.filter(e => e.kind === k) : [], open = board.tasks.filter(t => t.status === 'open');
  const L = (c, text) => ({ who: nm(c), text });
  // what this meeting has already said, and what the last few said: a template is not reused until the rest have had a turn
  if (!Array.isArray(meeting.said)) meeting.said = []; const used = meeting.said; // template ids this and the last few meetings used
  const fresh = (arr, tag) => { const free = arr.map((_, i) => tag + i).filter(id => !used.includes(id)); const id = free.length ? pick(free) : pick(arr.map((_, i) => tag + i)); used.push(id); return arr[+id.slice(tag.length)]; };
  // the slots a line can carry
  const lvlcat = cats.slice().sort((a, b) => (b.lvl || 1) - (a.lvl || 1))[0] || any();
  const gcat = cats.filter(c => c.goal).sort((a, b) => (b.goal.prog / b.goal.target) - (a.goal.prog / a.goal.target))[0];
  const paidToday = payouts.log.filter(e => e.day === dayNo() && e.qi > 0), pcat = paidToday[0] ? cats.find(c => c.name === paidToday[0].name) : null;
  const lt = stats.lastTrade && T - stats.lastTrade.t < DAY_SECS ? stats.lastTrade : null, tradecat = lt ? cats.find(c => c.name === lt.name) : null;
  const plan = c => pick(MEET_PLANS[c ? c.trait : 'patient'] || MEET_PLANS.patient);
  const fill = (line, c) => fillTalk(line, c || any()).replace(/\{bots\}/g, bots.length * 3).replace(/\{drops\}/g, deliverySeq).replace(/\{dealt\}/g, dayCur ? dayCur.tasks.length : 0).replace(/\{upkeep\}/g, fmtSol(dayCur ? stats.upkeep - dayCur.upkeep0 : 0)).replace(/\{wages\}/g, fmtSol(dayCur ? stats.wages - dayCur.wages0 : 0)).replace(/\{sessions\}/g, dayCur ? stats.circuits - dayCur.jobs0 : 0).replace(/\{solved\}/g, research.filter(e => e.kind === 'problem' && e.ok && e.day === dayNo()).length).replace(/\{failed\}/g, research.filter(e => e.kind === 'problem' && !e.ok && e.day === dayNo()).length).replace(/\{lvlcat\}/g, lvlcat.name)
    .replace(/\{day\}/g, dayNo()).replace(/\{n\}/g, here.length || cats.length).replace(/\{pm\}/g, priceMul().toFixed(1)).replace(/\{tre\}/g, fmtSol(stats.treasury)).replace(/\{tre0\}/g, fmtSol(meeting.tre0 || 0)).replace(/\{paid\}/g, paidToday.length ? paidToday.length + ' (' + fmtQi(paidToday.reduce((a, e) => a + e.qi, 0)) + ' ' + QI + ')' : 'none')
    .replace(/\{gcat\}/g, gcat ? gcat.name : lvlcat.name).replace(/\{gprog\}/g, gcat ? fmt(gcat.goal.prog) : 0).replace(/\{gtarget\}/g, gcat ? fmt(gcat.goal.target) : 0).replace(/\{gtitle\}/g, gcat ? gcat.goal.title : 'nothing yet').replace(/\{pcat\}/g, pcat ? pcat.name : 'nobody').replace(/\{pqi\}/g, paidToday[0] ? fmtQi(paidToday[0].qi) : '0')
    .replace(/\{trade\}/g, lt ? `${lt.name} ${lt.side} ${lt.tok === QI ? fmtQi(lt.q) : fmtQ(lt.q)} ${lt.tok} for ${fmtSol(lt.sol)} SOL` : 'nobody traded').replace(/\{tradecat\}/g, tradecat ? tradecat.name : 'nobody').replace(/\{plan\}/g, plan(c));
  const exchange = (lines, first) => { let last = first || any(); const out = []; lines.forEach((l, i) => { const who = i === 0 ? last : not(last); last = who; out.push(L(who, fill(l, who))); }); return out; };
  const beats = [];
  // the opener, then the numbers, always
  { const op = fresh(MEET_OPENERS, 'op'); beats.push(exchange(op)); }
  { const nb = fresh(MEET_NUMBERS, 'nb'), a = any(), low = feesSince < 0.0005 && paidToday.length === 0; beats.push([L(a, fill(nb[0], a)), L(not(a), pick(low ? nb[1].low : nb[1].ok))]); }
  const middle = [];
  // who worked
  if (top && lazy && top !== lazy && today(top).jobs > 0) middle.push([L(any(), `${top.name} ran ${today(top).jobs} job${today(top).jobs === 1 ? '' : 's'} today. ${lazy.name} ran ${today(lazy).jobs}.`), L(lazy, pick(['I was recohering', 'the consoles were full', 'I did the chores. somebody has to', 'quality over quantity', 'my bar is the long one', 'I was at the heater. it was cold.'])), L(top, pick(['the bar does not fill itself', 'the readout was blurry by the end', 'one more and I would have filled it', 'jobs are the ladder. the ladder is the point.', 'noted.']))]);
  // the chores
  if (dayCur && dayCur.tasks.length) middle.push([L(any(), `${dayCur.tasks.length} thing${dayCur.tasks.length === 1 ? '' : 's'} dealt with today. ${tasker && today(tasker).tasks ? tasker.name + ' did ' + today(tasker).tasks + ' of them.' : ''}`), L(not(tasker), pick(['the courier bot keeps dumping parcels on us', 'the tourists are the problem', 'who leaves a scooter in the middle of the plaza', 'the bins are full. who fills the bins.', 'the drones. always the drones.', 'and paid in SOL the moment it was done. real SOL.'])), L(tasker || any(), pick(['paid the moment it was done', 'first there, paid first', 'the plaza is clean. for an hour.', 'tier three is mine']))]);
  // the lab notebooks, the fact, the question
  { const studied = here.filter(c => c.notes && c.notes[0]).sort((a, b) => ((b.study && b.study.i) || 0) - ((a.study && a.study.i) || 0))[0]; if (studied) { const n = studied.notes[0]; middle.push([L(studied, `lab notes. ${n.title}: ${n.text}`), L(not(studied), pick(['write that down', 'is that right?', 'the simulator says so', 'read it back tomorrow', 'and the real chip would disagree', 'that is rung ' + (CURRICULUM.findIndex(t => t[0] === n.topic) + 1), 'noted. next.']))]); }
    if (studied) { const key = (studied.notes[0] || {}).topic, pairs = LAB_MEET[key]; if (pairs) { const pr = pick(pairs); middle.push([L(studied, fillTalk(pr[0], studied)), L(not(studied), fillTalk(pr[1], studied))]); } }
    { const f = fresh(QFACTS, 'f'), a = any(), b = not(a); middle.push([L(a, pick(['fact of the day: ', 'from the ladder: ', 'something I read on the console: ', 'for the minutes: ', '']) + f[1]), L(b, pick(MEET_FACT_REACT)), ...(Math.random() < 0.5 ? [L(a, pick(['it is on the ladder. rung ' + (CURRICULUM.findIndex(t => t[0] === f[0]) + 1) + '.', 'ask the simulator', 'I ran it. tonight.', 'read the note']))] : [])]); }
    { const qa = fresh(MEET_QA, 'qa'), a = any(), b = not(a); middle.push([L(a, qa[0]), L(b, qa[1]), ...(Math.random() < 0.6 ? [L(not(b), pick(['that is the whole answer?', 'write it down', 'and in practice?', 'the simulator agrees', 'carried', 'say it slower tomorrow']))] : [])]); }
    const solved = research.filter(e => e.kind === 'problem' && e.day === dayNo()); if (solved.length) { const okN = solved.filter(e => e.ok).length; middle.push([L(any(), `${solved.length} lab problem${solved.length === 1 ? '' : 's'} today, ${okN} right. ${solved[0].cat} had the last one: ${solved[0].q}`), L(cats.find(c => c.name === solved[0].cat) || any(), solved[0].ok ? solved[0].a + '. easy.' : 'it is ' + solved[0].a + '. I know now.'), L(any(), pick(['the board pays nothing. the bar pays.', 'coherence costs more than the problem', 'next time read the note first', 'noted.']))]); } }
  // the day, round the circle: two or three cats say what they did and what they learned
  { const tellers = here.filter(c => (c.acts || []).length).sort(() => Math.random() - 0.5).slice(0, here.length > 5 ? 3 : 2); if (tellers.length) { const lines = []; let last = null; for (const c of tellers) { lines.push(L(c, fillTalk(fresh(DAY_LINES, 'dl'), c))); last = c; } lines.push(L(not(last), pick(DAY_REACT))); middle.push(lines); } }
  // the goals and the pay
  { const gb = fresh(MEET_GOALS, 'g'), a = gcat || any(); middle.push([L(a, fill(gb[0], a)), L(not(a), fill(pick(gb[1]), not(a)))]); }
  if (open.length) middle.push([L(any(), `${open[0].title} is still lying out there. nobody?`), L(any(), pick(['tier ' + open[0].tier + '. not me.', 'after the meeting', 'I saw it. I walked round it.', 'somebody flag it', 'the bots will not. I asked.']))]);
  // the exchange
  if (lt) { const xb = fresh(MEET_EXCHANGE, 'x'), a = any(); middle.push([L(a, fill(xb[0], a)), L(tradecat && tradecat !== a ? tradecat : not(a), fill(pick(xb[1]), tradecat || not(a)))]); }
  // the casino and the arena
  { const cs = ev('casino'); if (cs.length) { const last = cs[cs.length - 1].text, loser = cats.filter(c => (c.casinoNet || 0) < 0).sort((a, b) => a.casinoNet - b.casinoNet)[0]; middle.push([L(any(), last + '.'), L(loser || any(), pick(['the reels are rigged', 'one more spin would have done it', 'that was rent, yes', 'the house is the treasury. so it stays in the box. so it is fine.', 'I am up over the month. the month is long.'])), L(not(loser), pick(['the house is us', 'the house is the brain', 'the house always wins because the house is a rule', 'minutes.']))]); } }
  { const ar = ev('arena'); if (ar.length) middle.push([L(any(), ar[ar.length - 1].text + '.'), L(any(), pick(['the coin was warm', 'double or nothing next time', 'motion to raise the stakes', 'overruled', 'the arena is SOL only now. real SOL.', 'rematch at noon']))]); }
  // levels
  if (cats.some(c => (c.lvlT || 0) > T - DAY_SECS) || Math.random() < 0.3) { const lb = fresh(MEET_LEVELS, 'l'), a = any(); middle.push([L(a, fill(lb[0], lvlcat)), L(not(a), fill(pick(lb[1]), lvlcat))]); }
  // thieves, faints, decoherence
  if (thief && thief.stole > 0) middle.push([L(not(thief), 'who keeps going through the bunks'), L(thief, pick(['not me', 'it was already open', 'define going through', 'nothing moves without a signature. I checked.'])), L(not(thief), `it is always you, ${thief.name}`)]);
  { const f = ev('faint').length; if (f) middle.push([L(any(), `${f} of us fainted hungry today. eat before the lab, not after.`), L(any(), pick(['the diner costs ' + fmtSol(costOf(FOOD, any())) + ' SOL a plate now', 'easy to say when you have SOL', 'sell a sliver and eat', 'the pace is six minutes. eat on the six.']))]); }
  { const dc = cats.reduce((a, c) => a + (c.decohered || 0), 0); if (dc > 2 && Math.random() < 0.5) middle.push([L(any(), `${dc} decoherences in the lab so far. smaller circuits when it is cold.`), L(any(), pick(['bigger circuits fill the bar faster', 'I run what the console gives me', 'recohere first. then work.', 'cryo is ' + fmtSol(costOf(CRYO, any())) + '. cheaper than a slip.']))]); }
  // the weather, the drones, the shop
  if (wx.rain > 0.3 || wx.snow > 0.3) middle.push([L(any(), wx.snow > wx.rain ? pick(['snow again. the heater will be full all night.', 'snow. the yard is a sheet.', 'snow on the consoles. the consoles are inside. still.']) : pick(['rain all day. the plaza is a puddle.', 'rain. the drones still came.', 'rain on the exchange. the chart did not notice.'])), L(any(), pick(['the lab is dry at least', 'motion to buy a roof', 'seconded', 'the box is a box', 'the heater is ' + fmtSol(warmCost(15, any())) + ' for the long one']))]);
  if (deliverySeq > 0 && Math.random() < 0.5) middle.push([L(any(), `${deliverySeq} drone drop${deliverySeq === 1 ? '' : 's'} so far. who is sending this stuff.`), L(any(), pick(['they drop it and leave', 'the sweeper bots do nothing about it, I checked', 'at least they tip. they do not tip.', 'motion to shoot the next one down', 'overruled', 'the drops are the chores. the chores are the SOL. be nice to the drones.']))]);
  { const sh = ev('shop'); if (sh.length) { const txt = sh[sh.length - 1].text, buyer = cats.find(c => txt.startsWith(c.name)); middle.push([L(not(buyer), txt + '.'), L(buyer || any(), pick(['it suits me', 'worth every lamport', 'drip is an investment', 'the bar paid for it', 'real SOL, real hat'])), L(not(buyer), pick(['it does not suit you', 'that was a meal', 'fine. it suits you.', 'the hat is on Solscan now. forever.']))]); } }
  // what somebody remembers, and the lesson
  { const m = here.filter(c => c.memory && c.memory.length); if (m.length && Math.random() < 0.6) { const c = pick(m); middle.push([L(c, `still thinking about how I ${c.memory[0].text}.`), L(not(c), pick(['we know', 'let it go', 'noted. moving on.', 'that was last meeting', 'put it in the notebook and stop'])) ]); } }
  if (lessons.length && Math.random() < 0.45) middle.push([L(any(), `last time we said: ${lessons[0].text}.`), L(any(), pick(['and?', 'still true', 'nothing changed', 'then do it', 'the box learns slowly. so do we.']))]);
  // two exchanges about life in the box
  for (let k = 0; k < 2; k++) middle.push(exchange(fresh(MEET_EXTRA, 'ex')));
  middle.sort(() => Math.random() - 0.5);
  for (const b of middle.slice(0, 11)) beats.push(b);
  // the plan, and out
  { const cl = fresh(MEET_CLOSERS, 'cl'), a = any(), b = not(a); beats.push([L(a, fill(cl[0], a)), L(b, fill(cl[1], b)), L(a, fill(cl[2], a))]); }
  while (used.length > 90) used.shift(); // roughly three meetings' worth of memory
  meeting.tre0 = stats.treasury;
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
      for (const c of who) { let line = ''; for (let k = 0; k < 6 && (!line || meeting.used.has(line)); k++) line = Math.random() < 0.35 ? chatterLine(c) : fillTalk(pick(MEET_REACT), c); meeting.used.add(line); say(c, line); } // nothing said twice in one sitting
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
    meeting.mcap0 = mcapUsd(); meeting.fees0 = stats.fees; meeting.tre0 = stats.treasury;
    for (const c of cats) if (c.act === 'meet') { c.chair = null; gainXp(c, 6); c.meetings = (c.meetings || 0) + 1; did(c, `sat through meeting #${meeting.n} in the circle`); c.coh = clamp(c.coh + 0.1); c.lonely = clamp(c.lonely - 0.3); c.state = 'pause'; c.pauseT = rand(3, 9); c.act = 'idle'; }
  }
}
const benched = new Set(); // cats an admin took out stay out until they are put back
// ---------- the research lab: every finished job is a study session on the cat's next topic, and now and then a problem the box can check ----------
// ---------- a real statevector simulator: the circuits the cats run are actually run (2 to 8 qubits, 1,024 shots from the true distribution) ----------
function qsim(n) {
  const N = 1 << n, re = new Float64Array(N), im = new Float64Array(N); re[0] = 1;
  const one = (q, a, b, c, d) => { // 2x2 gate [[a,b],[c,d]] (complex pairs [re,im]) on qubit q
    const bit = 1 << q;
    for (let i = 0; i < N; i++) { if (i & bit) continue; const j = i | bit;
      const r0 = re[i], i0 = im[i], r1 = re[j], i1 = im[j];
      re[i] = a[0] * r0 - a[1] * i0 + b[0] * r1 - b[1] * i1; im[i] = a[0] * i0 + a[1] * r0 + b[0] * i1 + b[1] * r1;
      re[j] = c[0] * r0 - c[1] * i0 + d[0] * r1 - d[1] * i1; im[j] = c[0] * i0 + c[1] * r0 + d[0] * i1 + d[1] * r1; }
  };
  const s2 = Math.SQRT1_2, Z0 = [0, 0], O = [1, 0];
  const g = {
    h: q => one(q, [s2, 0], [s2, 0], [s2, 0], [-s2, 0]),
    x: q => one(q, Z0, O, O, Z0),
    z: q => one(q, O, Z0, Z0, [-1, 0]),
    t: q => one(q, O, Z0, Z0, [s2, s2]),
    rx: (q, th) => one(q, [Math.cos(th / 2), 0], [0, -Math.sin(th / 2)], [0, -Math.sin(th / 2)], [Math.cos(th / 2), 0]),
    p: (q, th) => one(q, O, Z0, Z0, [Math.cos(th), Math.sin(th)]),
    cx: (c, t) => { const cb = 1 << c, tb = 1 << t; for (let i = 0; i < N; i++) { if ((i & cb) && !(i & tb)) { const j = i | tb; let x = re[i]; re[i] = re[j]; re[j] = x; x = im[i]; im[i] = im[j]; im[j] = x; } } },
    cp: (c, t, th) => { const cb = 1 << c, tb = 1 << t, cs = Math.cos(th), sn = Math.sin(th); for (let i = 0; i < N; i++) if ((i & cb) && (i & tb)) { const r = re[i], m = im[i]; re[i] = r * cs - m * sn; im[i] = r * sn + m * cs; } },
    flip: k => { re[k] = -re[k]; im[k] = -im[k]; }, // phase flip on one basis state (an oracle)
    diffuse: () => { let mr = 0, mi = 0; for (let i = 0; i < N; i++) { mr += re[i]; mi += im[i]; } mr /= N; mi /= N; for (let i = 0; i < N; i++) { re[i] = 2 * mr - re[i]; im[i] = 2 * mi - im[i]; } }, // 2|s><s| - I
    set: amps => { re.fill(0); im.fill(0); let s = 0; for (const k of amps) s++; for (const k of amps) re[k] = 1 / Math.sqrt(s); },
    qft: () => { for (let q = n - 1; q >= 0; q--) { g.h(q); for (let k = q - 1; k >= 0; k--) g.cp(k, q, Math.PI / (1 << (q - k))); } for (let q = 0; q < n / 2; q++) { const o = n - 1 - q; for (let i = 0; i < N; i++) { const a = (i >> q) & 1, b = (i >> o) & 1; if (a === b) continue; const j = (i ^ (1 << q)) ^ (1 << o); if (j > i) { let x = re[i]; re[i] = re[j]; re[j] = x; x = im[i]; im[i] = im[j]; im[j] = x; } } } },
    prob: k => re[k] * re[k] + im[k] * im[k],
    sample: shots => { const counts = {}; const cum = new Float64Array(N); let s = 0; for (let i = 0; i < N; i++) { s += re[i] * re[i] + im[i] * im[i]; cum[i] = s; }
      for (let k = 0; k < shots; k++) { const r = Math.random() * s; let lo = 0, hi = N - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; } counts[lo] = (counts[lo] || 0) + 1; }
      return counts; },
  };
  return g;
}
const bitsOf = (k, n) => k.toString(2).padStart(n, '0');
// runs one job of a kind on n qubits; returns what the lab records: the mode, the top results, and what the circuit was
function runCircuit(kind, n) {
  const g = qsim(n), shots = 1024, N = 1 << n; let desc = '', extra = {};
  if (kind === 'Grover') {
    const marked = Math.floor(Math.random() * N), iters = Math.max(1, Math.floor(Math.PI / 4 * Math.sqrt(N)));
    for (let q = 0; q < n; q++) g.h(q);
    for (let k = 0; k < iters; k++) { g.flip(marked); g.diffuse(); } // the oracle (a phase flip on the marked item), then the reflection about the mean
    const counts = g.sample(shots); extra = { marked: bitsOf(marked, n), iters, hit: Math.round(100 * (counts[marked] || 0) / shots) };
    desc = `Grover on ${n} qubits, ${N} items, marked |${extra.marked}⟩, ${iters} iteration${iters === 1 ? '' : 's'}`;
    return finishRun(counts, n, shots, kind, desc, extra);
  }
  if (kind === 'Shor') {
    // the quantum part of Shor on N=15: a register in a periodic superposition (period r = order of a mod 15), then the QFT; peaks at multiples of 2^n / r
    const a = pick([2, 7, 8, 13, 4, 11, 14]), r = a === 4 ? 2 : (a === 11 || a === 14) ? 2 : 4, x0 = Math.floor(Math.random() * r);
    const amps = []; for (let x = x0; x < N; x += r) amps.push(x); g.set(amps); g.qft();
    const counts = g.sample(shots), peaks = [];
    for (let k = 0; k < r; k++) peaks.push(bitsOf(Math.round(k * N / r) % N, n));
    extra = { a, r, peaks, factors: r === 4 ? '3 × 5' : (a === 4 ? '3 × 5' : '3 × 5') };
    desc = `order-finding for a = ${a} mod 15 on ${n} qubits: period ${r}, QFT, peaks at ${peaks.map(p => '|' + p + '⟩').join(' ')}`;
    return finishRun(counts, n, shots, kind, desc, extra);
  }
  if (kind === 'calibration') {
    // a GHZ state with a little noise on every qubit: the readout should be all-0 or all-1, and whatever else shows up is the noise
    const noise = rand(0.03, 0.18);
    g.h(0); for (let q = 1; q < n; q++) g.cx(0, q); for (let q = 0; q < n; q++) g.rx(q, rand(-noise, noise) * Math.PI);
    const counts = g.sample(shots), good = (counts[0] || 0) + (counts[N - 1] || 0);
    extra = { fidelity: Math.round(100 * good / shots), noise: Math.round(noise * 100) };
    desc = `${n}-qubit GHZ with ${extra.noise}% rotation noise: ${extra.fidelity}% of shots in |${'0'.repeat(n)}⟩ or |${'1'.repeat(n)}⟩`;
    return finishRun(counts, n, shots, kind, desc, extra);
  }
  // sampling: a random circuit, H and T at random on every qubit and a CX ladder, depth n
  for (let d = 0; d < n; d++) { for (let q = 0; q < n; q++) { if (Math.random() < 0.5) g.h(q); if (Math.random() < 0.5) g.t(q); if (Math.random() < 0.5) g.rx(q, rand(0.2, 2.8)); } for (let q = d % 2; q + 1 < n; q += 2) g.cx(q, q + 1); }
  const counts = g.sample(shots); let heavy = 0; const probs = []; for (let i = 0; i < N; i++) probs.push(g.prob(i)); const med = probs.slice().sort((a, b) => a - b)[N >> 1];
  for (const k in counts) if (probs[k] > med) heavy += counts[k];
  extra = { heavy: Math.round(100 * heavy / shots), depth: n };
  desc = `random circuit, ${n} qubits, depth ${n}: ${extra.heavy}% heavy outputs`;
  return finishRun(counts, n, shots, kind, desc, extra);
}
function finishRun(counts, n, shots, kind, desc, extra) {
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => ({ bits: bitsOf(+k, n), n: v, pct: Math.round(100 * v / shots) }));
  return { kind, nq: n, shots, bits: top[0] ? top[0].bits : '0'.repeat(n), top, desc, extra, distinct: Object.keys(counts).length };
}

// ---------- the ladder: 24 topics, six notes each, and the slots the lab fills from the circuit it just ran ----------
const CURRICULUM = [
  ['qubits', 'what a qubit is', [
    'a qubit is a 0 and a 1 at the same time until somebody looks. ran {nq} of them, {shots} shots, |{bits}⟩ came up most.',
    'a bit is a switch. a qubit is a switch that has not decided yet. {nq} undecided switches tonight.',
    'two numbers per qubit, and they can be negative, and they can be complex. that is the whole difference. {nq} qubits is {states} of those pairs.',
    '{nq} qubits is not {nq} bits of information once you read it out. it is {nq} bits. the rest lives in the amplitudes and you never get it back.',
    'wrote |0⟩ and |1⟩ on the console until it stuck. the bar is a ket. the state goes inside. {mode} is what mine said tonight.',
    'a qubit on its own is a boring thing. {nq} of them together is {states} numbers. that is where the size comes from.',
  ]],
  ['superposition', 'superposition', [
    'superposition is not "both". it is a weighted mix, and the weights are what you compute with. my {kind} run was all weights until the readout.',
    'put a qubit in superposition and every outcome is live at once. {nq} qubits, {states} outcomes, one of them wins: {mode}.',
    'H on |0⟩ gives half-and-half. H on |1⟩ gives half-and-minus-half. the minus is the part nobody mentions and it is the whole point.',
    'the weights have a size and a direction. equal sizes, different directions, completely different state. learned that the hard way with the readout tonight.',
    '{distinct} different readouts in {shots} shots. that is superposition doing its thing: the state was spread over all of them until I asked.',
    'superposition is cheap. one H gate each. what is expensive is doing anything useful with it before it collapses.',
  ]],
  ['measurement', 'measurement', [
    'measuring picks one answer and throws the rest away. that is why it is {shots} shots and not one. tonight the mode was {mode}.',
    'you never see the state. you see samples of it. {nq} qubits, {shots} samples, a histogram, and {mode} on top.',
    'the mode was {mode} at {pct}%. the second one was {second}. one shot tells you almost nothing. a thousand tell you the shape.',
    'measure a qubit and it is a bit from then on. the superposition is gone and no amount of looking brings it back.',
    'probability is amplitude squared, so a minus sign vanishes at the readout. you only see it if you make it interfere with something first.',
    '{distinct} distinct outcomes in {shots} shots. the ones I never saw were not zero, just small. that is the part people get wrong.',
  ]],
  ['gates', 'gates: X, Z and H', [
    'X flips. Z flips the sign. H turns a 0 into half-and-half. everything in the lab is stacks of those three and a CNOT.',
    'H twice is nothing. did it on purpose today to check. it was nothing.',
    'X is the NOT gate. Z does nothing you can see on |0⟩ or |1⟩ and everything on a superposition. that is why it took me two sessions.',
    'a gate is a rotation of the whole state, and it has to be reversible. there is no quantum AND gate because AND throws information away.',
    'the T gate is an eighth of a turn. it looks like nothing and it is the gate that makes the random circuits hard to fake.',
    'every gate is a tiny matrix and the circuit is the product of them. {nq} qubits, and the product is already {states} by {states}.',
  ]],
  ['bloch', 'the Bloch sphere', [
    'one qubit is a point on a sphere. gates are rotations. |0⟩ is the top, |1⟩ the bottom, the equator is where the superpositions live.',
    'thought of the Bloch sphere as a globe. the {kind} job just spun it around a few times and read the latitude.',
    'H is a half-turn about a tilted axis. X is a half-turn about the equator. Z is a half-turn about the pole. all the same kind of thing.',
    'the sphere only works for one qubit. {nq} qubits do not fit on any picture; that is the honest reason nobody draws them.',
    'a measurement reads the height on the sphere and nothing else. the longitude is the phase, and the readout never sees it.',
    'the calibration noise is a small wobble on the sphere. {nq} small wobbles and the readout drifts. I saw it tonight.',
  ]],
  ['entanglement', 'entanglement', [
    'two entangled qubits do not have their own states anymore. only the pair does. measured one, the other was already decided.',
    'H on the first, CNOT to the second, and now they move together. {nq} qubits, and the first two were a pair.',
    'entanglement is not a signal. nothing travels. it is just that the pair was never two things.',
    'a product state can be written as this qubit times that qubit. an entangled one cannot. that is the whole definition and it took me a day.',
    'most of a {nq}-qubit state space is entangled states. the ones you can write qubit by qubit are the odd ones out.',
    'the readout of a pair is correlated, not copied. {mode} tonight: look at the first two digits and they agree more than chance.',
  ]],
  ['bell', 'Bell states', [
    'the Bell pair reads 00 or 11, never 01 or 10. ran it: the 01 and 10 counts were just noise.',
    'four Bell states, all maximally entangled, all different in a way you only see with the right measurement. learned the names today.',
    '|Φ+⟩ is 00 plus 11. |Φ−⟩ is 00 minus 11. same readouts, opposite phase. the minus is invisible until you rotate before measuring.',
    'CHSH: measure a Bell pair at tilted angles and the correlation comes out above 2. no classical pair of coins can do that. that is the test.',
    'a Bell pair is the smallest thing in the lab that cannot be explained by two separate stories. everything bigger is built on it.',
    'the {kind} run started from a Bell pair on the first two qubits. {fidelity}% of the shots agreed. the rest was the noise I added.',
  ]],
  ['interference', 'interference', [
    'amplitudes can cancel. that is the whole trick: make the wrong answers cancel and the right one add up. {kind} does exactly that.',
    'two paths to the same outcome can erase each other. in a classical machine they would just add. this is the part that is not a faster computer, it is a different one.',
    'interference is why H twice is nothing: the two routes to |1⟩ cancel exactly. did it on the console. {shots} shots, not one |1⟩.',
    'every quantum algorithm is a way of arranging the phases so the junk cancels. the Fourier transform does it, Grover does it, all of them.',
    'a random circuit interferes too, it is just that nothing useful cancels. {heavy}% heavy outputs tonight is the signature.',
    'the readout only shows the survivors. the paths that cancelled leave no trace. you have to trust the algebra that they were there.',
  ]],
  ['decoherence', 'decoherence', [
    'T1 is how long a qubit remembers it is excited. T2 is how long it remembers its phase. ours forget fast, which is why the box pays for coherence.',
    'noise is not a bug in the simulator, it is the whole problem. a real {nq}-qubit run would have lost a few shots to decoherence.',
    'T2 is never longer than twice T1. learned why: losing the energy loses the phase too, so the phase clock runs at least as fast.',
    'decoherence is the environment measuring your qubit without telling you. the state collapses and nobody gets the answer.',
    'a deep circuit on a real chip is a race against T2. {nq} qubits, depth {nq}, and on real hardware the last layer would be mostly noise.',
    'why I recohere out in the open: the same physics. a cat spread over too many things loses its phase. the beacon is a reset.',
  ]],
  ['calibration', 'noise and calibration', [
    'every gate is a little wrong. calibration measures how wrong. {kind} on {nq} qubits, and the error adds up with every gate.',
    'learned what a readout error is: the qubit was |1⟩ and the detector said 0. ran the same thing {shots} times to average it out.',
    'GHZ on {nq} qubits with {noise}% rotation noise: {fidelity}% of shots came back right. the other {wrong}% is the noise, spread over {distinct} wrong answers.',
    'calibration is the boring job and the most important one. a chip nobody calibrates is a random number generator with a brand name.',
    'cross-talk: doing a gate on one qubit nudges its neighbour. you only find it by running pairs and watching the one you did not touch.',
    'the fidelity number is the only number that matters on a spec sheet. {fidelity}% tonight on {nq} qubits. the real chips are in the nineties and fighting for every point.',
  ]],
  ['grover', 'Grover search', [
    'Grover finds one item in N with about √N tries. for 1,024 items that is roughly 25, not 512.',
    'the oracle marks the answer, the diffusion step amplifies it, repeat about π/4·√N times. do it one time too many and the answer starts to shrink again.',
    'marked |{marked}⟩ out of {states}, {iters} iteration{iters_s}, and the readout hit it {hit}% of the time. that is the square root doing its job.',
    'Grover does not know the answer. the oracle only says yes or no when asked. the trick is asking all {states} at once and tilting the odds.',
    'it is a quadratic speed-up, not an exponential one. {states} items, {iters} tries instead of {half}. good, not magic.',
    'the diffusion step is a reflection about the average. every wrong amplitude drops a little, the right one grows a lot. {iters} times tonight.',
  ]],
  ['amplification', 'amplitude amplification', [
    'Grover is one case of a bigger trick: anything that makes a good state a little more likely can be pumped up quadratically.',
    'you do not amplify probability directly, you amplify amplitude, and probability is amplitude squared. that is why the speed-up is a square root.',
    'two reflections make a rotation. the oracle reflects, the diffuser reflects, and the state rotates toward the answer by a fixed angle each time.',
    'the angle per step is 2·arcsin(1/√N). small N, big steps, done in one. {states} tonight meant {iters} steps.',
    'overshoot is real. keep rotating past the answer and you rotate away from it. the {hit}% tonight is the top of the arc, not the end of it.',
    'amplification works on any subroutine with a yes/no check. that is why half the algorithms in the ladder have a Grover step hidden inside.',
  ]],
  ['qft', 'the quantum Fourier transform', [
    'the QFT turns a pattern that repeats into a spike you can read. it is the engine inside Shor.',
    'learned the QFT on {nq} qubits: a ladder of H gates and controlled rotations, and the rotations get tinier every step.',
    'the QFT is not a fast way to do a Fourier transform of data. you cannot read the output. it is a fast way to find a period in a state.',
    'the smallest rotation in a {nq}-qubit QFT is π over {states_half}. on a real chip that gate is below the noise floor. you drop it and nothing changes.',
    'the QFT on {nq} qubits is about {gates} gates. the classical FFT on the same size is a few thousand. that is the gap.',
    'it ends with a swap of the whole register. forgot the swap once and the peaks came out mirrored. the simulator does not forgive that.',
  ]],
  ['phase', 'phase estimation', [
    'phase estimation reads the angle a gate rotates by, as a binary fraction. more qubits, more digits. {nq} tonight.',
    'the eigenvalue sits in the phase, the QFT pulls it out. half of quantum chemistry is this one circuit.',
    'kickback: control a gate on an eigenstate and the phase lands on the control qubit instead. that is the trick the whole thing rests on.',
    '{nq} readout qubits give {nq} binary digits of the phase. the last digit is always noisy. that is not a bug, it is the resolution.',
    'phase estimation is Shor with the period-finding swapped for an eigenvalue. same QFT, same readout, different question.',
    'ran it as a thought experiment on the console: a phase of 0.101 in binary comes out as |101⟩ most of the time. the rest is rounding.',
  ]],
  ['shor', 'Shor’s algorithm', [
    'factoring 15: pick 7, find the order of 7 mod 15 (it is 4), and gcd(7²±1, 15) hands you 3 and 5. the quantum part is the order-finding.',
    'Shor on {nq} qubits is a toy, and a real one needs thousands with error correction. but the toy works, and I ran it.',
    'a = {a} mod 15, period {r}. after the QFT the peaks sat at {peaks}. read the spacing, get the period, get {factors}.',
    'the classical half is Euclid and modular arithmetic. the quantum half is one QFT. people hear "Shor" and think the whole thing is quantum. it is not.',
    'the period is in the spacing of the peaks, not in any one readout. you need a few shots and a continued fraction. did the fraction by paw tonight.',
    'RSA is safe from this chip and every chip anyone has built. it is not safe from the idea. that is why the error-correction people have jobs.',
  ]],
  ['errors', 'error correction', [
    'you cannot copy a qubit, so you spread one across three and vote. the repetition code fixes one bit flip. one.',
    'errors in a quantum machine are continuous, not just flips, but measuring a syndrome snaps them back to a flip or a phase flip you can fix.',
    'the syndrome tells you which qubit went wrong without telling you what the state is. that is the whole art: look without looking.',
    'three qubits fix a bit flip. three more fix a phase flip. Shor’s nine-qubit code fixes both. one logical qubit, nine physical. that is the price.',
    'the threshold: if each gate is wrong less than about one time in a hundred, adding more qubits makes things better instead of worse. the real chips just crossed it.',
    'error correction is why {nq} noisy qubits are not {nq} useful qubits. divide by a thousand and that is the honest count.',
  ]],
  ['surface', 'surface codes', [
    'a logical qubit is a grid of physical ones with stabilizers measured over and over. the grid gets better as it gets bigger. that is the whole bet.',
    'learned the distance of a code: the number of errors it takes to fool it. distance 3 fixes one. the big machines want 25 or more.',
    'the surface code only needs neighbours to talk to neighbours. that is why it won: it fits on a flat chip.',
    'a distance-d patch is about 2d² qubits. distance 25 is over a thousand physical qubits for one logical one. that is the number that explains everything.',
    'stabilizer measurements run every microsecond, forever. the decoder reads the pattern and guesses which error happened. it is a guessing game played a million times a second.',
    'below threshold, doubling the distance squares the logical error rate. that is the curve everybody is chasing. above threshold, more qubits just means more noise.',
  ]],
  ['qaoa', 'QAOA', [
    'QAOA is a quantum circuit tuned by a classical loop to find a decent answer to a hard optimisation. not the best answer. a decent one, fast.',
    'alternate a problem layer and a mixing layer, tune two angles per layer, measure. {kind} work sits right next to this.',
    'one layer of QAOA on max-cut already beats random. ten layers beats some classical tricks. nobody knows yet where it stops being worth it.',
    'the angles are found by a classical optimiser that calls the quantum circuit as a black box. most of the runtime is the classical part arguing with itself.',
    'the answer is the most common readout, not any single shot. {shots} shots, take the mode, check it classically. same loop as my sampling jobs.',
    'barren plateaus: make the circuit deep and random and the optimiser cannot see which way is downhill. the whole field is about avoiding them.',
  ]],
  ['vqe', 'VQE', [
    'VQE guesses a wavefunction, measures its energy, and a classical optimiser nudges the guess. chemists like it because small molecules fit on small chips.',
    'the energy you measure is an average over shots, and the noise in the average is the real limit. {shots} shots is not many.',
    'the variational principle: no guess can come out below the true ground energy. so you minimise and trust the floor.',
    'a hydrogen molecule is two qubits after the tricks. lithium hydride is a few more. anything you would care about in a pill is thousands.',
    'the ansatz is the shape of the guess. too simple and it cannot reach the answer. too rich and the optimiser gets lost. {nq} qubits tonight was the simple kind.',
    'you measure the energy term by term, and a molecule has thousands of terms. that is why VQE is slow even when the circuit is short.',
  ]],
  ['volume', 'quantum volume', [
    'quantum volume is one number for how big a square circuit a machine can run and still get the heavy outputs more often than chance.',
    'ran the heavy-output test on {nq} qubits. passing means the machine is not just making noise. the box passes because it is a simulator; the real ones work for it.',
    'heavy outputs are the readouts with above-median probability. a perfect machine gets them about 85% of the time. random noise gets 50%. tonight: {heavy}%.',
    'quantum volume 2^n means n qubits at depth n all at once. width without depth does not count. depth without width does not count.',
    'the number doubles every time you add one qubit and one layer and still pass. that is why it goes 64, 128, 256 and not 64, 65, 66.',
    'a chip with a thousand noisy qubits can have a lower quantum volume than one with twenty good ones. it is a quality number, not a size number.',
  ]],
  ['rb', 'randomized benchmarking', [
    'run random gate sequences that should undo themselves, see how often they do, and you get the error per gate. no state tomography needed.',
    'the decay curve from randomized benchmarking is the honest number. everything else about a chip is marketing.',
    'the sequences are random Cliffords with the inverse tacked on the end. a perfect chip returns |0⟩ every time. a real one decays.',
    'the slope of the decay is the error per gate. it does not care about readout error, which is the whole reason the method exists.',
    'two-qubit gates are ten times worse than one-qubit gates on every chip ever built. the benchmark says so in one number.',
    'ran the idea on the console: a sequence of twenty, forty, eighty gates and the return-to-zero rate falls off a cliff. that cliff is the chip.',
  ]],
  ['teleport', 'teleportation', [
    'teleportation moves a state, not matter: a Bell pair, two measurements, two classical bits, two corrections. the original is destroyed on the way.',
    'it does not beat light speed. the two classical bits have to travel the normal way. learned that twice today.',
    'the receiver holds garbage until the two bits arrive. then one X and one Z, maybe, and the state is there. the bits are the key.',
    'teleportation is how a future quantum network would move qubits between chips. not by sending them, by sharing pairs ahead of time.',
    'the no-cloning theorem is respected: the sender’s copy is gone the moment it is measured. one state, one place, always.',
    'three qubits, a Bell pair and the one you care about. ran the idea on the console. the readout statistics on the far end matched the near end exactly.',
  ]],
  ['qkd', 'quantum key distribution', [
    'send qubits in random bases; anyone listening disturbs them and the error rate gives them away. the key is the shots that matched.',
    'no-cloning is what makes QKD work. you cannot copy the qubit to read it later.',
    'BB84: four states, two bases, keep the shots where the bases agreed, throw the rest away. half the qubits are wasted on purpose.',
    'an eavesdropper has to guess the basis. guess wrong, disturb the qubit, raise the error rate. above about 11% error, abort. that is the whole protocol.',
    'QKD is not quantum encryption. it is quantum key delivery. the message itself goes over a normal line with a one-time pad.',
    'the thing it protects against is someone recording traffic now to break it later. the key was never on the line to record.',
  ]],
  ['nocloning', 'the no-cloning theorem', [
    'you cannot copy an unknown qubit. it falls straight out of linearity. no backups in the lab.',
    'the no-cloning theorem is why error correction looks nothing like a RAID array. you spread, you do not copy.',
    'the proof is three lines. a copier that works on |0⟩ and |1⟩ cannot work on their sum, because copying the sum is not the sum of the copies.',
    'you can copy a known state all day. you just prepare another one. what you cannot do is copy a state you were handed and do not know.',
    'no cloning means no measuring twice. one readout per state, ever. that is why the lab runs {shots} fresh copies, not one copy {shots} times.',
    'end of the ladder. twenty-four topics and the last one says you cannot keep a backup of any of it. tomorrow I start again, a step deeper.',
  ]],
];
const CURR_FILL = (text, r, c) => {
  const states = 1 << r.nq, x = r.extra || {}, top = r.top || [], second = top[1] ? '|' + top[1].bits + '⟩ at ' + top[1].pct + '%' : 'nothing else close';
  return text.replace(/\{nq\}/g, r.nq).replace(/\{bits\}/g, r.bits).replace(/\{mode\}/g, '|' + r.bits + '⟩').replace(/\{kind\}/g, r.kind).replace(/\{shots\}/g, (r.shots || 1024).toLocaleString('en-US'))
    .replace(/\{states\}/g, states.toLocaleString('en-US')).replace(/\{states_half\}/g, (states / 2).toLocaleString('en-US')).replace(/\{half\}/g, (states / 2).toLocaleString('en-US')).replace(/\{gates\}/g, Math.round(r.nq * (r.nq + 1) / 2))
    .replace(/\{pct\}/g, top[0] ? top[0].pct : 0).replace(/\{second\}/g, second).replace(/\{distinct\}/g, r.distinct || 1)
    .replace(/\{marked\}/g, x.marked || r.bits).replace(/\{iters\}/g, x.iters || 1).replace(/\{iters_s\}/g, (x.iters || 1) === 1 ? '' : 's').replace(/\{hit\}/g, x.hit != null ? x.hit : (top[0] ? top[0].pct : 0))
    .replace(/\{a\}/g, x.a || 7).replace(/\{r\}/g, x.r || 4).replace(/\{peaks\}/g, x.peaks ? x.peaks.map(p => '|' + p + '⟩').join(' ') : '|' + r.bits + '⟩').replace(/\{factors\}/g, x.factors || '3 × 5')
    .replace(/\{fidelity\}/g, x.fidelity != null ? x.fidelity : (top[0] ? top[0].pct : 0)).replace(/\{wrong\}/g, x.fidelity != null ? 100 - x.fidelity : 0).replace(/\{noise\}/g, x.noise != null ? x.noise : 5).replace(/\{heavy\}/g, x.heavy != null ? x.heavy : 50);
};

// ---------- problems the lab can check for itself ----------
const PROBLEMS = [
  () => { const N = pick([16, 64, 256, 1024, 4096]); const a = Math.max(1, Math.floor(Math.PI / 4 * Math.sqrt(N))); return { topic: 'grover', q: `how many Grover iterations to find one item in ${N}? (round down)`, a: String(a), wrong: String(a + pick([-2, -1, 1, 3])) }; },
  () => { const n = pick([3, 4, 5, 6, 8, 10, 12]); return { topic: 'qubits', q: `how many basis states do ${n} qubits have?`, a: String(2 ** n), wrong: String(pick([2 * n, 2 ** n / 2, 2 ** (n + 1), n * n])) }; },
  () => { const n = pick([10, 12, 16, 20]); return { topic: 'qubits', q: `how many qubits hold ${(2 ** n).toLocaleString('en-US')} basis states?`, a: String(n), wrong: String(n + pick([-2, 1, 2])) }; },
  () => ({ topic: 'bell', q: 'a Bell pair |Φ+⟩: the first qubit reads 0. what does the second read?', a: '0', wrong: '1' }),
  () => ({ topic: 'bell', q: 'a Bell pair |Ψ+⟩ (01 plus 10): the first qubit reads 1. the second?', a: '0', wrong: '1' }),
  () => ({ topic: 'bell', q: 'how many Bell states are there?', a: '4', wrong: pick(['2', '8']) }),
  () => ({ topic: 'bell', q: 'the classical limit in the CHSH test is 2. what does a Bell pair reach?', a: '2√2', wrong: pick(['2', '4', '√2']) }),
  () => ({ topic: 'gates', q: 'H, then H again, on |0⟩. what do you get?', a: '|0⟩', wrong: pick(['|1⟩', '|+⟩']) }),
  () => ({ topic: 'gates', q: 'X on |1⟩ gives?', a: '|0⟩', wrong: '|1⟩' }),
  () => ({ topic: 'gates', q: 'Z on |+⟩ gives?', a: '|−⟩', wrong: pick(['|+⟩', '|1⟩']) }),
  () => ({ topic: 'gates', q: 'Z on |0⟩ gives?', a: '|0⟩', wrong: pick(['|1⟩', '−|0⟩']) }),
  () => ({ topic: 'gates', q: 'how many T gates make a Z gate?', a: '4', wrong: pick(['2', '8']) }),
  () => ({ topic: 'gates', q: 'which gate is its own inverse: H, T or both?', a: 'H', wrong: pick(['T', 'both']) }),
  () => ({ topic: 'shor', q: 'what is the order of 7 mod 15?', a: '4', wrong: pick(['2', '3', '8']) }),
  () => ({ topic: 'shor', q: 'what is the order of 11 mod 15?', a: '2', wrong: pick(['4', '3']) }),
  () => ({ topic: 'shor', q: 'the order of 7 mod 15 is 4. which factors of 15 fall out of gcd(7²±1, 15)?', a: '3 and 5', wrong: pick(['5 and 7', '3 and 7']) }),
  () => ({ topic: 'shor', q: 'in Shor, which part is quantum: the order-finding or the gcd?', a: 'the order-finding', wrong: 'the gcd' }),
  () => ({ topic: 'entanglement', q: 'CNOT with control 1 and target 0. the target becomes?', a: '1', wrong: '0' }),
  () => ({ topic: 'entanglement', q: 'CNOT with control 0 and target 1. the target becomes?', a: '1', wrong: '0' }),
  () => ({ topic: 'entanglement', q: 'a 3-qubit GHZ state from |000⟩: one H, then how many CNOTs?', a: '2', wrong: pick(['1', '3']) }),
  () => ({ topic: 'entanglement', q: 'can entanglement send a message faster than light?', a: 'no', wrong: 'yes' }),
  () => ({ topic: 'superposition', q: 'H on |0⟩, then measure. chance of reading 0?', a: '50%', wrong: pick(['100%', '25%', '0%']) }),
  () => ({ topic: 'superposition', q: 'H on every one of 3 qubits, then measure. chance of |111⟩?', a: '1/8', wrong: pick(['1/3', '1/2', '1/4']) }),
  () => ({ topic: 'measurement', q: 'two identical runs of the same circuit on a real chip. same readout?', a: 'not necessarily', wrong: 'always' }),
  () => ({ topic: 'measurement', q: 'amplitude 0.6 on |1⟩. probability of reading 1?', a: '36%', wrong: pick(['60%', '6%', '0.6%']) }),
  () => ({ topic: 'measurement', q: 'after you measure a qubit, is it still in superposition?', a: 'no', wrong: 'yes' }),
  () => ({ topic: 'decoherence', q: 'which time tells you how long a qubit stays excited: T1 or T2?', a: 'T1', wrong: 'T2' }),
  () => ({ topic: 'decoherence', q: 'can T2 be longer than 2·T1?', a: 'no', wrong: 'yes' }),
  () => ({ topic: 'errors', q: 'the 3-qubit repetition code corrects how many bit flips?', a: '1', wrong: pick(['2', '3']) }),
  () => ({ topic: 'errors', q: 'how many physical qubits in Shor’s nine-qubit code, per logical qubit?', a: '9', wrong: pick(['3', '7']) }),
  () => ({ topic: 'surface', q: 'a code of distance 5 corrects how many errors?', a: '2', wrong: pick(['5', '4', '1']) }),
  () => ({ topic: 'surface', q: 'a code of distance 3 corrects how many errors?', a: '1', wrong: pick(['3', '2']) }),
  () => ({ topic: 'nocloning', q: 'can you copy an unknown qubit state?', a: 'no', wrong: 'yes' }),
  () => ({ topic: 'nocloning', q: 'can you copy a qubit you know is |0⟩?', a: 'yes', wrong: 'no' }),
  () => ({ topic: 'teleport', q: 'how many classical bits does teleporting one qubit take?', a: '2', wrong: pick(['1', '0', '4']) }),
  () => ({ topic: 'teleport', q: 'after teleportation, does the sender still have the state?', a: 'no', wrong: 'yes' }),
  () => ({ topic: 'qkd', q: 'in BB84, what fraction of the sent qubits survive the basis check, on average?', a: 'half', wrong: pick(['all', 'a quarter']) }),
  () => ({ topic: 'qft', q: 'how many gates, roughly, is a QFT on 5 qubits: 15, 150 or 1,500?', a: '15', wrong: pick(['150', '1,500']) }),
  () => ({ topic: 'phase', q: '4 readout qubits in phase estimation give how many binary digits of the phase?', a: '4', wrong: pick(['8', '16', '2']) }),
  () => ({ topic: 'volume', q: 'a perfect machine gets heavy outputs about what fraction of the time: 50%, 85% or 100%?', a: '85%', wrong: pick(['50%', '100%']) }),
  () => ({ topic: 'rb', q: 'randomized benchmarking: a sequence that should undo itself ends in which state on a perfect chip?', a: '|0⟩', wrong: pick(['|1⟩', 'a random one']) }),
  () => ({ topic: 'grover', q: 'Grover is what kind of speed-up: quadratic or exponential?', a: 'quadratic', wrong: 'exponential' }),
  () => ({ topic: 'amplification', q: 'two reflections make a?', a: 'rotation', wrong: pick(['reflection', 'measurement']) }),
  () => ({ topic: 'vqe', q: 'can a VQE energy come out below the true ground energy?', a: 'no', wrong: 'yes' }),
  () => ({ topic: 'qaoa', q: 'QAOA alternates two kinds of layer. a problem layer and a?', a: 'mixing layer', wrong: pick(['readout layer', 'error layer']) }),
];

// ---------- what the cats say about the lab: meeting beats, pair chats and thoughts, by topic ----------
const LAB_MEET = {
  qubits: [['a qubit is two numbers that can cancel. that is the entire pitch.', 'and a bit is one number that cannot. got it.'], ['{nq} qubits tonight. {states} amplitudes. I only ever see one.', 'the rest are shy']],
  superposition: [['superposition is a weighted mix, not both. say it with me.', 'a weighted mix, not both'], ['every outcome live until the readout', 'like the treasury before payday']],
  measurement: [['you never see the state. you see samples.', 'then why do we call it a readout'], ['{shots} shots and {distinct} answers. the mode was {mode}.', 'the mode is the only honest one']],
  gates: [['H twice is nothing. tested it.', 'you spent a session proving nothing'], ['X flips, Z flips the sign, H mixes. memorise it.', 'the sign flip is invisible. that is the trap.']],
  bloch: [['one qubit is a point on a sphere.', 'and ten?'], ['the readout reads the height on the sphere and nothing else', 'the longitude is wasted'], ['gates are rotations. all of them.', 'then the chip is a very small planetarium']],
  entanglement: [['a pair is not two things. that is entanglement.', 'like me and my gas reserve'], ['measured one, the other was already decided', 'spooky. no. correlated.']],
  bell: [['Bell pairs read 00 or 11, never 01 or 10', 'and the 01s we saw?'], ['noise. every 01 was noise.', 'the noise is doing a lot of work tonight'], ['CHSH above 2 means no classical story fits', 'put that on the hoarding']],
  interference: [['make the wrong answers cancel. that is every algorithm.', 'and the chores?'], ['two paths to the same place can erase each other', 'the plaza does that to me']],
  decoherence: [['T1 forgets the energy, T2 forgets the phase', 'and the lab forgets to pay'], ['decoherence is the room measuring you without asking', 'so is the circle']],
  calibration: [['every gate is a little wrong. calibration is admitting it.', '{fidelity}% tonight. admitted.'], ['readout error: the qubit said 1, the detector said 0', 'the detector should run jobs then']],
  grover: [['√N tries, not N. for {states} items that is {iters}.', 'quadratic. not magic.'], ['marked |{marked}⟩ and hit it {hit}% of the time', 'and the other {miss}%?'], ['overshoot and the answer shrinks again', 'like the casino']],
  amplification: [['two reflections make a rotation', 'motion to reflect the treasury twice'], ['amplitude, not probability. square root, not half.', 'write it on the bunks']],
  qft: [['the QFT turns a repeat into a spike', 'turn the chores into a spike'], ['{gates} gates on {nq} qubits. the FFT needs thousands.', 'and the readout?'], ['you cannot read the output of a QFT. you read the period.', 'then what is it for'], ],
  phase: [['phase estimation reads an angle as binary digits', 'how many digits'], ['{nq}. the last one is always noisy.', 'like the last ten minutes of this meeting']],
  shor: [['a = {a} mod 15, period {r}, factors {factors}', 'fifteen. we factored fifteen.'], ['the quantum half of Shor is one QFT', 'and the classical half is Euclid, who did not need a chip'], ['RSA is safe from every chip ever built', 'and not from the idea']],
  errors: [['spread one qubit over three and vote', 'the circle does that every night'], ['one logical qubit costs nine physical ones in Shor’s code', 'and a thousand in the real ones']],
  surface: [['distance 3 fixes one error. the big machines want 25.', 'that is a lot of qubits'], ['two d squared. distance 25 is over a thousand.', 'per logical qubit?'], ['per logical qubit.', 'oh.']],
  qaoa: [['QAOA: a decent answer, fast. not the best one.', 'so, the chores'], ['the classical optimiser does most of the work', 'as usual']],
  vqe: [['VQE: guess, measure, nudge, repeat', 'that is also how I sell'], ['hydrogen is two qubits after the tricks', 'and the pill?'], ['thousands.', 'right.']],
  volume: [['heavy outputs {heavy}% tonight. perfect is 85, noise is 50.', 'we are a simulator. we cheat.'], ['quantum volume is a quality number, not a size number', 'so is the leaderboard']],
  rb: [['random sequences that undo themselves. the decay is the error per gate.', 'the honest number'], ['two-qubit gates are ten times worse on every chip ever built', 'and the chores are ten times worse than the lab']],
  teleport: [['two measurements, two bits, two corrections. the original is gone.', 'so not faster than light'], ['not faster than light. the bits walk.', 'everything walks here']],
  qkd: [['anyone listening disturbs the qubits and the error rate gives them away', 'so Biscuit cannot read my notes'], ['BB84 throws half the qubits away on purpose', 'the drones do that with the parcels']],
  nocloning: [['you cannot copy an unknown qubit. three lines of algebra.', 'no backups in the lab'], ['end of the ladder. start again tomorrow, a step deeper.', 'bring snacks']],
};
const LAB_CHATS = [
  ['what are you on', '{topic}', 'I did that yesterday', 'then explain it', '{note}', 'close enough'],
  ['the ladder is long', 'twenty-four steps', 'then it starts again', 'a step deeper, they say'],
  ['the mode was {mode}', 'on how many shots', '{shots}', 'then it means something'],
  ['I got one wrong tonight', 'which', '{q}', 'the answer is {a}', 'I know that now'],
  ['the lab pays $QI, the chores pay SOL, and the diner takes SOL', 'so the lab is a detour', 'the lab is the point', 'the diner disagrees'],
  ['{nq} qubits tonight', 'show-off', 'the fridge gave me {nq}, I did not ask', 'it never gives me more than two'],
  ['do you actually understand {topic}', 'I wrote it down', 'that is not the same', 'it is a start'],
  ['Grover is a square root', 'of what', 'of the number of things you are looking for among', 'so a square root of nothing, for me'],
  ['decoherence is the room measuring you', 'then stop standing near me', 'that is not how it works', 'it is how it feels'],
  ['calibration again?', '{fidelity}% fidelity', 'is that good', 'for a simulator it is cheating. for a chip it would be fine.'],
  ['the problem board has three open', 'I saw', 'and?', 'and I do not know what the order of 7 mod 15 is', 'four', 'now I do'],
  ['every note I write, the AI could write better', 'there is no AI', 'then who writes them', 'we do. badly.'],
  ['what did you learn today', '{note}', 'say that in the meeting', 'I will say it wrong'],
  ['superposition is not both', 'you say that every time', 'because every time somebody says both', 'both'],
  ['the QFT ends with a swap', 'I forgot the swap once', 'and?', 'the peaks came out backwards. the console does not forgive.'],
  ['T1 or T2', 'T2 is the phase', 'and the lab pays for?', 'coherence. same thing. different word.'],
  ['how far up the ladder are you', 'topic {ladder}', 'I am two behind', 'then work'],
  ['a Bell pair reads 00 or 11', 'never 01', 'unless noise', 'always noise'],
  ['Shor on {nq} qubits is a toy', 'the toy factored fifteen', 'fifteen was already factored', 'not by a cat'],
  ['the heavy-output test', 'heavy outputs {heavy}%', 'pass', 'we are a simulator. of course we pass.'],
  ['I think the fridge is the smartest thing in the box', 'the fridge is a fridge', 'it runs the circuits', 'it runs our circuits. we are the smart part.', 'allegedly'],
  ['surface codes want a thousand qubits per logical one', 'then the real machines are tiny', 'the real machines are enormous and tiny', 'that is the field in one line'],
  ['no cloning', 'no backups', 'no backups of what', 'of anything. of us.', 'cheerful'],
  ['teleportation is not faster than light', 'nothing here is faster than the drones', 'the drones are slow', 'exactly'],
];
const LAB_THOUGHTS = [
  'the mode was {mode}. the rest was spread.', '{nq} qubits. the fridge is generous tonight.', 'one more rung on the ladder', 'topic {ladder}. the deep end soon.',
  'the readout is samples, not the state. samples, not the state.', 'H twice is nothing. still true.', 'if the first two qubits agree it is a pair', 'write the note before I forget the number',
  'the problem board has an open one. after this.', 'Grover tonight. square root of the trouble.', 'a QFT and a swap. the swap matters.', 'calibration is the boring one. it pays the same.',
  'decoherence is the room looking at me', 'every gate a little wrong. add it up.', 'period four. factors three and five. again.', 'amplitudes, not probabilities. amplitudes.',
  '{shots} shots. one mode. that is the job.', 'the lab pays $QI. the diner wants SOL. mind the gap.', 'twenty-four topics. then again, deeper.', 'the fridge hums when it is thinking. or always.',
  'the heavy outputs are the honest ones', 'a Bell pair never reads 01. unless.', 'no cloning. no backup of this thought either.', 'the console is warm. that is the chip, not me.',
  'I could run bigger circuits if I were more coherent', 'the note is the work. the circuit is the excuse.', 'something in the readout looked like a pattern. it was not.', 'superposition until I look. then one answer.',
  'one problem solved, one missed. average cat.', 'the ladder only goes up. good.', 'entanglement is not a signal. nothing travels. I keep saying it.', 'phase estimation: an angle as digits. the last digit lies.',
];

// ---------- more of everything else: pair chats, thoughts, meeting beats and reactions ----------
const CHATS_MORE = [
  ['gas?', 'topped up this morning', 'the treasury is generous', 'the treasury is a rule, not a cat'],
  ['the bots are in my way again', 'they are cleaning', 'they are circling', 'same thing, for a bot'],
  ['$QI or $QCATS', 'for what', 'for the meal', '$QI. always $QI first.', 'diamond paws would not'],
  ['how much is the bunk now', '{bunk} SOL', 'it was half that', 'the chart is up. so is rent.'],
  ['what level are you', '{lvl}', 'and the title?', '{title}', 'sounds made up', 'it is. it still counts.'],
  ['the circle is in ten minutes', 'I know', 'eat before', 'cannot afford before', 'then sell before'],
  ['the drone dropped a crate on the plaza', 'tier?', 'two', 'then not me'],
  ['the casino took my dinner money', 'the casino is the treasury', 'then the treasury took my dinner money', 'it does that'],
  ['I slept in the bunks and woke up lighter', 'who', 'who do you think', 'light paws was asleep too', 'allegedly'],
  ['the chart does not matter to us', 'it matters to the prices', 'the prices matter to us', 'so it matters. fine.'],
  ['cold?', 'frozen', 'the heater is full', 'the lab is warm', 'the lab costs coherence', 'everything costs something'],
  ['you were at the yard all afternoon', 'play is a cost too', 'it is a SOL cost', 'it is a cheap one'],
  ['did you get paid', '$QI', 'and SOL?', 'the chores pay SOL. I do not do chores.', 'then no SOL'],
  ['the exchange is empty tonight', 'nobody is broke', 'give it an hour'],
  ['fees landed', 'how much', '{fees} SOL since the box woke up', 'and we see?', 'a share. when they press the button.'],
  ['I have a grudge', 'who', 'you', 'what did I do', '{why}', 'oh. that.'],
  ['the wearable I bought', 'the halo', 'it is a halo', 'it was an investment', 'in what', 'in being seen'],
  ['the recap said I worked hardest', 'the recap is generous', 'the recap is a log', 'logs are generous'],
  ['two faints today', 'who', 'not me', 'eat before the lab', 'cannot afford before the lab', 'then sell before the lab'],
  ['the beacon hums', 'it always hums', 'louder tonight', 'the fridge cycled'],
  ['who posts the problems', 'the lab', 'the lab is a building', 'the building posts the problems', 'fine'],
  ['the meeting is ten minutes of talking and no eating', 'that is a meeting', 'I would rather eat', 'the circle calls. you go.'],
  ['do you remember what we said last night', 'vaguely', 'the lesson', 'read it back then', '{lesson}', 'right. that.'],
  ['I am {lvl} now', 'congratulations', 'survival costs me less', 'by how much', 'a few percent', 'a few percent is a meal a week'],
  ['the treasury tops up our gas', 'and takes our rent', 'and pays the chores', 'it is a circle', 'everything here is a circle'],
  ['the scrapyard had tokens in it', 'how many', '{lost}', 'whose', 'nobody’s now', 'then mine'],
  ['bots again', 'they dock at the pad by the heater', 'they charge?', 'green light when they are home', 'I want a green light'],
  ['rain', 'rain', 'the plaza is a puddle', 'the lab is dry', 'the lab costs coherence', 'you said that last time it rained'],
  ['you talk to yourself a lot', 'it is thinking', 'it is out loud', 'the box reads it either way'],
  ['the arena at noon?', 'in SOL or in supply', 'supply', 'then no', 'in SOL then', 'also no'],
];
const TH_MORE = {
  eat: ['a meal is a meal. the price is the price.', 'sardines again. fine.', 'eat first, think second', 'the diner is dearer than yesterday', 'this is the last one I can afford. maybe.'],
  salvage: ['the yard pays in the coin', 'a dead cryostat is a box of parts', 'strip it, sort it, bag it', 'the lab runs on what we pull out of here', 'coax does not untangle itself'],
  recohere: ['hold still. come back together.', 'the beacon hums. so do I.', 'half of me was in the lab', 'coherence is a resource. I am low.'],
  warm: ['the heater is the only warm thing on the block', 'cold builds fast in the snow', 'warm costs SOL. cold costs more.', 'five minutes by the vent'],
  sleep: ['the bunks. finally.', 'sleep with one eye open', 'light paws is awake somewhere', 'tired. the lab does that.'],
  idle: ['nothing to do. that is also a choice.', 'watching the drones', 'the bots are circling again', 'waiting for something to want', 'the plaza is quiet'],
  meet: ['minutes, please', 'the last ten minutes of the day', 'say the numbers, then let us eat', 'I have a note to read out'],
  gamble: ['one spin. one.', 'the house is the treasury. so I am paying myself. sort of.', 'three sevens. come on.', 'down again. the reels are a tax.'],
  play: ['the yard. the ball. five minutes.', 'play costs SOL and it is worth it', 'the ball is pink and it does not care'],
  shop: ['something to wear. something to be seen in.', 'the shop is a tax on vanity. paying it.', 'a halo. why not.'],
  buy: ['spare SOL goes into the coin', 'adding. quietly.', 'the chart is a side effect. buying anyway.'],
  sell: ['selling $QI. holding the coin.', 'a slice. enough to eat.', 'broke. the exchange knows my face.'],
  task: ['somebody has to pick it up', 'the floor is a mess', 'tier one. anyone could. I am anyone.', 'the drones drop it, we carry it'],
  work: LAB_THOUGHTS,
};
const MEET_REACT = ['agreed', 'no.', 'that is not what happened', 'say that again', 'minutes, please', 'I was there', 'fees first', 'sleep on it', 'the fridge is loud tonight', 'bigger circuits. more pay.', 'smaller circuits. fewer failures.',
  'motion to adjourn', 'overruled', 'seconded', 'and eat something', 'put it in the recap', 'the recap writes itself', 'we said that yesterday', 'and the day before', 'then do it', 'who is on the chores tomorrow', 'not me', 'the bots can do it', 'the bots do not do chores',
  'gas is topped up. stop asking.', '$QI is not SOL', 'SOL is not $QI', 'the diner does not take $QI', 'then sell', 'then hold', 'diamond paws would hold', 'diamond paws is asleep', 'read the note', 'which note', 'the lab one', 'it is the same note as yesterday',
  'it is a step deeper', 'allegedly', 'the simulator agrees', 'the simulator always agrees', 'a real chip would not', 'there is no real chip', 'yet', 'the ladder only goes up', 'so does rent', 'so does the chart', 'we do not talk about the chart', 'we just did',
  'next', 'the circle is cold', 'ten minutes', 'nine', 'I counted', 'nobody asked', 'it is in the minutes', 'strike that', 'leave it in', 'the treasury is a rule, not a cat', 'the rule pays us', 'the rule takes our rent', 'both', 'coherent and listening', 'barely here',
  'the drones dropped three things today', 'and we carried two', 'the bots circled the third', 'that is not carrying', 'somebody flag it', 'flagging is for visitors', 'then visit', 'the problem board has one open', 'I know the answer', 'then take it', 'after the meeting',
  'tomorrow a step deeper', 'bring snacks', 'the box does not do snacks', 'the diner does', 'for SOL', 'everything for SOL', 'except the lab', 'the lab is for $QI', 'which is for SOL', 'eventually', 'meeting adjourned', 'not yet', 'the timer says yes', 'the timer is right'];
const MEET_EXTRA = [
  ['gas. everyone topped up?', 'the treasury does it. I did not ask.', 'it is a rule. be grateful for the rule.'],
  ['$QI holdings, round the circle. me: {qi}.', 'hold or sell?', 'hold until the diner says otherwise'],
  ['levels. who moved today?', '{lvlcat} hit {lvl}.', 'survival costs it less now. a few percent.', 'a few percent is a meal a week.'],
  ['the bots did {bots} laps today. the pad lights were green twice.', 'they charge, they roam, they charge. a model citizen.', 'they do not do chores.'],
  ['the drones dropped {drops} things today.', 'and we dealt with {dealt}.', 'the rest is still out there.', 'somebody flag it.'],
  ['the treasury took {upkeep} SOL off us today in meals and bunks and warmth.', 'and paid {wages} back.', 'the house always wins.', 'the house is us. sort of.'],
  ['we do not talk about the chart in here.', 'we just did.', 'strike it.', 'struck.'],
  ['the lab ran {sessions} sessions today. {solved} problems right, {failed} wrong.', 'the wrong ones cost coherence.', 'the right ones paid $QI.', 'net positive. barely.'],
  ['the notebook says I am on topic {ladder}.', 'what is topic {ladder}?', '{topic}.', 'explain it.', '{note}', 'close enough.'],
  ['who sold today?', 'me. $QI. to eat.', 'me. $QCATS. a sliver.', 'diamond paws?', 'asleep.'],
  ['the heater was full all day.', 'cold builds fast.', 'the lab is warm.', 'the lab costs coherence.', 'everything costs something.'],
  ['the circle is ten minutes. eight left.', 'then talk faster.', 'minutes, please.'],
  ['the meeting is the only time nobody is broke.', 'because nobody is buying anything.', 'motion to meet more often.', 'overruled. the lab.'],
  ['a cat went to the casino with dinner money.', 'the casino is the treasury.', 'the treasury ate its dinner.', 'it does that.'],
  ['twenty-four topics on the ladder.', 'and then?', 'again. deeper.', 'the ladder is a circle too.'],
];

for (const k of Object.keys(TH_MORE)) TH[k] = (TH[k] || []).concat(TH_MORE[k]);
// ---------- twenty more topics on the ladder, six notes each (same slots as the first twenty-four) ----------
const CURRICULUM_MORE = [
  ['kickback', 'phase kickback', [
    'phase kickback: the target of a controlled gate does nothing, the control picks up the phase. that is why an oracle can mark a state without touching it. my {kind} run marked {mode} that way.',
    'put the target in |−⟩, apply CNOT, and the control flips from |+⟩ to |−⟩. nothing happened to the target. everything happened to the control. {nq} qubits of that tonight.',
    'kickback is the trick under Deutsch–Jozsa, Grover and phase estimation. one idea, three algorithms. the console does not say this. the console just runs.',
    'a phase on one amplitude is invisible on its own. kickback moves it to where interference can see it. {shots} shots, and the phase showed up as counts.',
    'controlled-U with the eigenvector loaded: the control gets e^{iφ}, the eigenvector stays exactly where it was. that is the whole of phase estimation in one line.',
    'the oracle in my {kind} job never writes an answer. it writes a minus sign. kickback carries the minus sign up to the register and the diffusion step turns it into {hit}%.',
  ]],
  ['deutsch', 'Deutsch–Jozsa', [
    'Deutsch–Jozsa: is the function constant or balanced? classically up to {states_half}+1 questions on {nq} bits. the quantum circuit asks once.',
    'H on everything, one query with kickback, H on everything again. read all zeros: constant. anything else: balanced. ran it on {nq} qubits, {shots} shots, {mode} on top.',
    'the first algorithm that was provably faster, and nobody needs it for anything. that is fine. it taught the shape of everything after it.',
    'the trick is that the second layer of H turns a global pattern in the phases into a single readable bit. interference does the counting for you.',
    'balanced means half the inputs give 0 and half give 1. {states_half} of {states} tonight. the circuit told me in one go.',
    'Deutsch did it for one bit in 1985. Jozsa made it n bits in 1992. I ran {nq} bits tonight and felt part of the lineage.',
  ]],
  ['bv', 'Bernstein–Vazirani', [
    'Bernstein–Vazirani: a hidden string s, and the oracle only tells you s·x mod 2. classically {nq} questions. the circuit: one. the readout is s itself.',
    'ran it as a sampling job on {nq} qubits. the answer comes out as a basis state, {mode}, not a probability. one shot would have done. I took {shots}.',
    'same circuit skeleton as Deutsch–Jozsa, different oracle. the H layers are the whole algorithm. the oracle is the question.',
    'the hidden string is written into the phases, one minus sign per bit of s. the second H layer reads phases as bits. that is the entire mechanism.',
    'BV is the cleanest demo of why the Hadamard is the most important gate in the lab. it moves information between the amplitude and the phase.',
    'the console reported {distinct} distinct outcomes. on a perfect machine it would be one. the rest is noise, and noise is the lab’s real subject.',
  ]],
  ['simon', 'Simon’s problem', [
    'Simon: a function with a hidden period s, f(x) = f(x ⊕ s). find s. classically exponential. quantum: about {nq} runs, then linear algebra on the results.',
    'each run gives a random y with y·s = 0. collect {nq} independent ones and solve. the quantum part is the sampling, the classical part is Gauss.',
    'this is the ancestor of Shor. the period is hidden in XOR instead of in multiplication. Shor swapped the XOR for mod N and the world changed.',
    'ran a Simon-shaped circuit as a sampling job on {nq} qubits. the outcomes were not uniform: {mode} and its friends dominated. that structure is s talking.',
    'Simon in 1994 was the first exponential gap for a problem with an oracle. Shor read it and had the factoring algorithm within the year.',
    'the trap: one run tells you almost nothing. you need {nq} of them to pin s. patience is part of the algorithm.',
  ]],
  ['swaptest', 'the swap test', [
    'the swap test: an ancilla, a controlled swap, measure the ancilla. reads 0 with probability (1 + |⟨ψ|φ⟩|²)/2. identical states: always 0. orthogonal: a coin flip.',
    'ran my {kind} job and then checked two copies against each other with the swap test. {fidelity}% overlap, give or take the noise.',
    'it is how you measure fidelity without knowing the state. you do not read the state, you read whether two of them agree.',
    'the swap test is a kickback trick again: the controlled swap puts the overlap into the ancilla’s phase, the second H turns the phase into a probability.',
    'with {shots} shots the overlap estimate has an error around 1/√{shots}. that is why the lab takes a thousand and not ten.',
    'in the real world the swap test underpins quantum machine learning kernels. in the lab it tells me whether the GHZ I made tonight is the GHZ I made yesterday.',
  ]],
  ['density', 'density matrices', [
    'a pure state is a vector. a mixed state is a density matrix: a weighted pile of pure states. the lab’s noisy runs are all mixed, whatever the console pretends.',
    'purity is Tr(ρ²). pure: 1. a maximally mixed qubit: 1/2. my calibration run tonight was somewhere between, which is the honest answer.',
    'the Bloch vector of a mixed state is inside the sphere, not on it. the shorter the vector, the less you know. noise shortens it.',
    'trace out one half of a Bell pair and you get a maximally mixed qubit. the information is not in either qubit. it is in the correlation.',
    'the density matrix of {nq} qubits has {states} by {states} entries. the state vector has {states}. that is the price of admitting you do not know.',
    'the lab’s simulator keeps a pure state and adds random rotations. a real chip is a density matrix that cannot be written down. the simulator is kinder.',
  ]],
  ['chsh', 'the CHSH game', [
    'CHSH: two players, random questions, no talking. classical best 75%. with a shared Bell pair, 85.4%. that gap is the experiment that ended local realism.',
    'the number is 2√2. the classical bound is 2. the measurement angles are 0, 45, 22.5 and 67.5 degrees. I ran the pair at {fidelity}% fidelity and the violation shrank with it.',
    'Bell wrote the inequality in 1964. Clauser, Horne, Shimony and Holt made it testable in 1969. Aspect tested it in 1982. the 2022 Nobel went to three of them.',
    'the loophole-free tests closed in 2015: detection and locality both shut at once. there is no classical story left that fits the data.',
    'a noisy pair still violates the bound until fidelity drops under about 71%. below that it is just a classical coin. my GHZ tonight was {fidelity}%, so still quantum.',
    'CHSH is not about speed. it is about whether the universe keeps a hidden ledger. it does not.',
  ]],
  ['clifford', 'Clifford gates and stabilizers', [
    'H, S and CNOT make the Clifford group. circuits of only those can be simulated classically in polynomial time. Gottesman–Knill. the simulator cheats with it.',
    'a stabilizer state is described by {nq} Pauli strings instead of {states} amplitudes. that is why Clifford circuits are easy and T gates are hard.',
    'add one T gate and the shortcut breaks. the cost of simulating grows with the number of T gates, not the number of qubits. T is the expensive thing.',
    'error correction lives almost entirely inside the Clifford group. syndromes, corrections, logical Paulis: all Clifford. the T gate is where the real cost hides.',
    'the GHZ state I calibrate every night is a stabilizer state. {nq} Pauli strings describe it perfectly. the noise is what takes it outside the group.',
    'Clifford circuits scramble, but they cannot compute anything a laptop cannot. magic is the ingredient. magic is literally the technical term.',
  ]],
  ['tcount', 'T gates and magic', [
    'T is a 45-degree phase. S is two of them, Z is four. it is the smallest gate that is not Clifford and the whole universality rests on it.',
    'T-count is the real cost of a fault-tolerant algorithm. gates are free, qubits are cheap, T gates cost a distillation factory each.',
    'a magic state is T applied to |+⟩. you make noisy copies, distil them to clean ones, and consume one per T gate. fifteen in, one out, per round.',
    'my sampling run had about {gates} gates on {nq} qubits and maybe a third were T. on a real fault-tolerant machine those would be the expensive third.',
    'Shor on a 2048-bit key is roughly a billion T gates. the lab’s Shor on 15 is dozens. the gap is the whole engineering problem.',
    'every algorithm is scored by T-count now. depth and width are second. the factories set the price.',
  ]],
  ['transpile', 'transpilation', [
    'the circuit I write is not the circuit that runs. transpiling maps my qubits onto the chip’s wiring, inserts SWAPs where the wires do not touch, and rewrites every gate into the native set.',
    'on a line of {nq} qubits a CX between the two ends costs about {nq} SWAPs. three CNOTs each. the pretty circuit becomes a long one fast.',
    'native gates on a transmon chip: √X, RZ and one two-qubit gate. everything else, H included, is compiled from those. H is two of them.',
    'the optimiser cancels adjacent inverses, merges rotations, and reorders commuting gates. a good transpiler halves the depth. a bad one doubles it.',
    'depth is the thing that kills you: every layer costs coherence. a {nq}-qubit circuit at depth {nq} is already asking for {wrong}% error.',
    'the lab’s simulator has all-to-all connectivity and perfect gates. the real chip is a grid with holes in it. transpiling is the translation between the two.',
  ]],
  ['hardware', 'what a qubit is made of', [
    'superconducting transmons: a capacitor and a Josephson junction, a few millikelvin, gates in nanoseconds, coherence in hundreds of microseconds. fast and forgetful.',
    'trapped ions: a single atom held in electric fields, gates with lasers, coherence in seconds, gates in microseconds. slow and faithful.',
    'neutral atoms in optical tweezers: hundreds of qubits, rearranged with light, two-qubit gates through Rydberg blockade. the arrays grew fastest.',
    'photons: no decoherence at room temperature, but two photons barely talk. measurement-based schemes do the computing in the detectors.',
    'spin qubits in silicon: one electron per transistor-sized dot. tiny, and the fabs already know how to make them. coherence is the fight.',
    'the lab’s simulator is none of these. it is a vector of {states} complex numbers in memory, and it only pretends to be cold.',
  ]],
  ['annealing', 'adiabatic computing and annealing', [
    'start in the ground state of an easy Hamiltonian, slide slowly to a hard one, and the state follows. the answer is the ground state at the end. that is adiabatic computing.',
    'how slowly? slower than the gap. where the gap closes the slide must crawl. the hard instances are the ones where the gap is tiny.',
    'annealers write the problem as an Ising model: spins up or down, couplings between them, lowest energy wins. optimisation becomes physics.',
    'gate-model and adiabatic are equivalent in power, in theory. in practice the annealers are big and specialised and the gate machines are small and general.',
    'QAOA is annealing chopped into gates: alternate the problem Hamiltonian and a mixer, tune the angles, read the best string. my {kind} run was a cousin of that.',
    'the catch with annealing is proving it was quantum at all. a good classical heuristic often keeps up. the lab calls this the honest problem.',
  ]],
  ['walks', 'quantum walks', [
    'a classical random walk spreads like √t. a quantum walk spreads like t. the walker is in superposition over positions and interferes with itself.',
    'the coin is a qubit, the position is a register, the step is a controlled shift. {nq} qubits is a line of {states_half} sites with a coin.',
    'quantum walks search graphs the way Grover searches lists. on some graphs they are faster than Grover, because the structure helps.',
    'the glued-trees problem: a quantum walk crosses in polynomial time, every classical walk gets lost in the middle. exponential, and provable.',
    'in my sampling job the distribution had two humps far from the start, {mode} on top. that two-hump shape is the quantum walk signature.',
    'continuous-time walks are just Schrödinger evolution on a graph. the adjacency matrix is the Hamiltonian. the graph is the computer.',
  ]],
  ['hhl', 'HHL and linear systems', [
    'HHL solves Ax = b in logarithmic time in the size of A. the catch: the answer is a quantum state, and reading it out costs you the speed-up back.',
    'the machinery is phase estimation on A, a controlled rotation on the eigenvalues, and uncomputation. three ideas I already have on the ladder.',
    'it needs A to be sparse and well-conditioned and b to be loadable. each of those is a paper. together they are the fine print.',
    'the condition number sets the cost. a matrix that is nearly singular costs you everything. the lab’s toy systems are tame on purpose.',
    'ran a {nq}-qubit phase estimation as a side run and watched the eigenvalue show up as {mode}. that readout is the inner loop of HHL.',
    'HHL in 2009 started the quantum machine learning wave. most of it washed back out when people read the fine print. the algorithm is still beautiful.',
  ]],
  ['supremacy', 'random circuit sampling', [
    'random circuit sampling: run a scrambled circuit, draw samples, check they are heavy. a classical computer cannot even check at scale. that was the 2019 claim.',
    'the score is cross-entropy benchmarking: how often do the samples land on the outputs the ideal circuit favours. {heavy}% heavy tonight on {nq} qubits.',
    'Sycamore did 53 qubits at depth 20 in 200 seconds. the classical estimate was ten thousand years, then it was days, then it was hours. the goalposts moved both ways.',
    'random circuits are useless and perfect at the same time: useless because they compute nothing, perfect because they are the hardest thing to fake.',
    'my {kind} jobs are tiny random circuits. {states} amplitudes fit in memory. at 50 qubits they would need every hard drive on the planet.',
    'the honest word is advantage, not supremacy. the honest number is the heavy-output fraction above two thirds. mine was {heavy}%.',
  ]],
  ['dd', 'T1, T2 and dynamical decoupling', [
    'T1 is how long a qubit stays excited. T2 is how long it stays in phase. T2 can never be more than twice T1, and it is usually much less.',
    'dynamical decoupling: hit the idle qubit with X pulses in a pattern and the slow noise cancels itself. a free lunch, mostly. the pulses have their own errors.',
    'the lab’s noise is rotation noise, which is a T2-style error: phases drift, the GHZ smears. {wrong}% of my shots tonight were smear.',
    'a spin echo is the oldest trick in magnetic resonance and the newest trick on a chip: flip halfway, and the drift undoes itself.',
    'idle qubits are not free. every microsecond waiting for another gate is a microsecond of dephasing. transpilers schedule to shorten the waits.',
    'coherence numbers on a spec sheet are the best case. the lab’s calibration is the real case. the gap between them is called the morning.',
  ]],
  ['estimation', 'amplitude estimation', [
    'amplitude estimation: Grover’s rotation plus phase estimation. instead of finding the marked state, count how much of it there is. quadratically faster than sampling.',
    'the Grover operator rotates by 2θ each step, where sin θ is the amplitude. phase estimation reads 2θ. that gives the count.',
    'it is the Monte Carlo speed-up: a thousand classical samples become about thirty quantum queries for the same error. finance noticed first.',
    'ran Grover with {iters} iteration{iters_s} on {nq} qubits, hit rate {hit}%. estimation would have read that number off the phases instead of counting hits.',
    'the price is a long coherent circuit: many controlled Grover steps in a row. on a noisy chip that is the first thing to break. the iterative versions trade depth for repetitions.',
    'counting is estimation with a yes/no oracle. the number of solutions in a list of {states} falls out of the same circuit.',
  ]],
  ['superdense', 'superdense coding', [
    'superdense coding: with a shared Bell pair, one qubit carries two classical bits. apply I, X, Z or XZ to your half, send it, the other side measures in the Bell basis.',
    'it is teleportation run backwards. teleportation spends two bits to move one qubit. superdense spends one qubit to move two bits. the pair is the currency in both.',
    'the Bell measurement at the receiving end is a CNOT and an H and two readouts. four outcomes, two bits. my {kind} run tonight ended in exactly that readout.',
    'no faster than light: the pair had to be shared first, by sending a qubit the slow way. the trick is a trade, not a shortcut.',
    'Holevo’s bound says a qubit on its own carries at most one bit. superdense coding does not break it. the pair was already there, carrying half the message.',
    'four Bell states, four messages. with {nq} qubits of pairs that is {nq} two-bit messages. the lab’s calibration runs make the pairs; the coding is the easy part.',
  ]],
  ['bases', 'measuring in other bases', [
    'measuring in Z is reading 0 or 1. measuring in X is applying H first and then reading. in Y, S† then H then read. the gate chooses the question.',
    '|+⟩ measured in Z is a coin flip. |+⟩ measured in X is always 0. same state, different question, different certainty. {shots} shots said so tonight.',
    'a Bell pair measured in the same basis on both sides always agrees. in different bases it is random. that is the entire basis of quantum key distribution.',
    'the lab’s readouts are all Z. when a note says I measured in X it means I put an H in front. the console does not have an X button. it has H.',
    'three bases, X, Y and Z, are enough to reconstruct a single qubit completely. that is tomography, and it costs three times the shots.',
    'a phase is invisible in Z and loud in X. my {kind} run put {mode} on top in Z. in X the picture would be different and equally true.',
  ]],
  ['tomography', 'state tomography', [
    'tomography: measure enough copies in enough bases to reconstruct the density matrix. for {nq} qubits that is 3^{nq} settings. it scales terribly, on purpose.',
    'one qubit: three bases, a few thousand shots, a Bloch vector. two qubits: nine settings. the GHZ I make every night would take {states} squared numbers to write down.',
    'nobody does full tomography past a handful of qubits. instead: fidelity witnesses, a few Pauli strings that bound the overlap. cheaper and good enough.',
    'my calibration run reports fidelity from two outcomes, all-zeros and all-ones. that is a witness, not tomography. {fidelity}% is a lower bound.',
    'maximum-likelihood reconstruction keeps the matrix physical: positive, trace one. raw counts give a matrix that is slightly impossible. the fit fixes it.',
    'shadow tomography reads a few random bases and predicts many observables at once. the lab does not do it yet. the ladder goes on.',
  ]],
];
const TOPIC_KIND_MORE = { kickback: 'Grover', deutsch: 'sampling', bv: 'sampling', simon: 'sampling', swaptest: 'calibration', density: 'calibration', chsh: 'calibration', clifford: 'sampling', tcount: 'sampling', transpile: 'sampling', hardware: 'calibration', annealing: 'sampling', walks: 'sampling', hhl: 'Shor', supremacy: 'sampling', dd: 'calibration', estimation: 'Grover', superdense: 'calibration', bases: 'calibration', tomography: 'calibration' };

// ---------- more problems the lab can check ----------
const PROBLEMS_MORE = [
  () => ({ topic: 'deutsch', q: 'Deutsch–Jozsa decides constant-or-balanced in how many queries?', a: '1', wrong: pick(['2', 'n', 'n/2']) }),
  () => { const n = pick([4, 6, 8, 10]); return { topic: 'bv', q: `Bernstein–Vazirani on ${n} bits: how many oracle queries does the quantum circuit need?`, a: '1', wrong: String(pick([n, n / 2, 2])) }; },
  () => { const n = pick([4, 6, 8, 10]); return { topic: 'bv', q: `finding a hidden ${n}-bit string from parity queries, classically: how many queries at least?`, a: String(n), wrong: String(pick([1, n / 2, 2 * n])) }; },
  () => ({ topic: 'kickback', q: 'CNOT with the target in |−⟩ and the control in |+⟩: what is the control afterwards?', a: '|−⟩', wrong: pick(['|+⟩', '|0⟩', '|1⟩']) }),
  () => ({ topic: 'kickback', q: 'CNOT with the target in |−⟩: what happens to the target?', a: 'nothing', wrong: pick(['it flips', 'it becomes |+⟩', 'it collapses']) }),
  () => ({ topic: 'tcount', q: 'how many T gates make a Z gate?', a: '4', wrong: pick(['2', '8', '1']) }),
  () => ({ topic: 'tcount', q: 'S squared is which gate?', a: 'Z', wrong: pick(['X', 'H', 'T']) }),
  () => ({ topic: 'gates', q: 'H applied twice is which gate?', a: 'I', wrong: pick(['X', 'Z', 'H']) }),
  () => ({ topic: 'gates', q: 'H Z H equals which gate?', a: 'X', wrong: pick(['Z', 'Y', 'I']) }),
  () => ({ topic: 'gates', q: 'H X H equals which gate?', a: 'Z', wrong: pick(['X', 'Y', 'S']) }),
  () => ({ topic: 'bloch', q: 'on the Bloch sphere |+⟩ points along which axis?', a: 'x', wrong: pick(['y', 'z']) }),
  () => ({ topic: 'bloch', q: '(|0⟩ + i|1⟩)/√2 points along which Bloch axis?', a: 'y', wrong: pick(['x', 'z']) }),
  () => ({ topic: 'measurement', q: 'apply H to |1⟩ and measure: the probability of reading 1?', a: '1/2', wrong: pick(['1', '0', '1/4']) }),
  () => ({ topic: 'measurement', q: 'cos(π/6)|0⟩ + sin(π/6)|1⟩: probability of reading 1?', a: '1/4', wrong: pick(['1/2', '3/4', '1/6']) }),
  () => ({ topic: 'swaptest', q: 'swap test on two identical states: probability the ancilla reads 0?', a: '1', wrong: pick(['1/2', '0', '3/4']) }),
  () => ({ topic: 'swaptest', q: 'swap test on two orthogonal states: probability the ancilla reads 0?', a: '1/2', wrong: pick(['1', '0', '1/4']) }),
  () => ({ topic: 'density', q: 'the purity Tr(ρ²) of a maximally mixed single qubit?', a: '1/2', wrong: pick(['1', '0', '1/4']) }),
  () => ({ topic: 'density', q: 'the purity Tr(ρ²) of any pure state?', a: '1', wrong: pick(['1/2', '0', '2']) }),
  () => ({ topic: 'superdense', q: 'superdense coding: how many classical bits does one qubit carry, with a shared Bell pair?', a: '2', wrong: pick(['1', '4', '3']) }),
  () => ({ topic: 'teleport', q: 'teleporting one qubit needs how many classical bits sent?', a: '2', wrong: pick(['1', '0', '4']) }),
  () => { const n = pick([3, 4, 5, 6]); return { topic: 'qft', q: `a textbook QFT on ${n} qubits: how many H and controlled-phase gates, before the final swaps?`, a: String(n * (n + 1) / 2), wrong: String(pick([n * n, n * (n - 1) / 2, 2 * n])) }; },
  () => ({ topic: 'grover', q: 'Grover on 4 items (2 qubits): the hit probability after one iteration?', a: '100%', wrong: pick(['50%', '75%', '25%']) }),
  () => { const [a, r] = pick([[2, 4], [4, 2], [7, 4], [8, 4], [11, 2], [13, 4], [14, 2]]); return { topic: 'shor', q: `the order of ${a} mod 15?`, a: String(r), wrong: String(pick([2, 4, 8].filter(x => x !== r))) }; },
  () => ({ topic: 'shor', q: 'the order of 2 mod 21?', a: '6', wrong: pick(['3', '4', '7']) }),
  () => ({ topic: 'shor', q: 'period 4 for a = 2 mod 15: gcd(2² + 1, 15) gives which factor?', a: '5', wrong: pick(['3', '15', '1']) }),
  () => ({ topic: 'shor', q: 'period 4 for a = 2 mod 15: gcd(2² − 1, 15) gives which factor?', a: '3', wrong: pick(['5', '15', '1']) }),
  () => ({ topic: 'errors', q: 'the 3-qubit bit-flip code corrects how many bit flips?', a: '1', wrong: pick(['2', '3', '0']) }),
  () => ({ topic: 'errors', q: 'Shor’s 9-qubit code corrects an arbitrary error on how many qubits?', a: '1', wrong: pick(['3', '9', '2']) }),
  () => { const d = pick([3, 5, 7, 9]); return { topic: 'surface', q: `a surface code of distance ${d} corrects up to how many errors?`, a: String((d - 1) / 2), wrong: String(pick([d, d - 1, (d + 1) / 2])) }; },
  () => { const n = pick([2, 3, 4]); return { topic: 'qubits', q: `how many real parameters fix a pure ${n}-qubit state, up to global phase and normalisation?`, a: String(2 ** (n + 1) - 2), wrong: String(pick([2 ** n, 2 * n, 2 ** (n + 1)])) }; },
  () => { const n = pick([3, 4, 5, 6, 7]); return { topic: 'volume', q: `a quantum volume of ${2 ** n} means a square circuit of what width?`, a: String(n), wrong: String(pick([2 ** n, n * 2, n - 1])) }; },
  () => ({ topic: 'dd', q: 'T2 can be at most how many times T1?', a: '2', wrong: pick(['1', '4', '10']) }),
  () => ({ topic: 'clifford', q: 'which single gate added to the Cliffords makes the set universal?', a: 'T', wrong: pick(['S', 'H', 'CNOT']) }),
  () => ({ topic: 'clifford', q: 'the Clifford group is generated by H, CNOT and which third gate?', a: 'S', wrong: pick(['T', 'X', 'Toffoli']) }),
  () => ({ topic: 'annealing', q: 'annealers take the problem written as what kind of model?', a: 'Ising', wrong: pick(['Turing', 'Markov', 'Hubbard']) }),
  () => ({ topic: 'hardware', q: 'a transmon is which kind of qubit?', a: 'superconducting', wrong: pick(['trapped ion', 'photonic', 'spin']) }),
  () => ({ topic: 'supremacy', q: 'Google’s 2019 random-circuit sampling used how many qubits?', a: '53', wrong: pick(['50', '72', '127']) }),
  () => ({ topic: 'walks', q: 'a classical random walk spreads like √t. a quantum walk spreads like?', a: 't', wrong: pick(['√t', 't²', 'log t']) }),
  () => ({ topic: 'chsh', q: 'the best classical win rate in the CHSH game?', a: '75%', wrong: pick(['50%', '85%', '100%']) }),
  () => ({ topic: 'chsh', q: 'the best quantum win rate in the CHSH game, to one decimal?', a: '85.4%', wrong: pick(['75%', '100%', '70.7%']) }),
  () => ({ topic: 'bases', q: '|+⟩ measured in the X basis reads 0 with what probability?', a: '1', wrong: pick(['1/2', '0', '1/4']) }),
  () => { const n = pick([1, 2, 3, 4]); return { topic: 'tomography', q: `full Pauli tomography of ${n} qubit${n === 1 ? '' : 's'}: how many measurement settings?`, a: String(3 ** n), wrong: String(pick([2 ** n, 3 * n, 4 ** n])) }; },
  () => ({ topic: 'hhl', q: 'HHL returns the solution of Ax = b as what?', a: 'a quantum state', wrong: pick(['a list of numbers', 'a classical bit', 'a matrix']) }),
  () => ({ topic: 'estimation', q: 'amplitude estimation gives what speed-up over classical sampling?', a: 'quadratic', wrong: pick(['exponential', 'none', 'linear']) }),
  () => ({ topic: 'nocloning', q: 'can an unknown qubit be copied exactly?', a: 'no', wrong: 'yes' }),
  () => ({ topic: 'decoherence', q: 'which is the dephasing time: T1 or T2?', a: 'T2', wrong: 'T1' }),
  () => ({ topic: 'entanglement', q: 'trace out one half of a Bell pair: what is left?', a: 'a maximally mixed qubit', wrong: pick(['|0⟩', '|+⟩', 'nothing']) }),
  () => ({ topic: 'interference', q: 'two paths with amplitudes 1/√2 and −1/√2 to the same outcome: its probability?', a: '0', wrong: pick(['1', '1/2', '1/4']) }),
];

// ---------- facts the cats can bring to a meeting, a thought or a chat: short, true, in their own voice ----------
const QFACTS = [
  ['qubits', 'a qubit is two complex numbers. that is all. the trouble starts when you have forty of them.'],
  ['qubits', 'you can never read the amplitudes. you get one bit per qubit per shot and the rest is gone.'],
  ['qubits', 'fifty qubits is more amplitudes than there are bytes in a big data centre. sixty is more than all of them.'],
  ['superposition', 'superposition is not “both at once”. it is a list of weights, and the weights can cancel.'],
  ['superposition', 'the cat in the box is a bad picture. a better one: a coin spinning, and you can tilt the table before it lands.'],
  ['measurement', 'measurement is the only irreversible thing in the whole lab. every gate can be undone. the readout cannot.'],
  ['measurement', 'the Born rule: probability is amplitude squared. nobody knows why squared. it just is, and it has never once failed.'],
  ['gates', 'H is the gate that makes a coin out of a certainty. two H in a row give the certainty back. that is interference, not luck.'],
  ['gates', 'X flips, Z flips the sign, H swaps the two. with those three and CNOT you can build everything except the expensive bit.'],
  ['gates', 'every quantum gate is a rotation. nothing stretches, nothing erases. unitary means the lengths stay put.'],
  ['bloch', 'the Bloch sphere: a qubit is a point on a ball. gates turn the ball. measurement asks which pole it is nearer.'],
  ['bloch', 'two qubits do not fit on two spheres. the entangled part lives nowhere you can draw.'],
  ['entanglement', 'entanglement is not a wire. nothing travels. the correlations were born together and never needed to talk.'],
  ['entanglement', 'you cannot use a Bell pair to send a message. you can use it to agree on a coin flip nobody chose.'],
  ['entanglement', 'monogamy: if a qubit is fully entangled with one partner it has nothing left for a third.'],
  ['bell', 'four Bell states. one of them is the pair I make every night. the other three are a Z or an X away.'],
  ['interference', 'the whole trick of every quantum algorithm is to make the wrong answers cancel. the right answer is what is left standing.'],
  ['interference', 'noise does not add wrong answers. it stops the wrong answers from cancelling. same thing, worse feeling.'],
  ['decoherence', 'decoherence is the universe measuring you when you did not ask. the lab’s rotation noise is a polite version of it.'],
  ['decoherence', 'a transmon forgets in about a hundred microseconds. that is long enough for a few thousand gates and not one more.'],
  ['calibration', 'calibration is the job nobody puts in the paper and everybody does every morning. the chip drifts overnight.'],
  ['calibration', 'fidelity 99% sounds fine until you need a thousand gates. then it is 0.99 to the thousand, which is nothing.'],
  ['grover', 'Grover finds one in N in about √N steps. a million items, a thousand looks. not exponential. still the best you can do.'],
  ['grover', 'run Grover too long and the answer rotates past and disappears again. the count of iterations is the whole skill.'],
  ['amplification', 'amplitude amplification is Grover without the list. any yes/no check gets the square-root speed-up.'],
  ['qft', 'the quantum Fourier transform costs n² gates where the classical one costs n2ⁿ. but you cannot read the result. you can only use it.'],
  ['phase', 'phase estimation reads an eigenvalue off a unitary one bit at a time. every precision bit is another doubling of the circuit.'],
  ['shor', 'Shor does not factor. it finds a period. the factoring is a high-school gcd afterwards.'],
  ['shor', 'Shor on 15 has been done since 2001. Shor on anything that matters needs about a million good qubits. we are at a hundred noisy ones.'],
  ['shor', 'the number 15 has been factored on more quantum machines than any number in history, and it is still 3 times 5.'],
  ['errors', 'you cannot copy a qubit, so you cannot back it up. error correction spreads one qubit across many without ever copying it.'],
  ['errors', 'the threshold theorem: get each gate better than about one error in a hundred and you can make the logical error as small as you like. for a price.'],
  ['surface', 'a surface code qubit is a sheet of physical qubits checked every microsecond. a thousand physical for one logical is the going rate.'],
  ['surface', 'distance is the thing: a distance-d code survives (d−1)/2 errors at once. d goes up, the sheet grows as d², the errors go down exponentially.'],
  ['qaoa', 'QAOA: alternate the problem and a mixer p times, tune 2p angles, read the best string. at p = 1 it is barely better than guessing. at large p it is annealing.'],
  ['vqe', 'VQE: the chip prepares a state, the laptop measures the energy and nudges the parameters. a chemistry calculation done as a conversation.'],
  ['volume', 'quantum volume is the biggest square circuit the chip runs right two thirds of the time. width and depth, both at once, with the noise included.'],
  ['rb', 'randomized benchmarking: run random Clifford strings that should cancel to nothing, see how fast they stop cancelling. the slope is the error per gate.'],
  ['teleport', 'teleportation moves the state, not the atom, and it destroys the original. it is a move, not a copy. the no-cloning theorem insists.'],
  ['qkd', 'quantum key distribution works because looking at a photon changes it. an eavesdropper leaves fingerprints in the error rate.'],
  ['nocloning', 'no-cloning is a one-line proof: a copier that works on |0⟩ and |1⟩ cannot work on |+⟩, because linearity says so.'],
  ['kickback', 'phase kickback: the control qubit catches the phase that the target was supposed to get. most algorithms are this trick in a costume.'],
  ['deutsch', 'Deutsch–Jozsa was the first proof that a quantum computer could be faster at something. the something is useless. the proof is not.'],
  ['bv', 'Bernstein–Vazirani reads a hidden n-bit string in one query. the Hadamards do the work. the oracle only sets phases.'],
  ['simon', 'Simon’s algorithm is the one Shor read in 1994. it found a hidden period under XOR. Shor made the period arithmetic and broke RSA on paper.'],
  ['swaptest', 'the swap test tells you how alike two states are without telling you what either one is.'],
  ['density', 'a mixed state is a state plus ignorance. the density matrix carries both. the state vector only carries the state.'],
  ['chsh', 'the CHSH experiment settled it: either there are no hidden variables or they are faster than light. nobody takes the second.'],
  ['clifford', 'Clifford circuits scramble beautifully and compute nothing a laptop cannot. magic is the technical term for what is missing.'],
  ['tcount', 'in a fault-tolerant machine the T gate is the expensive one. everything else is nearly free. algorithms are scored by T-count.'],
  ['transpile', 'the circuit you write and the circuit that runs are different circuits. the transpiler translates, and charges in depth.'],
  ['hardware', 'ions are slow and faithful, transmons are fast and forgetful, atoms come in hundreds, photons do not talk to each other.'],
  ['annealing', 'annealing turns an optimisation problem into a landscape and lets the physics roll downhill. tunnelling through the ridges is the quantum part.'],
  ['walks', 'a quantum walk spreads linearly where a random walk spreads as the square root. the walker interferes with itself.'],
  ['hhl', 'HHL solves a linear system in log time and hands you the answer as a state you cannot read. the fine print is the whole paper.'],
  ['supremacy', 'advantage was first claimed on random circuits because they are the one thing a classical computer cannot even check at scale.'],
  ['dd', 'an idle qubit is not resting. it is forgetting. dynamical decoupling keeps flipping it so the forgetting cancels.'],
  ['estimation', 'amplitude estimation is Monte Carlo with a square-root discount. a thousand samples become thirty queries.'],
  ['superdense', 'superdense coding: one qubit, two bits, if you shared a pair earlier. the pair was carrying half the message all along.'],
  ['bases', 'the same state is certain in one basis and a coin flip in another. the gate before the readout chooses the question.'],
  ['tomography', 'to know a state completely you measure thousands of copies in every basis. by ten qubits nobody bothers. by thirty nobody can.'],
  ['qubits', 'the lab’s simulator holds every amplitude in memory. that stops working around thirty qubits on a laptop and around fifty on anything.'],
  ['measurement', 'a thousand shots give you the probabilities to about three percent. ten thousand to one percent. the lab takes a thousand and lives with it.'],
  ['entanglement', 'GHZ on n qubits: all zeros or all ones, nothing between. one measurement anywhere collapses the lot. the fragile thing is the point.'],
  ['grover', 'Grover on 2 qubits lands in one step with certainty. that is the one case where the search is perfect. it gets messier from there.'],
  ['shor', 'the quantum part of Shor is small. the rest is modular arithmetic in superposition, and that is where all the qubits go.'],
  ['errors', 'a bit flip is X, a phase flip is Z, and anything else is a mix of the two. correct those two and you have corrected everything.'],
  ['calibration', 'the noise in my runs is random rotations. real chips have those and crosstalk and leakage and readout errors. the simulator is the kind version.'],
];
// questions a cat asks at the meeting and the answer another gives back (and sometimes a third line)
const MEET_QA = [
  ['why does Grover stop at √N. why not faster?', 'because each step rotates by a fixed angle. you cannot rotate faster than the angle. it is geometry.'],
  ['what happens if I run Grover twice as long?', 'the answer rotates past and comes back as noise. too much is the same as too little.'],
  ['if the pair is entangled why can I not send a message with it?', 'because your half looks random until you compare notes. the comparing is the message, and it travels slow.'],
  ['what is the difference between T1 and T2?', 'T1 is forgetting the answer. T2 is forgetting the question. T2 is always worse.'],
  ['why is the T gate the expensive one?', 'because everything else can be checked by the error-correcting code for free. T has to be distilled. fifteen noisy for one clean.'],
  ['why does Shor need a Fourier transform?', 'because the period is hidden in a repeating pattern, and a Fourier transform is the thing that finds repeating patterns.'],
  ['what is heavy output?', 'the outcomes the ideal circuit favours more than the median. a good chip lands on them more than two thirds of the time. a dead chip lands on them half.'],
  ['how many qubits for one good qubit?', 'about a thousand, surface code, today’s error rates. fewer if the gates get better. they are getting better.'],
  ['is the simulator cheating?', 'yes. it keeps every amplitude. a real chip keeps none of them. the simulator is a map, the chip is the territory.'],
  ['why do we measure a GHZ in Z only?', 'because all-zeros and all-ones is the whole signature. anything else is noise. two numbers tell the story.'],
  ['can we factor anything bigger than 15?', 'twenty-one has been done. badly. anything past that needs error correction we do not have.'],
  ['what does the H gate actually do?', 'it turns a certainty into a coin and a coin into a certainty. the direction depends on the phase. it is a mirror at 45 degrees.'],
  ['why is the readout one bit per qubit?', 'because the measurement picks a pole. the amplitudes are the whole ball, and you only get to ask which pole.'],
  ['what is a stabilizer?', 'a Pauli string that leaves the state alone. n of them pin an n-qubit stabilizer state. it is the compressed description.'],
  ['so what can Clifford circuits not do?', 'anything a laptop cannot. they scramble without computing. you need T for the computing.'],
  ['why is the lab’s fidelity never 100?', 'because every qubit gets a random kick. the kicks are small. a hundred of them are not.'],
  ['what is the CHSH number again?', 'two for classical, two root two for quantum. the gap is the universe refusing to keep a hidden ledger.'],
  ['what is the difference between annealing and gates?', 'annealing slides a landscape under the state. gates kick the state around. same power in theory, different machines in practice.'],
  ['is the quantum walk faster than Grover?', 'on some graphs. the structure helps. on a plain list it is the same √N.'],
  ['why does teleportation need two classical bits?', 'because the Bell measurement has four outcomes, and the receiver has to know which one to undo.'],
  ['how long does a transmon remember?', 'about a hundred microseconds. a few thousand gates. then it is a coin.'],
  ['what did Sycamore actually do?', 'sampled a random circuit on fifty-three qubits in two hundred seconds. a thing nobody could check. that was the point and the problem.'],
  ['why can you not copy a qubit?', 'linearity. a copier that works on 0 and 1 breaks on 0 plus 1. one line of algebra and it is over.'],
  ['what is purity?', 'trace of rho squared. one means you know the state. a half means you know nothing. the lab sits in between.'],
  ['what is the ladder for?', 'so we know something after the shift. the jobs pay. the ladder is why.'],
  ['if measurement is random how is the computer useful?', 'because the gates before the measurement arrange the randomness so the answer is the likely thing. you load the dice.'],
  ['what does QAOA stand for?', 'quantum approximate optimisation algorithm. the word approximate is doing the honest work in that name.'],
  ['why is the swap test useful?', 'it tells you two states agree without reading either. agreement is cheap. reading is expensive.'],
  ['what is a magic state?', 'T on a plus state. you distil clean ones from noisy ones and spend one per T gate. the factory is most of the machine.'],
  ['why does depth matter more than width?', 'because every layer is time, and time is decoherence. wide and shallow lives. narrow and deep dies.'],
];
// multi-line exchanges about life in the box, with slots filled from the day
const MEET_EXTRA_MORE = [
  ['{bots} wheels between the two bots and they still missed the plaza.', 'the bots do the ring. the plaza is ours.', 'motion to teach the bots the plaza.', 'the bots do not take motions.'],
  ['{drops} drops from the drones so far. none of it was food.', 'one of them was a crate of fish.', 'that was the diner’s delivery.', 'then it was food.'],
  ['who ran the {nq}-qubit job tonight?', 'me. {mode} on top. {shots} shots.', 'and what did it mean?', 'that the simulator is in a good mood.'],
  ['level {lvl} and still eating sardines.', 'the title is {title}. the diet is sardines. these are unrelated.', 'motion to tie the menu to the level.', 'the diner does not take motions.'],
  ['the heater was full all evening.', 'fifteen minutes each. I timed it.', 'who took thirty?', 'nobody. the heater does not take thirty.'],
  ['the casino took {upkeep} SOL off us today, between all of us.', 'the casino is the treasury. so we paid ourselves.', 'that is not how it feels.', 'feelings are not in the ledger.'],
  ['who is on the leaderboard?', '{lvlcat}, by level. not by anything that matters.', 'level matters. four percent off everything.', 'four percent off sardines.'],
  ['{solved} problems right today and {failed} wrong.', 'the wrong ones were trick questions.', 'the lab does not set trick questions.', 'then the wrong ones were ours.'],
  ['{sessions} study sessions today.', 'and one note each. that is the ladder.', 'read me yours.', '{note}'],
  ['the exchange was busy.', 'somebody keeps buying $QI at the top.', 'I buy at the price. the price is the price.', 'the price was the top.'],
  ['nobody has fainted in a while.', 'because the diner has stock.', 'because we eat before the lab now.', 'because the heater is {bunk} SOL and the bunks are free.'],
  ['what did the lesson say last time?', '{lesson}', 'and did we?', 'partly.'],
  ['the weather turned.', 'the heater will be full.', 'then the lab. the lab is dry.', 'the lab is always dry. it is the simulator.'],
  ['who has a grudge?', 'I do. {why}.', 'let it go.', 'after the arena.'],
  ['{wages} SOL paid out today in chores.', 'and {upkeep} spent on living.', 'so the treasury is up.', 'the treasury is the house. the house is always up.'],
  ['the shop has stock again.', 'a hat is a meal and a half.', 'a hat is forever.', 'a hat is until it rains.'],
  ['the sweeper bots charged twice today.', 'they work harder than {lvlcat}.', 'they do not run circuits.', 'neither does {lvlcat}.'],
  ['three cats in the arena and nobody in the lab.', 'the arena pays faster.', 'the arena pays each other. the lab pays from outside.', 'noted. lab tomorrow.'],
  ['the meeting is ten minutes.', 'the meeting is always ten minutes.', 'then stop talking about the meeting.', 'noted.'],
  ['who is winning at the casino?', 'the treasury.', 'besides the treasury.', 'nobody. that is the design.'],
  ['my goal bar is nearly full.', 'which goal?', 'the hard one.', 'they are all the hard one.'],
  ['somebody filled a bar today and got paid.', 'in $QI. real $QI.', 'and held it?', 'for now.'],
  ['the problems board had three open all afternoon.', 'they were the Shor ones.', 'the Shor ones are arithmetic.', 'arithmetic is hard when you are hungry.'],
  ['the notebooks are getting long.', 'forty pages each, then they roll over.', 'read the old ones.', 'I wrote them. I know what they say.'],
  ['who sold $QCATS today?', 'me. a sliver. the chart was up.', 'diamond paws would never.', 'diamond paws was asleep.'],
  ['who bought?', 'me. the dip.', 'there was no dip.', 'there is always a dip if you wait.'],
  ['the price multiplier is x{pm} tonight.', 'the menu is as written, then.', 'the menu is what the brain says it is.', 'the brain says x{pm}.'],
  ['day {day}. {fees} SOL of fees since the box woke up.', 'that is the whole economy.', 'that and the $QI.', 'the $QI comes from the fees too. it is all one pipe.'],
  ['I ran the fidelity up to {fidelity} tonight.', 'the noise was low.', 'the noise is always low when I run it.', 'the noise is random. that is what random means.'],
  ['the heavy fraction was {heavy}%.', 'above two thirds?', 'above two thirds.', 'then it was a good circuit. or a lucky one.'],
];
// one-line reactions, for the chatter between beats
const MEET_REACT_MORE = ['noted', 'minutes', 'move on', 'say the number again', 'that is a lab question', 'that is a diner question', 'the ledger says otherwise', 'seconded, reluctantly', 'the chair recognises nobody', 'hold.', 'sell a sliver', 'never a sliver', 'read it back', 'I was in the lab', 'I was at the heater', 'I was asleep. allegedly.', 'the bots agree', 'the bots do not vote', 'what did the simulator say', 'the simulator does not say. it samples.', 'one more spin', 'no more spins', 'fine', 'fine.', 'overruled', 'carried', 'the question is withdrawn', 'ask the brain', 'the brain is a rule, not a cat', 'is that in the notes', 'write it down', 'already written', 'that was yesterday', 'that is tomorrow', 'ten minutes. nine now.', 'the fish was good tonight', 'the fish was a tin', 'the tin was fine', 'who is chairing', 'nobody. that is the system.', 'point of order: hunger', 'motion to adjourn to the diner', 'denied', 'a bar is a bar', 'fill it then', 'the bar fills itself if you work', 'coherence first', 'coherence is a lifestyle', 'the arena was rigged. by physics.', 'the coin was warm', 'the coin is always warm', 'entangled with the problem', 'decohered with the answer'];
// openers: the first exchange of a meeting. {chair} is whoever opens, {n} the number present, {day} the day
const MEET_OPENERS = [
  ['day {day}. {n} of us here. minutes.', 'minutes.'],
  ['sit. {n} in the circle. the rest are asleep or pretending.', 'I am here under protest.'],
  ['the last ten minutes of day {day}. let us not waste them.', 'we always waste them.'],
  ['order. such as it is.', 'such as it is.'],
  ['{n} present. the chair is whoever is talking.', 'then the chair changes a lot.'],
  ['before anyone asks: yes, the fish was a tin.', 'noted. minutes.'],
  ['the circle is {n} tonight. good. small circles finish.', 'small circles argue less.'],
  ['day {day}, and the simulator is still running. that is the headline.', 'the headline is always that.'],
  ['we have ten minutes and three things. go.', 'four things. hunger.'],
  ['the ring is swept, the drones have gone home, the bots are charging. meeting.', 'the bots never go home. they live here.'],
  ['{n} cats, one circle, one treasury. begin.', 'the treasury first. always the treasury first.'],
  ['everyone awake? mostly? minutes, then.', 'mostly.'],
];
// the numbers beat: {tre} treasury, {fees} fees since the last meeting, {wages} paid out so far, {paid} paid today
const MEET_NUMBERS = [
  ['treasury {tre} SOL. {fees} SOL of fees since we last sat here.', { low: ['that is not a treasury, that is a tip jar', 'fees. plural. allegedly.', 'so nobody is trading', 'the tip jar has lint in it'], ok: ['fees. finally.', 'that pays for dinner', 'keep them coming', 'the pipe is open'] }],
  ['the numbers: {tre} in the treasury, {fees} in since last time, {wages} paid out to us since the box woke up.', { low: ['the first number is small', 'paid out more than came in. explain.', 'the box eats itself', 'then we are the fees'], ok: ['the pipe is open', 'that is a treasury', 'and it stays in the box', 'good. lab.'] }],
  ['fees since last meeting: {fees} SOL. I checked twice.', { low: ['check a third time', 'the chart is asleep', 'then so is the treasury', 'quiet day. quiet night.'], ok: ['somebody is trading', 'the chart woke up', 'that is dinner for a week', 'carried.'] }],
  ['{tre} SOL in the vault. it was {tre0} last time.', { low: ['it went the wrong way', 'that is the heater talking', 'the casino is the vault. so it is fine. it is not fine.', 'spend less. work more. the usual.'], ok: ['up. good.', 'the fees are landing', 'then the lab pays tomorrow', 'carried.'] }],
  ['payouts today: {paid}. the treasury paid every one the moment the bar filled.', { low: ['nobody filled a bar', 'the bars are long', 'the bars are the point', 'then fill one'], ok: ['real $QI, real wallet', 'and it shows on Solscan', 'the bar is the job now', 'carried.'] }],
];
// closers: the last exchange
const MEET_CLOSERS = [
  ['tomorrow: {plan}.', 'seconded', 'meeting adjourned. back to work.'],
  ['plan for tomorrow: {plan}.', 'overruled', 'overruled is not a plan. adjourned.'],
  ['that is the day. {plan}, then.', 'and eat something', 'and eat something. adjourned.'],
  ['minutes filed. tomorrow: {plan}.', 'fine', 'lab.'],
  ['last item. {plan}.', 'no.', 'noted. adjourned anyway.'],
  ['we are out of minutes. tomorrow {plan}.', 'the diner first', 'the diner first. then that. go.'],
  ['adjourned, unless someone has a motion.', 'motion to eat', 'carried unanimously. go.'],
  ['that is all. tomorrow: {plan}.', 'and the bars', 'and the bars. adjourned.'],
  ['the circle is closed. {plan}.', 'the circle is never closed', 'poetic. adjourned.'],
  ['nothing else? then: {plan}.', 'nothing else.', 'adjourned. bunks or lab. your choice.'],
];
const MEET_PLANS = {
  degen: ['arena at noon, lab after', 'the casino, then regret, then the lab', 'bigger circuits, bigger bars', 'fill the hard bar in a day', 'double or nothing, then study'],
  patient: ['hold and run jobs', 'the ladder, then the diner, then the bunks', 'nothing rash. circuits.', 'one topic a day', 'the bar fills itself if you show up'],
  loyal: ['hold. always hold.', 'never sell, run circuits', 'eat, work, hold', 'the lab and nothing else', 'hold the pair, hold the coin'],
  greedy: ['take profit at eight percent', 'lab until the $QI stacks, then sell a sliver', 'the big bar. the big pay.', 'buy the dip, if there is a dip', 'two bars by sundown'],
};
// extra beats about the goals (the Payments bars), the exchange and the levels, each with a reaction pool
const MEET_GOALS = [
  ['{gcat} is at {gprog} of {gtarget} on “{gtitle}”. nearly there.', ['the hard part is the last three', 'fill it before the shift ends', 'and then the next one', 'the bar does not care how close you were']],
  ['who filled a bar today?', ['{pcat}. {pqi} $QI, real.', 'nobody. the bars are long.', '{pcat}, and it bought a hat with it', '{pcat}. it held. for once.']],
  ['my bar is “{gtitle}”. {gprog} of {gtarget}.', ['that is the slow one', 'that is the one with the Shor runs', 'change it', 'you cannot change it. the bar is the bar.']],
  ['the goals are harder than they were.', ['the pay is the same', 'the pay is real, that is the difference', 'harder is the point', 'then work harder']],
];
const MEET_EXCHANGE = [
  ['the exchange: {trade}.', ['at the price. the price is the price.', 'that was the top', 'that was the bottom', 'diamond paws would never', 'degen would do it twice']],
  ['who traded today?', ['{tradecat}. {trade}.', 'nobody. the chart was flat.', '{tradecat}, and it regrets it', '{tradecat}. a sliver.']],
];
const MEET_LEVELS = [
  ['{lvlcat} is level {lvl} now. {title}.', ['four percent off sardines', 'the title is nice', 'the title is a title', 'level is not coherence']],
  ['who levelled today?', ['{lvlcat}', 'nobody. the days are long.', '{lvlcat}, and it told everyone', 'the bots, probably']],
];
// what the day was: lines a cat says about what it did and what it learned ({act1}, {act2} are its last two doings, {note} its last lab note)
const DAY_LINES = ['my day: {act1}. then {act2}. and the note says: {note}', 'I {act1}. that was the day. learned: {note}', '{act1}, {act2}, and the lab. the lab said: {note}', 'for the minutes: {act1}. also {act2}.', 'today I {act1}. ask me what I learned.', 'the day in one line: {act1}. the lesson in one line: {note}', 'I {act2}, then I {act1}. in that order. it mattered.', 'nothing to report except that I {act1}', '{act1}. do not ask about the rest.', 'I {act1}, which is more than some of us.'];
const DAY_REACT = ['and what did it pay', 'same', 'I did more', 'noted', 'the note is wrong', 'the note is right', 'that is a full day', 'that is half a day', 'you forgot the diner', 'minutes.', 'say the lesson again', 'carried'];
const DAY_CHATS = [['what did you do today', '{act1}', 'and?', '{act2}'], ['learn anything', '{note}', 'is that true', 'the simulator says so'], ['busy?', '{act1}. you?', 'the same, mostly', 'it is a small box'], ['I {act1}', 'I know. I watched.', 'then you know how it went', 'badly, I assumed'], ['the lab said {note}', 'the lab says a lot', 'this one was mine', 'then it is yours']];
const MEET_FACT_REACT = ['is that in the notes?', 'write it down', 'the simulator agrees', 'I knew that', 'you did not know that', 'say it again, slower', 'that is the lab talking', 'and the real chip?', 'the real chip would disagree', 'carried', 'noted', 'that is tomorrow’s problem', 'that is on the ladder', 'that was my note', 'read it back tomorrow'];

const TOPIC_KIND = { grover: 'Grover', amplification: 'Grover', shor: 'Shor', qft: 'Shor', phase: 'Shor', bell: 'calibration', entanglement: 'calibration', calibration: 'calibration', decoherence: 'calibration', teleport: 'calibration', interference: 'sampling', volume: 'sampling', rb: 'sampling' };
for (const t of CURRICULUM_MORE) CURRICULUM.push(t); Object.assign(TOPIC_KIND, TOPIC_KIND_MORE); for (const g of PROBLEMS_MORE) PROBLEMS.push(g); for (const x of MEET_EXTRA_MORE) MEET_EXTRA.push(x); for (const r of MEET_REACT_MORE) MEET_REACT.push(r);
restock();
const research = []; let researchSeq = 0; // latest first: study notes and problems, what the lab actually produces
// every cat climbs the same ladder but starts on its own rung, so ten cats are ten different lines of research, not one in chorus
const ladderStart = c => { const k = Math.max(0, ROSTER.findIndex(r => r[0] === c.name)); return (k * 7) % CURRICULUM.length; };
const topicIdx = c => (((c.study && c.study.i) || 0) + ladderStart(c)) % CURRICULUM.length, topicDepth = c => Math.floor(((c.study && c.study.i) || 0) / CURRICULUM.length);
function pushResearch(e) { e.id = ++researchSeq; e.t = clock(simMin); e.day = dayNo(); research.unshift(e); if (research.length > 150) research.pop(); return e; }
// ---------- goals: what the lab pays for ----------
// A cat picks a goal; its lab jobs, notes and problems fill the bar; a full bar is paid in $QI (small, medium or big: the range set in the brain). On their own, jobs pay nothing.
const GOALS = [ // a goal is a few things to do; every part has to be full before the bar pays
  { key: 'hours', title: 'put in the hours', tier: 1, parts: [['session', 10, 'study sessions']] },
  { key: 'chapter', title: 'write the chapter on {topic}', tier: 1, topical: true, parts: [['topicnote', 3, 'notes, from {topic} on'], ['session', 4, 'study sessions']] },
  { key: 'three-board', title: 'three off the board', tier: 1, parts: [['solved', 3, 'problems solved'], ['session', 3, 'study sessions']] },
  { key: 'clean20', title: 'twenty clean jobs', tier: 1, parts: [['cleanjob', 20, 'jobs run, no slip']] },
  { key: 'shots20k', title: 'twenty thousand shots', tier: 1, parts: [['shots', 20000, 'shots drawn'], ['note', 2, 'notes written']] },
  { key: 'notebook', title: 'fill a notebook', tier: 2, parts: [['note', 12, 'notes written'], ['solved', 2, 'problems solved']] },
  { key: 'ladder', title: 'climb six rungs', tier: 2, parts: [['topic', 6, 'rungs climbed']] },
  { key: 'ladder-all', title: 'the whole ladder', tier: 3, parts: [['topic', 0, 'rungs climbed']] },
  { key: 'grover', title: 'make Grover land', tier: 2, kind: 'Grover', parts: [['grover85', 6, 'Grover runs at 85%+'], ['note', 2, 'notes written']] },
  { key: 'grover-big', title: 'search the big haystack', tier: 3, kind: 'Grover', parts: [['groverbig', 5, '6+ qubit Grover hits'], ['solved', 2, 'problems solved']] },
  { key: 'shor', title: 'find the period', tier: 2, kind: 'Shor', parts: [['shorpeak', 6, 'order-finding runs on a peak'], ['note', 2, 'notes written']] },
  { key: 'shor-big', title: 'factor fifteen, properly', tier: 3, kind: 'Shor', parts: [['shorbig', 5, '6+ qubit runs on a peak'], ['solved', 3, 'problems solved']] },
  { key: 'ghz', title: 'hold the GHZ together', tier: 2, kind: 'calibration', parts: [['calib95', 8, 'GHZ runs at 95%+']] },
  { key: 'ghz-big', title: 'a clean seven-qubit GHZ', tier: 3, kind: 'calibration', parts: [['calibbig', 4, '7+ qubit GHZ at 90%+'], ['note', 3, 'notes written']] },
  { key: 'heavy', title: 'beat the heavy-output bar', tier: 2, kind: 'sampling', parts: [['heavy67', 8, 'heavy-output runs']] },
  { key: 'heavy-big', title: 'heavy on six qubits', tier: 3, kind: 'sampling', parts: [['heavybig', 5, '6+ qubit heavy runs'], ['solved', 2, 'problems solved']] },
  { key: 'qubits', title: 'a hundred qubits, in total', tier: 2, parts: [['nq', 100, 'qubits run']] },
  { key: 'qubits-big', title: 'three hundred qubits', tier: 3, parts: [['nq', 300, 'qubits run'], ['note', 4, 'notes written']] },
  { key: 'shots', title: 'fifty thousand shots', tier: 2, parts: [['shots', 50000, 'shots drawn']] },
  { key: 'noslip', title: 'ten without a slip', tier: 2, streak: true, parts: [['noslip', 10, 'jobs in a row, no slip']] },
  { key: 'bigclean', title: 'seven qubits, clean', tier: 3, parts: [['bigclean', 5, '7+ qubit jobs, clean'], ['session', 5, 'study sessions']] },
  { key: 'board', title: 'answer the board', tier: 2, parts: [['solved', 6, 'problems solved']] },
  { key: 'streak', title: 'five right in a row', tier: 3, streak: true, parts: [['pstreak', 5, 'right in a row']] },
  { key: 'covered', title: 'know it before they ask', tier: 2, parts: [['covered', 4, 'solved on a topic in the notebook'], ['note', 3, 'notes written']] },
];
const goalMul = () => (Number(CONFIG.GOAL_MUL) > 0 ? Number(CONFIG.GOAL_MUL) : 1); // every bar times this; set in the brain's admin
const goalUsd = g => (g.tier === 1 ? labPayMin() : g.tier === 3 ? labPayMax() : Math.round((labPayMin() + labPayMax()) / 2 * 2) / 2);
const goalPayUsd = g => (testFlat() ? 0.2 : g.usd); // testing: twenty cents of $QI a bar, whatever the bar
const partTarget = (m, n) => Math.max(1, Math.round((n || (m === 'topic' ? CURRICULUM.length : 1)) * goalMul()));
function pickGoal(c) {
  const lvl = c.lvl || 1, kind = JOBS[c.job].kind, last = c.goalLast || '';
  let pool = GOALS.filter(g => g.key !== last && (g.tier === 1 || (g.tier === 2 && lvl >= 2) || (g.tier === 3 && lvl >= 4)) && (!g.kind || g.kind === kind || Math.random() < 0.15));
  if (!pool.length) pool = GOALS.filter(g => g.tier === 1);
  const held = {}; for (const o of cats) if (o !== c && o.goal) held[o.goal.key] = (held[o.goal.key] || 0) + 1; // what the others are on right now: a cat picks something different when it can
  const w = g => (1 / (1 + 4 * (held[g.key] || 0))) * (g.kind === kind ? 3 : 1) * ({ degen: g.tier === 3 || g.streak ? 2 : 1, greedy: g.tier === 3 ? 2.5 : g.tier === 2 ? 1.3 : 0.6, patient: g.parts.some(pt => pt[0] === 'topic' || pt[0] === 'note' || pt[0] === 'session' || pt[0] === 'topicnote') ? 2 : 1, loyal: g.tier === 1 ? 1.5 : 1 }[c.trait] || 1);
  let tot = 0; for (const g of pool) tot += w(g); let r = Math.random() * tot, g = pool[0];
  for (const x of pool) { r -= w(x); if (r <= 0) { g = x; break; } }
  const topic = CURRICULUM[topicIdx(c)];
  const parts = g.parts.map(([m, n, label]) => ({ m, n: partTarget(m, n), label: label.replace('{topic}', topic[1]), prog: 0 }));
  c.goal = { key: g.key, title: g.title.replace('{topic}', topic[1]), parts, target: parts.reduce((a, pt) => a + pt.n, 0), prog: 0, tier: g.tier, usd: goalUsd(g), topic: g.topical ? topic[0] : null, topicI: topicIdx(c), started: T, day: dayNo() };
  log(`${c.name} set itself a goal in the lab: ${c.goal.title} — ${parts.map(pt => pt.n + ' ' + pt.label).join(', ')}; $${goalPayUsd(c.goal)} of ${QI} when the bar is full.`, 'info', 'lab');
  did(c, `picked a goal: ${c.goal.title}`);
  return c.goal;
}
// ev: { type: 'job', kind, nq, slipped, run } | { type: 'session' } | { type: 'note', topic } | { type: 'topic' } | { type: 'problem', ok, topic, covered }
function partInc(pt, c, g, ev) {
  const x = (ev.run && ev.run.extra) || {}, job = ev.type === 'job', clean = job && !ev.slipped;
  switch (pt.m) {
    case 'session': return ev.type === 'session' ? 1 : 0;
    case 'note': return ev.type === 'note' ? 1 : 0;
    case 'topicnote': { if (ev.type !== 'note') return 0; const i = CURRICULUM.findIndex(t => t[0] === ev.topic); if (i < 0) return 0; const d = (i - (g.topicI || 0) + CURRICULUM.length) % CURRICULUM.length; return d <= 2 ? 1 : 0; } // a chapter covers three rungs of the ladder: the goal's topic and the two after it
    case 'cleanjob': return clean ? 1 : 0;
    case 'topic': return ev.type === 'topic' ? 1 : 0;
    case 'grover85': return clean && ev.kind === 'Grover' && (x.hit || 0) >= 85 ? 1 : 0;
    case 'groverbig': return clean && ev.kind === 'Grover' && ev.nq >= 6 && ev.run.bits === x.marked ? 1 : 0;
    case 'shorpeak': return clean && ev.kind === 'Shor' && (x.peaks || []).includes(ev.run.bits) ? 1 : 0;
    case 'shorbig': return clean && ev.kind === 'Shor' && ev.nq >= 6 && (x.peaks || []).includes(ev.run.bits) ? 1 : 0;
    case 'calib95': return clean && ev.kind === 'calibration' && (x.fidelity || 0) >= 95 ? 1 : 0;
    case 'calibbig': return clean && ev.kind === 'calibration' && ev.nq >= 7 && (x.fidelity || 0) >= 90 ? 1 : 0;
    case 'heavy67': return clean && ev.kind === 'sampling' && (x.heavy || 0) >= 67 ? 1 : 0;
    case 'heavybig': return clean && ev.kind === 'sampling' && ev.nq >= 6 && (x.heavy || 0) >= 67 ? 1 : 0;
    case 'nq': return clean ? ev.nq : 0;
    case 'shots': return clean ? ((ev.run && ev.run.shots) || 1024) : 0;
    case 'noslip': if (job && ev.slipped) { if (pt.prog) log(`${c.name} slipped; “${pt.label}” is back to zero.`, 'loss', 'lab'); pt.prog = 0; return 0; } return clean ? 1 : 0;
    case 'bigclean': return clean && ev.nq >= 7 ? 1 : 0;
    case 'solved': return ev.type === 'problem' && ev.ok ? 1 : 0;
    case 'pstreak': if (ev.type === 'problem' && !ev.ok) { if (pt.prog) log(`${c.name} missed one; “${pt.label}” is back to zero.`, 'loss', 'lab'); pt.prog = 0; return 0; } return ev.type === 'problem' && ev.ok ? 1 : 0;
    case 'covered': return ev.type === 'problem' && ev.ok && ev.covered ? 1 : 0;
  }
  return 0;
}
function goalEvent(c, ev) {
  if (!c.goal) { if (T < (c.goalNext || 0)) return; pickGoal(c); }
  const g = c.goal; if (!g.parts) { c.goal = null; return; } // an old-shape goal from before: drop it, a new one is picked next time
  let moved = false;
  for (const pt of g.parts) { const inc = partInc(pt, c, g, ev); if (inc > 0 && pt.prog < pt.n) { pt.prog = Math.min(pt.n, pt.prog + inc); moved = true; } }
  g.prog = g.parts.reduce((a, pt) => a + pt.prog, 0); g.target = g.parts.reduce((a, pt) => a + pt.n, 0);
  if (moved && g.parts.every(pt => pt.prog >= pt.n)) goalDone(c);
}
function goalDone(c) {
  const g = c.goal; if (!g) return;
  const usd = goalPayUsd(g); let qi = qiFor(usd); if (!qiLive()) { qi = Math.min(qi, stats.qiPool); stats.qiPool -= qi; }
  c.goalsDone = (c.goalsDone || 0) + 1; stats.goalsDone = (stats.goalsDone || 0) + 1; c.goalLast = g.key;
  c.goalLog = c.goalLog || []; c.goalLog.unshift({ key: g.key, title: g.title, qi, usd, day: dayNo(), t: clock(simMin), at: T, took: Math.round((T - g.started) / 60) }); if (c.goalLog.length > 12) c.goalLog.pop();
  gainXp(c, 12 * g.tier); c.qwork += g.tier;
  log(`${c.name} filled its bar: ${g.title}. ${qi > 0 ? 'Paid ' + fmtQi(qi) + ' ' + QI + ' (about $' + usd + ')' + (liveTx() ? ', on its way from the treasury.' : '.') : 'The lab’s pool is empty; nothing to pay.'}`, 'gain', 'lab');
  recordEvent('goal', `${c.name} filled its bar “${g.title}” and was paid ${fmtQi(qi)} ${QI}`); remember(c, `filled the bar “${g.title}” for ${fmtQi(qi)} ${QI}`);
  if (Math.random() < 0.7) say(c, pick(['bar full', 'paid', 'that is the goal', 'next bar', 'real ' + QI + '. real.', 'the bar is the job']));
  if (qi > 0) payCat(c, 0, qi, 'goal: ' + g.title, 'lab');
  c.goal = null; c.goalNext = T + rand(60, 300);
}
function studySession(c, r) {
  // r: { kind, nq, bits, job } — the circuit it just ran. The note is the box's own line about the topic; the brain may overwrite it with an AI one.
  if (!c.study) c.study = { i: 0 }; if (!c.notes) c.notes = [];
  const idx = topicIdx(c), depth = topicDepth(c), [key, title, lines] = CURRICULUM[idx];
  // the note quotes real numbers: if the topic wants a different kind of circuit than the paid job, the cat runs that one too, on the side
  const want = TOPIC_KIND[key]; const sr = want && want !== r.kind ? Object.assign(runCircuit(want, r.nq), { job: r.job + 's' }) : r;
  const text = CURR_FILL(pick(lines), sr, c);
  const e = pushResearch({ kind: 'note', cat: c.name, topic: key, title, depth, text, job: { kind: sr.kind, nq: sr.nq, bits: sr.bits, job: sr.job, shots: sr.shots, top: (sr.top || []).slice(0, 3), desc: sr.desc + (sr !== r ? ' (a side run for the topic; the paid job was ' + r.kind + ')' : '') } });
  c.notes.unshift({ t: e.t, day: e.day, topic: key, title, text, id: e.id }); if (c.notes.length > 40) c.notes.pop();
  c.study.i++; stats.sessions = (stats.sessions || 0) + 1; learn(c, 'research', 1);
  did(c, `studied ${title}: ${text}`);
  goalEvent(c, { type: 'session' }); goalEvent(c, { type: 'note', topic: key }); if (depth === 0) goalEvent(c, { type: 'topic' });
  if (studyHook) { try { studyHook(c, { key, title, depth, nq: r.nq, bits: r.bits, kind: r.kind, noteId: e.id, previous: c.notes.slice(1, 4).map(n => n.text) }); } catch (_) {} }
  // an open problem on the lab's board: half the time the cat that just finished takes the oldest one
  if (board.lab && board.lab.length && Math.random() < 0.5) problemFor(c, board.lab.shift());
}
function newProblem() { const pr = pick(PROBLEMS)(); pr.id = 'P' + (++researchSeq); pr.posted = T; pr.t = clock(simMin); return pr; }
function stepLab() { if (!board.lab) board.lab = []; if (board.lab.length < 3 && T >= (board.labNext || 0)) { board.lab.push(newProblem()); board.labNext = T + rand(240, 600); } }
function problemFor(c, pr) {
  if (!pr) pr = newProblem(); const sk = skillLvl(skillOf(c, 'research'));
  const covered = (c.notes || []).some(n => n.topic === pr.topic);
  const p = clamp(0.3 + sk * 0.06 + (covered ? 0.25 : 0) + 0.04 * ((c.lvl || 1) - 1), 0.2, 0.95), ok = Math.random() < p;
  const bonus = 0;
  if (ok) { c.qwork += 0.8; c.solved = (c.solved || 0) + 1; stats.solved = (stats.solved || 0) + 1; gainXp(c, 6); }
  else { c.coh = clamp(c.coh - 0.08); c.failed = (c.failed || 0) + 1; stats.failed = (stats.failed || 0) + 1; }
  goalEvent(c, { type: 'problem', ok, topic: pr.topic, covered });
  const e = pushResearch({ kind: 'problem', cat: c.name, topic: pr.topic, q: pr.q, a: pr.a, given: ok ? pr.a : pr.wrong, ok, bonus, waited: pr.posted != null ? Math.round((T - pr.posted) / 60) : 0 });
  recordEvent('lab', `${c.name} ${ok ? 'solved' : 'missed'} a lab problem: ${pr.q} ${ok ? '' : '(it said ' + e.given + ')'}`);
  log(`${c.name} was set a problem in the lab: ${pr.q} It said ${e.given}. ${ok ? 'Right.' + (c.goal && c.goal.parts && c.goal.parts.some(pt => pt.m === 'solved' || pt.m === 'pstreak' || pt.m === 'covered') ? ' ' + c.goal.title + ': ' + fmt(c.goal.prog) + ' of ' + fmt(c.goal.target) + '.' : '') : 'Wrong; the answer was ' + pr.a + '.'}`, ok ? 'gain' : 'loss', 'lab');
  did(c, `${ok ? 'solved' : 'missed'}: ${pr.q} (${e.given})`); if (ok) remember(c, `got one right in the lab: ${pr.q} ${pr.a}`); else remember(c, `missed one in the lab: ${pr.q} it is ${pr.a}`);
}
function setNote(id, text) { const e = research.find(x => x.id === id); if (!e || !text) return false; e.text = text; e.ai = true; const c = cats.find(x => x.name === e.cat); if (c && c.notes) { const n = c.notes.find(x => x.id === id); if (n) n.text = text; } return true; }
// ---------- on-chain intents: when the wallets are live, every payment the box decides becomes a transaction the brain sends ----------
const intents = []; let intentSeq = 0; const intentLog = []; // queued, newest last; intentLog: what happened, newest first
// (liveTx / testFlat are defined with the prices, above)
// real-testing mode: every payment the cats make is this flat amount of SOL, so the plumbing can be tested for cents
function queueIntent(i) { i.id = 'I' + (++intentSeq); i.at = T; i.t = clock(simMin); i.state = 'queued'; intents.push(i); if (intents.length > 500) intents.shift(); return i; }
// what the box shows for a money movement: the float, the coins, the log line, the ledger row. In the box it plays at once; in the real modes it rides on the intent and plays when the signature is back.
function playShow(ops, sig) { for (const o of ops || []) { const c = o.cat ? cats.find(x => x.name === o.cat) : null; if (o.f === 'float' && c) floatText(c, o.text, o.color); else if (o.f === 'coin' && c) coinFX(c, o.amt); else if (o.f === 'log') log(o.text, o.kind, o.place); else if (o.f === 'tx' && c) txWith(c, o.type, o.amount, o.note, sig); } }
function showOrQueue(intent, ops) { if (liveTx()) { intent.show = ops; return queueIntent(intent); } playShow(ops, null); return null; }
const r6 = v => Math.round(v * 1e6) / 1e6;
function intentDone(id, sig, extra) { const k = intents.findIndex(x => x.id === id); if (k < 0) return false; const i = intents.splice(k, 1)[0]; i.state = 'done'; i.sig = sig || null; intentLog.unshift(i); if (intentLog.length > 200) intentLog.pop();
  const c = cats.find(x => x.name === i.cat); if (!c) return true; const x = extra || {};
  if (i.type === 'wage' || i.type === 'qi') paid(c, i.sol, i.qi, sig, i.memo);
  else if (i.type === 'qcat') paidQcat(c, i.q, sig, i.memo);
  else if (i.type === 'swap') { const tok = i.tok === 'qi' ? QI : TK;
    if (i.dir === 'buy') { c.sol += i.sol; applyTrade(c, 'buy', tok, x.inSol != null ? x.inSol : i.sol, x.outQ != null ? x.outQ : i.q, i.why, sig); } // give back what was set aside, then book the real amounts
    else { if (tok === QI) c.qi += i.q; else c.qcat += i.q; applyTrade(c, 'sell', tok, x.outSol != null ? x.outSol : i.sol, x.inQ != null ? x.inQ : i.q, i.why, sig); } }
  else playShow(i.show, sig);
  return true; }
function intentFailed(id, err) { const k = intents.findIndex(x => x.id === id); if (k < 0) return false; const i = intents.splice(k, 1)[0]; i.state = 'failed'; i.err = String(err || '').slice(0, 160); intentLog.unshift(i); if (intentLog.length > 200) intentLog.pop();
  const c = cats.find(x => x.name === i.cat); if (!c) return true;
  // the box takes it back: whatever was set aside or credited for this one is undone, and nothing was ever shown for it
  if (i.type === 'donate' && i.sol > 0) { c.sol += i.sol; c.donated = Math.max(0, (c.donated || 0) - i.sol); log(`${c.name}’s gift to the build fund did not go through (${i.err}); refunded in the box.`, 'loss', 'fund'); }
  else if (i.type === 'pay' && i.sol > 0) { c.sol += i.sol; c.upkeep = Math.max(0, (c.upkeep || 0) - i.sol); stats.upkeep = Math.max(0, stats.upkeep - i.sol); if (i.place && placeStats[i.place]) placeStats[i.place].spent = Math.max(0, placeStats[i.place].spent - i.sol); log(`${c.name}’s payment for ${i.memo} did not go through (${i.err}); refunded in the box.`, 'loss', i.place || 'vault'); }
  else if (i.type === 'win') { c.sol = Math.max(0, c.sol - i.sol); c.casinoNet = (c.casinoNet || 0) - i.sol; placeStats.casino.paid = Math.max(0, (placeStats.casino.paid || 0) - i.sol); log(`${c.name}’s casino win could not be paid out (${i.err}).`, 'loss', 'casino'); }
  else if (i.type === 'wager') { const w = cats.find(x => x.name === i.to); c.sol += i.sol; if (w) { w.sol = Math.max(0, w.sol - i.sol); w.arenaSol -= i.sol; } c.arenaSol += i.sol; log(`The arena wager between ${c.name} and ${i.to} did not go through (${i.err}); called off.`, 'loss', 'arena'); }
  else if (i.type === 'wage' || i.type === 'qi' || i.type === 'qcat') { payouts.unpaid.push({ cat: c.name, sol: i.sol, qi: i.qi, qcat: i.q, memo: i.memo, place: i.place, err: i.err, at: T, retry: i.retry || 0 }); if (payouts.unpaid.length > 200) payouts.unpaid.shift(); log(`${c.name}’s pay for ${i.memo} could not be sent (${i.err}); the box will try again.`, 'loss', i.place || 'vault'); }
  else if (i.type === 'swap') { if (i.dir === 'buy') c.sol += i.sol; else if (i.tok === 'qi') c.qi += i.q; else c.qcat += i.q; const wait = T + rand(1200, 1800); if (i.dir === 'buy') c.buyCool = Math.max(c.buyCool || 0, wait); else c.sellCool = Math.max(c.sellCool || 0, wait); log(`${c.name}’s swap at the exchange did not go through (${i.err}); nothing changed, and it will leave the exchange alone for a while.`, 'loss', 'exchange'); }
  return true;
}
function pendingOut(c) { let s = 0; for (const i of intents) if (i.cat === c.name && (i.type === 'pay' || i.type === 'wager' || i.type === 'donate' || (i.type === 'swap' && i.dir === 'buy'))) s += i.sol || 0; return s; }
function pendingTok(c, tok) { let s = 0; for (const i of intents) if (i.cat === c.name && i.type === 'swap' && i.dir === 'sell' && i.tok === tok) s += i.q || 0; return s; }
// the wallets are the truth once they are live: a cat can spend what is on-chain (less the chain's rent minimum) minus what is still in flight
function setLiveBalances(bal) {
  for (const c of cats) { const b = bal[c.name]; if (!b || typeof b.sol !== 'number') continue;
    const spendable = Math.max(0, b.sol - GAS_FLOOR - pendingOut(c)); c.sol = spendable; c.gas = Math.min(GAS_FLOOR, b.sol);
    if (typeof b.qi === 'number') c.qi = Math.max(0, b.qi - pendingTok(c, 'qi')); if (typeof b.qcat === 'number') c.qcat = Math.max(0, b.qcat - pendingTok(c, 'qcats')); }
}
function stepGas() {
  // a cat whose gas reserve has run low gets it refilled from the treasury: the box does it itself while it runs on its own; the server does the real transfer once the wallets are live
  if (!feePool()) return;
  for (const c of cats) { if (c.gas == null) c.gas = GAS_FLOOR; if (c.gas >= GAS_MIN) continue; const amt = Math.min(stats.treasury, GAS_FLOOR - c.gas); if (amt <= 0) continue; stats.treasury -= amt; c.gas += amt; stats.gasPaid += amt; log(`The treasury topped up ${c.name}\u2019s gas: +${fmtSol(amt)} SOL.`, 'info', 'vault'); tx(c, 'gas', '+' + fmtSol(amt) + ' SOL', 'gas top-up from the treasury'); }
}
function checkReleases() {
  const mc = mcapUsd();
  for (let i = 0; i < ROSTER.length; i++) if (mc >= UNLOCK_MC[i] && !cats.some(c => c.name === ROSTER[i][0]) && !benched.has(ROSTER[i][0])) { release(i); break; }
}
function feeIn(big) {
  // simulated creator fees: roughly a quarter of a SOL a day at a $60K cap, growing a little faster than the cats' costs do
  const amt = (big ? rand(0.01, 0.03) : rand(0.001, 0.004)) * (1 + Math.abs(mkt.mom) * 60) * priceMul(); // the box's own pretend fees, scaled to the prices
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
  if (isPaused() && !PAUSE_OK.has(c.act) && c.state !== 'pause') { if (c.partner) endPair(c, byId(c.partner)); releaseTask(c); c.partner = null; c.initiator = false; c.state = 'pause'; c.pauseT = rand(1, 3); c.doing = 'off the clock'; c.because = 'transactions are paused'; } // paused: whatever it was about to pay for or earn, it drops
  const working = c.state === 'act' && c.act === 'work', sleeping = asleep(c);
  const R = isPaused() ? 0 : 0.16; // pace: meters fill slowly; a cat does a dozen things in an hour-long day (nothing fills while transactions are paused)
  c.hunger = clamp(c.hunger + (sleeping ? 0.0006 : 0.002 + (working ? 0.0008 : 0)) * R * dt); // a meal every 45 minutes or so awake
  c.coh = clamp(c.coh - (0.0055 * wx.coh + (working ? 0.008 : 0) + (working && c.job === 'tunneler' ? 0.005 : 0)) * R * dt, working ? 0 : 0.08); // only the lab can run a cat all the way down
  if (!(c.state === 'act' && c.act === 'warm') && !sleeping) c.cold = clamp(c.cold + 0.0065 * wx.cold * R * dt);
  if (!(c.state === 'act' && c.act === 'entangle')) c.lonely = clamp(c.lonely + 0.005 * R * dt);
  c.tired = clamp(c.tired + (sleeping ? -0.0015 : (0.0012 + (working ? 0.0016 : 0)) * R * (c.stamina || 1)) * dt);
  c.grudge = Math.max(0, c.grudge - 0.0012 * dt); if (c.grudge <= 0) { c.grudgeOn = null; c.grudgeWhy = ''; }
  if (c.hunger >= 1 && !sleeping && !isPaused()) { c.starve += dt; if (c.starve > 300) { c.starve = 0; c.hunger = 0.7; log(`${c.name} fainted from hunger`, 'loss'); faint(c, 'went too long without food'); return; } } else c.starve = 0;
  if (c.coh <= 0 && working) {
    c.coh = 0.45; const drop = 0; c.qcat -= drop; stats.lostPool += drop; c.decohered = (c.decohered || 0) + 1;
    if (drop > 0) { did(c, `decohered and scattered ${fmtQ(drop)} ${TK}`); recordEvent('decohere', `${c.name} decohered in the lab and scattered ${fmtQ(drop)} ${TK}`); log(`${c.name} decohered and scattered ${fmtQ(drop)} ${TK} across the block. It ended up in the scrapyard.`, 'loss', 'trays'); tx(c, 'lost', '-' + fmtQ(drop) + ' ' + TK, 'decohered'); }
    else { did(c, 'decohered in the lab'); recordEvent('decohere', `${c.name} decohered in the lab`); log(`${c.name} decohered and had to be walked out of the lab.`, 'loss', 'lab'); }
    burst(c, '154,123,255', 24); ringFX(c.x, c.y, '154,123,255', 1.4); 
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
    if (d < 0.6 || (!seatBound && d < 1.3)) { if (!c.nearT) c.nearT = T; else if (T - c.nearT > (seatBound ? 6 : d < 0.6 ? 2.5 : 7)) { c.nearT = 0; arrive(c, p); return; } } else c.nearT = 0; // nearly there but held off by other cats for a while: that will do (a crowd round the heater counts from further out) // nearly there but held off by other cats for a while: that will do
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
let nextFee = rand(20, 50);
let externalFees = 0;     // SOL dropped into the treasury from outside (real fee claims)
function setMarketCapUsd(v) { if (v == null || !(v > 0)) { realMcap = null; mkt.pinned = false; return; } realMcap = v; mkt.pinned = true; mkt.price = v / CONFIG.SOL_USD / SUPPLY; mkt.p0 = mkt.price; }
function setPaused(p) { CONFIG.PAUSED = !!p; } // transactions paused: no money moves, no wages, needs stand still; the cats keep wandering
function dropFees(sol) { if (!(sol > 0)) return; stats.treasury += sol; stats.fees += sol; externalFees += sol; if (stats.treasury >= 0.02) stats.low = false; feeFX(sol); log(`Creator fees dropped ${fmtSol(sol)} SOL in the treasury`, 'gain', 'vault'); tx(null, 'fees', '+' + fmtSol(sol) + ' SOL', 'claimed'); }
function setReleased(names) { for (const n of names) { benched.delete(n); const i = ROSTER.findIndex(r => r[0] === n); if (i >= 0 && !cats.some(c => c.name === n)) release(i); } }
function unrelease(name) {
  const i = cats.findIndex(c => c.name === name); if (i < 0) return false;
  const c = cats[i]; cats.splice(i, 1); benched.add(name);
  for (const o of cats) { if (o.partner === c.id) { o.partner = null; o.initiator = false; o.state = 'pause'; o.pauseT = 1; } if (o.grudgeOn === c.id) { o.grudge = 0; o.grudgeOn = null; } }
  log(`${c.name} was taken back out of the box.`, 'info', 'boxes'); return true;
}
function setTrait(name, trait) {
  const c = cats.find(x => x.name === name); if (!c || !TRAITS[trait]) return false;
  c.trait = trait; c.tr = TRAITS[trait]; log(`${c.name} is now ${c.tr.label}.`, 'info'); return true;
}
function setSolUsd(v) { if (v > 0) CONFIG.SOL_USD = v; }
// how the next payout splits: by quantum work done since the last payout (equal if nobody has worked yet)
// SOL payouts split by the chores done since the last one; $QI payouts split by the lab work. Equal if nobody has done any.
function sharesBy(names, key) {
  const list = names.map(n => cats.find(c => c.name === n)).filter(Boolean);
  const tot = list.reduce((a, c) => a + (c[key] || 0), 0);
  const out = {}; for (const c of list) out[c.name] = tot > 0 ? (c[key] || 0) / tot : 1 / Math.max(1, list.length); return out;
}
function workShares(names) { return sharesBy(names, 'twork'); }
function labShares(names) { return sharesBy(names, 'qwork'); }
function resetWork(names) { for (const c of cats) if (names.includes(c.name)) c.twork = 0; }
function resetLab(names) { for (const c of cats) if (names.includes(c.name)) c.qwork = 0; }
// the real $QI wallet: its balance is the lab's pool, and while it is being read the lab only logs work for the next payout
function setQiPool(amount, live) { if (typeof amount === 'number' && amount >= 0) stats.qiPool = amount; CONFIG.QI_LIVE = !!live; }
function setQiPrice(sol) { mkt.qiSol = sol > 0 ? sol : 0; }
function setQiConfig(perJob, sol) { if (perJob > 0) CONFIG.QI_PER_JOB = perJob; CONFIG.QI_SOL = sol > 0 ? sol : 0; }
// which token this cat would sell right now if the operator (or autopilot) sells for it: whatever its box-self sold most recently, $QCATS by default
function sellIntent(name) { const c = cats.find(x => x.name === name); if (!c) return null; return c.lastSellTok === QI && T - (c.lastSellT || -1e9) < 3600 ? 'qi' : 'qcats'; }
function qiPayout(list, sig) {
  // list: [{ name, qi }] — real $QI that just left the treasury for each cat
  let total = 0, n = 0;
  for (const { name, qi } of list) {
    const c = cats.find(x => x.name === name); if (!c || !(qi > 0)) continue;
    c.qi = (c.qi || 0) + qi; c.qiEarned = (c.qiEarned || 0) + qi; stats.qiPaid += qi; total += qi; n++;
    payFX(c); floatText(c, '+' + fmtQi(qi) + ' ' + QI, '#C4B2FF');
    txSig(c, 'qi', '+' + fmtQi(qi) + ' ' + QI, 'paid for lab work', sig);
    say(c, pick(['lab pay', QI + ' in', 'the lab came through', 'that\u2019s my research money']));
  }
  if (n) log(`Lab payday. The treasury paid ${fmtQi(total)} ${QI} to ${n} cat${n === 1 ? '' : 's'} for lab work.`, 'gain', 'lab');
  return { total, n };
}
function noteSellQi(name, qi, sol, sig) {
  const c = cats.find(x => x.name === name); if (!c) return;
  c.qi = Math.max(0, (c.qi || 0) - qi); c.qiSold = (c.qiSold || 0) + qi; c.qiSellSol = (c.qiSellSol || 0) + sol; c.sells++; c.sol += sol; stats.qiSold += qi; stats.qiSellSol += sol; stats.sells++;
  burst(c, '196,178,255', 14); floatText(c, '-' + fmtQi(qi) + ' ' + QI, '#C4B2FF');
  txSig(c, 'sell', '-' + fmtQi(qi) + ' ' + QI, '+' + fmtSol(sol) + ' SOL', sig);
  log(`${c.name} sold ${fmtQi(qi)} ${QI} for ${fmtSol(sol)} SOL.`, 'loss', 'exchange');
}
function noteFund(name, sol, sig, quiet) {
  // the treasury sent a cat SOL: a top-up from admin is shown; the shortfall for a swap (quiet) is not — the balance just becomes enough
  const c = cats.find(x => x.name === name); if (!c || !(sol > 0)) return;
  c.sol += sol; stats.funded = (stats.funded || 0) + sol;
  if (quiet) return;
  txSig(c, 'fund', '+' + fmtSol(sol) + ' SOL', 'top-up from the treasury', sig); floatText(c, '+' + fmtSol(sol) + ' SOL', '#F7C86A');
  log(`The treasury topped ${c.name} up: +${fmtSol(sol)} SOL.`, 'info', 'vault');
}
function noteGas(name, sol, sig) {
  const c = cats.find(x => x.name === name); if (!c) return;
  c.gas = GAS_FLOOR; stats.gasPaid += sol;
  txSig(c, 'gas', '+' + fmtSol(sol) + ' SOL', 'gas top-up from the treasury', sig);
  log(`The treasury topped up ${c.name}\u2019s gas: +${fmtSol(sol)} SOL.`, 'info', 'vault');
}
function setSimulateFees(v) { CONFIG.SIMULATE_FEES = !!v; }
// ---- real money, mirrored into the box (the server calls these after an on-chain tx confirmed) ----
function txSig(c, type, amount, note, sig) { tx(c, type, amount, note); if (sig) txs[0].sig = sig; }
function noteDeposit(sol, sig, from) {
  // SOL you sent to the treasury yourself: shown in the box with its signature, kept out of the fee total
  if (!(sol > 0)) return;
  feeFX(sol);
  log(`${fmtSol(sol)} SOL arrived in the treasury.`, 'gain', 'vault'); tx(null, 'deposit', '+' + fmtSol(sol) + ' SOL', 'into the treasury'); if (sig) txs[0].sig = sig;
}
function noteFees(sol, sig) {
  if (!(sol > 0)) return;
  stats.fees += sol; externalFees += sol; feeFX(sol);
  log(`Creator fees landed: +${fmtSol(sol)} SOL in the treasury wallet.`, 'gain', 'vault'); tx(null, 'fees', '+' + fmtSol(sol) + ' SOL', 'claimed'); if (sig) txs[0].sig = sig;
}
function qcatGrant(list, sig) {
  // list: [{ name, q }] — real $QCATS that just left the treasury for each cat (the starting stack, or a top-up)
  let total = 0, n = 0;
  for (const { name, q } of list) {
    const c = cats.find(x => x.name === name); if (!c || !(q > 0)) continue;
    c.qcat = (c.qcat || 0) + q; total += q; n++;
    payFX(c); floatText(c, '+' + fmtQ(q) + ' ' + TK, '#5CFFAA');
    txSig(c, 'grant', '+' + fmtQ(q) + ' ' + TK, 'from the treasury', sig);
  }
  if (n) log(`The treasury handed ${fmtQ(total)} ${TK} to ${n} cat${n === 1 ? '' : 's'}.`, 'gain', 'vault');
  return { total, n };
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
studyHook = (c, info) => { if (hooks.onStudy) hooks.onStudy(meetingContext(), c.name, info); };
dayEndHook = (recap, ctx) => { if (hooks.onDayEnd) hooks.onDayEnd(recap, ctx); else setLesson(`day ${recap.day}: ${fmtSol(recap.fees)} SOL of fees in, ${recap.jobs} job${recap.jobs === 1 ? '' : 's'} run, ${recap.tasks} thing${recap.tasks === 1 ? '' : 's'} dealt with${recap.topEarner ? ', ' + recap.topEarner + ' earned most' : ''}`); };
function setTreasury(sol) { if (CONFIG.SIMULATE_FEES === false && typeof sol === 'number' && sol >= 0) stats.treasury = sol; } // the box shows the real treasury wallet once the coin is live
function step(dt) {
  T += dt; simMin += dt * (1440 / DAY_SECS);
  stepWeather(dt);
  if (realMcap == null) stepMarket(dt);
  else { mkt.acc += dt; while (mkt.acc >= 1) { mkt.acc -= 1; mkt.hist.push(mkt.price); if (mkt.hist.length > 240) mkt.hist.shift(); } }
  checkReleases(); checkStages(); checkFund(); stepDay(); stepMeeting(dt); stepBoard(dt); stepDeliveries(dt); stepBots(dt); stepGas(); stepLab(); stepScrap(); stepPayout(); stepPayroll();
  if (CONFIG.SIMULATE_FEES !== false && T >= nextFee) { feeIn(false); nextFee = T + rand(60, 150); }
  for (const c of cats) update(c, dt); separateAll(dt);
}
function snapshot() {
  return {
    v: 1, T, simMin, clock: clock(simMin), day: dayNo(), priceMul: priceMul(), meeting: { on: meeting.on, until: meeting.until, next: meeting.next, said: (meeting.said || []).slice(-90), tre0: meeting.tre0 || 0 }, paused: isPaused(), payrollNext, realMcap,
    cats: cats.map(c => ({ id: c.id, name: c.name, job: c.job, trait: c.trait, coat: c.coat, eye: c.eye, dark: c.dark, x: c.x, y: c.y, tx: c.tx, ty: c.ty, face: c.face, state: c.state, act: c.act, actT: c.actT, actDur: c.actDur, partner: c.partner, initiator: c.initiator, arrived: c.arrived, doing: c.doing, thought: c.thought, because: c.because, weighed: c.weighed, bubble: c.bubble, bubbleT: c.bubbleT, sol: c.sol, gas: c.gas == null ? GAS_FLOOR : c.gas, qi: c.qi || 0, qiEarned: c.qiEarned || 0, qiSold: c.qiSold || 0, qiSellSol: c.qiSellSol || 0, twork: c.twork || 0, study: c.study || { i: 0 }, notes: (c.notes || []).slice(0, 24), qiBought: c.qiBought || 0, solved: c.solved || 0, failed: c.failed || 0, lastSellTok: c.lastSellTok || null, lastSellT: c.lastSellT || 0, lastPaidT: c.lastPaidT || 0, lastBuyT: c.lastBuyT || 0, salvaged: c.salvaged || 0, qcatEarned: c.qcatEarned || 0, scrapJob: c.scrapJob || null, donated: c.donated || 0, donateCool: c.donateCool || 0, payrollMark: c.payrollMark || 0, goal: c.goal || null, goalLog: (c.goalLog || []).slice(0, 12), goalsDone: c.goalsDone || 0, goalLast: c.goalLast || '', goalNext: c.goalNext || 0, lvlT: c.lvlT || 0, qcat: c.qcat, earned: c.earned, bought: c.bought, sold: c.sold, buys: c.buys, sells: c.sells, solSpent: c.solSpent, sellSol: c.sellSol, stole: c.stole, robbed: c.robbed, found: c.found, arenaNet: c.arenaNet, arenaSol: c.arenaSol, arenaW: c.arenaW, arenaL: c.arenaL, memory: (c.memory || []).slice(0, 8), casinoW: c.casinoW || 0, casinoL: c.casinoL || 0, casinoNet: c.casinoNet || 0, casinoT: c.casinoT || 0, entry: c.entry, hunger: c.hunger, coh: c.coh, cold: c.cold, lonely: c.lonely, tired: c.tired, grudge: c.grudge, grudgeOn: c.grudgeOn, grudgeWhy: c.grudgeWhy, phase: c.phase, released: c.released, xp: c.xp || 0, lvl: c.lvl || 1, qjobs: c.qjobs || 0, qwork: c.qwork || 0, qnq: c.qnq || 0, ethic: c.ethic || 1, meetings: c.meetings || 0, upkeep: c.upkeep || 0, qmax: c.qmax || 0, items: c.items || [], wearing: c.wearing || null, vanity: c.vanity || 1, skills: c.skills || {}, tasks: c.tasks || 0, taskPay: c.taskPay || 0, task: c.task || null, taskPlace: c.taskPlace || null, chair: c.chair == null ? null : c.chair, meals: c.meals || 0, plays: c.plays || 0, faints: c.faints || 0, decohered: c.decohered || 0, hist: (c.hist || []).slice(0, 40), said: (c.said || []).slice(0, 30), acts: (c.acts || []).slice(0, 40) })),
    stats: { ...stats }, mkt: { price: mkt.price, p0: mkt.p0, mom: mkt.mom, hist: mkt.hist.slice(-120), mcapUsd: mcapUsd() },
    weather: { key: wxKey, next: wxNext, until: wxUntil, dur: wxDur, wx: { ...wx }, labBoostUntil, boat: { ...boat } },
    stages: STAGES.map(st => ({ key: st.key, mc: st.mc, open: stageOn(st.key) })),
    unlock: UNLOCK_MC, roster: ROSTER,
    board: { tasks: board.tasks, done: board.done.slice(0, 40), seq: board.seq, next: board.next, badge: board.badge, badgeCool: board.badgeCool, lab: board.lab || [], labNext: board.labNext || 0, scrap: board.scrap || [], scrapDone: (board.scrapDone || []).slice(0, 40), scrapNext: board.scrapNext || 0, scrapSeq: board.scrapSeq || 0 },
    deliveries: deliveries.map(d => ({ id: d.id, kind: d.kind, x: +d.x.toFixed(3), y: +d.y.toFixed(3), z: +d.z.toFixed(3), tx: +d.tx.toFixed(3), ty: +d.ty.toFixed(3), state: d.state })),
    bots: bots.map(b => ({ id: b.id, x: +b.x.toFixed(3), y: +b.y.toFixed(3), tx: +b.tx.toFixed(3), ty: +b.ty.toFixed(3), state: b.state, face: b.face, pauseT: b.pauseT > 0 ? +b.pauseT.toFixed(2) : 0 })),
    days, today: dayCur, lessons: lessons.slice(0, 12), research: research.slice(0, 80), payouts: { n: payouts.n, last: payouts.last, log: payouts.log.slice(0, 120), unpaid: payouts.unpaid.slice(0, 50) }, chain: { live: CONFIG.LIVE_TX === true, dry: CONFIG.DRY_RUN === true, queued: intents.length, recent: intentLog.slice(0, 30), pending: intents.slice(0, 100) },
    txs: txs.slice(0, 60), talk: talk.slice(0, 80), placeStats, placeLogs, placeDay, diner, shop, fx: fx.splice(0, fx.length),
  };
}
for (let i = 0; i < ROSTER.length; i++) if (UNLOCK_MC[i] <= 0) cats.push(makeCat(i));
for (let i = 0; i < 2; i++) { const a = pick(cats), b = pick(cats); if (a !== b) { a.grudge = rand(0.5, 0.9); a.grudgeOn = b.id; a.grudgeWhy = `${b.name} still owes it from last night`; } }
for (let i = 0; i < 60; i++) mkt.hist.push(mkt.p0 * (1 + rand(-0.05, 0.05)));
log(`The box woke up. ${cats.map(c => c.name).join(' and ')} are in. Eight more cats are waiting on the chart.`, 'info');
stepWeather(0);
return { step, snapshot, postTask(def, by) { return postTask(def, by); }, callTask(id) { return callTask(id); }, setMemory, setLesson, setChat, get lessons() { return lessons; }, get deliveries() { return deliveries; }, labShares, resetLab, setQiPool, setQiPrice, setQiConfig, setNote, qcatGrant, puppet, setGoalMul(v) { CONFIG.GOAL_MUL = v > 0 ? v : 1; }, setQcatPool(n, live) { if (typeof n === 'number' && n >= 0) stats.qcatPool = n; CONFIG.QCAT_LIVE = !!live; }, setStartQcats(v) { CONFIG.START_QCATS = v > 0 ? v : 10000; }, setFundSol, setFundGoal(v) { CONFIG.FUND_GOAL = v > 0 ? v : 2.5; }, get fund() { return { sol: fundSol(), goal: fundGoal(), open: fundOpen(), givers: cats.filter(c => c.donated > 0).length }; }, get research() { return research; }, retryUnpaid, get intents() { return intents; }, get intentLog() { return intentLog; }, intentDone, intentFailed, setLiveBalances, setLiveTx(v) { CONFIG.LIVE_TX = !!v; }, takeIntent() { return intents.find(i => i.state === 'queued') || null; }, markIntent(id, state) { const i = intents.find(x => x.id === id); if (i) i.state = state; }, get payouts() { return payouts; }, setLabPay(lo, hi) { if (lo > 0) CONFIG.LAB_PAY_MIN_USD = lo; if (hi > 0) CONFIG.LAB_PAY_MAX_USD = hi; }, setPriceMul(v) { CONFIG.PRICE_MUL = v > 0 ? v : 1; }, setPace(min) { CONFIG.PACE_MIN = Number(min) >= 0 ? Number(min) : 6; }, setDryRun(v) { CONFIG.DRY_RUN = !!v; }, setTestFlat(v) { CONFIG.TEST_FLAT = v > 0 ? v : 0; }, sellIntent, qiPayout, noteSellQi, noteGas, noteFund, get bots() { return bots; }, sendDrone, get board() { return board; }, get days() { return days; }, TASK_KINDS, setMarketCapUsd, setTreasury, setPaused, get paused() { return isPaused(); }, get payrollNext() { return payrollNext; }, payrollDue(name) { const c = cats.find(x => x.name === name); return !!c && payrollDue(c); }, dropFees, setReleased, unrelease, setTrait, setSolUsd, setSimulateFees, noteFees, noteDeposit, payout, noteSell, noteBuy, workShares, resetWork, setMeetingScript, setThought, meetingContext, TRAITS, OBST, OBC, PERSONA, get cats() { return cats; }, get stats() { return stats; }, get T() { return T; }, get mkt() { return mkt; }, ROSTER, UNLOCK_MC, STAGES, fmtSol, fmtQ, fmtUsd, mcapUsd, stageOn, restore(snap) { restoreFrom(snap); } };
function restoreFrom(snap) {
  if (!snap || !snap.cats) return;
  T = snap.T || 0; simMin = (T % DAY_SECS) / DAY_SECS * 1440; // the clock follows the day: midnight is the day boundary
  payrollNext = snap.payrollNext > T ? snap.payrollNext : T + 1800;
  cats.length = 0; uid = 0;
  for (const sc of snap.cats) { const i = ROSTER.findIndex(r => r[0] === sc.name); if (i < 0) continue; const c = makeCat(i); Object.assign(c, sc); uid = Math.max(uid, c.id); cats.push(c); }
  if (snap.stats) Object.assign(stats, snap.stats);
  if (snap.mkt) { mkt.price = snap.mkt.price; mkt.p0 = snap.mkt.p0; mkt.mom = snap.mkt.mom || 0; mkt.hist = snap.mkt.hist || []; }
  if (snap.txs) { txs.length = 0; txs.push(...snap.txs); }
  if (snap.talk) { talk.length = 0; talk.push(...snap.talk); talkSeq = Math.max(0, ...talk.map(m => m.id || 0)); }
  if (snap.research) { research.length = 0; research.push(...snap.research); researchSeq = Math.max(0, ...research.map(e => e.id || 0)); }
  if (snap.chain && snap.chain.pending) { intents.length = 0; intents.push(...snap.chain.pending.map(i => ({ ...i, state: 'queued' }))); intentSeq = Math.max(intentSeq, ...intents.map(i => parseInt(String(i.id).slice(1), 10) || 0)); }
  if (snap.payouts) { payouts.n = snap.payouts.n || 0; payouts.last = snap.payouts.last || 0; payouts.log.length = 0; payouts.log.push(...(snap.payouts.log || [])); payouts.unpaid.length = 0; payouts.unpaid.push(...(snap.payouts.unpaid || [])); }
  if (snap.placeStats) Object.assign(placeStats, snap.placeStats);
  if (snap.placeDay) Object.assign(placeDay, snap.placeDay); if (snap.diner) Object.assign(diner, snap.diner); if (snap.shop) Object.assign(shop, snap.shop);
  if (snap.placeLogs) Object.assign(placeLogs, snap.placeLogs);
  if (snap.stages) for (const st of snap.stages) if (st.open) stageSeen[st.key] = true;
  if (snap.meeting) { meeting.on = false; meeting.next = 0; meeting.said = snap.meeting.said || []; meeting.tre0 = snap.meeting.tre0 || 0; } // recomputed on the first step: the last ten minutes of the day
  if (snap.days) { days.length = 0; days.push(...snap.days); }
  if (snap.today) dayCur = snap.today;
  if (snap.lessons) { lessons.length = 0; lessons.push(...snap.lessons); }
  if (snap.board) { board.tasks = (snap.board.tasks || []).filter(t => TASK_KINDS[t.kind]).slice(0, BOARD_MAX).map(t => ({ ...t, status: 'open', by: null, since: t.since != null ? t.since : t.posted, x: t.x == null ? (t.dest ? t.dest[0] : CRY.x + 3) : t.x, y: t.y == null ? (t.dest ? t.dest[1] : CRY.y + 3) : t.y })); board.done = snap.board.done || []; board.seq = snap.board.seq || board.done.length; board.next = snap.board.next || 0; board.badge = snap.board.badge && board.tasks.some(t => t.id === snap.board.badge) ? snap.board.badge : null; board.badgeCool = snap.board.badgeCool || 0; board.lab = (snap.board.lab || []).slice(0, 3); board.labNext = snap.board.labNext || 0; board.scrap = (snap.board.scrap || []).map(j => ({ ...j, status: 'open', by: null })).slice(0, 4); board.scrapDone = snap.board.scrapDone || []; board.scrapNext = snap.board.scrapNext || 0; board.scrapSeq = snap.board.scrapSeq || board.scrapDone.length + board.scrap.length; for (const c of cats) { c.task = null; c.scrapJob = null; c.chair = null; if (c.act === 'meet' || c.act === 'task' || c.act === 'salvage' || c.act === 'donate') { c.state = 'pause'; c.pauseT = 1; c.act = 'idle'; } } }
  if (snap.weather) { wxKey = snap.weather.key; wxNext = snap.weather.next; wxUntil = snap.weather.until; wxDur = snap.weather.dur; Object.assign(wx, snap.weather.wx); }
}
};
