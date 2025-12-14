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

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    let group;

    if (groupId) {
      // Full group ID lookup
      const { data } = await supabase
        .from("groups")
        .select("id, name, owner_id, question_prompt, image_url")
        .eq("id", groupId)
        .maybeSingle();
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
          .select("id, name, owner_id, question_prompt, image_url")
          .eq("id", shortInvite.group_id)
          .maybeSingle();
        group = data;
      } else {
        // Fallback: try UUID prefix lookup for old-style short links
        const { data: allGroups } = await supabase
          .from("groups")
          .select("id, name, owner_id, question_prompt, image_url");
        
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
  } catch (error) {
    console.error("Invite lookup error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
