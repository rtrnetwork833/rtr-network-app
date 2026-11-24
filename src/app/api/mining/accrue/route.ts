import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMiningBalanceSchemaError(code: string) {
  return ["42883", "42P01", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(code);
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) {
    console.error("Failed to authenticate mining accrual request:", authError);
    return NextResponse.json({ error: "Unable to verify your account." }, { status: 401 });
  }
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data, error } = await supabase
    .schema("public")
    .rpc("claim_mining_accrual");

  if (error) {
    console.error("Failed to claim persisted mining accrual:", error);
    const message = isMiningBalanceSchemaError(error.code)
      ? "The profile mining balance columns or accrual RPC are missing. Run supabase/schema.sql and try again."
      : "Unable to save mining accrual.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const claim = Array.isArray(data) ? data[0] : null;
  if (
    !isRecord(claim)
    || (typeof claim.claimed_balance !== "number" && typeof claim.claimed_balance !== "string")
    || typeof claim.accrued_at !== "string"
  ) {
    console.error("Mining accrual function returned an invalid result:", data);
    return NextResponse.json({ error: "Unable to read the saved mining balance." }, { status: 500 });
  }

  const balance = Number(claim.claimed_balance);
  if (!Number.isFinite(balance) || !Number.isFinite(Date.parse(claim.accrued_at))) {
    console.error("Mining accrual function returned invalid balance data:", claim);
    return NextResponse.json({ error: "Unable to read the saved mining balance." }, { status: 500 });
  }

  return NextResponse.json({ balance, accrued_at: claim.accrued_at });
}
