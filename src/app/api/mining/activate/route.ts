import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { cycleSecondsForTier } from "@/lib/mining";
import { createClient } from "@/lib/supabase/server";

function getActivationSchemaError(error: { code?: string }) {
  if (error.code === "42P01" || error.code === "PGRST205") {
    return "The public.booster_activations table is missing. Run supabase/schema.sql and try again.";
  }
  if (error.code === "42703" || error.code === "PGRST204") {
    return "The public.booster_activations table must contain id, user_id, tier, activated_at, and expires_at. Run supabase/schema.sql and try again.";
  }
  if (error.code === "PGRST106") {
    return "The public schema is not exposed by Supabase. Enable it in the API settings and try again.";
  }
  return null;
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
    .schema("public")
    .from("booster_activations")
    .insert({ id: randomUUID(), user_id: user.id, tier: body.tier, activated_at: activatedAt.toISOString(), expires_at: expiresAt.toISOString() })
    .select("id, tier, activated_at, expires_at")
    .single();

  if (error) {
    console.error("Failed to insert public.booster_activations row:", error);
    const schemaError = getActivationSchemaError(error);
    if (schemaError) return NextResponse.json({ error: schemaError }, { status: 500 });
    if (error.code === "23505") {
      return NextResponse.json({ error: "A database uniqueness rule is preventing this plan from stacking. Run the latest supabase/schema.sql." }, { status: 500 });
    }
    return NextResponse.json({ error: "Unable to save the node activation." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, activation: data });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { data, error } = await supabase
    .schema("public")
    .from("booster_activations")
    .select("id, tier, activated_at, expires_at")
    .eq("user_id", user.id)
    .gt("expires_at", new Date().toISOString())
    .order("activated_at", { ascending: false });

  if (error) {
    console.error("Failed to query public.booster_activations:", error);
    const schemaError = getActivationSchemaError(error);
    if (schemaError) return NextResponse.json({ error: schemaError }, { status: 500 });
    return NextResponse.json({ error: "Unable to load active mining nodes." }, { status: 500 });
  }
  return NextResponse.json({ activations: data ?? [] });
}