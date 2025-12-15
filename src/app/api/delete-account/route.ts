import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const { userId } = await req.json();

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error("Missing Supabase env vars");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const supabase = createClient(url, serviceKey);

  try {
    // Delete checkin_groups (links between checkins and groups)
    await supabase.from("checkin_groups").delete().eq("checkin_id", 
      supabase.from("checkins").select("id").eq("user_id", userId)
    );

    // Delete all user's checkins
    await supabase.from("checkins").delete().eq("user_id", userId);

    // Delete all user's answers
    await supabase.from("answers").delete().eq("user_id", userId);

    // Delete all user's messages
    await supabase.from("messages").delete().eq("user_id", userId);

    // Delete memberships
    await supabase.from("group_memberships").delete().eq("user_id", userId);

    // Delete profile
    await supabase.from("profiles").delete().eq("id", userId);

    // Delete the auth user
    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(userId);
    
    if (deleteUserError) {
      console.error("Error deleting auth user:", deleteUserError);
      // Continue anyway - data is deleted
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting account:", error);
    return NextResponse.json({ 
      error: "Failed to delete account",
      message: error?.message 
    }, { status: 500 });
  }
}
