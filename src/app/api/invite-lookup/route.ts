import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const shortId = searchParams.get("shortId");
  const groupId = searchParams.get("groupId");

  if (!shortId && !groupId) {
    return NextResponse.json({ error: "Missing shortId or groupId" }, { status: 400 });
  }

  // Use service role key to bypass RLS, fall back to anon key
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!url) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  // Prefer service key, fall back to anon key
  const key = serviceKey || anonKey;
  if (!key) {
    console.error("Missing both SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_ANON_KEY");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const supabase = createClient(url, key);

  console.log("Invite lookup request:", { groupId, shortId, hasServiceKey: !!serviceKey, hasAnonKey: !!anonKey });

  try {
    let group;

    if (groupId) {
      // Full group ID lookup
      const { data, error: queryError } = await supabase
        .from("groups")
        .select("id, name, owner_id, image_url, description")
        .eq("id", groupId)
        .maybeSingle();
      
      if (queryError) {
        console.error("Group query error:", JSON.stringify(queryError));
        return NextResponse.json({ 
          error: "Database query failed", 
          details: queryError.message,
          code: queryError.code 
        }, { status: 500 });
      }
      console.log("Group lookup result:", { groupId, found: !!data });
      group = data;
    } else if (shortId) {
      // First check the short_invites table
      const { data: shortInvite } = await supabase
        .from("short_invites")
        .select("group_id")
        .eq("short_id", shortId)
        .maybeSingle();

      if (shortInvite?.group_id) {
        const { data } = await supabase
          .from("groups")
          .select("id, name, owner_id, image_url")
          .eq("id", shortInvite.group_id)
          .maybeSingle();
        group = data;
      } else {
        // Fallback: try UUID prefix lookup for old-style short links
        const { data: allGroups } = await supabase
          .from("groups")
          .select("id, name, owner_id, image_url");
        
        group = allGroups?.find((g: any) => g.id.startsWith(shortId)) || null;
      }
    }

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // Get owner profile
    const { data: owner } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", group.owner_id)
      .maybeSingle();

    return NextResponse.json({
      group,
      owner: owner || { display_name: null, avatar_url: null },
    });
  } catch (error: any) {
    console.error("Invite lookup error:", error);
    return NextResponse.json({ 
      error: "Internal server error",
      message: error?.message || "Unknown error"
    }, { status: 500 });
  }
}
