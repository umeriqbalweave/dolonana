"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { withHaptics } from "@/lib/haptics";

type Group = {
  id: string;
  name: string;
  image_url?: string | null;
};

export default function CheckInPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [step, setStep] = useState<"number" | "message" | "groups">("number");
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const isDark = theme === "dark";

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedTheme = window.localStorage.getItem("theme");
      if (savedTheme === "light" || savedTheme === "dark") {
        setTheme(savedTheme);
      }
    }
  }, []);

  useEffect(() => {
    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      const currentUserId = data.user?.id ?? null;

      if (!currentUserId) {
        router.replace("/");
        return;
      }

      setUserId(currentUserId);

      // Load user's groups
      const { data: memberships } = await supabase
        .from("group_memberships")
        .select("group_id")
        .eq("user_id", currentUserId);

      if (memberships && memberships.length > 0) {
        const groupIds = memberships.map((m) => m.group_id);
        const { data: groupsData } = await supabase
          .from("groups")
          .select("id, name, image_url")
          .in("id", groupIds);

        if (groupsData) {
          setGroups(groupsData);
          // Select all groups by default
          setSelectedGroups(new Set(groupsData.map((g) => g.id)));
        }
      }
    }

    void loadUser();
  }, [router]);

  function handleNumberSelect(num: number) {
    setSelectedNumber(num);
    // Auto-advance after selection with slight delay
    setTimeout(() => setStep("message"), 300);
  }

  function handleMessageNext() {
    setStep("groups");
  }

  function toggleGroup(groupId: string) {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  function toggleAllGroups() {
    if (selectedGroups.size === groups.length) {
      setSelectedGroups(new Set());
    } else {
      setSelectedGroups(new Set(groups.map((g) => g.id)));
    }
  }

  async function handleShare() {
    if (!userId || selectedNumber === null || selectedGroups.size === 0) return;

    setSending(true);

    // TODO: Insert check-in to database
    // For now, just simulate success
    await new Promise((resolve) => setTimeout(resolve, 1000));

    setSent(true);
    setTimeout(() => {
      router.push("/groups");
    }, 2000);
  }

  // Get color based on number
  function getNumberColor(num: number): string {
    if (num <= 3) return "from-rose-500 to-red-600";
    if (num <= 5) return "from-amber-500 to-orange-500";
    if (num <= 7) return "from-emerald-400 to-teal-500";
    return "from-violet-400 to-purple-500";
  }

  function getNumberEmoji(num: number): string {
    if (num <= 2) return "😔";
    if (num <= 4) return "😐";
    if (num <= 6) return "🙂";
    if (num <= 8) return "😊";
    return "🤩";
  }

  return (
    <div
      className={
        isDark
          ? "relative flex min-h-screen flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50"
          : "relative flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900"
      }
    >
      {/* Header */}
      <header
        className={
          isDark
            ? "flex items-center justify-between gap-4 border-b border-slate-800 bg-slate-950/70 px-4 py-4"
            : "flex items-center justify-between gap-4 border-b border-slate-200 bg-white/80 px-4 py-4 shadow-sm"
        }
      >
        <button
          type="button"
          onClick={withHaptics(() => router.back())}
          className={isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-800"}
        >
          ← Back
        </button>
        <h1 className="text-lg font-semibold">Check In</h1>
        <div className="w-12" />
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        <AnimatePresence mode="wait">
          {/* Step 1: Number Selection */}
          {step === "number" && (
            <motion.div
              key="number"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-md text-center"
            >
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={isDark ? "text-2xl font-medium text-slate-200 mb-2" : "text-2xl font-medium text-slate-700 mb-2"}
              >
                How are you feeling?
              </motion.p>
              <p className={isDark ? "text-sm text-slate-500 mb-8" : "text-sm text-slate-400 mb-8"}>
                1 = struggling &nbsp;•&nbsp; 10 = thriving
              </p>

              <div className="grid grid-cols-5 gap-3 mb-8">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                  <motion.button
                    key={num}
                    type="button"
                    onClick={withHaptics(() => handleNumberSelect(num))}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    className={`h-14 w-14 rounded-2xl text-xl font-bold text-white shadow-lg transition-all ${
                      selectedNumber === num
                        ? `bg-gradient-to-br ${getNumberColor(num)} ring-4 ring-white/30`
                        : isDark
                        ? "bg-slate-800 hover:bg-slate-700"
                        : "bg-slate-200 text-slate-800 hover:bg-slate-300"
                    }`}
                  >
                    {num}
                  </motion.button>
                ))}
              </div>

              {selectedNumber && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-6xl mb-4"
                >
                  {getNumberEmoji(selectedNumber)}
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Step 2: Optional Message */}
          {step === "message" && (
            <motion.div
              key="message"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-md text-center"
            >
              <div className="mb-6">
                <span className={`inline-block px-4 py-2 rounded-full text-2xl font-bold text-white bg-gradient-to-br ${getNumberColor(selectedNumber || 5)}`}>
                  {selectedNumber} {getNumberEmoji(selectedNumber || 5)}
                </span>
              </div>

              <p className={isDark ? "text-xl font-medium text-slate-200 mb-2" : "text-xl font-medium text-slate-700 mb-2"}>
                What&apos;s going on?
              </p>
              <p className={isDark ? "text-sm text-slate-500 mb-6" : "text-sm text-slate-400 mb-6"}>
                Optional - share as much or as little as you want
              </p>

              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="I'm feeling this way because..."
                className={
                  isDark
                    ? "w-full min-h-[120px] rounded-2xl bg-slate-800 border border-slate-700 px-4 py-3 text-white placeholder:text-slate-500 outline-none focus:border-rose-400 resize-none"
                    : "w-full min-h-[120px] rounded-2xl bg-white border border-slate-200 px-4 py-3 text-slate-800 placeholder:text-slate-400 outline-none focus:border-rose-500 resize-none shadow-sm"
                }
              />

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={withHaptics(() => setStep("number"))}
                  className={isDark ? "flex-1 rounded-xl bg-slate-800 px-4 py-3 font-medium text-slate-300 hover:bg-slate-700" : "flex-1 rounded-xl bg-slate-100 px-4 py-3 font-medium text-slate-600 hover:bg-slate-200"}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={withHaptics(handleMessageNext)}
                  className="flex-1 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 px-4 py-3 font-bold text-white shadow-lg"
                >
                  Next →
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 3: Group Selection */}
          {step === "groups" && !sent && (
            <motion.div
              key="groups"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-md"
            >
              <div className="text-center mb-6">
                <span className={`inline-block px-4 py-2 rounded-full text-2xl font-bold text-white bg-gradient-to-br ${getNumberColor(selectedNumber || 5)}`}>
                  {selectedNumber} {getNumberEmoji(selectedNumber || 5)}
                </span>
                {message && (
                  <p className={isDark ? "mt-3 text-sm text-slate-400 italic" : "mt-3 text-sm text-slate-500 italic"}>
                    &quot;{message.slice(0, 50)}{message.length > 50 ? "..." : ""}&quot;
                  </p>
                )}
              </div>

              <p className={isDark ? "text-xl font-medium text-slate-200 mb-2 text-center" : "text-xl font-medium text-slate-700 mb-2 text-center"}>
                Share with...
              </p>

              {/* Select All */}
              <button
                type="button"
                onClick={withHaptics(toggleAllGroups)}
                className={
                  isDark
                    ? "w-full mb-4 rounded-xl bg-slate-800 border border-slate-700 px-4 py-3 text-left flex items-center justify-between"
                    : "w-full mb-4 rounded-xl bg-white border border-slate-200 px-4 py-3 text-left flex items-center justify-between shadow-sm"
                }
              >
                <span className={isDark ? "font-medium text-slate-200" : "font-medium text-slate-700"}>
                  All Groups
                </span>
                <span className={selectedGroups.size === groups.length ? "text-rose-500 text-xl" : "text-slate-500 text-xl"}>
                  {selectedGroups.size === groups.length ? "✓" : "○"}
                </span>
              </button>

              {/* Group List */}
              <div className="space-y-2 max-h-[40vh] overflow-y-auto mb-6">
                {groups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={withHaptics(() => toggleGroup(group.id))}
                    className={
                      isDark
                        ? "w-full rounded-xl bg-slate-800/50 border border-slate-700 px-4 py-3 text-left flex items-center gap-3"
                        : "w-full rounded-xl bg-white border border-slate-200 px-4 py-3 text-left flex items-center gap-3 shadow-sm"
                    }
                  >
                    <div className={isDark ? "h-10 w-10 rounded-full bg-slate-700 overflow-hidden flex items-center justify-center" : "h-10 w-10 rounded-full bg-slate-100 overflow-hidden flex items-center justify-center"}>
                      {group.image_url ? (
                        <img src={group.image_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-sm font-bold">
                          {group.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <span className={isDark ? "flex-1 font-medium text-slate-200" : "flex-1 font-medium text-slate-700"}>
                      {group.name}
                    </span>
                    <span className={selectedGroups.has(group.id) ? "text-rose-500 text-xl" : "text-slate-500 text-xl"}>
                      {selectedGroups.has(group.id) ? "✓" : "○"}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={withHaptics(() => setStep("message"))}
                  className={isDark ? "flex-1 rounded-xl bg-slate-800 px-4 py-3 font-medium text-slate-300 hover:bg-slate-700" : "flex-1 rounded-xl bg-slate-100 px-4 py-3 font-medium text-slate-600 hover:bg-slate-200"}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={withHaptics(handleShare)}
                  disabled={selectedGroups.size === 0 || sending}
                  className="flex-1 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 px-4 py-3 font-bold text-white shadow-lg disabled:opacity-50"
                >
                  {sending ? "Sharing..." : `Share 💜`}
                </button>
              </div>
            </motion.div>
          )}

          {/* Success State */}
          {sent && (
            <motion.div
              key="sent"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 0.5, repeat: 2 }}
                className="text-8xl mb-6"
              >
                💜
              </motion.div>
              <p className={isDark ? "text-2xl font-bold text-white mb-2" : "text-2xl font-bold text-slate-800 mb-2"}>
                Check-in shared!
              </p>
              <p className={isDark ? "text-slate-400" : "text-slate-500"}>
                Your people can see how you&apos;re doing
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
