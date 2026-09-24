import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { email, code, newPassword } = await request.json();

    if (!email || !code || !newPassword) {
      return NextResponse.json({ error: "Please fill in all boxes." }, { status: 400 });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!serviceKey || !supabaseUrl) {
      return NextResponse.json({ error: "System configuration error." }, { status: 503 });
    }

    // Initialize Supabase with the administrative Service Key
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const cleanEmail = email.trim().toLowerCase();

    // 1. Find the user profile and check if the recovery code matches exactly
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, recovery_code")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (profileError || !profile || profile.recovery_code !== code.trim()) {
      return NextResponse.json({ error: "The recovery code or email address is incorrect." }, { status: 400 });
    }

    // 2. Fetch the authentication user account safely using listUsers filtering
    const { data: { users }, error: authUserError } = await supabase.auth.admin.listUsers();
    
    if (authUserError) {
      return NextResponse.json({ error: "Database communication failure." }, { status: 500 });
    }

    const targetUser = users.find(u => u.email?.toLowerCase() === cleanEmail);
    if (!targetUser) {
      return NextResponse.json({ error: "User account could not be located." }, { status: 404 });
    }

    // 3. Force update the user's password using their structural account ID
    const { error: updateAuthError } = await supabase.auth.admin.updateUserById(
      targetUser.id,
      { password: newPassword }
    );

    if (updateAuthError) {
      return NextResponse.json({ error: "Could not reset password. Please try again." }, { status: 500 });
    }

    // 4. Wipe out the recovery code from the profiles table so it cannot be used again
    await supabase.from("profiles").update({ recovery_code: null }).eq("id", profile.id);

    return NextResponse.json({ message: "Password updated successfully!" });

  } catch (error) {
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}