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
    decimals?: unknown;
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

function tokenAmountFromRaw(value: unknown, decimals: number | null): string | null {
  if (typeof value !== "string" || decimals === null || decimals < 0 || decimals > 255) return null;
  const raw = value.trim().replace(/\.0+$/, "");
  if (!/^\d+$/.test(raw)) return null;

  const padded = raw.padStart(decimals + 1, "0");
  const whole = padded.slice(0, padded.length - decimals) || "0";
  const fraction = decimals > 0
    ? padded.slice(-decimals).replace(/0+$/, "")
    : "";
  return fraction ? `${whole}.${fraction}` : whole.toString();
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
  const requestedDecimals = new Map<string, number>();
  (new URL(request.url).searchParams.get("decimals") ?? "")
    .split(",")
    .forEach((value, index) => {
      const address = addresses[index]?.toLowerCase();
      const decimals = Number(value);
      if (address && Number.isInteger(decimals) && decimals >= 0 && decimals <= 255) {
        requestedDecimals.set(address, decimals);
      }
    });

  const bestPairs = new Map<string, DexPair>();
  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${addresses.join(",")}`,
      { next: { revalidate: 30 }, signal: AbortSignal.timeout(8000) },
    );
    if (response.ok) {
      const payload: unknown = await response.json();
      if (isRecord(payload) && Array.isArray(payload.pairs)) {
        for (const value of payload.pairs.filter(isDexPair)) {
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
      const body = await response.text();
      const bodyWithExactSupplies = body.replace(
        /("(?:total_supply|circulating_supply)"\s*:\s*)(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
        '$1"$2"',
      );
      const payload: unknown = JSON.parse(bodyWithExactSupplies);
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
    const tokenDecimals = requestedDecimals.get(address)
      ?? numericValue(fallback?.decimals);
    const values = {
      price: numericValue(pair?.priceUsd) ?? numericValue(fallback?.price_usd),
      change: numericValue(pair?.priceChange?.h24) ?? numericValue(fallback?.price_change_percentage?.h24),
      volume: numericValue(pair?.volume?.h24) ?? numericValue(fallback?.volume_usd?.h24),
      marketCap: numericValue(pair?.marketCap) ?? numericValue(fallback?.market_cap_usd),
      fdv: numericValue(pair?.fdv) ?? numericValue(fallback?.fdv_usd),
      totalSupply: tokenAmountFromRaw(fallback?.total_supply, tokenDecimals),
      circulatingSupply: tokenAmountFromRaw(fallback?.circulating_supply, tokenDecimals),
      pairAddress,
    };
    return [address, Object.values(values).some((value) => value !== null && value !== undefined) ? values : null];
  }));

  return NextResponse.json(marketData, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
  });
}
