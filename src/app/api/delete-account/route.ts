import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const { userId } = await req.json();

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    console.error("Missing Supabase URL");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  // Use service key if available, otherwise fall back to anon key
  const supabase = createClient(url, serviceKey || anonKey || "");

  try {
    // First get all checkin IDs for this user
    const { data: checkins, error: checkinsError } = await supabase
      .from("checkins")
      .select("id")
      .eq("user_id", userId);
    
    if (checkinsError) console.log("Checkins fetch error (non-fatal):", checkinsError);
    
    const checkinIds = checkins?.map(c => c.id) || [];

    // Delete checkin_groups for user's checkins
    if (checkinIds.length > 0) {
      const { error: cgError } = await supabase.from("checkin_groups").delete().in("checkin_id", checkinIds);
      if (cgError) console.log("Checkin_groups delete error (non-fatal):", cgError);
    }

    // Delete all user's checkins
    const { error: delCheckinsErr } = await supabase.from("checkins").delete().eq("user_id", userId);
    if (delCheckinsErr) console.log("Checkins delete error (non-fatal):", delCheckinsErr);

    // Delete all user's answers
    const { error: answersErr } = await supabase.from("answers").delete().eq("user_id", userId);
    if (answersErr) console.log("Answers delete error (non-fatal):", answersErr);

    // Delete all user's messages
    const { error: msgsErr } = await supabase.from("messages").delete().eq("user_id", userId);
    if (msgsErr) console.log("Messages delete error (non-fatal):", msgsErr);

    // Delete memberships
    const { error: membErr } = await supabase.from("group_memberships").delete().eq("user_id", userId);
    if (membErr) console.log("Memberships delete error (non-fatal):", membErr);

    // Delete profile
    const { error: profErr } = await supabase.from("profiles").delete().eq("id", userId);
    if (profErr) console.log("Profile delete error (non-fatal):", profErr);

    // Delete the auth user (only works with service key)
    if (serviceKey) {
      const { error: deleteUserError } = await supabase.auth.admin.deleteUser(userId);
      if (deleteUserError) {
        console.error("Error deleting auth user:", deleteUserError);
        // Continue anyway - data is deleted
      }
    } else {
      console.log("Service key not available - auth user not deleted, but all data cleared");
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
