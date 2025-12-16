import { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";

type Props = {
  params: Promise<{ groupId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { groupId } = await params;
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: group } = await supabase
    .from("groups")
    .select("name, image_url, owner_id")
    .eq("id", groupId)
    .maybeSingle();

  let title = "Join CWF";
  let description = "Answer first. Then see theirs.";

  if (group) {
    title = `Join ${group.name} on CWF`;
    
    // Get owner name
    const { data: owner } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", group.owner_id)
      .maybeSingle();

    if (owner?.display_name) {
      description = `${owner.display_name} invited you to join ${group.name}`;
    }
  }

  const ogImageUrl = `https://checkinwithfriends.app/api/og?groupId=${groupId}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default function InviteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
