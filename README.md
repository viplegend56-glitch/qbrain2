# Quantum Cats — the brain

The server that runs the one shared block. The website reads from it; the admin panel controls it.

**What it does right now (phase 1 + 2):**
- runs the exact simulation that ships in the website, 24/7, so every visitor sees the same cats
- reads the real market cap from DexScreener once the contract address is set, and releases cats / opens the lab from it
- serves `/state.json` for the website and a password-protected `/admin`
- generates the ten cat wallets + treasury wallet and shows their addresses and balances (read-only — nothing is signed or sent yet)

## Deploy on Railway (about 10 minutes)

1. Put this folder in a GitHub repo (e.g. `quantumcats-brain`).
2. railway.app → **New Project** → **Deploy from GitHub repo** → pick the repo. Railway detects Node and runs `npm start`.
3. **Variables** tab → add:
   - `ADMIN_PASSWORD` — a long password. This is the only thing between the internet and your admin page.
   - `DATA_DIR` = `/data`
   - `RPC_URL` — from helius.dev (free account → create an API key → copy the mainnet RPC URL)
4. **Settings → Volumes → Add volume**, mount path `/data`. Without this, config and state reset on every redeploy.
5. **Settings → Networking → Generate domain.** You get `something.up.railway.app`.
6. Open `https://something.up.railway.app/admin` → log in with any username and your password.

## Connect the website

In the site's `index.html`, set `BRAIN_URL: "https://something.up.railway.app"` in the CONFIG block and redeploy the site. The page stops simulating locally and shows the brain's block.

## Wallets (phase 2)

1. In `/admin` → **generate wallets**. You see eleven secret keys ONCE (treasury + ten cats) and their public addresses.
2. Copy `TREASURY_KEY` and `CAT_KEYS` into Railway **Variables**. They are never stored on the server's disk.
3. Redeploy (Railway → Deployments → Redeploy). `/admin` now shows "wallets loaded" and reads balances through your RPC.
4. Send each cat its 1,000,000 $QCAT and the treasury wallet any SOL you want distributed. Nothing moves until phase 3.

## Launch day

Paste the contract address into `/admin` → Token → CA, add the buy / chart / X / Telegram links, Save. The site updates within seconds, market cap goes live, wallet token balances appear. Turn off "keep simulated fee drops" once real fees flow.

## Phases still to build
- 3: fee claim → wages, cat trades via Jupiter, wagers/steals as transfers, caps, Solscan links in the Ledger
- 4: the lab (real quantum jobs)

## Files
- `server.js` — http server, loop, admin routes
- `engine.js` — the simulation, extracted from the site. Regenerate after site changes: `python3 extract-engine.py ../quantumcats-site/index.html`
- `market.js` — DexScreener
- `wallets.js` — keys from env, address + balance reading
- `page.js` — the admin page

Run locally: `npm install && ADMIN_PASSWORD=test node server.js` → http://localhost:3000/admin
