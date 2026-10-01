import { NextResponse } from "next/server";

const marketWatchlist = [
  { id: "rtr-network", symbol: "RTR", name: "RTR Network" },
  { id: "ethereum", symbol: "ETH", name: "Ethereum" },
  { id: "coinbase-wrapped-btc", symbol: "cbBTC", name: "Coinbase Wrapped Bitcoin" },
  { id: "wrapped-solana", symbol: "wSOL", name: "Wrapped Solana" },
  { id: "wbnb", symbol: "wBNB", name: "Wrapped BNB" },
  { id: "usd-coin", symbol: "USDC", name: "Bridged USDC" },
] as const;

type CoinGeckoAsset = {
  id?: string;
  current_price?: number;
  price_change_percentage_24h?: number;
  total_volume?: number;
  sparkline_in_7d?: { price?: number[] };
};

export const revalidate = 30;

export async function GET() {
  const ids = marketWatchlist.map((asset) => asset.id).join(",");

  try {
    const upstream = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&sparkline=true&price_change_percentage=24h`,
      { next: { revalidate: 30 }, signal: AbortSignal.timeout(8000) },
    );
    if (!upstream.ok) {
      return NextResponse.json({ error: "Market data is temporarily unavailable." }, { status: 502 });
    }

    const assets = await upstream.json() as CoinGeckoAsset[];
    if (!Array.isArray(assets)) throw new Error("Unexpected market response.");
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    const market = marketWatchlist.map((item) => {
      const asset = byId.get(item.id);
      return {
        id: item.id,
        symbol: item.symbol,
        name: item.name,
        price: typeof asset?.current_price === "number" ? asset.current_price : null,
        change: typeof asset?.price_change_percentage_24h === "number" ? asset.price_change_percentage_24h : null,
        volume: typeof asset?.total_volume === "number" ? asset.total_volume : null,
        sparkline: asset?.sparkline_in_7d?.price ?? [],
      };
    });

    return NextResponse.json(market, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
    });
  } catch {
    return NextResponse.json({ error: "Market data is temporarily unavailable." }, { status: 502 });
  }
}