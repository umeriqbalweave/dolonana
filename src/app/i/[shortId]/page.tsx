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
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-violet-950 via-slate-900 to-emerald-900 text-slate-50 overflow-hidden">
      {/* Floating background elements */}
      <div className="absolute top-20 left-10 text-5xl opacity-20 animate-bounce">✨</div>
      <div className="absolute bottom-32 right-10 text-5xl opacity-20 animate-pulse">🎉</div>
      <div className="animate-spin text-6xl mb-4">🦦</div>
      <p className="text-lg text-slate-300">finding your invite...</p>
    </div>
  );
}
