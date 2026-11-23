import { NextResponse } from "next/server";

const addressPattern = /^0x[a-fA-F0-9]{40}$/;

type DexPair = {
  chainId?: unknown;
  pairAddress?: unknown;
  baseToken?: { address?: unknown };
  quoteToken?: { address?: unknown };
  priceUsd?: unknown;
  priceChange?: { h24?: unknown };
  volume?: { h24?: unknown };
  marketCap?: unknown;
  fdv?: unknown;
  liquidity?: { usd?: unknown };
};

type GeckoToken = {
  id?: unknown;
  attributes?: {
    address?: unknown;
    price_usd?: unknown;
    price_change_percentage?: { h24?: unknown };
    volume_usd?: { h24?: unknown };
    market_cap_usd?: unknown;
    fdv_usd?: unknown;
    total_supply?: unknown;
    circulating_supply?: unknown;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isDexPair(value: unknown): value is DexPair {
  return isRecord(value);
}

function isGeckoToken(value: unknown): value is GeckoToken {
  return isRecord(value)
    && isRecord(value.attributes)
    && typeof value.attributes.address === "string";
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("addresses");
  const addresses = query?.split(",").map((address) => address.trim()).filter(Boolean) ?? [];
  if (
    addresses.length === 0 ||
    addresses.length > 30 ||
    addresses.some((address) => !addressPattern.test(address))
  ) {
    return NextResponse.json({ error: "Provide between 1 and 30 valid token addresses." }, { status: 400 });
  }

  const requestedAddresses = new Map(addresses.map((address) => [address.toLowerCase(), address]));

  const bestPairs = new Map<string, DexPair>();
  try {
    const response = await fetch(
      `https://api.dexscreener.com/tokens/v1/base/${addresses.join(",")}`,
      { next: { revalidate: 30 }, signal: AbortSignal.timeout(8000) },
    );
    if (response.ok) {
      const payload: unknown = await response.json();
      if (Array.isArray(payload)) {
        for (const value of payload.filter(isDexPair)) {
          if (value.chainId !== "base" || typeof value.pairAddress !== "string" || !addressPattern.test(value.pairAddress)) {
            continue;
          }

          const baseAddress = typeof value.baseToken?.address === "string" ? value.baseToken.address.toLowerCase() : "";
          const quoteAddress = typeof value.quoteToken?.address === "string" ? value.quoteToken.address.toLowerCase() : "";
          const tokenAddress = requestedAddresses.has(baseAddress) ? baseAddress : requestedAddresses.has(quoteAddress) ? quoteAddress : "";
          if (!tokenAddress) continue;

          const currentPair = bestPairs.get(tokenAddress);
          if (
            !currentPair ||
            (numericValue(value.liquidity?.usd) ?? 0) > (numericValue(currentPair.liquidity?.usd) ?? 0)
          ) {
            bestPairs.set(tokenAddress, value);
          }
        }
      }
    }
  } catch {
    // Continue to the secondary public source if DexScreener is unavailable.
  }

  const geckoTokens = new Map<string, GeckoToken>();
  try {
    const response = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/base/tokens/multi/${addresses.join(",")}`,
      {
        headers: { Accept: "application/json;version=20230302" },
        next: { revalidate: 60 },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (response.ok) {
      const payload: unknown = await response.json();
      if (isRecord(payload) && Array.isArray(payload.data)) {
        for (const item of payload.data.filter(isGeckoToken)) {
          const address = item.attributes?.address;
          if (typeof address !== "string") continue;
          const tokenAddress = address.toLowerCase();
          if (requestedAddresses.has(tokenAddress)) geckoTokens.set(tokenAddress, item);
        }
      }
    }
  } catch {
    // Return any available primary-source data if the fallback is unavailable.
  }

  const marketData = Object.fromEntries([...requestedAddresses.keys()].map((address) => {
    const pair = bestPairs.get(address);
    const fallback = geckoTokens.get(address)?.attributes;
    const pairAddress = typeof pair?.pairAddress === "string" ? pair.pairAddress : undefined;
    const values = {
      price: numericValue(pair?.priceUsd) ?? numericValue(fallback?.price_usd),
      change: numericValue(pair?.priceChange?.h24) ?? numericValue(fallback?.price_change_percentage?.h24),
      volume: numericValue(pair?.volume?.h24) ?? numericValue(fallback?.volume_usd?.h24),
      marketCap: numericValue(pair?.marketCap) ?? numericValue(fallback?.market_cap_usd),
      fdv: numericValue(pair?.fdv) ?? numericValue(fallback?.fdv_usd),
      totalSupply: numericValue(fallback?.total_supply),
      circulatingSupply: numericValue(fallback?.circulating_supply),
      pairAddress,
    };
    return [address, Object.values(values).some((value) => value !== null && value !== undefined) ? values : null];
  }));

  return NextResponse.json(marketData, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
  });
}
