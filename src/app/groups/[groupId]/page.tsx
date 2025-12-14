"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { withHaptics } from "@/lib/haptics";

type CheckIn = {
  id: string;
  user_id: string;
  number: number;
  message: string | null;
  created_at: string;
  profile?: {
    display_name: string | null;
    avatar_url: string | null;
  };
  reactions?: { user_id: string; emoji: string }[];
  replies?: Reply[];
};

type Reply = {
  id: string;
  user_id: string;
  text: string;
  created_at: string;
  profile?: {
    display_name: string | null;
    avatar_url: string | null;
  };
};

type GroupMeta = {
  id: string;
  name: string;
  owner_id: string;
  image_url?: string | null;
};

const REACTION_EMOJIS = ["❤️", "🫂", "💪", "🙏", "✨"];

export default function GroupDetailPage() {
  const router = useRouter();
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;

  const [userId, setUserId] = useState<string | null>(null);
  const [group, setGroup] = useState<GroupMeta | null>(null);
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light" | "warm">("warm");
  const [expandedCheckin, setExpandedCheckin] = useState<string | null>(null);

  const isDark = theme === "dark";
  const isWarm = theme === "warm";

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedTheme = window.localStorage.getItem("theme");
      if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "warm") {
        setTheme(savedTheme);
      }
    }
  }, []);

  useEffect(() => {
    async function loadData() {
      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData.user?.id ?? null;

      if (!currentUserId) {
        router.replace("/");
        return;
      }

      setUserId(currentUserId);

      // Load group
      const { data: groupData } = await supabase
        .from("groups")
        .select("*")
        .eq("id", groupId)
        .single();

      if (groupData) {
        setGroup(groupData);
      }

      // Load check-ins for this group
      await fetchCheckins();
      setLoading(false);
    }

    void loadData();
  }, [groupId, router]);

  async function fetchCheckins() {
    // Get check-in IDs for this group
    const { data: checkinGroupsData } = await supabase
      .from("checkin_groups")
      .select("checkin_id")
      .eq("group_id", groupId);

    if (!checkinGroupsData || checkinGroupsData.length === 0) {
      setCheckins([]);
      return;
    }

    const checkinIds = checkinGroupsData.map((cg) => cg.checkin_id);

    // Get check-ins with profiles
    const { data: checkinsData } = await supabase
      .from("checkins")
      .select(`
        *,
        profile:profiles(display_name, avatar_url)
      `)
      .in("id", checkinIds)
      .order("created_at", { ascending: false });

    if (checkinsData) {
      // Get reactions for these check-ins
      const { data: reactionsData } = await supabase
        .from("reactions")
        .select("*")
        .in("checkin_id", checkinIds);

      // Get replies (messages) for these check-ins
      const { data: repliesData } = await supabase
        .from("messages")
        .select(`
          *,
          profile:profiles(display_name, avatar_url)
        `)
        .in("checkin_id", checkinIds)
        .order("created_at", { ascending: true });

      // Attach reactions and replies to check-ins
      const checkinsWithData = checkinsData.map((checkin) => ({
        ...checkin,
        reactions: reactionsData?.filter((r) => r.checkin_id === checkin.id) || [],
        replies: repliesData?.filter((r) => r.checkin_id === checkin.id) || [],
      }));

      setCheckins(checkinsWithData);
    }
  }

  async function handleReaction(checkinId: string, emoji: string) {
    if (!userId) return;

    // Check if user already reacted
    const existingReaction = checkins
      .find((c) => c.id === checkinId)
      ?.reactions?.find((r) => r.user_id === userId);

    if (existingReaction) {
      // Remove reaction
      await supabase
        .from("reactions")
        .delete()
        .eq("checkin_id", checkinId)
        .eq("user_id", userId);
    } else {
      // Add reaction
      await supabase.from("reactions").insert({
        checkin_id: checkinId,
        user_id: userId,
        emoji,
      });
    }

    await fetchCheckins();
  }

  async function handleSendReply() {
    if (!userId || !replyingTo || !replyText.trim()) return;

    setSendingReply(true);

    await supabase.from("messages").insert({
      checkin_id: replyingTo,
      user_id: userId,
      text: replyText.trim(),
    });

    setReplyText("");
    setReplyingTo(null);
    setSendingReply(false);
    await fetchCheckins();
  }

  function getNumberColor(num: number): string {
    if (num <= 3) return "bg-rose-500/20 text-rose-400";
    if (num <= 5) return "bg-amber-500/20 text-amber-400";
    if (num <= 7) return "bg-emerald-500/20 text-emerald-400";
    return "bg-violet-500/20 text-violet-400";
  }

  function formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  // Theme classes
  const bgClass = isDark
    ? "flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950"
    : isWarm
    ? "flex min-h-screen items-center justify-center bg-[#FDF8F3]"
    : "flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100";

  const mainBgClass = isDark
    ? "relative flex min-h-screen flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50"
    : isWarm
    ? "relative flex min-h-screen flex-col bg-[#FDF8F3] text-stone-800"
    : "relative flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900";

  const headerClass = isDark
    ? "flex items-center justify-between gap-4 border-b border-slate-800 bg-slate-950/70 px-4 py-4"
    : isWarm
    ? "flex items-center justify-between gap-4 border-b border-stone-200 bg-[#FAF5EF] px-4 py-4"
    : "flex items-center justify-between gap-4 border-b border-slate-200 bg-white/80 px-4 py-4 shadow-sm";

  const cardClass = isDark
    ? "rounded-2xl bg-slate-900/50 border border-slate-800 p-4"
    : isWarm
    ? "rounded-2xl bg-[#FAF5EF] border border-stone-200 p-4"
    : "rounded-2xl bg-white border border-slate-200 p-4 shadow-sm";

  if (loading) {
    return (
      <div className={bgClass}>
        <div className="text-center">
          <div className="animate-pulse text-6xl mb-4">🪷</div>
          <p className={isDark ? "text-slate-400" : "text-stone-500"}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={mainBgClass}>
      {/* Header */}
      <header className={headerClass}>
        <button
          type="button"
          onClick={withHaptics(() => router.push("/groups"))}
          className={isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-800"}
        >
          ← Back
        </button>
        <h1 className="text-lg font-semibold truncate">{group?.name || "Group"}</h1>
        <button
          type="button"
          onClick={withHaptics(() => router.push(`/groups/${groupId}/settings`))}
          className={isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-800"}
        >
          ⚙️
        </button>
      </header>

      {/* Check-ins Feed */}
      <main className="flex-1 overflow-y-auto px-4 py-4 pb-24">
        {checkins.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
            <div className="text-6xl mb-4">🪷</div>
            <p className={isDark ? "text-lg text-slate-400 mb-2" : "text-lg text-slate-600 mb-2"}>
              No check-ins yet
            </p>
            <p className={isDark ? "text-sm text-slate-500" : "text-sm text-slate-500"}>
              Be the first to share how you&apos;re doing
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {checkins.map((checkin) => (
              <motion.div
                key={checkin.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={
                  isDark
                    ? "rounded-2xl bg-slate-900/50 border border-slate-800 p-4"
                    : "rounded-2xl bg-white border border-slate-200 p-4 shadow-sm"
                }
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={isDark ? "h-10 w-10 rounded-full bg-slate-800 overflow-hidden" : "h-10 w-10 rounded-full bg-slate-100 overflow-hidden"}>
                      {checkin.profile?.avatar_url ? (
                        <img src={checkin.profile.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-sm font-bold">
                          {(checkin.profile?.display_name || "?")[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{checkin.profile?.display_name || "Anonymous"}</p>
                      <p className={isDark ? "text-xs text-slate-500" : "text-xs text-slate-400"}>
                        {formatTime(checkin.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-lg font-bold ${getNumberColor(checkin.number)}`}>
                    {checkin.number}/10
                  </div>
                </div>

                {/* Message */}
                {checkin.message && (
                  <p className={isDark ? "text-slate-200 mb-3" : "text-slate-700 mb-3"}>
                    {checkin.message}
                  </p>
                )}

                {/* Reactions */}
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  {REACTION_EMOJIS.map((emoji) => {
                    const count = checkin.reactions?.filter((r) => r.emoji === emoji).length || 0;
                    const userReacted = checkin.reactions?.some((r) => r.user_id === userId && r.emoji === emoji);
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={withHaptics(() => handleReaction(checkin.id, emoji))}
                        className={`px-2 py-1 rounded-full text-sm transition ${
                          userReacted
                            ? isDark
                              ? "bg-slate-700 border border-slate-600"
                              : "bg-slate-200 border border-slate-300"
                            : isDark
                            ? "bg-slate-800/50 border border-slate-700 hover:bg-slate-700"
                            : "bg-slate-100 border border-slate-200 hover:bg-slate-200"
                        }`}
                      >
                        {emoji} {count > 0 && count}
                      </button>
                    );
                  })}
                </div>

                {/* Reply button */}
                <button
                  type="button"
                  onClick={withHaptics(() => {
                    setExpandedCheckin(expandedCheckin === checkin.id ? null : checkin.id);
                    setReplyingTo(checkin.id);
                  })}
                  className={isDark ? "text-sm text-slate-500 hover:text-slate-300" : "text-sm text-slate-400 hover:text-slate-600"}
                >
                  💬 {checkin.replies?.length || 0} {checkin.replies?.length === 1 ? "reply" : "replies"}
                </button>

                {/* Expanded replies */}
                <AnimatePresence>
                  {expandedCheckin === checkin.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-3 pt-3 border-t border-slate-700/50"
                    >
                      {/* Existing replies */}
                      {checkin.replies && checkin.replies.length > 0 && (
                        <div className="space-y-3 mb-3">
                          {checkin.replies.map((reply) => (
                            <div key={reply.id} className="flex gap-2">
                              <div className={isDark ? "h-7 w-7 rounded-full bg-slate-800 flex-shrink-0 overflow-hidden" : "h-7 w-7 rounded-full bg-slate-100 flex-shrink-0 overflow-hidden"}>
                                {reply.profile?.avatar_url ? (
                                  <img src={reply.profile.avatar_url} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <div className="h-full w-full flex items-center justify-center text-xs font-bold">
                                    {(reply.profile?.display_name || "?")[0].toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <div className={isDark ? "flex-1 bg-slate-800/50 rounded-xl px-3 py-2" : "flex-1 bg-slate-100 rounded-xl px-3 py-2"}>
                                <p className="text-xs font-medium">{reply.profile?.display_name || "Anonymous"}</p>
                                <p className="text-sm">{reply.text}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Reply input */}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Send some love..."
                          className={
                            isDark
                              ? "flex-1 rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-amber-400"
                              : "flex-1 rounded-xl bg-slate-100 border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-500"
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleSendReply();
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={withHaptics(handleSendReply)}
                          disabled={!replyText.trim() || sendingReply}
                          className="px-4 py-2 rounded-xl bg-amber-500 text-white font-medium disabled:opacity-50"
                        >
                          {sendingReply ? "..." : "Send"}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}
      </main>

      {/* Floating Check-in Button */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30">
        <motion.button
          type="button"
          onClick={withHaptics(() => router.push("/checkin"))}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 via-amber-500 to-rose-500 text-3xl shadow-2xl shadow-rose-500/30 ring-4 ring-white/20"
        >
          🪷
        </motion.button>
      </div>
    </div>
  );
}
