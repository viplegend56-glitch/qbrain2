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

// balances: SOL, the project's own token (mint = the CA) and $QI (qiMint), for the treasury and every cat
async function balances(rpcUrl, ws, mint, qiMint) {
  const { Connection, PublicKey, LAMPORTS_PER_SOL } = libs();
  const conn = new Connection(rpcUrl, 'confirmed');
  const out = { cats: {}, treasury: null };
  const pkOf = m => { try { return m ? new PublicKey(m) : null; } catch (_) { return null; } };
  const mintPk = pkOf(mint), qiPk = pkOf(qiMint);
  async function tok(pk, mp) {
    if (!mp) return { ui: null, raw: null, dec: null };
    const r = await conn.getParsedTokenAccountsByOwner(pk, { mint: mp });
    let ui = 0, raw = 0, dec = null;
    for (const a of r.value) { const ta = a.account.data.parsed.info.tokenAmount; ui += Number(ta.uiAmount || 0); raw += Number(ta.amount || 0); dec = ta.decimals; }
    return { ui, raw, dec };
  }
  async function one(pub) {
    const pk = new PublicKey(pub);
    const sol = (await conn.getBalance(pk)) / LAMPORTS_PER_SOL;
    const q = await tok(pk, mintPk), qi = await tok(pk, qiPk);
    return { sol, qcat: q.ui, qcatRaw: q.raw, decimals: q.dec, qi: qi.ui, qiRaw: qi.raw, qiDec: qi.dec };
  }
  out.treasury = await one(ws.treasury.pub);
  for (const c of ws.cats) out.cats[c.name] = await one(c.pub);
  return out;
}

// ---------- the only three things this server ever signs ----------
// 1) SOL from the treasury to cat wallets (and nowhere else): payroll and gas top-ups.
// 2) $QI (or the project's own token) from the treasury to cat wallets (and nowhere else).
// 3) Swaps between SOL and the project's own mint or $QI, from a cat's wallet, via Jupiter.
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

// ---- SPL tokens, by hand (no extra dependency): the mint's program + decimals, associated accounts, transferChecked ----
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnwqMYbqcmChnM', ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
async function mintInfo(rpcUrl, mint) {
  const { Connection, PublicKey } = libs();
  const conn = new Connection(rpcUrl, 'confirmed');
  const info = await conn.getParsedAccountInfo(new PublicKey(mint));
  if (!info.value) throw new Error('mint not found: ' + mint);
  const owner = info.value.owner.toBase58();
  if (owner !== TOKEN_PROGRAM && owner !== TOKEN_2022) throw new Error('that address is not a token mint');
  const parsed = info.value.data && info.value.data.parsed;
  const decimals = parsed && parsed.info && typeof parsed.info.decimals === 'number' ? parsed.info.decimals : null;
  if (decimals == null) throw new Error('could not read the mint\u2019s decimals');
  return { program: owner, decimals };
}
function ataOf(owner, mint, program) { const { PublicKey } = libs(); return PublicKey.findProgramAddressSync([owner.toBuffer(), new PublicKey(program).toBuffer(), mint.toBuffer()], new PublicKey(ATA_PROGRAM))[0]; }
// outs: [{ pub, raw }] (raw = smallest units). Creates the cat's token account if it has none (idempotent), then transferChecked. Five cats per transaction. Returns the signatures.
async function transferToken(rpcUrl, ws, fromKp, mint, outs) {
  const { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } = libs();
  const conn = new Connection(rpcUrl, 'confirmed');
  const { program, decimals } = await mintInfo(rpcUrl, mint);
  const mintPk = new PublicKey(mint), progPk = new PublicKey(program), fromAta = ataOf(fromKp.publicKey, mintPk, program);
  const sigs = [];
  for (let i = 0; i < outs.length; i += 5) {
    const tx = new Transaction();
    for (const o of outs.slice(i, i + 5)) {
      assertKnown(ws, o.pub);
      const raw = BigInt(Math.floor(o.raw)); if (raw <= 0n) continue;
      const to = new PublicKey(o.pub), toAta = ataOf(to, mintPk, program);
      tx.add(new TransactionInstruction({ programId: new PublicKey(ATA_PROGRAM), keys: [
        { pubkey: fromKp.publicKey, isSigner: true, isWritable: true }, { pubkey: toAta, isSigner: false, isWritable: true }, { pubkey: to, isSigner: false, isWritable: false },
        { pubkey: mintPk, isSigner: false, isWritable: false }, { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, { pubkey: progPk, isSigner: false, isWritable: false },
      ], data: Buffer.from([1]) })); // CreateIdempotent
      const data = Buffer.alloc(10); data[0] = 12; data.writeBigUInt64LE(raw, 1); data[9] = decimals; // TransferChecked
      tx.add(new TransactionInstruction({ programId: progPk, keys: [
        { pubkey: fromAta, isSigner: false, isWritable: true }, { pubkey: mintPk, isSigner: false, isWritable: false }, { pubkey: toAta, isSigner: false, isWritable: true }, { pubkey: fromKp.publicKey, isSigner: true, isWritable: false },
      ], data }));
    }
    if (!tx.instructions.length) continue;
    sigs.push(await sendAndConfirmTransaction(conn, tx, [fromKp], { commitment: 'confirmed', maxRetries: 3 }));
  }
  return { sigs, decimals };
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

module.exports = { load, generate, balances, transferSol, transferToken, mintInfo, jupiterSwap, ROSTER_NAMES, SOL_MINT, LAMPORTS };
