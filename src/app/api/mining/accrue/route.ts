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
    .rpc("get_user_accrual_balance", {
      user_id_param: user.id
    });

  if (error) {
    console.error("Failed to fetch user accrual balance:", error);
    const message = isMiningBalanceSchemaError(error.code)
      ? "The profile mining balance columns or accrual RPC are missing. Run supabase/schema.sql and try again."
      : "Unable to fetch mining accrual.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (
    !isRecord(result)
    || (typeof result.total_accrued_balance !== "number" && typeof result.total_accrued_balance !== "string")
    || typeof result.last_balance_update !== "string"
  ) {
    console.error("Mining accrual function returned an invalid result:", data);
    return NextResponse.json({ error: "Unable to read the saved mining balance." }, { status: 500 });
  }

  const balance = Number(result.total_accrued_balance);
  if (!Number.isFinite(balance) || !Number.isFinite(Date.parse(result.last_balance_update))) {
    console.error("Mining accrual function returned invalid balance data:", result);
    return NextResponse.json({ error: "Unable to read the saved mining balance." }, { status: 500 });
  }

  return NextResponse.json({ balance, accrued_at: result.last_balance_update });
}
