import { NextResponse } from "next/server";

const addressPattern = /^0x[a-fA-F0-9]{40}$/;
const timeframeOptions = {
  "1h": { timeframe: "minute", aggregate: 5, limit: 12 },
  "24h": { timeframe: "hour", aggregate: 1, limit: 24 },
  "7d": { timeframe: "hour", aggregate: 1, limit: 168 },
  "30d": { timeframe: "hour", aggregate: 6, limit: 120 },
  "1y": { timeframe: "day", aggregate: 1, limit: 365 },
} as const;

type Timeframe = keyof typeof timeframeOptions;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function GET(request: Request) {
  const parameters = new URL(request.url).searchParams;
  const pairAddress = parameters.get("pair");
  const timeframe = parameters.get("timeframe") as Timeframe | null;
  const options = timeframe ? timeframeOptions[timeframe] : undefined;

  if (!pairAddress || !addressPattern.test(pairAddress) || !options) {
    return NextResponse.json({ error: "A valid pair address and timeframe are required." }, { status: 400 });
  }

  const url = new URL(
    `https://api.geckoterminal.com/api/v2/networks/base/pools/${pairAddress}/ohlcv/${options.timeframe}`,
  );
  url.searchParams.set("aggregate", String(options.aggregate));
  url.searchParams.set("limit", String(options.limit));
  url.searchParams.set("currency", "usd");
  url.searchParams.set("token", "base");

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json;version=20230302" },
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return NextResponse.json({ error: "Price history is temporarily unavailable." }, { status: 502 });
    }

    const payload: unknown = await response.json();
    const attributes = isRecord(payload) && isRecord(payload.data) && isRecord(payload.data.attributes)
      ? payload.data.attributes
      : null;
    const ohlcv = attributes?.ohlcv_list;
    if (!Array.isArray(ohlcv)) {
      return NextResponse.json({ error: "The chart provider returned an invalid response." }, { status: 502 });
    }

    const points = ohlcv.flatMap((entry) => {
      if (!Array.isArray(entry) || entry.length < 5) return [];
      const timestamp = typeof entry[0] === "number" ? entry[0] : Number(entry[0]);
      const close = typeof entry[4] === "number" ? entry[4] : Number(entry[4]);
      return Number.isFinite(timestamp) && Number.isFinite(close) ? [{ timestamp, price: close }] : [];
    }).reverse();

    return NextResponse.json({ points }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch {
    return NextResponse.json({ error: "Price history is temporarily unavailable." }, { status: 502 });
  }
}
