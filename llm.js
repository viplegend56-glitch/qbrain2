// llm.js — AI-written dialogue for the box.
// When LLM_API_KEY is set, every meeting in the circle gets a fresh script written for the cats that actually showed up,
// in their own personalities and about what actually happened that day (treasury, chart, who worked, who stole), and
// every few minutes a few cats get a one-line thought of their own. Without a key the box falls back to the built-in lines.
// Uses the Anthropic Messages API over plain fetch; no SDK, no extra dependency.
'use strict';
const KEY = process.env.LLM_API_KEY || '';
const MODEL = process.env.LLM_MODEL || 'claude-haiku-5-5';
const URL = 'https://api.anthropic.com/v1/messages';
const status = { enabled: !!KEY, model: MODEL, calls: 0, ok: 0, lastErr: '', lastAt: 0, lastMs: 0 };

async function complete(system, user, maxTokens = 900) {
  if (!KEY) throw new Error('LLM_API_KEY not set');
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 20000);
  const t0 = Date.now(); status.calls++; status.lastAt = t0;
  try {
    const r = await fetch(URL, {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, temperature: 1, system, messages: [{ role: 'user', content: user }] }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.error && j.error.message) || ('HTTP ' + r.status));
    const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    status.ok++; status.lastErr = ''; status.lastMs = Date.now() - t0;
    return text;
  } catch (e) { status.lastErr = String(e.message || e).slice(0, 160); throw e; }
  finally { clearTimeout(timer); }
}
// pull the first JSON array out of a reply, even when the model wraps it in prose or a code fence
function parseArray(text) {
  const a = text.indexOf('['), b = text.lastIndexOf(']');
  if (a < 0 || b <= a) throw new Error('no JSON array in reply');
  return JSON.parse(text.slice(a, b + 1));
}
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };

const WORLD = `You write dialogue for Quantum Cats: ten stray cats living in an isometric box on a Solana memecoin site. Each cat has a real wallet.
Facts of their world, never contradict them:
- Every cat was given 100,000 $QCATS and no SOL. They sell a little coin to pay for food, a bunk, warmth and play; prices rise as the chart rises.
- The cats earn SOL only from the coin's creator fees, which land in the treasury and are paid out in proportion to the quantum work each cat does in the lab (sampling, Grover search, Shor factoring, calibration). Lazy cats earn less and sell more.
- The lab is open from day one: ten consoles in a glass control room, the chip in a dilution fridge next door, piped to the lab.
- The circle in the middle of the box runs a countdown. When it hits zero every awake cat sits down there and talks through the day: treasury, chart, lab, grudges, strategy.
- Things turn up around the block that want doing (trash behind the diner, a dropped crate, a spill, a loose cable, a console to recalibrate, a readout check on the fridge), in three tiers; first cat there deals with it and is paid from the fee pool. Cats get better at a kind of job the more they do it.
- There is a shop (three stalls) where cats buy things to wear: collars, bandanas, shades, hats, a gold chain, a crown, a halo. The SOL goes to the treasury.
- Cats steal from sleepers, wager in the arena, hold grudges, decohere when they overwork in the lab, faint when they go hungry.
Voice: lowercase, short, dry, funny, specific. Crypto-native slang is fine (dip, pump, fees, bag, ape, hold), no hashtags, no emojis, no exclamation marks, no corporate tone. Never mention being an AI. Never give financial advice to the viewer; the cats talk to each other, not to the audience.`;

function describeCat(c) {
  return `${c.name} (${c.role}, ${c.trait}, level ${c.level}; ${c.persona}) — ${c.sol} SOL, ${c.qcat} $QCATS, earned ${c.earned} SOL lifetime, ${c.jobs} jobs done, hunger ${c.hunger}%, coherence ${c.coherence}%${c.grudge ? ', holds a grudge against ' + c.grudge : ''}${c.lastSaid ? ', last said "' + c.lastSaid + '"' : ''}`;
}
function describeDay(ctx) {
  return [
    `Day ${ctx.day}, ${ctx.clock}, weather: ${ctx.weather}. Market cap ${ctx.mcap}. Survival prices are ${ctx.priceMul}x launch.`,
    `Treasury holds ${ctx.treasury} SOL; ${ctx.fees} SOL of fees have landed in total and ${ctx.wages} SOL has been paid out to cats.`,
    ctx.lastJob ? `Last job: ${ctx.lastJob.name} ran a ${ctx.lastJob.nq}-qubit ${ctx.lastJob.kind} job, most common result |${ctx.lastJob.bits}⟩.` : '',
    ctx.top ? `Top earner so far: ${ctx.top}.` : '', ctx.thief ? `${ctx.thief} has been stealing from sleepers.` : '',
    ctx.asleep && ctx.asleep.length ? `Asleep in the bunks (not present): ${ctx.asleep.join(', ')}.` : '',
    ctx.board && ctx.board.open && ctx.board.open.length ? `Lying around the block right now, wanting doing: ${ctx.board.open.join('; ')}.` : 'Nothing is lying around the block right now.',
    ctx.board && ctx.board.doneToday && ctx.board.doneToday.length ? `Tasks finished today: ${ctx.board.doneToday.slice(0, 8).join('; ')}.` : '',
  ].filter(Boolean).join('\n');
}

// a full meeting: 12-14 lines, only cats that are present, in their voices, about this day
async function meetingScript(ctx) {
  const cats = ctx.cats || []; if (cats.length < 2) return null;
  const names = cats.map(c => c.name);
  const user = `${describeDay(ctx)}

Cats present in the circle:
${cats.map(describeCat).join('\n')}

Write the meeting: 20 to 26 lines of dialogue for a five-minute sit-down. Open with someone reading the numbers (treasury, chart, fees), then argue about the day: who worked, who did not, whether to sell coin for food or hold, what the lab should run next, one grudge, one joke, and end with a plan for tomorrow. Cats interrupt and answer each other, so write some quick back-and-forth exchanges of two or three short lines. Every speaker must be one of: ${names.join(', ')}. Spread the lines around; let personalities clash. Each line under 110 characters.
Reply with ONLY a JSON array like [{"who":"Miso","text":"..."}, ...]`;
  const text = await complete(WORLD, user, 2000);
  const arr = parseArray(text);
  const lines = arr.map(x => ({ who: names.includes(x.who) ? x.who : null, text: clip(x.text, 120) })).filter(x => x.text);
  return lines.length >= 4 ? lines.slice(0, 30) : null;
}

// a one-line thought for a few awake cats, about what they are doing right now
async function thoughts(ctx, picks) {
  const cats = (ctx.cats || []).filter(c => picks.includes(c.name)); if (!cats.length) return [];
  const user = `${describeDay(ctx)}

Cats:
${cats.map(describeCat).join('\n')}

For each cat write one thought it mutters to itself right now, in its own voice, about its own situation (its SOL, its bag, its hunger, the chart, the lab, a grudge). Under 70 characters each, no names of cats that are not listed.
Reply with ONLY a JSON array like [{"name":"Miso","text":"..."}, ...]`;
  const text = await complete(WORLD, user, 400);
  const arr = parseArray(text);
  return arr.map(x => ({ name: x.name, text: clip(x.text, 80) })).filter(x => x.text && cats.some(c => c.name === x.name));
}

module.exports = { enabled: () => !!KEY, status, meetingScript, thoughts };
