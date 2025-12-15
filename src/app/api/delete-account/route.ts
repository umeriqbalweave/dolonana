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
    // 1. Get all groups owned by this user
    const { data: ownedGroups } = await supabase
      .from("groups")
      .select("id")
      .eq("owner_id", userId);
    const ownedGroupIds = ownedGroups?.map(g => g.id) || [];
    results.ownedGroupsFound = `${ownedGroupIds.length}`;

    // 2. Delete all messages in owned groups (FK: messages -> groups)
    if (ownedGroupIds.length > 0) {
      const { error } = await supabase.from("messages").delete().in("group_id", ownedGroupIds);
      results.messagesInOwnedGroups = error ? `error: ${error.message}` : "deleted";
    }

    // 3. Delete all checkin_groups for owned groups
    if (ownedGroupIds.length > 0) {
      const { error } = await supabase.from("checkin_groups").delete().in("group_id", ownedGroupIds);
      results.checkinGroupsInOwned = error ? `error: ${error.message}` : "deleted";
    }

    // 4. Delete all memberships for owned groups
    if (ownedGroupIds.length > 0) {
      const { error } = await supabase.from("group_memberships").delete().in("group_id", ownedGroupIds);
      results.membershipsInOwned = error ? `error: ${error.message}` : "deleted";
    }

    // 5. Delete owned groups
    if (ownedGroupIds.length > 0) {
      const { error } = await supabase.from("groups").delete().in("id", ownedGroupIds);
      results.ownedGroups = error ? `error: ${error.message}` : "deleted";
    }

    // 6. Get user's checkins and delete related data
    const { data: checkins } = await supabase.from("checkins").select("id").eq("user_id", userId);
    const checkinIds = checkins?.map(c => c.id) || [];
    
    if (checkinIds.length > 0) {
      await supabase.from("checkin_groups").delete().in("checkin_id", checkinIds);
    }
    
    // 7. Delete user's checkins
    const { error: checkinsErr } = await supabase.from("checkins").delete().eq("user_id", userId);
    results.checkins = checkinsErr ? `error: ${checkinsErr.message}` : "deleted";

    // 8. Delete user's messages (in other groups)
    const { error: msgsErr } = await supabase.from("messages").delete().eq("user_id", userId);
    results.userMessages = msgsErr ? `error: ${msgsErr.message}` : "deleted";

    // 9. Delete user's memberships (in other groups)
    const { error: membErr } = await supabase.from("group_memberships").delete().eq("user_id", userId);
    results.userMemberships = membErr ? `error: ${membErr.message}` : "deleted";

    // 10. Delete profile
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
