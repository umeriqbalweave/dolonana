"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function ShortInvitePage() {
  const router = useRouter();
  const params = useParams<{ shortId: string }>();
  const shortId = params.shortId;

  useEffect(() => {
    async function findGroup() {
      if (!shortId) {
        router.replace("/");
        return;
      }

      try {
        // Use server-side API to bypass RLS
        const res = await fetch(`/api/invite-lookup?shortId=${shortId}`);
        const data = await res.json();
        
        if (res.ok && data.group?.id) {
          router.replace(`/invite/${data.group.id}`);
          return;
        }
      } catch (err) {
        console.error("Invite lookup failed:", err);
      }
      
      // No group found - show error briefly then redirect
      setTimeout(() => router.replace("/"), 2000);
    }

    void findGroup();
  }, [shortId, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
      <p className="text-xl text-[#a8a6a3]">Finding your invite...</p>
    </div>
  );
}
