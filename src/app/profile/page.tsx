"use client";

import { Suspense, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { uploadImage } from "@/lib/uploadImage";
import { withHaptics } from "@/lib/haptics";
import FloatingEmojis from "@/components/FloatingEmojis";

type AnsweredQuestion = {
  id: string;
  question_text: string;
  answer_text: string;
  group_name: string;
  answered_at: string;
};

function ProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectAfter = searchParams.get("then") || "/groups";
  const [userId, setUserId] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light" | "warm">("warm");
  const [answeredQuestions, setAnsweredQuestions] = useState<AnsweredQuestion[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [notificationsMuted, setNotificationsMuted] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      const { data } = await supabase.auth.getUser();
      const currentUserId = data.user?.id ?? null;
      const userPhone = data.user?.phone ?? null;
      if (!currentUserId) {
        router.replace("/");
        return;
      }
      setUserId(currentUserId);
      setPhone(userPhone);

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, avatar_url, notifications_muted")
        .eq("id", currentUserId)
        .maybeSingle();

      if (profile) {
        setDisplayName(profile.display_name ?? "");
        setAvatarUrl(profile.avatar_url ?? "");
        setNotificationsMuted(profile.notifications_muted ?? false);
      }

      // Load theme from localStorage
      if (typeof window !== "undefined") {
        const stored = window.localStorage.getItem("theme");
        if (stored === "light" || stored === "dark" || stored === "warm") {
          setTheme(stored);
        }
      }

      // Load answered questions across all groups
      const { data: answers } = await supabase
        .from("answers")
        .select(`
          id,
          answer_text,
          created_at,
          daily_questions!inner(question_text, group_id)
        `)
        .eq("user_id", currentUserId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (answers && answers.length > 0) {
        // Get group names
        const groupIds = [...new Set(answers.map((a: any) => a.daily_questions?.group_id).filter(Boolean))];
        const { data: groups } = await supabase
          .from("groups")
          .select("id, name")
          .in("id", groupIds);

        const groupMap: Record<string, string> = {};
        for (const g of groups || []) {
          groupMap[g.id] = g.name;
        }

        const formatted: AnsweredQuestion[] = answers.map((a: any) => ({
          id: a.id,
          question_text: a.daily_questions?.question_text || "",
          answer_text: a.answer_text,
          group_name: groupMap[a.daily_questions?.group_id] || "Unknown",
          answered_at: a.created_at,
        }));

        setAnsweredQuestions(formatted);
      }

      setLoading(false);
    }

    void loadProfile();
  }, [router]);

  async function handleToggleMuteNotifications() {
    if (!userId) return;
    setSavingNotifications(true);
    const newValue = !notificationsMuted;
    setNotificationsMuted(newValue);

    await supabase
      .from("profiles")
      .update({ notifications_muted: newValue })
      .eq("id", userId);

    setSavingNotifications(false);
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!userId) return;
    setSaving(true);
    setError(null);

    let avatarUrlToSave = avatarUrl;
    if (avatarFile && userId) {
      const uploaded = await uploadImage("avatars", avatarFile, userId);
      if (uploaded) avatarUrlToSave = uploaded;
    }

    const payload = {
      id: userId,
      display_name: displayName || null,
      avatar_url: avatarUrlToSave || null,
    };

    const { error: upsertError } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "id" });

    if (upsertError) {
      setError(upsertError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setShowSavedToast(true);
    setEditingName(false);
    setTimeout(() => {
      setShowSavedToast(false);
    }, 1200);
  }

  function toggleTheme() {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : prev === "light" ? "warm" : "dark";
      if (typeof window !== "undefined") {
        window.localStorage.setItem("theme", next);
      }
      return next;
    });
  }

  async function handleSendFeedback() {
    if (!feedbackText.trim()) return;
    setSendingFeedback(true);
    try {
      const response = await fetch("/api/send-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedback: feedbackText,
          userName: displayName || "Anonymous",
          userPhone: phone || "Unknown",
        }),
      });
      if (response.ok) {
        setFeedbackSent(true);
        setFeedbackText("");
        setTimeout(() => {
          setShowFeedbackModal(false);
          setFeedbackSent(false);
        }, 2000);
      }
    } catch (err) {
      console.error("Failed to send feedback:", err);
    }
    setSendingFeedback(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  async function handleDeleteProfile() {
    if (!userId) return;
    const confirmed = window.confirm(
      "Delete your profile and all your data? This cannot be undone."
    );
    if (!confirmed) return;

    setDeleting(true);

    // Delete all user's answers
    await supabase.from("answers").delete().eq("user_id", userId);

    // Delete all user's messages
    await supabase.from("messages").delete().eq("user_id", userId);

    // Delete profile
    await supabase.from("profiles").delete().eq("id", userId);

    // Delete memberships
    await supabase.from("group_memberships").delete().eq("user_id", userId);

    // Sign out
    await supabase.auth.signOut();
    router.replace("/");
  }

  const isDark = theme === "dark";

  if (loading) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-violet-950 via-slate-900 to-emerald-900 text-slate-50 overflow-hidden">
        <div className="absolute top-20 left-10 text-5xl opacity-20 animate-bounce">✨</div>
        <div className="absolute bottom-32 right-10 text-5xl opacity-20 animate-pulse">🎉</div>
        <div className="animate-spin text-6xl mb-4">🦦</div>
        <p className="text-lg text-slate-300">one sec, getting your stuff...</p>
      </div>
    );
  }

  const bgClass = isDark 
    ? "relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50 overflow-hidden"
    : theme === "warm"
    ? "relative min-h-screen bg-[#FCEADE] text-stone-800 overflow-hidden"
    : "relative min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900 overflow-hidden";

  return (
    <div className={bgClass}>
      <FloatingEmojis count={5} />
      <div className="relative z-10 mx-auto max-w-md px-4 py-6">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={withHaptics(() => router.push("/groups"))}
            className={isDark ? "rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1 text-xs text-slate-300 hover:border-emerald-400 hover:text-emerald-300" : "rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-600 hover:border-emerald-500 hover:text-emerald-600 shadow-sm"}
          >
            ← Back
          </button>
        </header>

        {/* Profile Photo - Clickable to update */}
        <div className="mb-6 flex flex-col items-center">
          <input
            id="avatar-file-input"
            type="file"
            accept="image/*"
            onChange={async (event) => {
              const file = event.target.files?.[0] ?? null;
              if (file && userId) {
                setAvatarFile(file);
                const url = URL.createObjectURL(file);
                setAvatarPreview(url);
                // Auto-save avatar
                const uploaded = await uploadImage("avatars", file, userId);
                if (uploaded) {
                  await supabase
                    .from("profiles")
                    .upsert({ id: userId, avatar_url: uploaded }, { onConflict: "id" });
                  setAvatarUrl(uploaded);
                  setShowSavedToast(true);
                  setTimeout(() => setShowSavedToast(false), 1200);
                }
              }
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={withHaptics(() => {
              const input = document.getElementById("avatar-file-input") as HTMLInputElement | null;
              input?.click();
            })}
            className={isDark ? "group relative h-28 w-28 overflow-hidden rounded-full border-2 border-slate-700 bg-slate-900 hover:border-emerald-400" : "group relative h-28 w-28 overflow-hidden rounded-full border-2 border-slate-300 bg-white hover:border-emerald-500 shadow-lg"}
          >
            {avatarPreview || avatarUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatarPreview ?? avatarUrl}
                  alt="Profile"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition group-hover:opacity-100">
                  <span className="text-xs text-white">Change</span>
                </div>
              </>
            ) : (
              <div className="flex h-full w-full items-center justify-center text-3xl text-slate-500">
                +
              </div>
            )}
          </button>
          <p className={isDark ? "mt-2 text-xs text-slate-500" : "mt-2 text-xs text-slate-500"}>Tap to change photo</p>
        </div>

        {/* Name */}
        <div className={isDark ? "mb-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4" : "mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"}>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className={isDark ? "text-xs text-slate-500" : "text-xs text-slate-500"}>Name</p>
              {editingName ? (
                <form onSubmit={handleSave} className="mt-1 flex gap-2">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className={isDark ? "flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-50 outline-none focus:border-emerald-400" : "flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 outline-none focus:border-emerald-500"}
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-emerald-400 px-3 py-1 text-xs font-medium text-slate-950"
                  >
                    {saving ? "..." : "Save"}
                  </button>
                </form>
              ) : (
                <p className={isDark ? "text-base font-medium text-slate-100" : "text-base font-medium text-slate-800"}>
                  {displayName || "Add your name"}
                </p>
              )}
            </div>
            {!editingName && (
              <button
                type="button"
                onClick={withHaptics(() => setEditingName(true))}
                className="text-xs text-emerald-400 hover:text-emerald-300"
              >
                Edit
              </button>
            )}
          </div>
        </div>

        {/* Phone */}
        <div className={isDark ? "mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4" : "mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"}>
          <p className={isDark ? "text-xs text-slate-500" : "text-xs text-slate-500"}>Phone</p>
          <p className={isDark ? "text-base text-slate-300" : "text-base text-slate-700"}>{phone || "Not set"}</p>
        </div>

        {/* Settings */}
        <div className="mb-6 space-y-2">
          {/* Master Notifications Toggle */}
          <div className={isDark ? "flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-4" : "flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm"}>
            <div className="flex items-center gap-3">
              <span className="text-lg">{notificationsMuted ? "🔕" : "🔔"}</span>
              <div>
                <span className={isDark ? "text-sm text-slate-200" : "text-sm text-slate-700"}>
                  {notificationsMuted ? "Notifications muted" : "Notifications on"}
                </span>
                <p className="text-xs text-slate-500">
                  {notificationsMuted ? "You won't receive any SMS" : "For all groups"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={withHaptics(handleToggleMuteNotifications)}
              disabled={savingNotifications}
              className={`relative h-7 w-12 rounded-full transition ${
                !notificationsMuted ? "bg-emerald-500" : "bg-slate-700"
              }`}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
                  !notificationsMuted ? "left-6" : "left-1"
                }`}
              />
            </button>
          </div>

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={withHaptics(toggleTheme)}
            className={
              theme === "dark" 
                ? "flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-4 hover:border-slate-700" 
                : theme === "warm"
                ? "flex w-full items-center justify-between rounded-xl border border-stone-300 bg-stone-50 p-4 hover:border-stone-400"
                : "flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300 shadow-sm"
            }
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">{theme === "dark" ? "🌙" : theme === "warm" ? "🪷" : "☀️"}</span>
              <span className={theme === "dark" ? "text-sm text-slate-200" : "text-sm text-stone-700"}>
                {theme === "dark" ? "Dark mode" : theme === "warm" ? "Warm mode" : "Light mode"}
              </span>
            </div>
            <span className="text-xs text-slate-500">Tap to switch</span>
          </button>

          {/* Send Feedback */}
          <button
            type="button"
            onClick={withHaptics(() => setShowFeedbackModal(true))}
            className={isDark ? "flex w-full items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 hover:border-slate-700" : "flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300 shadow-sm"}
          >
            <span className="text-lg">💬</span>
            <span className={isDark ? "text-sm text-slate-200" : "text-sm text-slate-700"}>Send feedback or report bugs</span>
          </button>

          {/* Logout */}
          <button
            type="button"
            onClick={withHaptics(handleLogout)}
            className={isDark ? "flex w-full items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 hover:border-slate-700" : "flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300 shadow-sm"}
          >
            <span className="text-lg">👋</span>
            <span className={isDark ? "text-sm text-slate-200" : "text-sm text-slate-700"}>Log out</span>
          </button>

          {/* Delete Profile */}
          <button
            type="button"
            disabled={deleting}
            onClick={withHaptics(handleDeleteProfile)}
            className="flex w-full items-center gap-3 rounded-xl border border-rose-900/50 bg-slate-900/60 p-4 hover:border-rose-700 disabled:opacity-50"
          >
            <span className="text-lg">🗑️</span>
            <span className="text-sm text-rose-400">
              {deleting ? "Deleting..." : "Delete profile"}
            </span>
          </button>
        </div>

        {/* Answered Questions History */}
        {answeredQuestions.length > 0 && (
          <div className="mb-6">
            <h2 className="mb-3 text-sm font-medium text-slate-300">Your answers</h2>
            <div className="space-y-3">
              {answeredQuestions.map((q) => (
                <div
                  key={q.id}
                  className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"
                >
                  <p className="mb-1 text-xs text-emerald-400">{q.group_name}</p>
                  <p className="mb-2 text-sm text-slate-300">{q.question_text}</p>
                  <p className="text-sm text-slate-100">{q.answer_text}</p>
                  <p className="mt-2 text-xs text-slate-600">
                    {new Date(q.answered_at).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-rose-400">{error}</p>}
      </div>

      <AnimatePresence>
        {showSavedToast && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="fixed inset-x-0 bottom-4 flex justify-center"
          >
            <div className="rounded-full bg-emerald-500/90 px-4 py-2 text-xs font-medium text-slate-950 shadow-lg shadow-emerald-900/60">
              Saved ✨
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Feedback Modal */}
      <AnimatePresence>
        {showFeedbackModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => !sendingFeedback && setShowFeedbackModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className={isDark ? "w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 p-6 shadow-2xl" : "w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 shadow-2xl"}
            >
              {feedbackSent ? (
                <div className="text-center py-8">
                  <div className="text-6xl mb-4">🎉</div>
                  <p className={isDark ? "text-xl font-bold text-white" : "text-xl font-bold text-slate-800"}>Thanks for your feedback!</p>
                  <p className={isDark ? "text-sm text-slate-400 mt-2" : "text-sm text-slate-500 mt-2"}>We really appreciate it 💜</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className={isDark ? "text-lg font-bold text-white" : "text-lg font-bold text-slate-800"}>💬 Send Feedback</h3>
                    <button
                      type="button"
                      onClick={() => setShowFeedbackModal(false)}
                      className={isDark ? "text-slate-400 hover:text-white text-xl" : "text-slate-400 hover:text-slate-800 text-xl"}
                    >
                      ✕
                    </button>
                  </div>
                  <p className={isDark ? "text-sm text-slate-400 mb-4" : "text-sm text-slate-500 mb-4"}>
                    Got ideas, bugs, or just want to say hi? We&apos;d love to hear from you!
                  </p>
                  <textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="What's on your mind? 🦦"
                    className={isDark ? "w-full min-h-[150px] rounded-xl bg-slate-800 border border-slate-700 px-4 py-3 text-white placeholder:text-slate-500 outline-none focus:border-emerald-400" : "w-full min-h-[150px] rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-slate-800 placeholder:text-slate-400 outline-none focus:border-emerald-500"}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={withHaptics(handleSendFeedback)}
                    disabled={!feedbackText.trim() || sendingFeedback}
                    className="w-full mt-4 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-black hover:bg-emerald-400 transition disabled:opacity-50"
                  >
                    {sendingFeedback ? "Sending... 🚀" : "Send Feedback 💜"}
                  </button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-violet-950 via-slate-900 to-emerald-900 text-slate-50 overflow-hidden">
          <div className="absolute top-20 left-10 text-5xl opacity-20 animate-bounce">✨</div>
          <div className="absolute bottom-32 right-10 text-5xl opacity-20 animate-pulse">🎉</div>
          <div className="animate-spin text-6xl mb-4">🦦</div>
          <p className="text-lg text-slate-300">one sec, getting your stuff...</p>
        </div>
      }
    >
      <ProfileContent />
    </Suspense>
  );
}
