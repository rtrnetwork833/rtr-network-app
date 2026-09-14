import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ error: "An image upload is required." }, { status: 415 });
  }

  // Production integration point: authenticate the session and store this
  // object in private profile storage, never in client-managed balance state.
  return NextResponse.json({ ok: true, status: "avatar_upload_received" });
}