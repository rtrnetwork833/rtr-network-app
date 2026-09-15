import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (!body.tier || typeof body.tier !== "string") {
    return NextResponse.json({ error: "A valid tier is required." }, { status: 400 });
  }

  // Production integration point: authenticate the session, validate payment,
  // and persist the tier's server timestamp and 24-hour free-node reset here.
  return NextResponse.json({ ok: true, status: "activation_pending", tier: body.tier });
}