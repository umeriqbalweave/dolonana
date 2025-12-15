import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const { userId } = await req.json();

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log("Delete account - URL exists:", !!url);
  console.log("Delete account - Service key exists:", !!serviceKey);
  console.log("Delete account - User ID:", userId);

  if (!url || !serviceKey) {
    console.error("Missing required env vars - URL:", !!url, "ServiceKey:", !!serviceKey);
    return NextResponse.json({ 
      error: "Server configuration error - missing service key",
      hasUrl: !!url,
      hasServiceKey: !!serviceKey
    }, { status: 500 });
  }

  // Create admin client with service role key
  const supabase = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const results: Record<string, string> = {};

  try {
    // First get all checkin IDs for this user
    const { data: checkins, error: checkinsError } = await supabase
      .from("checkins")
      .select("id")
      .eq("user_id", userId);
    
    results.checkinsFetch = checkinsError ? `error: ${checkinsError.message}` : `found ${checkins?.length || 0}`;
    
    const checkinIds = checkins?.map(c => c.id) || [];

    // Delete checkin_groups for user's checkins
    if (checkinIds.length > 0) {
      const { error: cgError } = await supabase.from("checkin_groups").delete().in("checkin_id", checkinIds);
      results.checkinGroups = cgError ? `error: ${cgError.message}` : "deleted";
    }

    // Delete all user's checkins
    const { error: delCheckinsErr } = await supabase.from("checkins").delete().eq("user_id", userId);
    results.checkins = delCheckinsErr ? `error: ${delCheckinsErr.message}` : "deleted";

    // Delete all user's answers
    const { error: answersErr } = await supabase.from("answers").delete().eq("user_id", userId);
    results.answers = answersErr ? `error: ${answersErr.message}` : "deleted";

    // Delete all user's messages
    const { error: msgsErr } = await supabase.from("messages").delete().eq("user_id", userId);
    results.messages = msgsErr ? `error: ${msgsErr.message}` : "deleted";

    // Delete memberships
    const { error: membErr } = await supabase.from("group_memberships").delete().eq("user_id", userId);
    results.memberships = membErr ? `error: ${membErr.message}` : "deleted";

    // Delete groups owned by user (this may cascade to related data)
    const { error: groupsErr } = await supabase.from("groups").delete().eq("owner_id", userId);
    results.ownedGroups = groupsErr ? `error: ${groupsErr.message}` : "deleted";

    // Delete profile
    const { error: profErr } = await supabase.from("profiles").delete().eq("id", userId);
    results.profile = profErr ? `error: ${profErr.message}` : "deleted";

    // Delete the auth user using admin API
    try {
      const { error: deleteUserError } = await supabase.auth.admin.deleteUser(userId);
      if (deleteUserError) {
        console.error("Auth delete error details:", JSON.stringify(deleteUserError));
        results.authUser = `error: ${deleteUserError.message} (${deleteUserError.status || 'no status'})`;
      } else {
        results.authUser = "deleted";
      }
    } catch (authError: any) {
      console.error("Auth delete exception:", authError);
      results.authUser = `exception: ${authError?.message || 'unknown'}`;
    }

    console.log("Delete account results:", results);

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error("Error deleting account:", error);
    return NextResponse.json({ 
      error: "Failed to delete account",
      message: error?.message,
      results
    }, { status: 500 });
  }
}
