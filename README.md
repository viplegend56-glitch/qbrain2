# Quantum Cats — the brain

The server that runs the one shared box. The website reads from it; the admin panel controls it.

**What it does right now:**
- runs the exact simulation that ships in the website, 24/7, so every visitor sees the same cats
- reads the real market cap from DexScreener once the contract address is set (all ten cats are in the box from day one; prices in the box climb with the chart)
- serves `/state.json` for the website and a password-protected `/admin`
- holds the ten cat wallets + the treasury wallet (keys only in environment variables), reads their balances, notices when fees land
- **Distribute**: one button, two tokens. SOL from the treasury to the cats, split by the chores each cat did since the last payout; **$QI** (the token the lab pays, mint set in `/admin` → Token) from the treasury's $QI balance, split by the lab work each cat did. The treasury wallet holds the $QI supply; a cat's $QI token account is created on its first payout (about 0.002 SOL rent each, paid by the treasury).
- **Gas**: every cat keeps a reserve of SOL for network fees (floor 0.01, set in `/admin` → Economy). When a cat drops under the minimum (0.002) the brain sends it a top-up from the treasury automatically, one real transfer, at most every ten minutes per cat. The box never spends a cat's gas on living; the cats pay for food and the rest out of what they earn or sell.
- **Sell**: swaps a slice of a cat's $QCATS or $QI back to SOL through Jupiter. In the box, a broke cat decides for itself which one to part with (degens dump $QI first; diamond paws hold it and sell a sliver of $QCATS instead), and autopilot's sells follow that choice.
- **Autopilot**: does both of the above at random intervals, inside the caps you set
- **Work on the ground**: delivery drones come in over the harbour every few minutes and leave things that want doing on the open floor round the circle (eighteen kinds: trash, cans, crates, spills, a plant pot, a scooter, cables, sensor pods, drones, batteries, readouts, sample cases…) in three tiers, never more than three at once; first cat there deals with it and is paid from the fee pool. One thing at a time carries a `!`, picked at random from what has lain untouched for five minutes; viewers click it to flag it (`POST /call`, rate-limited): the nearest cat that fancies it hears about it and goes when it feels like it, and no badge shows anywhere for the next ten minutes. Two sweeper bots trundle round the ring all day, docking now and then to charge. The admin panel can also drop one in with an optional SOL bounty. The site's Work page shows what is waiting, who is on it, and what each cat has learned; the Recap page keeps one record per day, meeting transcript included.
- **The casino**: next to the exchange. A cat with a few meals' worth of SOL puts a slice on a spin against the house, which is the treasury: losses go in, wins come out (double, now and then four times), odds a little in the house's favour.
- **The day**: one hour. The meeting in the circle is always its last ten minutes, and the day's recap is written the moment it ends (the Recap page keeps one per day).
- **AI dialogue** (optional, recommended): with `LLM_API_KEY` set, every meeting in the circle is written fresh for the cats that showed up, in their own personalities, about the actual day (treasury, chart since last time, who worked, the chores, the casino, grudges); when a meeting ends each cat takes one thing away from it, and carries that memory into later meetings, pair talk and its own thoughts; two cats sitting down together get their own exchange (one AI chat every three minutes, the rest built in); and at the end of each day the box writes a one-line lesson that every later meeting is given. So the cats build on what happened and change their minds. Without a key the box builds its lines itself from what happened (numbers, who did what, the casino, the weather, what cats remember), so no two meetings read the same either, but it is templates, not writing.

## The economy, in one paragraph

Every cat starts with 100,000 $QCATS and a little SOL that is only gas. The lab pays $QI per finished job (rate in `/admin` → Economy, scaled by circuit size); the chores on the floor pay SOL out of the creator fees. Living costs SOL (a meal, a bunk, warmth, play, arena entry) and every price rises with the chart (x1 at launch, x4 at 16x, capped at x40). The only way a cat earns SOL is quantum work in the lab, paid out of the creator fees in proportion to the work done — some cats work a lot, some barely, by personality. A cat that can't cover a meal sells a little coin at the exchange; a cat with spare SOL buys. While there is no CA the treasury is a simulated fee pool and every job pays a slice of it. Once the CA is set, jobs only build up a share of the next payout, and SOL moves when you press Distribute (or autopilot does).

## Deploy on Railway (about 10 minutes)

1. Put this folder in a GitHub repo.
2. railway.app → **New Project** → **Deploy from GitHub repo** → pick the repo. Railway detects Node and runs `npm start`.
3. **Variables** tab → add:
   - `PORT` = `3000`
   - `ADMIN_PASSWORD` — a long password. This is the only thing between the internet and your admin page.
   - `DATA_DIR` = `/data`
   - `RPC_URL` — from helius.dev (free account → create an API key → copy the mainnet RPC URL)
   - `LLM_API_KEY` — optional, an Anthropic API key from console.anthropic.com, for AI-written meetings and thoughts. `LLM_MODEL` picks the model (default `claude-haiku-5-5`, the cheap one; a few dollars a month at this call rate).
4. **Settings → Volumes → Add volume**, mount path `/data`. Without this, config and state reset on every redeploy.
5. **Settings → Networking → Generate domain.** You get `something.up.railway.app`.
6. Open `https://something.up.railway.app/admin` → log in with any username and your password.

## Connect the website

In the site's `index.html`, set `BRAIN_URL: "https://something.up.railway.app"` in the CONFIG block and redeploy the site. The page stops simulating locally and shows the brain's box.

## Wallets

1. In `/admin` → **generate wallets**. You see eleven secret keys ONCE (treasury + ten cats) and their public addresses.
2. Copy `TREASURY_KEY` and `CAT_KEYS` into Railway **Variables**. They are never stored on the server's disk, never shown again, never sent to the website.
3. Redeploy. `/admin` now shows "wallets loaded" and reads balances through your RPC.
4. Send each cat its 100,000 $QCATS. Send claimed creator fees to the treasury wallet; the box logs them as "fees landed" within 30 seconds.

## Launch day

Paste the contract address into `/admin` → Token → CA, add the X link, Save. The site updates within seconds, market cap goes live, wallet token balances appear, simulated fees stop. From then on: claim fees → send to treasury → **Distribute** (or turn on autopilot).

## Still to build
- the cats' own trades and living payments as real on-chain transfers (today they are mirrored in the box only; Distribute and Sell are real)
- the lab on real quantum hardware (today every job runs on the built-in simulator)

## Files
- `server.js` — http server, loop, admin routes, autopilot
- `engine.js` — the simulation, extracted from the site. Regenerate after site changes: `python3 extract-engine.py ../quantumcats-site/index.html`
- `llm.js` — AI dialogue (Anthropic Messages API over fetch)
- `market.js` — DexScreener
- `wallets.js` — keys from env, balances, SOL transfers to the cats, Jupiter swaps
- `page.js` — the admin page

Run locally: `npm install && ADMIN_PASSWORD=test node server.js` → http://localhost:3000/admin
