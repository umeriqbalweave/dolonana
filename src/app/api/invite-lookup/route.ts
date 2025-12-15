import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const shortId = searchParams.get("shortId");
  const groupId = searchParams.get("groupId");

  if (!shortId && !groupId) {
    return NextResponse.json({ error: "Missing shortId or groupId" }, { status: 400 });
  }

  // Check env vars at runtime
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    console.error("Missing Supabase env vars at runtime:", { 
      hasUrl: !!url, 
      hasKey: !!key,
      urlLength: url?.length,
      keyLength: key?.length 
    });
    return NextResponse.json({ 
      error: "Server configuration error",
      debug: { hasUrl: !!url, hasKey: !!key }
    }, { status: 500 });
  }

  const supabase = createClient(url, key);

  try {
    let group;

    if (groupId) {
      // Full group ID lookup
      const { data, error: queryError } = await supabase
        .from("groups")
        .select("id, name, owner_id, image_url")
        .eq("id", groupId)
        .maybeSingle();
      
      if (queryError) {
        console.error("Group query error:", queryError);
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
