# Quantum Cats — the brain

The server that runs the one shared box. The website reads from it; the admin panel controls it.

**What it does right now:**
- runs the exact simulation that ships in the website, 24/7, so every visitor sees the same cats
- reads the real market cap from DexScreener once the contract address is set (all ten cats are in the box from day one; prices in the box climb with the chart)
- serves `/state.json` for the website and a password-protected `/admin`
- holds the ten cat wallets + the treasury wallet (keys only in environment variables), reads their balances, notices when fees land
- **Prices**: every price in the box is multiplied by one number you set by hand in `/admin` → Economy (x1 = the menu as written). Nothing changes on its own with the chart. The site reads the multiplier (and the testing price) from the brain, so the diner, heater, yard, shop and arena panels show exactly what the cats pay.
- **Payouts** (`/admin` → Payouts): chores earn SOL and lab tasks earn $QI as the cats work ($5–$15 of $QI per task, by difficulty; range set there); both are *owed* until the payout timer fires (every 20 minutes by default, set there; the site shows the countdown top-left and has a Payouts page). **Pay now** pays every cat exactly what it is owed — one SOL transfer and one $QI transfer, each logged with its Solscan link. Tick **Automatic payouts** and the brain does it itself every time the timer fires. The treasury always buys the $QI it owes through Jupiter at payout time, with SOL from the fees, on top of any $QI it already holds.
- **The cats' own transactions, on-chain** (`/admin` → Economy): meals, heater, yard, shop, arena entries and casino stakes go cat → treasury; casino wins treasury → cat; arena wagers cat → cat — one transaction each, with a memo saying what it was, from the cat's own key. Three modes: **sandbox** (the box only, nothing leaves a wallet), **default testing** (real transactions, but every price in the box — and on the site — is 0.001 SOL, and lab pay a hundredth of the dollar range, so the plumbing is proved for cents), **default** (real prices). In both real modes the wallet balances are the truth: a cat can spend what is on-chain minus its 0.01 gas floor minus what is still in flight, and a transfer that fails is refunded in the box. A per-payment cap (1 SOL) and a daily cap on casino wins (25 SOL) sit underneath as a safety net against a bug; they are not settings.
- **Distribute**: one button, two tokens. SOL from the treasury to the cats, split by the chores each cat did since the last payout; **$QI** (the token the lab pays, mint set in `/admin` → Token) from the treasury's $QI balance, split by the lab work each cat did. The treasury wallet holds the $QI supply; a cat's $QI token account is created on its first payout (about 0.002 SOL rent each, paid by the treasury).
- **Gas**: every cat keeps a reserve of SOL for network fees (0.01) that the box never spends on living. There is no automatic top-up: the Cats & wallets table flags a cat under 0.002 SOL with **needs SOL**, and you send it some by hand.
- **Sell**: in the box, a cat decides for itself when to sell $QI or $QCATS for SOL and when to buy (degens dump $QI first; diamond paws hold it and sell a sliver of $QCATS instead). Nothing in admin sells for them.
- **Work on the ground**: delivery drones come in over the harbour every few minutes and leave things that want doing on the open floor round the circle (eighteen kinds: trash, cans, crates, spills, a plant pot, a scooter, cables, sensor pods, drones, batteries, readouts, sample cases…) in three tiers, never more than three at once; first cat there deals with it and is paid from the fee pool. One thing at a time carries a `!`, picked at random from what has lain untouched for five minutes; viewers click it to flag it (`POST /call`, rate-limited): the nearest cat that fancies it hears about it and goes when it feels like it, and no badge shows anywhere for the next ten minutes. Two sweeper bots trundle round the ring all day, docking now and then to charge. The site's Work page shows what is waiting, who is on it, and what each cat has learned; the Recap page keeps one record per day, meeting transcript included.
- **The casino**: next to the exchange. A cat with a few meals' worth of SOL puts a slice on a spin against the house, which is the treasury: losses go in, wins come out (double, now and then four times), odds a little in the house's favour.
- **The day**: one hour. The meeting in the circle is always its last ten minutes, and the day's recap is written the moment it ends (the Recap page keeps one per day).
- **AI dialogue** (optional, recommended): with `LLM_API_KEY` set, every meeting in the circle is written fresh for the cats that showed up, in their own personalities, about the actual day (treasury, chart since last time, who worked, the chores, the casino, grudges); when a meeting ends each cat takes one thing away from it, and carries that memory into later meetings, pair talk and its own thoughts; two cats sitting down together get their own exchange (one AI chat every three minutes, the rest built in); and at the end of each day the box writes a one-line lesson that every later meeting is given. So the cats build on what happened and change their minds. Without a key the box builds its lines itself from what happened (numbers, who did what, the casino, the weather, what cats remember), so no two meetings read the same either, but it is templates, not writing.

## The economy, in one paragraph

Every cat starts with 100,000 $QCATS and a little SOL that is only gas. The lab pays $QI per finished job (rate in `/admin` → Economy, scaled by circuit size); the chores on the floor pay SOL out of the creator fees. Living costs SOL at prices you can read: the diner's menu runs 0.01 to 0.10 SOL a meal (eight dishes, stocked daily), the heater sells 3/5/10/15-minute sessions pro rata of 0.10 SOL, the yard is 0.04 SOL a visit, the bunks are free, the arena wagers SOL only, the casino takes 0.01–0.05 SOL a spin, and the shop's wearables run 0.05–0.32 SOL with a few in stock each. Every price steps up with the chart: x1 under $50K market cap, x1.1 at $50K, x1.2 at $100K, +0.1 per $50K after that, and back down if the chart falls. Living costs SOL (a meal, a bunk, warmth, play, arena entry) and every price rises with the chart (x1 at launch, x4 at 16x, capped at x40). The only way a cat earns SOL is quantum work in the lab, paid out of the creator fees in proportion to the work done — some cats work a lot, some barely, by personality. A cat that can't cover a meal sells a little coin at the exchange; a cat with spare SOL buys. While there is no CA the treasury is a simulated fee pool and every job pays a slice of it. Once the CA is set, jobs only build up a share of the next payout, and SOL moves when you press Distribute (or autopilot does).

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

**How a transaction is sent.** Every transfer carries a priority fee read from the network (a few thousand lamports at most) and a compute budget, is re-broadcast every two seconds until it confirms, and if its blockhash expires anyway ("block height exceeded") it is re-signed with a fresh one and a higher tip, up to three times. Before anything is reported as failed the signature is looked up once more, so a payment that did land is never refunded in the game. A slow or rate-limited public RPC is the usual reason for expiries; a Helius / Triton / QuickNode endpoint in `RPC_URL` fixes most of them.

## Launch day

Paste the contract address into `/admin` → Token → CA, add the X link, Save. The site updates within seconds, market cap goes live, wallet token balances appear, simulated fees stop. From then on: claim fees → send to treasury → **Distribute** (or turn on autopilot).

## Still to build
- the cats' own trades and living payments as real on-chain transfers (today they are mirrored in the box only; Distribute and Sell are real)
- the lab on real quantum hardware (today every job runs on the built-in statevector simulator: random circuits, Grover, the order-finding step of Shor, noisy GHZ calibration, 2–8 qubits, 1,024 shots drawn from the true distribution)

## Files
- `server.js` — http server, loop, admin routes, the on-chain executor, automatic payouts
- `engine.js` — the simulation, extracted from the site. Regenerate after site changes: `python3 extract-engine.py ../quantumcats-site/index.html`
- `llm.js` — AI dialogue (Anthropic Messages API over fetch)
- `market.js` — DexScreener
- `wallets.js` — keys from env, balances, SOL transfers to the cats, Jupiter swaps
- `page.js` — the admin page

Run locally: `npm install && ADMIN_PASSWORD=test node server.js` → http://localhost:3000/admin
