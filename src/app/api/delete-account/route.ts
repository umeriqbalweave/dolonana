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
    // First get all checkin IDs for this user
    const { data: checkins } = await supabase
      .from("checkins")
      .select("id")
      .eq("user_id", userId);
    
    const checkinIds = checkins?.map(c => c.id) || [];

    // Delete checkin_groups for user's checkins
    if (checkinIds.length > 0) {
      await supabase.from("checkin_groups").delete().in("checkin_id", checkinIds);
    }

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
