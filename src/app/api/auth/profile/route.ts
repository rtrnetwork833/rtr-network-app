import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json() as { email?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!email || !serviceKey) return NextResponse.json({ profile: null });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("email", email)
    .maybeSingle();

  return NextResponse.json({
    profile: data?.full_name ? { full_name: data.full_name, avatar_url: data.avatar_url } : null,
  });
}
