import { NextResponse } from "next/server";
import { cycleSecondsForTier } from "@/lib/mining";
import { createClient } from "@/lib/supabase/server";

function isMissingActivationTable(error: { code?: string; message?: string }) {
  return error.code === "42P01" || error.code === "PGRST205" || error.message?.includes("booster_activations") === true;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (!body.tier || typeof body.tier !== "string" || cycleSecondsForTier(body.tier) === null) {
    return NextResponse.json({ error: "A valid tier is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const activatedAt = new Date();
  const expiresAt = new Date(activatedAt.getTime() + cycleSecondsForTier(body.tier)! * 1000);
  const { data, error } = await supabase
    .from("booster_activations")
    .upsert({ user_id: user.id, tier: body.tier, activated_at: activatedAt.toISOString(), expires_at: expiresAt.toISOString() }, { onConflict: "user_id,tier" })
    .select("tier, activated_at, expires_at")
    .single();

  if (error) {
    if (isMissingActivationTable(error)) return NextResponse.json({ activation: null, standard: true });
    return NextResponse.json({ error: "Unable to save the node activation." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, activation: data });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data, error } = await supabase
    .from("booster_activations")
    .select("tier, activated_at, expires_at")
    .eq("user_id", user.id)
    .order("activated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingActivationTable(error)) return NextResponse.json({ activation: null, standard: true });
    return NextResponse.json({ error: "Unable to load the node activation." }, { status: 500 });
  }
  return NextResponse.json({ activation: data });
}