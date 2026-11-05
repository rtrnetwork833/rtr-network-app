import { getAddress, isAddress } from "viem";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const chainId = 8453;
const apiBase = `https://api.1inch.dev/swap/v6.1/${chainId}`;
const amountPattern = /^[1-9]\d{0,77}$/;
const hexDataPattern = /^0x[0-9a-fA-F]+$/;

type UpstreamError = { error?: string; description?: string; detail?: string };

function getApiKey() {
  const apiKey = process.env.ONEINCH_API_KEY;
  if (!apiKey) {
    return {
      error: NextResponse.json(
        { error: "The 1inch API is not configured. Set ONEINCH_API_KEY on the server." },
        { status: 503 },
      ),
    };
  }
  return { apiKey };
}

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function fetchOneInch(url: URL, apiKey: string) {
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const errorBody = body && typeof body === "object" ? body as UpstreamError : {};
      const detail = errorBody.description ?? errorBody.error ?? errorBody.detail;
      const message = typeof detail === "string" && detail.length < 240
        ? detail
        : "1inch could not provide a route for this token pair and amount.";
      return { error: NextResponse.json({ error: message }, { status: response.status === 429 ? 503 : 502 }) };
    }
    return { body };
  } catch (error) {
    console.error("1inch API request failed:", error);
    return {
      error: NextResponse.json(
        { error: "The 1inch service timed out or is temporarily unavailable." },
        { status: 502 },
      ),
    };
  }
}

function readAddress(value: string | null) {
  if (!value || !isAddress(value, { strict: false })) return null;
  try {
    return getAddress(value.toLowerCase());
  } catch {
    return null;
  }
}

function validateSwapParams(params: URLSearchParams) {
  const src = readAddress(params.get("src"));
  const dst = readAddress(params.get("dst"));
  const amount = params.get("amount");
  if (!src || !dst || src.toLowerCase() === dst.toLowerCase()) {
    return { error: NextResponse.json({ error: "Select two different supported token addresses." }, { status: 400 }) };
  }
  if (!amount || !amountPattern.test(amount)) {
    return { error: NextResponse.json({ error: "Enter a valid positive token amount." }, { status: 400 }) };
  }
  return { src, dst, amount };
}

function readTransaction(body: unknown) {
  if (!body || typeof body !== "object") return null;
  const tx = (body as { tx?: unknown }).tx ?? body;
  if (!tx || typeof tx !== "object") return null;
  const transaction = tx as { to?: unknown; data?: unknown; value?: unknown; gas?: unknown };
  const to = typeof transaction.to === "string" ? readAddress(transaction.to) : null;
  const data = transaction.data;
  const value = transaction.value;
  const gas = typeof transaction.gas === "number" || typeof transaction.gas === "string"
    ? String(transaction.gas)
    : undefined;
  if (
    !to ||
    typeof data !== "string" ||
    !hexDataPattern.test(data) ||
    typeof value !== "string" ||
    !/^\d+$/.test(value) ||
    (gas !== undefined && !/^\d+$/.test(gas))
  ) {
    return null;
  }
  return { to, data, value, ...(gas !== undefined ? { gas } : {}) };
}

export async function GET(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { apiKey, error: keyError } = getApiKey();
  if (keyError) return keyError;

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const url = new URL(`${apiBase}/${action === "tokens" ? "tokens" : "quote"}`);

  if (action === "tokens") {
    const result = await fetchOneInch(url, apiKey);
    if (result.error) return result.error;
    const body = result.body as { tokens?: Record<string, unknown> } | null;
    const upstreamTokens = body?.tokens;
    if (!upstreamTokens || typeof upstreamTokens !== "object") {
      return NextResponse.json({ error: "1inch returned an invalid token list." }, { status: 502 });
    }

    const tokens = Object.entries(upstreamTokens).flatMap(([address, rawToken]) => {
      if (!rawToken || typeof rawToken !== "object") return [];
      const token = rawToken as {
        symbol?: unknown;
        name?: unknown;
        decimals?: unknown;
        logoURI?: unknown;
      };
      const normalizedAddress = readAddress(address);
      if (
        !normalizedAddress ||
        typeof token.symbol !== "string" ||
        typeof token.name !== "string" ||
        typeof token.decimals !== "number" ||
        !Number.isInteger(token.decimals) ||
        token.decimals < 0 ||
        token.decimals > 36
      ) {
        return [];
      }

      let logoURI: string | undefined;
      if (typeof token.logoURI === "string") {
        try {
          const logoUrl = new URL(token.logoURI);
          if (logoUrl.protocol === "https:") logoURI = logoUrl.toString();
        } catch {
          logoURI = undefined;
        }
      }

      return [{
        address: normalizedAddress,
        symbol: token.symbol.slice(0, 32),
        name: token.name.slice(0, 80),
        decimals: token.decimals,
        ...(logoURI ? { logoURI } : {}),
        ...(normalizedAddress.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
          ? { isNative: true }
          : {}),
      }];
    });

    const rtrAddress = readAddress(process.env.NEXT_PUBLIC_RTR_TOKEN_ADDRESS ?? null);
    if (rtrAddress && !tokens.some((token) => token.address.toLowerCase() === rtrAddress.toLowerCase())) {
      tokens.push({ address: rtrAddress, symbol: "RTR", name: "RTR Network", decimals: 18 });
    }

    return NextResponse.json({ tokens }, { headers: { "Cache-Control": "private, max-age=300" } });
  }

  if (action !== "quote") {
    return NextResponse.json({ error: "Choose a supported swap action." }, { status: 400 });
  }

  const validated = validateSwapParams(searchParams);
  if ("error" in validated) return validated.error;
  url.searchParams.set("src", validated.src);
  url.searchParams.set("dst", validated.dst);
  url.searchParams.set("amount", validated.amount);

  const result = await fetchOneInch(url, apiKey);
  if (result.error) return result.error;
  const quote = result.body as { dstAmount?: unknown; gas?: unknown } | null;
  const gas = typeof quote?.gas === "number" || typeof quote?.gas === "string"
    ? String(quote.gas)
    : "";
  if (
    typeof quote?.dstAmount !== "string" ||
    !/^\d+$/.test(quote.dstAmount) ||
    !/^\d+$/.test(gas)
  ) {
    return NextResponse.json({ error: "1inch returned an invalid swap quote." }, { status: 502 });
  }

  return NextResponse.json({ dstAmount: quote.dstAmount, gas }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { apiKey, error: keyError } = getApiKey();
  if (keyError) return keyError;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid swap request is required." }, { status: 400 });
  }
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "A valid swap request is required." }, { status: 400 });
  }

  const body = payload as Record<string, unknown>;
  const params = new URLSearchParams({
    src: typeof body.src === "string" ? body.src : "",
    dst: typeof body.dst === "string" ? body.dst : "",
    amount: typeof body.amount === "string" ? body.amount : "",
  });
  const validated = validateSwapParams(params);
  if ("error" in validated) return validated.error;

  const wallet = readAddress(typeof body.from === "string" ? body.from : null);
  if (!wallet) return NextResponse.json({ error: "A valid wallet address is required." }, { status: 400 });
  const slippage = body.slippage;
  if (typeof slippage !== "number" || !Number.isFinite(slippage) || slippage < 0.1 || slippage > 50) {
    return NextResponse.json({ error: "Slippage must be between 0.1% and 50%." }, { status: 400 });
  }

  const action = body.action === "swap" ? "swap" : "prepare";
  if (action === "prepare" && validated.src.toLowerCase() !== "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
    const allowanceUrl = new URL(`${apiBase}/approve/allowance`);
    allowanceUrl.searchParams.set("tokenAddress", validated.src);
    allowanceUrl.searchParams.set("walletAddress", wallet);
    const allowanceResult = await fetchOneInch(allowanceUrl, apiKey);
    if (allowanceResult.error) return allowanceResult.error;
    const allowanceBody = allowanceResult.body as { allowance?: unknown } | null;
    const allowance = allowanceBody?.allowance;
    if (typeof allowance !== "string" || !/^\d+$/.test(allowance)) {
      return NextResponse.json({ error: "1inch returned invalid token allowance data." }, { status: 502 });
    }

    if (BigInt(allowance) < BigInt(validated.amount)) {
      const approvalUrl = new URL(`${apiBase}/approve/transaction`);
      approvalUrl.searchParams.set("tokenAddress", validated.src);
      approvalUrl.searchParams.set("amount", validated.amount);
      const approvalResult = await fetchOneInch(approvalUrl, apiKey);
      if (approvalResult.error) return approvalResult.error;
      const approvalTransaction = readTransaction(approvalResult.body);
      if (!approvalTransaction) {
        return NextResponse.json({ error: "1inch returned invalid token approval data." }, { status: 502 });
      }
      return NextResponse.json({ approvalRequired: true, tx: approvalTransaction }, {
        headers: { "Cache-Control": "no-store" },
      });
    }
  }

  const url = new URL(`${apiBase}/swap`);
  url.searchParams.set("src", validated.src);
  url.searchParams.set("dst", validated.dst);
  url.searchParams.set("amount", validated.amount);
  url.searchParams.set("from", wallet);
  url.searchParams.set("slippage", String(slippage));
  const result = await fetchOneInch(url, apiKey);
  if (result.error) return result.error;
  const transaction = readTransaction(result.body);
  if (!transaction) {
    return NextResponse.json({ error: "1inch returned invalid transaction data." }, { status: 502 });
  }

  return NextResponse.json({
    approvalRequired: false,
    tx: transaction,
  }, { headers: { "Cache-Control": "no-store" } });
}
