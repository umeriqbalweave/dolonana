import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get("groupId");

  let groupName = "CWF";
  let groupImage: string | null = null;
  let inviterName: string | null = null;

  // If groupId provided, fetch group data
  if (groupId) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: group } = await supabase
      .from("groups")
      .select("name, image_url, owner_id")
      .eq("id", groupId)
      .maybeSingle();

    if (group) {
      groupName = group.name;
      groupImage = group.image_url;

      // Get owner name
      const { data: owner } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", group.owner_id)
        .maybeSingle();

      inviterName = owner?.display_name ?? null;
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#1e1b4b",
          backgroundImage: "linear-gradient(to bottom right, #1e1b4b, #0f172a, #064e3b)",
        }}
      >
        {/* Group Image or Emojis */}
        {groupImage ? (
          <img
            src={groupImage}
            alt=""
            width={180}
            height={180}
            style={{
              borderRadius: 24,
              marginBottom: 24,
              border: "4px solid rgba(255,255,255,0.2)",
              objectFit: "cover",
            }}
          />
        ) : (
          <div style={{ fontSize: 80, marginBottom: 20 }}>
            ✨❓💬
          </div>
        )}

        {/* Group Name */}
        <div
          style={{
            fontSize: groupId ? 56 : 80,
            fontWeight: 800,
            color: "#f8fafc",
            marginBottom: 10,
            textAlign: "center",
            maxWidth: 900,
          }}
        >
          {groupName}
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 28,
            color: "#a78bfa",
            textAlign: "center",
            maxWidth: 700,
          }}
        >
          {inviterName ? `${inviterName} invited you to join` : "Answer first. Then see theirs."}
        </div>

        {/* CWF badge */}
        {groupId && (
          <div
            style={{
              marginTop: 30,
              fontSize: 20,
              color: "#64748b",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>✨</span>
            <span>Questions With Friends</span>
          </div>
        )}
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
