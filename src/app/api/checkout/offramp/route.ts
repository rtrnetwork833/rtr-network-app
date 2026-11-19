import { getAddress, isAddress } from "viem";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface MeldWidgetResponse {
  widgetUrl?: unknown;
}

function getMeldApiUrl() {
  const configuredUrl = process.env.MELD_API_BASE_URL?.trim() || "https://api.meld.io";
  const apiUrl = new URL(configuredUrl);
  if (
    apiUrl.protocol !== "https:" ||
    !["api.meld.io", "api-sb.meld.io"].includes(apiUrl.hostname) ||
    apiUrl.pathname !== "/" ||
    apiUrl.search ||
    apiUrl.hash
  ) {
    throw new Error("MELD_API_BASE_URL must be the official Meld production or sandbox API URL.");
  }
  return apiUrl;
}

function isAllowedCheckoutHost(hostname: string) {
  const allowedHosts = new Set(["meldcrypto.com", "sb.meldcrypto.com"]);
  const configuredHost = process.env.MELD_CHECKOUT_HOST?.trim().toLowerCase();
  if (configuredHost) allowedHosts.add(configuredHost);
  return allowedHosts.has(hostname.toLowerCase());
}

export async function POST(request: Request) {
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  let supabase;
  let user;
  try {
    supabase = await createClient();
    const authResult = await supabase.auth.getUser();
    if (authResult.error) throw authResult.error;
    user = authResult.data.user;
  } catch (error) {
    console.error("Unable to authenticate Meld off-ramp request:", error);
    return NextResponse.json({ error: "Unable to verify your session." }, { status: 500 });
  }
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const secretKey = process.env.MELD_SECRET_KEY?.trim();
  const publicKey = process.env.MELD_PUBLIC_KEY?.trim();
  if (!secretKey || !publicKey) {
    return NextResponse.json(
      { error: "Meld checkout is not configured. Please contact support." },
      { status: 503 },
    );
  }

  let apiUrl: URL;
  try {
    apiUrl = getMeldApiUrl();
  } catch (error) {
    console.error("Invalid Meld API configuration:", error);
    return NextResponse.json(
      { error: "Meld checkout is not configured correctly." },
      { status: 500 },
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("wallet_address")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    console.error("Unable to load profile wallet for Meld checkout:", profileError);
    return NextResponse.json({ error: "Unable to load your profile wallet." }, { status: 500 });
  }
  if (!profile?.wallet_address || !isAddress(profile.wallet_address)) {
    return NextResponse.json(
      { error: "A valid profile wallet is required for fiat withdrawal." },
      { status: 400 },
    );
  }

  let providerResponse: Response;
  try {
    providerResponse = await fetch(new URL("/crypto/session/widget/url", apiUrl), {
      method: "POST",
      headers: {
        Authorization: `BASIC ${secretKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "Meld-Version": "2026-02-03",
      },
      body: JSON.stringify({
        publicKey,
        sessionType: "SELL",
        prefill: {
          walletAddress: getAddress(profile.wallet_address),
        },
        locked: ["walletAddress"],
        externalCustomerId: user.id,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    console.error("Meld checkout URL request failed:", error);
    return NextResponse.json(
      { error: "Unable to connect to the withdrawal provider. Please try again." },
      { status: 502 },
    );
  }

  if (!providerResponse.ok) {
    console.error("Meld checkout URL request was rejected:", providerResponse.status);
    return NextResponse.json(
      { error: "The withdrawal provider could not create a checkout session." },
      { status: 502 },
    );
  }

  let providerPayload: MeldWidgetResponse;
  try {
    providerPayload = await providerResponse.json() as MeldWidgetResponse;
  } catch (error) {
    console.error("Meld returned an invalid checkout response:", error);
    return NextResponse.json(
      { error: "The withdrawal provider returned an invalid session." },
      { status: 502 },
    );
  }

  if (typeof providerPayload.widgetUrl !== "string") {
    console.error("Meld checkout response did not contain a widget URL.");
    return NextResponse.json(
      { error: "The withdrawal provider returned an invalid session." },
      { status: 502 },
    );
  }

  let widgetUrl: URL;
  try {
    widgetUrl = new URL(providerPayload.widgetUrl);
  } catch (error) {
    console.error("Meld returned an invalid checkout URL:", error);
    return NextResponse.json(
      { error: "The withdrawal provider returned an invalid session URL." },
      { status: 502 },
    );
  }
  if (widgetUrl.protocol !== "https:" || !isAllowedCheckoutHost(widgetUrl.hostname)) {
    console.error("Meld returned a checkout URL with an unsupported origin.");
    return NextResponse.json(
      { error: "The withdrawal provider returned an invalid session URL." },
      { status: 502 },
    );
  }

  return NextResponse.json({ sessionUrl: widgetUrl.toString() }, {
    headers: { "Cache-Control": "no-store" },
  });
}
