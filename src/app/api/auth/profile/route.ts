import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { normalizeDateOfBirth } from "@/lib/date";

export async function POST(request: Request) {
  const body = await request.json() as { email?: unknown; dateOfBirth?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!email || !serviceKey) return NextResponse.json({ profile: null });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data } = await supabase
    .from("profiles")
    .select("full_name, avatar_url, date_of_birth")
    .eq("email", email)
    .maybeSingle();

  if (typeof body.dateOfBirth === "string") {
    const dateOfBirth = normalizeDateOfBirth(body.dateOfBirth);
    return NextResponse.json({ matches: Boolean(dateOfBirth && data && data.date_of_birth === dateOfBirth) });
  }

  return NextResponse.json({
    profile: data?.full_name ? { full_name: data.full_name, avatar_url: data.avatar_url } : null,
  });
}
