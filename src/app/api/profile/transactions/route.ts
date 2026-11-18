import { getAddress, isAddress } from "viem";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type TransactionType = "deposit" | "swap" | "withdrawal";
type TransactionStatus = "pending" | "completed";
type TransactionPlatform = "Meld" | "Native";

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return { supabase, user };
}

export async function GET() {
  let supabase;
  let user;
  try {
    ({ supabase, user } = await getAuthenticatedUser());
  } catch (error) {
    console.error("Unable to authenticate transaction history request:", error);
    return NextResponse.json({ error: "Unable to verify your session." }, { status: 500 });
  }
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data, error } = await supabase
    .from("transactions")
    .select("user_id, wallet_address, transaction_type, status, platform")
    .eq("user_id", user.id);

  if (error) {
    console.error("Unable to load transaction history:", error);
    return NextResponse.json({ error: "Unable to load transaction history." }, { status: 500 });
  }
  return NextResponse.json({ transactions: data ?? [] });
}

export async function POST(request: Request) {
  let supabase;
  let user;
  try {
    ({ supabase, user } = await getAuthenticatedUser());
  } catch (error) {
    console.error("Unable to authenticate transaction logging request:", error);
    return NextResponse.json({ error: "Unable to verify your session." }, { status: 500 });
  }
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "A valid transaction payload is required." }, { status: 400 });
  }

  const { transactionType, status, platform } = body as Record<string, unknown>;
  if (
    !["deposit", "swap", "withdrawal"].includes(String(transactionType)) ||
    !["pending", "completed"].includes(String(status)) ||
    !["Meld", "Native"].includes(String(platform))
  ) {
    return NextResponse.json({ error: "The transaction details are invalid." }, { status: 400 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("wallet_address")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) {
    console.error("Unable to load profile wallet for transaction:", profileError);
    return NextResponse.json({ error: "Unable to load your profile wallet." }, { status: 500 });
  }
  if (!profile?.wallet_address || !isAddress(profile.wallet_address)) {
    return NextResponse.json({ error: "A valid profile wallet is required to log transactions." }, { status: 400 });
  }

  const { error } = await supabase
    .from("transactions")
    .insert({
      user_id: user.id,
      wallet_address: getAddress(profile.wallet_address),
      transaction_type: transactionType as TransactionType,
      status: status as TransactionStatus,
      platform: platform as TransactionPlatform,
    });

  if (error) {
    console.error("Unable to create profile transaction:", error);
    return NextResponse.json({ error: "Unable to record this transaction." }, { status: 500 });
  }
  return NextResponse.json({ logged: true }, { status: 201 });
}
