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

const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
function memoIx(text) { const { PublicKey, TransactionInstruction } = libs(); return new TransactionInstruction({ programId: new PublicKey(MEMO_PROGRAM), keys: [], data: Buffer.from(String(text).slice(0, 200), 'utf8') }); }

// ---- sending ----
// A Solana transaction is only valid for ~150 blocks (60–90 s) after its blockhash. The library default sends it a few
// times and gives up, so on a busy network a zero-tip transfer dies with "block height exceeded". Here every transaction
// gets a priority fee read from the network plus a compute budget, is re-broadcast every 2 s until it confirms, and is
// re-signed with a fresh blockhash (up to 3 times) if one does expire. Before anything is called failed, the signature
// is looked up once more, so a payment that did land is never reported as lost.
const PRIO = { min: 20000, max: 1500000, fallback: 150000 }; // micro-lamports per compute unit (1.5M × 50k CU = 0.000075 SOL at most)
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function priorityFee(conn) {
  try {
    const fees = await conn.getRecentPrioritizationFees();
    const vals = fees.map(f => f.prioritizationFee).filter(v => v > 0).sort((a, b) => a - b);
    if (!vals.length) return PRIO.fallback;
    const p75 = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.75))];
    return Math.min(PRIO.max, Math.max(PRIO.min, p75 * 2));
  } catch { return PRIO.fallback; }
}
const isConfirmed = st => !!st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized');
async function statusOf(conn, sig, history) {
  try { const r = await conn.getSignatureStatuses([sig], history ? { searchTransactionHistory: true } : undefined); return r.value && r.value[0]; } catch { return null; }
}
// Broadcasts an already-signed transaction until it confirms or its blockhash expires. Returns 'ok' | 'expired'; throws on an on-chain error.
async function broadcast(conn, raw, sig, lastValidBlockHeight) {
  for (let n = 0; n < 60; n++) {
    const st = await statusOf(conn, sig);
    if (st && st.err) throw new Error('failed on chain: ' + JSON.stringify(st.err));
    if (isConfirmed(st)) return 'ok';
    let height = 0; try { height = await conn.getBlockHeight('confirmed'); } catch {}
    if (height && height > lastValidBlockHeight) break;
    try { await conn.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 }); } catch {}
    await sleep(2000);
  }
  await sleep(1500);
  const st = await statusOf(conn, sig, true);
  if (st && st.err) throw new Error('failed on chain: ' + JSON.stringify(st.err));
  return isConfirmed(st) ? 'ok' : 'expired';
}
// ixs: the instructions, or a function (feeLamports) => instructions for a transfer that must leave an exact amount behind; signers[0] pays.
// Adds the compute budget, signs with a fresh blockhash, broadcasts, retries on expiry. Returns the signature.
async function sendTx(conn, ixs, signers, cuLimit) {
  const { Transaction, ComputeBudgetProgram } = libs();
  const price = await priorityFee(conn);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const bh = await conn.getLatestBlockhash('confirmed');
    const micro = Math.round(price * attempt), fee = 5000 * signers.length + Math.ceil(cuLimit * micro / 1e6); // base fee per signature + the priority fee, exactly as the chain charges it
    const tx = new Transaction({ recentBlockhash: bh.blockhash, feePayer: signers[0].publicKey });
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: micro }));
    for (const ix of (typeof ixs === 'function' ? ixs(fee) : ixs)) tx.add(ix);
    tx.sign(...signers);
    const raw = tx.serialize();
    const sig = await conn.sendRawTransaction(raw, { skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 0 }); // a preflight failure (no funds, bad account) throws here and is not retried
    const r = await broadcast(conn, raw, sig, bh.lastValidBlockHeight);
    if (r === 'ok') return sig;
    console.warn(`tx ${sig.slice(0, 8)}… expired (attempt ${attempt}), re-signing with a fresh blockhash`);
  }
  throw new Error('transaction expired 3 times (network congested or RPC slow) — nothing was sent');
}

// outs: [{ pub, sol }] — one transaction, several transfers, an optional memo so Solscan shows what it was. Returns the signature.
// A transfer to an account that may not exist yet (a fresh cat wallet) must be at least the rent minimum; one to the treasury or a funded cat can be any size.
async function transferSol(rpcUrl, ws, fromKp, outs, memo, allowSmall) {
  const { Connection, PublicKey, SystemProgram } = libs();
  const conn = new Connection(rpcUrl, 'confirmed');
  const ixs = [];
  for (const o of outs) {
    assertKnown(ws, o.pub);
    const lamports = Math.floor(o.sol * LAMPORTS);
    if (lamports < 900000 && !allowSmall) throw new Error(`each transfer must be at least 0.0009 SOL (rent); ${o.pub.slice(0, 4)}… would get ${o.sol}`);
    if (lamports < 1000) throw new Error('transfer too small');
    ixs.push(SystemProgram.transfer({ fromPubkey: fromKp.publicKey, toPubkey: new PublicKey(o.pub), lamports }));
  }
  if (memo) ixs.push(memoIx(memo));
  return sendTx(conn, ixs, [fromKp], 30000 + 5000 * outs.length);
}
// Everything a wallet holds, to one of the known addresses: balance minus the exact fee, so the wallet lands on zero (the chain refuses to leave dust under the rent minimum). Returns { sig, sol }.
async function sweepSol(rpcUrl, ws, fromKp, toPub, memo) {
  const { Connection, PublicKey, SystemProgram } = libs();
  assertKnown(ws, toPub);
  const conn = new Connection(rpcUrl, 'confirmed');
  const bal = await conn.getBalance(fromKp.publicKey, 'confirmed');
  const cu = 30000; let sent = 0;
  const sig = await sendTx(conn, fee => { sent = bal - fee; if (sent < 1000) throw new Error(`only ${(bal / LAMPORTS).toFixed(6)} SOL here, not enough to cover the fee`); return [SystemProgram.transfer({ fromPubkey: fromKp.publicKey, toPubkey: new PublicKey(toPub), lamports: sent })].concat(memo ? [memoIx(memo)] : []); }, [fromKp], cu);
  return { sig, sol: sent / LAMPORTS };
}

// ---- SPL tokens, by hand (no extra dependency): the mint's program + decimals, associated accounts, transferChecked ----
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
async function mintInfo(rpcUrl, mint) {
  const { Connection, PublicKey } = libs();
  const conn = new Connection(rpcUrl, 'confirmed');
  let pk; try { pk = new PublicKey(mint); } catch { throw new Error('not a valid Solana address'); }
  // getTokenSupply only answers for a mint (and gives its decimals); that is the real test
  let decimals = null, supplyErr = null;
  try { const sup = await conn.getTokenSupply(pk); decimals = sup && sup.value && typeof sup.value.decimals === 'number' ? sup.value.decimals : null; } catch (e) { supplyErr = String(e.message || e); }
  const info = await conn.getAccountInfo(pk, 'confirmed');
  if (!info) throw new Error('no account at that address' + (supplyErr ? ' (' + supplyErr.slice(0, 80) + ')' : ''));
  const owner = info.owner && info.owner.toBase58 ? info.owner.toBase58() : String(info.owner);
  const program = owner === TOKEN_2022 || (info.owner && info.owner.equals && info.owner.equals(new PublicKey(TOKEN_2022))) ? TOKEN_2022 : TOKEN_PROGRAM;
  if (decimals == null) {
    // not answered as a mint: say what is there instead, so the next step is obvious
    if (owner !== TOKEN_PROGRAM && owner !== TOKEN_2022) throw new Error(`that address is not a token mint (owned by ${owner.slice(0, 8)}…, ${info.data ? info.data.length : 0} bytes${supplyErr ? '; ' + supplyErr.slice(0, 60) : ''})`);
    throw new Error('that address belongs to the token program but is not a mint (a token account?)' + (supplyErr ? ': ' + supplyErr.slice(0, 80) : ''));
  }
  return { program, decimals, owner };
}
function ataOf(owner, mint, program) { const { PublicKey } = libs(); return PublicKey.findProgramAddressSync([owner.toBuffer(), new PublicKey(program).toBuffer(), mint.toBuffer()], new PublicKey(ATA_PROGRAM))[0]; }
// outs: [{ pub, raw }] (raw = smallest units). Creates the cat's token account if it has none (idempotent), then transferChecked. Five cats per transaction. Returns the signatures.
async function transferToken(rpcUrl, ws, fromKp, mint, outs, memo) {
  const { Connection, PublicKey, SystemProgram, TransactionInstruction } = libs();
  const conn = new Connection(rpcUrl, 'confirmed');
  const { program, decimals } = await mintInfo(rpcUrl, mint);
  const mintPk = new PublicKey(mint), progPk = new PublicKey(program), fromAta = ataOf(fromKp.publicKey, mintPk, program);
  const sigs = [];
  for (let i = 0; i < outs.length; i += 5) {
    const ixs = [], tx = { add: ix => ixs.push(ix), instructions: ixs };
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
    if (!ixs.length) continue;
    if (memo) tx.add(memoIx(memo));
    sigs.push(await sendTx(conn, ixs, [fromKp], 40000 + 45000 * Math.ceil(ixs.length / 2))); // an account creation + a transfer per cat
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
  const raw = tx.serialize();
  const bh = await conn.getLatestBlockhash('confirmed'); // Jupiter stamped the blockhash moments ago; this height is a close upper bound for when it expires
  const sig = await conn.sendRawTransaction(raw, { skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 0 });
  const r = await broadcast(conn, raw, sig, bh.lastValidBlockHeight);
  if (r !== 'ok') throw new Error('swap expired before it confirmed (network congested) — nothing was swapped, try again');
  return { sig, inAmount: Number(quote.inAmount), outAmount: Number(quote.outAmount) };
}

module.exports = { load, generate, balances, transferSol, sweepSol, transferToken, mintInfo, jupiterSwap, ROSTER_NAMES, SOL_MINT, LAMPORTS, MEMO_PROGRAM };
