// Wallets — phase 2 is read-only. Keys live ONLY in environment variables on the server:
//   TREASURY_KEY  = base58 secret key of the treasury wallet (receives claimed creator fees)
//   CAT_KEYS      = ten base58 secret keys, comma-separated, in roster order (Miso, Qubit, Nori, ...)
// Nothing in this file signs or sends anything yet. It derives public addresses and reads balances.
'use strict';
let web3 = null, bs58 = null;
function libs() { if (!web3) { web3 = require('@solana/web3.js'); const b = require('bs58'); bs58 = b.default || b; } return web3; }

const ROSTER_NAMES = ['Miso', 'Qubit', 'Nori', 'Pixel', 'Mochi', 'Static', 'Olive', 'Photon', 'Biscuit', 'Echo'];

function kpFrom(b58) { const { Keypair } = libs(); return Keypair.fromSecretKey(bs58.decode(b58.trim())); }

function load() {
  const t = process.env.TREASURY_KEY, c = process.env.CAT_KEYS;
  if (!t || !c) return { ready: false, reason: !t && !c ? 'no keys in environment' : !t ? 'TREASURY_KEY missing' : 'CAT_KEYS missing' };
  try {
    const keys = c.split(',').map(s => s.trim()).filter(Boolean);
    if (keys.length !== 10) return { ready: false, reason: `CAT_KEYS has ${keys.length} keys, need 10` };
    const treasury = kpFrom(t);
    const cats = keys.map((k, i) => { const kp = kpFrom(k); return { name: ROSTER_NAMES[i], pub: kp.publicKey.toBase58(), kp }; });
    return { ready: true, treasury: { pub: treasury.publicKey.toBase58(), kp: treasury }, cats };
  } catch (e) { return { ready: false, reason: 'could not parse keys: ' + e.message }; }
}

// Generates a fresh set. Returned ONCE to the admin page; the operator pastes them into the host's environment variables.
function generate(names) {
  const { Keypair } = libs();
  const treasury = Keypair.generate();
  const cats = (names || ROSTER_NAMES).map(name => { const kp = Keypair.generate(); return { name, pub: kp.publicKey.toBase58(), secret: bs58.encode(kp.secretKey) }; });
  return { treasury: { pub: treasury.publicKey.toBase58(), secret: bs58.encode(treasury.secretKey) }, cats, CAT_KEYS: cats.map(c => c.secret).join(','), TREASURY_KEY: bs58.encode(treasury.secretKey) };
}

async function balances(rpcUrl, ws, mint) {
  const { Connection, PublicKey, LAMPORTS_PER_SOL } = libs();
  const conn = new Connection(rpcUrl, 'confirmed');
  const out = { cats: {}, treasury: null };
  const mintPk = mint ? new PublicKey(mint) : null;
  async function one(pub) {
    const pk = new PublicKey(pub);
    const sol = (await conn.getBalance(pk)) / LAMPORTS_PER_SOL;
    let qcat = null;
    if (mintPk) {
      const r = await conn.getParsedTokenAccountsByOwner(pk, { mint: mintPk });
      qcat = r.value.reduce((s, a) => s + Number(a.account.data.parsed.info.tokenAmount.uiAmount || 0), 0);
    }
    return { sol, qcat };
  }
  out.treasury = await one(ws.treasury.pub);
  for (const c of ws.cats) out.cats[c.name] = await one(c.pub);
  return out;
}

module.exports = { load, generate, balances, ROSTER_NAMES };
