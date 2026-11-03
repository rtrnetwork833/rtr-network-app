import { getAddress, isAddress } from "viem";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const walletAddress = searchParams.get("walletAddress");
  if (!walletAddress || !isAddress(walletAddress)) {
    return NextResponse.json({ error: "A valid wallet address is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data, error } = await supabase
    .from("transactions")
    .select("id, wallet_address, type, amount, token_symbol, status, tx_hash, created_at")
    .eq("user_id", user.id)
    .eq("wallet_address", getAddress(walletAddress))
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: "Unable to load transaction history." }, { status: 500 });
  return NextResponse.json({ transactions: data ?? [] });
}
