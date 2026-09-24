import { createClient } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";

const invalidResponse = () => NextResponse.json({ error: "The details provided do not match our records." }, { status: 400 });
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export async function POST(request: Request) {
  let body: { email?: unknown; dateOfBirth?: unknown };
  try {
    body = await request.json() as { email?: unknown; dateOfBirth?: unknown };
  } catch {
    return invalidResponse();
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const rawDateOfBirth = typeof body.dateOfBirth === "string" ? body.dateOfBirth.trim() : "";
  
  if (!email || !rawDateOfBirth) return invalidResponse();

  // Explicit, fail-proof translation from DD/MM/YYYY to YYYY-MM-DD
  let databaseDateOfBirth = "";
  const dateParts = rawDateOfBirth.split('/');
  if (dateParts.length === 3) {
    const [day, month, year] = dateParts;
    // padStart ensures days like '5' become '05' and months like '9' become '09'
    databaseDateOfBirth = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  } else {
    // If it doesn't have slashes, check if it's already in YYYY-MM-DD dash format
    const dashParts = rawDateOfBirth.split('-');
    if (dashParts.length === 3) {
      databaseDateOfBirth = rawDateOfBirth;
    } else {
      return invalidResponse();
    }
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Recovery is temporarily unavailable." }, { status: 503 });
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, 
    serviceKey, 
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Queries the "profiles" table with the corrected date format
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .eq("date_of_birth", databaseDateOfBirth)
    .maybeSingle();

  if (profileError || !profile) return invalidResponse();

  const brevoApiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim() || "no-reply@rtrnetwork.com";
  if (!brevoApiKey || !senderEmail) return NextResponse.json({ error: "Recovery email delivery is not configured." }, { status: 503 });

  const recoveryCode = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const { error: updateError } = await supabase.from("profiles").update({ recovery_code: recoveryCode }).eq("id", profile.id);
  if (updateError) return NextResponse.json({ error: "Recovery is temporarily unavailable." }, { status: 503 });

  let emailSent = false;
  try {
    const emailResponse = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: { "api-key": brevoApiKey, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { email: senderEmail, name: process.env.BREVO_SENDER_NAME ?? "RTR Network" },
        to: [{ email }],
        subject: "Your RTR Network recovery code",
        textContent: `Your RTR Network recovery code is ${recoveryCode}. It expires when a new recovery request is made.`,
      }),
    });
    emailSent = emailResponse.ok;
  } catch {
    emailSent = false;
  }
  
  if (!emailSent) {
    await supabase.from("profiles").update({ recovery_code: null }).eq("id", profile.id);
    return NextResponse.json({ error: "Recovery email delivery is temporarily unavailable." }, { status: 503 });
  }

  return NextResponse.json({ message: "Recovery code sent." });
}