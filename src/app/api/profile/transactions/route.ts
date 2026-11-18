import { getAddress, isAddress } from "viem";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data, error } = await supabase
    .from("transactions")
    .select("id, wallet_address, type, amount, token_symbol, status, tx_hash, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: "Unable to load transaction history." }, { status: 500 });
  return NextResponse.json({ transactions: data ?? [] });
}

export async function POST(request: Request) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "A valid transaction payload is required." }, { status: 400 });
  }
  const { type, status, platform, amount, tokenSymbol } = body as Record<string, unknown>;
  if (
    !["deposit", "withdrawal", "swap"].includes(String(type)) ||
    !["pending", "completed"].includes(String(status)) ||
    !["Meld", "Native"].includes(String(platform)) ||
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    typeof tokenSymbol !== "string" ||
    !tokenSymbol.trim() ||
    tokenSymbol.length > 32
  ) {
    return NextResponse.json({ error: "The transaction details are invalid." }, { status: 400 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("wallet_address")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    return NextResponse.json({ error: "Unable to load your profile wallet." }, { status: 500 });
  }
  if (!profile?.wallet_address || !isAddress(profile.wallet_address)) {
    return NextResponse.json({ error: "A valid profile wallet is required to log transactions." }, { status: 400 });
  }

  const { data: transaction, error } = await supabase
    .from("transactions")
    .insert({
      user_id: user.id,
      wallet_address: getAddress(profile.wallet_address),
      type,
      amount,
      token_symbol: tokenSymbol.trim(),
      status,
      platform,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Unable to create profile transaction:", error);
    return NextResponse.json({ error: "Unable to record this transaction." }, { status: 500 });
  }
  return NextResponse.json({ transaction }, { status: 201 });
}

export async function PATCH(request: Request) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "A valid transaction update is required." }, { status: 400 });
  }
  const { transactionId, status, txHash } = body as Record<string, unknown>;
  if (
    typeof transactionId !== "string" ||
    !transactionId.trim() ||
    !["pending", "completed", "failed"].includes(String(status)) ||
    (txHash !== undefined && (typeof txHash !== "string" || txHash.length > 100))
  ) {
    return NextResponse.json({ error: "The transaction update is invalid." }, { status: 400 });
  }

  const updates: { status: string; tx_hash?: string | null } = { status: String(status) };
  if (txHash !== undefined) updates.tx_hash = txHash || null;

  const { data, error } = await supabase
    .from("transactions")
    .update(updates)
    .eq("id", transactionId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Unable to update profile transaction:", error);
    return NextResponse.json({ error: "Unable to update transaction history." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
  return NextResponse.json({ transaction: data });
}
