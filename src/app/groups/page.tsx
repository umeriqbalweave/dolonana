"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { withHaptics } from "@/lib/haptics";
import FloatingEmojis from "@/components/FloatingEmojis";

type Group = {
  id: string;
  name: string;
  image_url?: string | null;
  owner_id?: string;
  created_at?: string;
  memberAvatars?: (string | null)[];
  memberCount?: number;
  lastCheckinAt?: string | null;
};

function formatLastCheckin(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function GroupsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const swipeStartX = useRef<number | null>(null);
  const [swipeOffsets, setSwipeOffsets] = useState<Record<string, number>>({});
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light" | "warm">("warm");
  const [showWelcome, setShowWelcome] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  function toggleTheme() {
    setTheme((previous) => {
      const next = previous === "dark" ? "light" : previous === "light" ? "warm" : "dark";
      if (typeof window !== "undefined") {
        window.localStorage.setItem("theme", next);
      }
      return next;
    });
  }

  useEffect(() => {
    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      const currentUserId = data.user?.id ?? null;
      const phone = data.user?.phone ?? null;

      if (!currentUserId) {
        router.replace("/");
        return;
      }

      setUserId(currentUserId);

      const { data: profile } = await supabase
        .from("profiles")
        .select("avatar_url, display_name")
        .eq("id", currentUserId)
        .maybeSingle();

      // Redirect to onboarding if user doesn't have a name
      const hasName = profile?.display_name && profile.display_name.trim().length > 0;
      if (!hasName) {
        router.replace("/onboarding");
        return;
      }

      if (profile?.avatar_url) {
        setAvatarUrl(profile.avatar_url);
      }

      void fetchGroups(currentUserId, phone);
    }

    void loadUser();
  }, [router]);

  // Real-time subscription for new messages/answers across all groups
  useEffect(() => {
    if (groups.length === 0) return;

    const groupIds = groups.map((g) => g.id);

    // Subscribe to new messages in any of the user's groups
    const messagesChannel = supabase
      .channel("groups-messages-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const newMessage = payload.new as { group_id?: string; user_id?: string };
          if (newMessage.group_id && groupIds.includes(newMessage.group_id)) {
            // Don't count own messages
            if (newMessage.user_id !== userId) {
              setUnreadCounts((prev) => ({
                ...prev,
                [newMessage.group_id!]: (prev[newMessage.group_id!] || 0) + 1,
              }));
            }
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "answers",
        },
        (payload) => {
          const newAnswer = payload.new as { user_id?: string };
          // For answers, we need to look up which group - for now just trigger a visual hint
          if (newAnswer.user_id && newAnswer.user_id !== userId) {
            // Could enhance this to map question_id -> group_id if needed
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
    };
  }, [groups, userId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("theme");
    if (stored === "light" || stored === "dark" || stored === "warm") {
      setTheme(stored);
    }
  }, []);

  function toE164(phone: string): string {
    const digits = phone.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) {
      return `+${digits}`;
    }
    if (digits.length === 10) {
      return `+1${digits}`;
    }
    return phone.startsWith("+") ? phone : `+${phone}`;
  }

  async function fetchGroups(currentUserId: string, _phone: string | null) {
    setGroupsLoading(true);

    // Get groups where user is a member
    const { data: memberships, error: membershipError } = await supabase
      .from("group_memberships")
      .select("group_id")
      .eq("user_id", currentUserId);

    if (membershipError) {
      console.error("Error fetching memberships:", membershipError);
      setGroups([]);
      setGroupsLoading(false);
      return;
    }

    const groupIds = memberships?.map(m => m.group_id).filter(Boolean) || [];

    if (groupIds.length === 0) {
      setGroups([]);
      setGroupsLoading(false);
      return;
    }

    // Fetch groups
    const { data: groupsData, error: groupsError } = await supabase
      .from("groups")
      .select("id, name, image_url, owner_id, created_at")
      .in("id", groupIds);

    if (groupsError) {
      console.error("Error fetching groups:", groupsError);
      setError(groupsError.message);
      setGroups([]);
      setGroupsLoading(false);
      return;
    }

    // Fetch all memberships for member counts and avatars
    const { data: allMemberships } = await supabase
      .from("group_memberships")
      .select("group_id, user_id")
      .in("group_id", groupIds);
    
    // Get unique member IDs for avatar fetch
    const allMemberIds = [...new Set(allMemberships?.map(m => m.user_id) || [])];
    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("id, avatar_url")
      .in("id", allMemberIds.slice(0, 50));
    
    const profileMap = new Map(allProfiles?.map(p => [p.id, p.avatar_url]) || []);
    
    // Group memberships by group_id
    const membershipsByGroup = new Map<string, string[]>();
    allMemberships?.forEach(m => {
      if (!membershipsByGroup.has(m.group_id)) {
        membershipsByGroup.set(m.group_id, []);
      }
      membershipsByGroup.get(m.group_id)!.push(m.user_id);
    });

    // Fetch display names for DM handling
    const { data: allProfilesWithNames } = await supabase
      .from("profiles")
      .select("id, avatar_url, display_name")
      .in("id", allMemberIds.slice(0, 50));
    
    const profileMapFull = new Map(allProfilesWithNames?.map(p => [p.id, p]) || []);

    // Fetch user's last check-in for each group
    const { data: lastCheckins } = await supabase
      .from("checkins")
      .select("group_id, created_at")
      .eq("user_id", currentUserId)
      .in("group_id", groupIds)
      .order("created_at", { ascending: false });
    
    // Map of group_id -> last check-in time
    const lastCheckinMap = new Map<string, string>();
    lastCheckins?.forEach(checkin => {
      if (!lastCheckinMap.has(checkin.group_id)) {
        lastCheckinMap.set(checkin.group_id, checkin.created_at);
      }
    });

    // Build groups with member data
    const groupsWithData: Group[] = (groupsData ?? []).map(group => {
      const memberIds = membershipsByGroup.get(group.id) || [];
      const memberAvatars = memberIds.slice(0, 4).map(id => profileMap.get(id) || null);
      
      // Check if this is a DM (name contains " + " and has exactly 2 members)
      const isDM = group.name.includes(" + ") && memberIds.length === 2;
      let displayName = group.name;
      let displayImage = group.image_url;
      
      if (isDM) {
        // Find the other person (not current user)
        const otherUserId = memberIds.find(id => id !== currentUserId);
        if (otherUserId) {
          const otherProfile = profileMapFull.get(otherUserId);
          if (otherProfile) {
            displayName = otherProfile.display_name || "Friend";
            displayImage = otherProfile.avatar_url || displayImage;
          }
        }
      }
      
      return {
        ...group,
        name: displayName,
        image_url: displayImage,
        memberAvatars,
        memberCount: memberIds.length,
        lastCheckinAt: lastCheckinMap.get(group.id) || null,
      };
    });

    // Sort by created_at (newest first)
    groupsWithData.sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });

    setGroups(groupsWithData);
    setGroupsLoading(false);
  }

  async function fetchUnreadCounts(groupIds: string[], currentUserId: string) {
    if (typeof window === "undefined") return;

    const lastVisitsRaw = window.localStorage.getItem("groupLastVisits");
    const lastVisits: Record<string, string> = lastVisitsRaw
      ? JSON.parse(lastVisitsRaw)
      : {};

    const counts: Record<string, number> = {};

    for (const groupId of groupIds) {
      const lastVisit = lastVisits[groupId] || new Date(0).toISOString();

      // Count messages since last visit (excluding own messages)
      const { count, error } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("group_id", groupId)
        .neq("user_id", currentUserId)
        .gt("created_at", lastVisit);

      if (!error && count && count > 0) {
        counts[groupId] = count;
      }
    }

    setUnreadCounts(counts);
  }

  async function handleLeaveGroup(groupId: string) {
    if (!userId) return;
    
    const confirmed = window.confirm("Leave this group? Your answers will be deleted.");
    if (!confirmed) {
      setSwipeOffsets({});
      return;
    }

    setDeletingGroupId(groupId);

    // Delete user's answers for this group
    const { data: questions } = await supabase
      .from("daily_questions")
      .select("id")
      .eq("group_id", groupId);

    if (questions && questions.length > 0) {
      const questionIds = questions.map((q) => q.id);
      await supabase
        .from("answers")
        .delete()
        .eq("user_id", userId)
        .in("question_id", questionIds);
    }

    // Delete user's messages
    await supabase
      .from("messages")
      .delete()
      .eq("user_id", userId)
      .eq("group_id", groupId);

    // Delete membership
    await supabase
      .from("group_memberships")
      .delete()
      .eq("user_id", userId)
      .eq("group_id", groupId);

    // Delete notification settings
    await supabase
      .from("group_notification_settings")
      .delete()
      .eq("user_id", userId)
      .eq("group_id", groupId);

    // Remove from local state
    setGroups(prev => prev.filter(g => g.id !== groupId));
    setDeletingGroupId(null);
    setSwipeOffsets({});
  }

  async function handleDeleteGroup(groupId: string) {
    const confirmed = window.confirm("Delete this group for everyone? This cannot be undone.");
    if (!confirmed) {
      setSwipeOffsets({});
      return;
    }

    setDeletingGroupId(groupId);
    await supabase.from("groups").delete().eq("id", groupId);
    setGroups(prev => prev.filter(g => g.id !== groupId));
    setDeletingGroupId(null);
    setSwipeOffsets({});
  }

  function handleSwipeStart(e: React.TouchEvent | React.MouseEvent, groupId: string) {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    swipeStartX.current = clientX;
  }

  function handleSwipeMove(e: React.TouchEvent | React.MouseEvent, groupId: string) {
    if (swipeStartX.current === null) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const diff = swipeStartX.current - clientX;
    // Only allow left swipe (positive diff), cap at 100px
    const offset = Math.max(0, Math.min(diff, 100));
    setSwipeOffsets(prev => ({ ...prev, [groupId]: offset }));
  }

  function handleSwipeEnd(groupId: string) {
    swipeStartX.current = null;
    // If swiped more than 50px, keep it open, otherwise close
    setSwipeOffsets(prev => ({
      ...prev,
      [groupId]: (prev[groupId] || 0) > 50 ? 100 : 0
    }));
  }

  const isDark = theme === "dark";
  const isWarm = theme === "warm";

  // Theme-based classes
  const bgClass = isDark 
    ? "relative min-h-screen bg-black text-slate-50 overflow-hidden"
    : isWarm
    ? "relative min-h-screen bg-[#FCEADE] text-stone-800 overflow-hidden"
    : "relative min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900 overflow-hidden";

  return (
    <div className={bgClass}>
      <FloatingEmojis count={6} />
      <header
        className={
          isDark
            ? "flex items-center justify-between gap-4 border-b border-slate-800 bg-slate-950/70 px-4 py-4 md:px-8"
            : isWarm
            ? "flex items-center justify-between gap-4 border-b border-orange-200 bg-[#FEF3E2] px-4 py-4 md:px-8"
            : "flex items-center justify-between gap-4 border-b border-slate-200 bg-white/80 px-4 py-4 text-slate-900 shadow-sm md:px-8"
        }
      >
        <div>
          <h1
            className="cursor-pointer text-5xl font-bold tracking-tight md:text-6xl bg-gradient-to-r from-rose-400 via-amber-400 to-rose-400 bg-clip-text text-transparent"
            onClick={withHaptics(() => setShowWelcome(true))}
          >
            CWF
          </h1>
          <p className={isDark ? "text-base text-slate-400 md:text-lg" : "text-base text-stone-500 md:text-lg"}>
            Check in with your people.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={withHaptics(() => router.push("/groups/new"))}
            className={isDark 
              ? "rounded-full bg-gradient-to-br from-zinc-300 to-zinc-500 px-5 py-3 text-lg font-bold text-zinc-800 transition hover:from-zinc-200 hover:to-zinc-400" 
              : "rounded-full bg-gradient-to-r from-orange-400 to-amber-400 px-5 py-3 text-lg font-bold text-white shadow-lg transition hover:from-orange-500 hover:to-amber-500"}
          >
            + New
          </button>
          <button
            type="button"
            onClick={withHaptics(() => router.push("/profile"))}
            className={isDark ? "flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-white/10 text-lg font-semibold text-white/90 hover:bg-white/20" : "flex h-16 w-16 items-center justify-center rounded-full border-3 border-stone-300 bg-white text-lg font-semibold text-stone-700 hover:border-amber-500 shadow-md ring-2 ring-orange-400/50"}
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt="Profile avatar"
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              (userId ?? "?").slice(0, 1).toUpperCase()
            )}
          </button>
        </div>
      </header>

      {showWelcome && (
        <div
          className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-black/70"
          onClick={withHaptics(() => setShowWelcome(false))}
          ref={(el) => {
            if (el) {
              const timer = setTimeout(() => setShowWelcome(false), 3000);
              el.dataset.timer = String(timer);
            }
          }}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              scale: { duration: 0.8, ease: "easeOut" },
              opacity: { duration: 0.8 },
            }}
            className="mb-6 text-8xl md:text-9xl"
          >
            🪷
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="text-center text-xl font-medium text-slate-100 md:text-2xl"
          >
            Take a breath. You&apos;re okay 💜
          </motion.p>
        </div>
      )}

      
      <main className="flex h-[calc(100vh-64px)] flex-col px-0 py-0">
        <div
          className={
            isDark
              ? "flex-1 overflow-y-auto bg-slate-950/80 px-4 pb-6 pt-4 md:px-8"
              : isWarm
              ? "flex-1 overflow-y-auto bg-[#FCEADE]/80 px-4 pb-6 pt-4 md:px-8"
              : "flex-1 overflow-y-auto bg-white/80 px-4 pb-6 pt-4 text-slate-900 md:px-8"
          }
        >
          {groupsLoading && (
            <div className="relative flex flex-col items-center justify-center min-h-[60vh]">
              <div className="absolute top-10 left-10 text-4xl opacity-20 animate-pulse">🪷</div>
              <div className="absolute bottom-10 right-10 text-4xl opacity-20 animate-pulse">✨</div>
              <div className="animate-pulse text-6xl mb-4">🪷</div>
              <p className={isDark ? "text-lg text-slate-400" : "text-lg text-slate-600"}>Loading your circles...</p>
            </div>
          )}
          {!groupsLoading && groups.length === 0 && (
            <div className="py-8 text-center">
              <div className="text-6xl mb-4">🪷</div>
              <p className={isDark ? "text-lg text-slate-400 mb-2" : "text-lg text-slate-600 mb-2"}>No circles yet</p>
              <p className={isDark ? "text-sm text-slate-500" : "text-sm text-slate-500"}>Create a group to start checking in with friends</p>
            </div>
          )}

          {/* IMAGE-HEAVY GROUP CARDS - 2 cols desktop, 1 col mobile */}
          {groups.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-32">
              {groups.map((group, index) => {
                const swipeOffset = swipeOffsets[group.id] || 0;
                
                return (
                  <motion.div
                    key={group.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.1 }}
                    className="relative overflow-hidden rounded-3xl"
                  >
                    {/* Large tappable image card - tall on mobile, square-ish on desktop */}
                    <div
                      onClick={withHaptics(() => {
                        if (swipeOffset < 10) {
                          if (typeof window !== "undefined") {
                            const lastVisitsRaw = window.localStorage.getItem("groupLastVisits");
                            const lastVisits: Record<string, string> = lastVisitsRaw ? JSON.parse(lastVisitsRaw) : {};
                            lastVisits[group.id] = new Date().toISOString();
                            window.localStorage.setItem("groupLastVisits", JSON.stringify(lastVisits));
                          }
                          setUnreadCounts((prev) => { const next = { ...prev }; delete next[group.id]; return next; });
                          router.push(`/groups/${group.id}`);
                        }
                      })}
                      className="relative cursor-pointer w-full overflow-hidden rounded-2xl shadow-lg bg-stone-200"
                      style={{ minHeight: "200px", maxHeight: "280px" }}
                    >
                      {/* FULL image - fills the entire box */}
                      {group.image_url ? (
                        <img 
                          src={group.image_url} 
                          alt={group.name} 
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : (
                        <div className={isDark ? "absolute inset-0 bg-gradient-to-br from-violet-600 via-purple-600 to-emerald-600" : "absolute inset-0 bg-gradient-to-br from-orange-400 via-amber-400 to-rose-400"}>
                          <div className="absolute inset-0 flex items-center justify-center text-9xl font-bold text-white/30">
                            {group.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                          </div>
                        </div>
                      )}
                      
                      {/* Gradient overlay at bottom for text readability */}
                      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
                      
                      {/* Unread badge - top right */}
                      {unreadCounts[group.id] > 0 && (
                        <div className="absolute top-3 right-3">
                          <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-rose-500 px-2 text-sm font-bold text-white shadow">
                            {unreadCounts[group.id] > 99 ? "99+" : unreadCounts[group.id]}
                          </span>
                        </div>
                      )}
                      
                      {/* Bottom content - group name and member avatars */}
                      <div className="absolute bottom-0 left-0 right-0 p-4">
                        {/* Group name */}
                        <h3 className="text-2xl font-bold text-white mb-1 drop-shadow-lg">
                          {group.name}
                        </h3>
                        
                        {/* Last check-in time */}
                        {group.lastCheckinAt && (
                          <p className="text-xs text-white/70 mb-2">
                            Last check-in: {formatLastCheckin(group.lastCheckinAt)}
                          </p>
                        )}
                        
                        {/* Member avatars */}
                        <div className="flex -space-x-2">
                          {group.memberAvatars?.slice(0, 5).map((avatar, i) => (
                            <div 
                              key={i} 
                              className="h-8 w-8 rounded-full border-2 border-white bg-stone-300 overflow-hidden shadow"
                            >
                              {avatar ? (
                                <img src={avatar} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <div className="h-full w-full bg-gradient-to-br from-emerald-400 to-violet-400" />
                              )}
                            </div>
                          ))}
                          {(group.memberCount ?? 0) > 5 && (
                            <div className="h-8 w-8 rounded-full border-2 border-white bg-orange-500 flex items-center justify-center text-xs font-bold text-white shadow">
                              +{(group.memberCount ?? 0) - 5}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Prominent Check-in Button - Round circular button */}
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30">
          <motion.button
            type="button"
            onClick={withHaptics(() => router.push("/checkin"))}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="h-20 w-20 rounded-full bg-gradient-to-r from-rose-400 via-amber-400 to-rose-400 shadow-2xl shadow-rose-500/40 ring-4 ring-white/30"
          />
        </div>
      </main>
    </div>
  );
}
