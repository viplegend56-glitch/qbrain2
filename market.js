// Market data from DexScreener (public, no key). Returns market cap in USD and the SOL price it implies.
'use strict';
async function fetchToken(ca) {
  const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(ca)}`, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`dexscreener ${r.status}`);
  const j = await r.json();
  const pairs = (j.pairs || []).filter(p => p.chainId === 'solana');
  if (!pairs.length) throw new Error('no solana pairs for this address yet');
  // prefer the deepest pair
  pairs.sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0));
  const p = pairs[0];
  const priceUsd = Number(p.priceUsd), priceNative = Number(p.priceNative);
  const mcapUsd = Number(p.marketCap || p.fdv || 0);
  const solUsd = priceUsd && priceNative ? priceUsd / priceNative : null;
  return { mcapUsd, priceUsd, priceNative, solUsd, pair: p.pairAddress, dex: p.dexId, url: p.url, liquidityUsd: p.liquidity && p.liquidity.usd, vol24h: p.volume && p.volume.h24 };
}
module.exports = { fetchToken };
