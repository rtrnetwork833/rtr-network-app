import { getAddress, isAddress } from "viem";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data, error } = await supabase
    .from("profiles")
    .select("wallet_address")
    .eq("id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Unable to load the wallet address." }, { status: 500 });
  return NextResponse.json({ walletAddress: data?.wallet_address ?? null });
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null) as { walletAddress?: unknown } | null;
  const walletAddress = body?.walletAddress;
  if (typeof walletAddress !== "string" || !isAddress(walletAddress)) {
    return NextResponse.json({ error: "A valid wallet address is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { error } = await supabase
    .from("profiles")
    .update({ wallet_address: getAddress(walletAddress) })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: "Unable to save the wallet address." }, { status: 500 });
  return NextResponse.json({ ok: true });
}