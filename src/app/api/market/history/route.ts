import { NextResponse } from "next/server";

const historyAssets = ["ethereum", "coinbase-wrapped-btc", "wrapped-solana", "wbnb", "usd-coin"] as const;
const supportedPeriods = new Set([7, 18, 30, 380]);

type CoinGeckoHistory = { prices?: [number, number][] };

export async function GET(request: Request) {
  const days = Number(new URL(request.url).searchParams.get("days"));
  if (!supportedPeriods.has(days)) {
    return NextResponse.json({ error: "Unsupported history period." }, { status: 400 });
  }

  const priceHistory = await Promise.all(historyAssets.map(async (assetId) => {
    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/coins/${assetId}/market_chart?vs_currency=usd&days=${days}`,
        { next: { revalidate: 1800 }, signal: AbortSignal.timeout(10000) },
      );
      if (!response.ok) return [assetId, []] as const;

      const body = await response.json() as CoinGeckoHistory;
      const points = Array.isArray(body.prices) ? body.prices : [];
      const stride = Math.max(1, Math.ceil(points.length / 120));
      const sampled = points.filter((_, index) => index % stride === 0 || index === points.length - 1)
        .map((point) => point[1])
        .filter((price) => Number.isFinite(price));
      return [assetId, sampled] as const;
    } catch {
      return [assetId, []] as const;
    }
  }));

  return NextResponse.json({ days, prices: Object.fromEntries(priceHistory) }, {
    headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=7200" },
  });
}