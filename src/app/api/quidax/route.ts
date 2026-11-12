import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const QUIDAX_API_BASE = "https://openapi.quidax.io/exchange-open-api/api/v1";

type QuidaxResponse = {
  status?: string;
  message?: string;
  data?: unknown;
};

async function quidaxRequest(path: string, init?: RequestInit) {
  const apiKey = process.env.QUIDAX_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      data: { message: "Quidax API credentials are unavailable." } satisfies QuidaxResponse,
    };
  }

  const response = await fetch(`${QUIDAX_API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: apiKey,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  const data = (await response.json().catch(() => null)) as QuidaxResponse | null;
  return {
    ok: response.ok && data?.status !== "error",
    status: response.status,
    data,
  };
}

async function requireUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function GET(request: Request) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const action = new URL(request.url).searchParams.get("action");
  if (action === "banks") {
    const result = await quidaxRequest("/banks");
    if (!result.ok) {
      return NextResponse.json(
        { error: "Unable to load supported banks from Quidax." },
        { status: result.status >= 400 ? result.status : 502 },
      );
    }

    const data = result.data?.data;
    const banks = Array.isArray(data)
      ? data.filter(
          (bank): bank is { code: string; name: string; country: string; currency: string } =>
            typeof bank === "object" &&
            bank !== null &&
            "code" in bank &&
            typeof bank.code === "string" &&
            "name" in bank &&
            typeof bank.name === "string" &&
            "country" in bank &&
            typeof bank.country === "string" &&
            bank.country.toLowerCase() === "nigeria" &&
            "currency" in bank &&
            typeof bank.currency === "string" &&
            bank.currency.toUpperCase() === "NGN",
        )
      : [];

    return NextResponse.json({ banks });
  }

  if (action === "rate") {
    const usdcResult = await quidaxRequest("/markets/tickers/usdcngn");
    const usdcRate = extractTickerPrice(usdcResult.data, "usdcngn");
    if (usdcResult.ok && usdcRate) {
      return NextResponse.json({ market: "usdcngn", rate: usdcRate });
    }

    const usdtResult = await quidaxRequest("/markets/tickers/usdtngn");
    const usdtRate = extractTickerPrice(usdtResult.data, "usdtngn");
    if (usdtResult.ok && usdtRate) {
      return NextResponse.json({ market: "usdtngn", rate: usdtRate });
    }

    return NextResponse.json(
      { error: "Unable to load a live NGN stablecoin rate from Quidax." },
      { status: 502 },
    );
  }

  return NextResponse.json({ error: "Unsupported Quidax query action." }, { status: 400 });
}

function extractTickerPrice(payload: QuidaxResponse | null, market: string) {
  if (!payload || typeof payload.data !== "object" || payload.data === null) return null;
  const marketData = (payload.data as Record<string, unknown>)[market];
  if (typeof marketData !== "object" || marketData === null || !("ticker" in marketData)) return null;
  const ticker = marketData.ticker;
  if (typeof ticker !== "object" || ticker === null || !("last" in ticker)) return null;
  const price = Number(ticker.last);
  return Number.isFinite(price) && price > 0 ? price : null;
}

export async function POST(request: Request) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null || !("action" in body)) {
    return NextResponse.json({ error: "A valid action is required." }, { status: 400 });
  }

  const action = String(body.action);
  if (action === "deposit") {
    return NextResponse.json(
      {
        error:
          "Customer deposits are unavailable: the Quidax NGN wallet belongs to the merchant account and cannot provide customer-specific bank details.",
      },
      { status: 409 },
    );
  }

  if (action === "withdraw") {
    return NextResponse.json(
      {
        error:
          "Customer withdrawals are unavailable: Quidax would debit the shared merchant NGN wallet.",
      },
      { status: 409 },
    );
  }

  if (action !== "verify") {
    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  }

  if (
    !("accountNumber" in body) ||
    typeof body.accountNumber !== "string" ||
    !/^\d{10}$/.test(body.accountNumber) ||
    !("bankCode" in body) ||
    typeof body.bankCode !== "string" ||
    !/^\d{3,8}$/.test(body.bankCode)
  ) {
    return NextResponse.json(
      { error: "A valid Nigerian account number and bank code are required." },
      { status: 400 },
    );
  }

  const result = await quidaxRequest("/banks/verify_account", {
    method: "POST",
    body: JSON.stringify({
      fund_uid: body.accountNumber,
      fund_uid2: body.bankCode,
      currency: "ngn",
    }),
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: "Quidax could not verify this Nigerian bank account." },
      { status: result.status >= 400 ? result.status : 502 },
    );
  }

  const data = result.data?.data;
  const accountName =
    typeof data === "object" && data !== null && "account_name" in data && typeof data.account_name === "string"
      ? data.account_name
      : null;
  if (!accountName) {
    return NextResponse.json(
      { error: "Quidax did not return a verified account name." },
      { status: 502 },
    );
  }
  return NextResponse.json({ accountName });
}
