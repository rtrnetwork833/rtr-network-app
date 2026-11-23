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

  try {
    const response = await fetch(
      `https://api.dexscreener.com/tokens/v1/base/${addresses.join(",")}`,
      { next: { revalidate: 30 }, signal: AbortSignal.timeout(8000) },
    );
    if (!response.ok) {
      return NextResponse.json({ error: "Live token data is temporarily unavailable." }, { status: 502 });
    }

    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) {
      return NextResponse.json({ error: "The market data provider returned an invalid response." }, { status: 502 });
    }

    const bestPairs = new Map<string, DexPair>();
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

    const marketData = Object.fromEntries([...requestedAddresses.keys()].map((address) => {
      const pair = bestPairs.get(address);
      return [address, pair ? {
        price: numericValue(pair.priceUsd),
        change: numericValue(pair.priceChange?.h24),
        volume: numericValue(pair.volume?.h24),
        marketCap: numericValue(pair.marketCap),
        fdv: numericValue(pair.fdv),
        pairAddress: pair.pairAddress,
      } : null];
    }));

    return NextResponse.json(marketData, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
    });
  } catch {
    return NextResponse.json({ error: "Live token data is temporarily unavailable." }, { status: 502 });
  }
}
