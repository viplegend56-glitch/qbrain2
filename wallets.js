// Wallets. Keys live ONLY in environment variables on the server:
//   TREASURY_KEY  = base58 secret key of the treasury wallet (receives claimed creator fees)
//   CAT_KEYS      = ten base58 secret keys, comma-separated, in roster order (Miso, Qubit, Nori, ...)
// This file derives public addresses, reads balances, and signs exactly two kinds of transaction (see the bottom).
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
  let mintPk = null; try { if (mint) mintPk = new PublicKey(mint); } catch (_) { mintPk = null; }
  async function one(pub) {
    const pk = new PublicKey(pub);
    const sol = (await conn.getBalance(pk)) / LAMPORTS_PER_SOL;
    let qcat = null, qcatRaw = null, decimals = null;
    if (mintPk) {
      const r = await conn.getParsedTokenAccountsByOwner(pk, { mint: mintPk });
      qcat = 0; qcatRaw = 0;
      for (const a of r.value) { const ta = a.account.data.parsed.info.tokenAmount; qcat += Number(ta.uiAmount || 0); qcatRaw += Number(ta.amount || 0); decimals = ta.decimals; }
    }
    return { sol, qcat, qcatRaw, decimals };
  }
  out.treasury = await one(ws.treasury.pub);
  for (const c of ws.cats) out.cats[c.name] = await one(c.pub);
  return out;
}

// ---------- phase 3: the only two things this server ever signs ----------
// 1) SOL from the treasury to cat wallets (and nowhere else).
// 2) Swaps between SOL and the project's own mint, from a cat's wallet, via Jupiter.
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const LAMPORTS = 1e9;

function assertKnown(ws, pub) {
  if (pub !== ws.treasury.pub && !ws.cats.some(c => c.pub === pub)) throw new Error('refusing to send to an address that is not one of the ten cats or the treasury');
}

// outs: [{ pub, sol }] — one transaction, several transfers. Returns the signature.
async function transferSol(rpcUrl, ws, fromKp, outs) {
  const { Connection, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } = libs();
  const conn = new Connection(rpcUrl, 'confirmed');
  const tx = new Transaction();
  for (const o of outs) {
    assertKnown(ws, o.pub);
    const lamports = Math.floor(o.sol * LAMPORTS);
    if (lamports < 900000) throw new Error(`each transfer must be at least 0.0009 SOL (rent); ${o.pub.slice(0, 4)}… would get ${o.sol}`);
    tx.add(SystemProgram.transfer({ fromPubkey: fromKp.publicKey, toPubkey: new PublicKey(o.pub), lamports }));
  }
  return sendAndConfirmTransaction(conn, tx, [fromKp], { commitment: 'confirmed', maxRetries: 3 });
}

// Jupiter swap. direction 'sell' = mint → SOL, 'buy' = SOL → mint. amountRaw is in the input token's smallest unit.
async function jupiterSwap(rpcUrl, kp, mint, direction, amountRaw, slippageBps) {
  const { Connection, VersionedTransaction } = libs();
  if (!mint) throw new Error('no CA set');
  const inputMint = direction === 'sell' ? mint : SOL_MINT, outputMint = direction === 'sell' ? SOL_MINT : mint;
  const base = (process.env.JUP_API || 'https://lite-api.jup.ag/swap/v1').replace(/\/$/, '');
  const hdr = { accept: 'application/json' }; if (process.env.JUP_API_KEY) hdr['x-api-key'] = process.env.JUP_API_KEY;
  const q = await fetch(`${base}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${Math.floor(amountRaw)}&slippageBps=${slippageBps || 300}`, { headers: hdr });
  if (!q.ok) throw new Error(`jupiter quote ${q.status}: ${(await q.text()).slice(0, 160)}`);
  const quote = await q.json();
  if (quote.error || !quote.outAmount) throw new Error('jupiter: ' + (quote.error || 'no route for this token yet'));
  const sw = await fetch(`${base}/swap`, { method: 'POST', headers: { ...hdr, 'content-type': 'application/json' }, body: JSON.stringify({ quoteResponse: quote, userPublicKey: kp.publicKey.toBase58(), wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, prioritizationFeeLamports: 'auto' }) });
  if (!sw.ok) throw new Error(`jupiter swap ${sw.status}: ${(await sw.text()).slice(0, 160)}`);
  const { swapTransaction } = await sw.json();
  if (!swapTransaction) throw new Error('jupiter returned no transaction');
  const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
  tx.sign([kp]);
  const conn = new Connection(rpcUrl, 'confirmed');
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  const bh = await conn.getLatestBlockhash('confirmed');
  const conf = await conn.confirmTransaction({ signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight }, 'confirmed');
  if (conf.value && conf.value.err) throw new Error('swap failed on chain: ' + JSON.stringify(conf.value.err));
  return { sig, inAmount: Number(quote.inAmount), outAmount: Number(quote.outAmount) };
}

module.exports = { load, generate, balances, transferSol, jupiterSwap, ROSTER_NAMES, SOL_MINT, LAMPORTS };
