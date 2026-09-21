import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ error: "An image upload is required." }, { status: 415 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const file = await request.blob();
  if (!file.size || !file.type.startsWith("image/")) {
    return NextResponse.json({ error: "An image upload is required." }, { status: 415 });
  }

  const path = `${user.id}/avatar.png`;
  const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, {
    contentType: file.type,
    upsert: true,
  });
  if (uploadError) return NextResponse.json({ error: "Unable to save the profile picture." }, { status: 500 });

  const { data: publicUrl } = supabase.storage.from("avatars").getPublicUrl(path);
  const avatarUrl = `${publicUrl.publicUrl}?v=${Date.now()}`;
  const { error: profileError } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", user.id);
  if (profileError) return NextResponse.json({ error: "Avatar saved, but the profile could not be updated." }, { status: 500 });

  return NextResponse.json({ avatarUrl });
}