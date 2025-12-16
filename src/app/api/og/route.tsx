import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get("groupId");

  let groupName = "CWF";
  let groupImage: string | null = null;
  let groupImageDataUrl: string | null = null;
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

  if (groupImage) {
    try {
      const res = await fetch(groupImage);
      if (res.ok) {
        const contentType = res.headers.get("content-type") || "image/jpeg";
        const buf = await res.arrayBuffer();
        const base64 = arrayBufferToBase64(buf);
        groupImageDataUrl = `data:${contentType};base64,${base64}`;
      }
    } catch {
      groupImageDataUrl = null;
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
          backgroundColor: "#0a0a0a",
          padding: 60,
        }}
      >
        {/* Card container mimicking invite screen */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#1a1a1a",
            border: "2px solid #2a2a2a",
            borderRadius: 32,
            padding: 48,
            maxWidth: 800,
          }}
        >
          {/* Group Image or initial fallback */}
          {groupImageDataUrl ? (
            <img
              src={groupImageDataUrl}
              alt=""
              width={140}
              height={140}
              style={{
                borderRadius: 70,
                marginBottom: 24,
                border: "3px solid #3a3a3a",
                objectFit: "cover",
              }}
            />
          ) : (
            <div
              style={{
                width: 140,
                height: 140,
                borderRadius: 70,
                backgroundColor: "#2a2a2a",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 24,
                fontSize: 56,
                fontWeight: 700,
                color: "#e8e6e3",
                border: "3px solid #3a3a3a",
              }}
            >
              {groupName.charAt(0).toUpperCase()}
            </div>
          )}

          {/* Inviter text */}
          {inviterName && (
            <div
              style={{
                fontSize: 24,
                color: "#666",
                marginBottom: 8,
              }}
            >
              {inviterName} invited you to
            </div>
          )}

          {/* Group Name */}
          <div
            style={{
              fontSize: 48,
              fontWeight: 700,
              color: "#e8e6e3",
              marginBottom: 16,
              textAlign: "center",
            }}
          >
            {groupName}
          </div>

          {/* CTA hint */}
          <div
            style={{
              fontSize: 20,
              color: "#a8a6a3",
              marginTop: 16,
            }}
          >
            Tap to join and check in with friends
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
