"use client";

import { useEffect, useState, useRef } from "react";
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
  reactions?: { emoji: string; user_id: string }[];
};

type Message = {
  id: string;
  user_id: string;
  text: string;
  created_at: string;
  checkin_id?: string | null;
  group_id?: string | null;
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

const REACTION_EMOJIS = ["❤️", "🫂", "💪", "🙏", "💜"];

export default function GroupDetailPage() {
  const router = useRouter();
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [group, setGroup] = useState<GroupMeta | null>(null);
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessageText, setNewMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light" | "warm">("warm");
  const [profilesById, setProfilesById] = useState<Record<string, { avatar_url: string | null; display_name: string | null }>>({});

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

      // Fetch group details
      const { data: groupData } = await supabase
        .from("groups")
        .select("id, name, owner_id, image_url")
        .eq("id", groupId)
        .single();

      if (groupData) {
        setGroup(groupData);
      }

      // Fetch check-ins for this group (via checkin_groups junction)
      const { data: checkinGroupsData } = await supabase
        .from("checkin_groups")
        .select("checkin_id")
        .eq("group_id", groupId);

      const checkinIds = checkinGroupsData?.map(cg => cg.checkin_id) || [];

      if (checkinIds.length > 0) {
        const { data: checkinsData } = await supabase
          .from("checkins")
          .select("*")
          .in("id", checkinIds)
          .order("created_at", { ascending: false });

        if (checkinsData) {
          // Fetch profiles for check-in users
          const userIds = [...new Set(checkinsData.map(c => c.user_id))];
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, display_name, avatar_url")
            .in("id", userIds);

          const profileMap: Record<string, { avatar_url: string | null; display_name: string | null }> = {};
          profiles?.forEach(p => {
            profileMap[p.id] = { avatar_url: p.avatar_url, display_name: p.display_name };
          });
          setProfilesById(prev => ({ ...prev, ...profileMap }));

          // Fetch reactions for check-ins
          const { data: reactionsData } = await supabase
            .from("reactions")
            .select("checkin_id, emoji, user_id")
            .in("checkin_id", checkinIds);

          const reactionsMap: Record<string, { emoji: string; user_id: string }[]> = {};
          reactionsData?.forEach(r => {
            if (!reactionsMap[r.checkin_id]) reactionsMap[r.checkin_id] = [];
            reactionsMap[r.checkin_id].push({ emoji: r.emoji, user_id: r.user_id });
          });

          const checkinsWithData = checkinsData.map(c => ({
            ...c,
            profile: profileMap[c.user_id],
            reactions: reactionsMap[c.id] || [],
          }));

          setCheckins(checkinsWithData);
        }
      }

      // Fetch free-form messages for this group
      const { data: messagesData } = await supabase
        .from("messages")
        .select("*")
        .eq("group_id", groupId)
        .order("created_at", { ascending: true });

      if (messagesData) {
        const msgUserIds = [...new Set(messagesData.map(m => m.user_id))];
        const { data: msgProfiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", msgUserIds);

        const msgProfileMap: Record<string, { avatar_url: string | null; display_name: string | null }> = {};
        msgProfiles?.forEach(p => {
          msgProfileMap[p.id] = { avatar_url: p.avatar_url, display_name: p.display_name };
        });
        setProfilesById(prev => ({ ...prev, ...msgProfileMap }));

        const messagesWithProfiles = messagesData.map(m => ({
          ...m,
          profile: msgProfileMap[m.user_id],
        }));

        setMessages(messagesWithProfiles);
      }

      setLoading(false);

      // Mark group as visited for unread tracking
      if (typeof window !== "undefined") {
        const lastVisitsRaw = window.localStorage.getItem("groupLastVisits");
        const lastVisits = lastVisitsRaw ? JSON.parse(lastVisitsRaw) : {};
        lastVisits[groupId] = new Date().toISOString();
        window.localStorage.setItem("groupLastVisits", JSON.stringify(lastVisits));
      }
    }

    void loadData();
  }, [groupId, router]);

  // Real-time subscription for new messages
  useEffect(() => {
    if (!groupId) return;

    const channel = supabase
      .channel(`group-${groupId}-messages`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `group_id=eq.${groupId}` },
        async (payload) => {
          const newMsg = payload.new as Message;
          // Fetch profile for new message
          const { data: profile } = await supabase
            .from("profiles")
            .select("display_name, avatar_url")
            .eq("id", newMsg.user_id)
            .single();

          setMessages(prev => [...prev, { ...newMsg, profile: profile || undefined }]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessageText.trim() || !userId || !groupId) return;

    setSendingMessage(true);

    const { data, error } = await supabase.from("messages").insert({
      group_id: groupId,
      user_id: userId,
      text: newMessageText.trim(),
    }).select();

    console.log("Message insert result:", { data, error });

    if (error) {
      console.error("Error sending message:", error);
    } else {
      setNewMessageText("");
      // Manually add message to state if realtime doesn't work
      if (data && data[0]) {
        const newMsg = data[0];
        const profile = profilesById[userId];
        setMessages(prev => [...prev, { ...newMsg, profile }]);
      }
    }

    setSendingMessage(false);
  }

  async function handleReaction(checkinId: string, emoji: string) {
    if (!userId) return;

    // Check if user already reacted with this emoji
    const existing = checkins.find(c => c.id === checkinId)?.reactions?.find(
      r => r.user_id === userId && r.emoji === emoji
    );

    if (existing) {
      // Remove reaction
      await supabase
        .from("reactions")
        .delete()
        .eq("checkin_id", checkinId)
        .eq("user_id", userId)
        .eq("emoji", emoji);

      setCheckins(prev =>
        prev.map(c =>
          c.id === checkinId
            ? { ...c, reactions: c.reactions?.filter(r => !(r.user_id === userId && r.emoji === emoji)) }
            : c
        )
      );
    } else {
      // Add reaction
      await supabase.from("reactions").insert({
        checkin_id: checkinId,
        user_id: userId,
        emoji,
      });

      setCheckins(prev =>
        prev.map(c =>
          c.id === checkinId
            ? { ...c, reactions: [...(c.reactions || []), { emoji, user_id: userId }] }
            : c
        )
      );
    }
  }

  function getNumberColor(num: number): string {
    if (num <= 3) return "from-rose-500 to-rose-600";
    if (num <= 5) return "from-amber-500 to-amber-600";
    if (num <= 7) return "from-emerald-500 to-emerald-600";
    return "from-violet-500 to-violet-600";
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
    ? "flex flex-col min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50"
    : isWarm
    ? "flex flex-col min-h-screen bg-[#FCEADE] text-stone-800"
    : "flex flex-col min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900";

  const headerClass = isDark
    ? "flex items-center justify-between gap-4 border-b border-slate-800 bg-slate-950/70 px-4 py-4"
    : isWarm
    ? "flex items-center justify-between gap-4 border-b border-orange-200 bg-[#FEF3E2] px-4 py-4"
    : "flex items-center justify-between gap-4 border-b border-slate-200 bg-white/80 px-4 py-4 shadow-sm";

  const cardClass = isDark
    ? "rounded-2xl bg-slate-900/50 border border-slate-800 p-4"
    : isWarm
    ? "rounded-2xl bg-white border border-orange-200 p-4 shadow-sm"
    : "rounded-2xl bg-white border border-slate-200 p-4 shadow-sm";

  const inputClass = isDark
    ? "flex-1 rounded-full bg-slate-800 border border-slate-700 px-4 py-3 text-white placeholder:text-slate-500 outline-none focus:border-amber-400"
    : isWarm
    ? "flex-1 rounded-full bg-white border-2 border-orange-200 px-4 py-3 text-stone-800 placeholder:text-stone-400 outline-none focus:border-orange-400"
    : "flex-1 rounded-full bg-white border border-slate-200 px-4 py-3 text-slate-800 placeholder:text-slate-400 outline-none focus:border-amber-500";

  if (loading) {
    return (
      <div className={bgClass.replace("flex flex-col", "flex items-center justify-center")}>
        <div className="text-center">
          <div className="animate-pulse text-6xl mb-4">🪷</div>
          <p className={isDark ? "text-slate-400" : "text-stone-500"}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={bgClass}>
      {/* Header */}
      <header className={headerClass}>
        <button
          type="button"
          onClick={withHaptics(() => router.push("/groups"))}
          className={isDark ? "text-slate-400 hover:text-white text-lg" : "text-stone-500 hover:text-stone-800 text-lg"}
        >
          ← Back
        </button>
        <h1 className="text-xl font-bold truncate">{group?.name || "Group"}</h1>
        <button
          type="button"
          onClick={withHaptics(() => router.push(`/groups/${groupId}/settings`))}
          className={isDark ? "text-slate-400 hover:text-white text-xl" : "text-stone-500 hover:text-stone-800 text-xl"}
        >
          ⚙️
        </button>
      </header>

      {/* Main Content - Scrollable */}
      <main className="flex-1 overflow-y-auto px-4 py-4 pb-32">
        {/* Check-ins Section */}
        {checkins.length > 0 && (
          <div className="mb-6">
            <h2 className={`text-lg font-semibold mb-3 ${isDark ? "text-slate-300" : "text-stone-600"}`}>
              Recent Check-ins
            </h2>
            <div className="space-y-3">
              {checkins.map((checkin) => (
                <motion.div
                  key={checkin.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cardClass}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className={`h-12 w-12 rounded-full overflow-hidden flex-shrink-0 ${isDark ? "bg-slate-700" : "bg-stone-100"}`}>
                      {checkin.profile?.avatar_url ? (
                        <img src={checkin.profile.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-lg font-bold">
                          {checkin.profile?.display_name?.[0]?.toUpperCase() || "?"}
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold">{checkin.profile?.display_name || "Someone"}</span>
                        <span className={`text-sm ${isDark ? "text-slate-500" : "text-stone-400"}`}>
                          {formatTime(checkin.created_at)}
                        </span>
                      </div>

                      {/* Number badge */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`inline-flex items-center justify-center h-10 w-10 rounded-full bg-gradient-to-br ${getNumberColor(checkin.number)} text-white font-bold text-lg`}>
                          {checkin.number}
                        </span>
                        {checkin.message && (
                          <p className={`text-base ${isDark ? "text-slate-300" : "text-stone-600"}`}>
                            {checkin.message}
                          </p>
                        )}
                      </div>

                      {/* Reactions */}
                      <div className="flex items-center gap-1 flex-wrap">
                        {REACTION_EMOJIS.map((emoji) => {
                          const count = checkin.reactions?.filter(r => r.emoji === emoji).length || 0;
                          const hasReacted = checkin.reactions?.some(r => r.emoji === emoji && r.user_id === userId);
                          return (
                            <button
                              key={emoji}
                              type="button"
                              onClick={withHaptics(() => handleReaction(checkin.id, emoji))}
                              className={`px-2 py-1 rounded-full text-sm transition ${
                                hasReacted
                                  ? isDark
                                    ? "bg-amber-500/30 border border-amber-500"
                                    : "bg-orange-100 border border-orange-400"
                                  : isDark
                                  ? "bg-slate-800 hover:bg-slate-700"
                                  : "bg-stone-100 hover:bg-stone-200"
                              }`}
                            >
                              {emoji} {count > 0 && count}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {checkins.length === 0 && (
          <div className="text-center py-8">
            <div className="text-5xl mb-3">🪷</div>
            <p className={isDark ? "text-slate-400" : "text-stone-500"}>No check-ins yet</p>
            <p className={`text-sm mt-1 ${isDark ? "text-slate-500" : "text-stone-400"}`}>
              Be the first to share how you&apos;re feeling!
            </p>
          </div>
        )}

        {/* Messages Section - QWF style list format */}
        {messages.length > 0 && (
          <div className="mb-4">
            <div className="space-y-1">
              {messages.map((msg, index) => {
                const isMe = msg.user_id === userId;
                const displayName = isMe ? "You" : (msg.profile?.display_name || "Friend");
                const initials = displayName.split(" ").map(w => w[0]).join("");
                const avatarUrl = msg.profile?.avatar_url;

                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, delay: index * 0.015 }}
                    className="flex items-start gap-3 px-1 py-2"
                  >
                    <div className={`mt-1 flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold ${isDark ? "bg-slate-700 text-slate-100" : "bg-stone-200 text-stone-700"}`}>
                      {avatarUrl ? (
                        <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
                      ) : (
                        initials
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={isDark ? "text-sm font-medium text-slate-300" : "text-sm font-medium text-stone-600"}>
                        {displayName}
                      </p>
                      <p className={isDark ? "whitespace-pre-wrap text-xl text-slate-50" : "whitespace-pre-wrap text-xl text-stone-800"}>
                        {msg.text}
                      </p>
                      <p className={isDark ? "mt-0.5 text-xs text-slate-500" : "mt-0.5 text-xs text-stone-400"}>
                        {formatTime(msg.created_at)}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}
      </main>

      {/* Message Input - Fixed at bottom */}
      <div className={`fixed bottom-0 left-0 right-0 p-4 ${isDark ? "bg-slate-950/90 border-t border-slate-800" : isWarm ? "bg-[#FEF3E2] border-t border-orange-200" : "bg-white/90 border-t border-slate-200"}`}>
        <form onSubmit={handleSendMessage} className="flex items-center gap-3 max-w-2xl mx-auto">
          <input
            type="text"
            value={newMessageText}
            onChange={(e) => setNewMessageText(e.target.value)}
            placeholder="Send a message..."
            className={inputClass}
          />
          <button
            type="submit"
            disabled={!newMessageText.trim() || sendingMessage}
            className="h-12 w-12 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xl flex items-center justify-center disabled:opacity-50"
          >
            {sendingMessage ? "..." : "→"}
          </button>
        </form>
      </div>

      {/* Floating Check-in Button */}
      <motion.button
        type="button"
        onClick={withHaptics(() => router.push("/checkin"))}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-24 right-4 h-16 w-16 rounded-full bg-gradient-to-br from-rose-500 via-amber-500 to-rose-500 text-3xl shadow-xl flex items-center justify-center z-20"
      >
        🪷
      </motion.button>
    </div>
  );
}
