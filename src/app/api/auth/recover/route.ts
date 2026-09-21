import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const invalidResponse = () => NextResponse.json({ error: "Invalid credentials provided." }, { status: 400 });

export async function POST(request: Request) {
  const body = await request.json() as { email?: unknown; dateOfBirth?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const dateOfBirth = typeof body.dateOfBirth === "string" ? body.dateOfBirth : "";
  if (!email || !dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return invalidResponse();

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Recovery is temporarily unavailable." }, { status: 503 });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: profile, error: profileError } = await supabase.from("profiles").select("date_of_birth").eq("email", email).maybeSingle();
  if (profileError || !profile || profile.date_of_birth !== dateOfBirth) return invalidResponse();

  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: new URL("/", request.url).toString() });
  if (error) {
    const smtpMessage = /smtp|email|mail/i.test(error.message)
      ? "Recovery email delivery is not configured. Enable SMTP or email provider delivery in the Supabase dashboard."
      : "Recovery is temporarily unavailable. Please try again later.";
    return NextResponse.json({ error: smtpMessage }, { status: 503 });
  }
  return NextResponse.json({ message: "Recovery instructions sent." });
}