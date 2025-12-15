"use client";

import { Suspense, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { uploadImage } from "@/lib/uploadImage";
import { withHaptics } from "@/lib/haptics";

type MyCheckin = {
  id: string;
  number: number;
  message: string | null;
  is_private: boolean;
  created_at: string;
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
  const [theme] = useState<"dark" | "light" | "warm">("dark");
  const [myCheckins, setMyCheckins] = useState<MyCheckin[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [notificationsMuted, setNotificationsMuted] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [showPastCheckins, setShowPastCheckins] = useState(false);

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


      // Load user's check-ins (all of them, including private)
      const { data: checkins } = await supabase
        .from("checkins")
        .select("id, number, message, is_private, created_at")
        .eq("user_id", currentUserId)
        .order("created_at", { ascending: false })
        .limit(30);

      if (checkins) {
        setMyCheckins(checkins);
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

    try {
      // Call API to delete all user data and auth user
      const response = await fetch("/api/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      const data = await response.json();
      console.log("Delete response:", data);
      
      if (!response.ok) {
        throw new Error(data.message || "Failed to delete account");
      }

      // Clear all localStorage
      if (typeof window !== "undefined") {
        window.localStorage.clear();
      }

      // Sign out locally
      await supabase.auth.signOut();
      
      // Force hard redirect to clear any cached state
      window.location.href = "/";
    } catch (error) {
      console.error("Error deleting profile:", error);
      alert("Failed to delete profile. Please try again.");
      setDeleting(false);
    }
  }

  const isDark = theme === "dark";
  const isWarm = theme === "warm";

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
    ? "relative min-h-screen bg-black text-slate-50 overflow-hidden"
    : theme === "warm"
    ? "relative min-h-screen bg-[#FCEADE] text-stone-800 overflow-hidden"
    : "relative min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900 overflow-hidden";

  return (
    <div className={bgClass}>
      <div className="relative z-10 mx-auto max-w-md px-4 py-6">
        {/* Floating Back Button */}
        <motion.button
          type="button"
          onClick={withHaptics(() => router.push("/groups"))}
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          whileTap={{ scale: 0.95 }}
          className={isDark 
            ? "fixed top-4 left-4 z-30 h-10 w-10 rounded-full bg-white/10 text-white/80 flex items-center justify-center hover:bg-white/20"
            : "fixed top-4 left-4 z-30 h-10 w-10 rounded-full bg-stone-200 text-stone-600 flex items-center justify-center hover:bg-stone-300"}
        >
          ←
        </motion.button>

        {/* Header */}
        <header className="mb-8 flex items-center justify-center">
          <h1 className="text-3xl font-bold">Profile</h1>
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
            className={isDark ? "group relative h-40 w-40 overflow-hidden rounded-full border-4 border-slate-700 bg-slate-900 hover:border-emerald-400 ring-4 ring-emerald-500/30" : "group relative h-40 w-40 overflow-hidden rounded-full border-4 border-slate-300 bg-white hover:border-emerald-500 shadow-xl ring-4 ring-emerald-500/20"}
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
                  <span className="text-xl text-white">Change</span>
                </div>
              </>
            ) : (
              <div className="flex h-full w-full items-center justify-center text-5xl text-slate-500">
                +
              </div>
            )}
          </button>
          <p className={isDark ? "mt-3 text-lg text-slate-400" : "mt-3 text-lg text-slate-500"}>Tap to change photo</p>
        </div>

        {/* Name */}
        <div className={isDark ? "mb-6 rounded-2xl border-2 border-slate-800 bg-slate-900/60 p-6" : "mb-6 rounded-2xl border-2 border-slate-200 bg-white p-6 shadow-sm"}>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className={isDark ? "text-lg text-slate-400 mb-1" : "text-lg text-slate-500 mb-1"}>Name</p>
              {editingName ? (
                <form onSubmit={handleSave} className="mt-2 flex gap-3">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className={isDark ? "flex-1 rounded-xl border-2 border-slate-700 bg-slate-800 px-4 py-3 text-2xl text-slate-50 outline-none focus:border-emerald-400" : "flex-1 rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-2xl text-slate-800 outline-none focus:border-emerald-500"}
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-emerald-500 px-6 py-3 text-xl font-bold text-white"
                  >
                    {saving ? "..." : "Save"}
                  </button>
                </form>
              ) : (
                <p className={isDark ? "text-2xl font-semibold text-slate-100" : "text-2xl font-semibold text-slate-800"}>
                  {displayName || "Add your name"}
                </p>
              )}
            </div>
            {!editingName && (
              <button
                type="button"
                onClick={withHaptics(() => setEditingName(true))}
                className="text-xl text-emerald-400 hover:text-emerald-300 px-4 py-2"
              >
                Edit
              </button>
            )}
          </div>
        </div>

        {/* Phone */}
        <div className={isDark ? "mb-8 rounded-2xl border-2 border-slate-800 bg-slate-900/60 p-6" : "mb-8 rounded-2xl border-2 border-slate-200 bg-white p-6 shadow-sm"}>
          <p className={isDark ? "text-lg text-slate-400 mb-1" : "text-lg text-slate-500 mb-1"}>Phone</p>
          <p className={isDark ? "text-2xl text-slate-300" : "text-2xl text-slate-700"}>{phone || "Not set"}</p>
        </div>

        {/* Settings */}
        <div className="mb-8 space-y-4">
          {/* Master Notifications Toggle */}
          <div className={isDark ? "flex w-full items-center justify-between rounded-2xl border-2 border-slate-800 bg-slate-900/60 p-6" : "flex w-full items-center justify-between rounded-2xl border-2 border-slate-200 bg-white p-6 shadow-sm"}>
            <div className="flex items-center gap-4">
              <div>
                <span className={isDark ? "text-xl text-slate-200" : "text-xl text-slate-700"}>
                  {notificationsMuted ? "Notifications muted" : "Notifications on"}
                </span>
                <p className="text-lg text-slate-500">
                  {notificationsMuted ? "You won't receive any SMS" : "For all groups"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={withHaptics(handleToggleMuteNotifications)}
              disabled={savingNotifications}
              className={`relative h-10 w-18 rounded-full transition ${
                !notificationsMuted ? "bg-emerald-500" : "bg-slate-700"
              }`}
              style={{width: '72px'}}
            >
              <span
                className={`absolute top-1.5 h-7 w-7 rounded-full bg-white shadow transition ${
                  !notificationsMuted ? "left-9" : "left-1.5"
                }`}
              />
            </button>
          </div>

          {/* Send Feedback */}
          <button
            type="button"
            onClick={withHaptics(() => setShowFeedbackModal(true))}
            className={isDark ? "flex w-full items-center gap-4 rounded-2xl border-2 border-slate-800 bg-slate-900/60 p-6 hover:border-slate-700" : "flex w-full items-center gap-4 rounded-2xl border-2 border-slate-200 bg-white p-6 hover:border-slate-300 shadow-sm"}
          >
            <span className={isDark ? "text-xl text-slate-200" : "text-xl text-slate-700"}>Send feedback</span>
          </button>

          {/* Logout */}
          <button
            type="button"
            onClick={withHaptics(handleLogout)}
            className={isDark ? "flex w-full items-center gap-4 rounded-2xl border-2 border-slate-800 bg-slate-900/60 p-6 hover:border-slate-700" : "flex w-full items-center gap-4 rounded-2xl border-2 border-slate-200 bg-white p-6 hover:border-slate-300 shadow-sm"}
          >
            <span className={isDark ? "text-xl text-slate-200" : "text-xl text-slate-700"}>Log out</span>
          </button>

          {/* Delete Profile */}
          <button
            type="button"
            disabled={deleting}
            onClick={withHaptics(handleDeleteProfile)}
            className="flex w-full items-center gap-4 rounded-2xl border-2 border-rose-900/50 bg-slate-900/60 p-6 hover:border-rose-700 disabled:opacity-50"
          >
            <span className="text-xl text-rose-400">
              {deleting ? "Deleting..." : "Delete profile"}
            </span>
          </button>
        </div>

        {/* My Check-ins History - Toggle Button */}
        {myCheckins.length > 0 && (
          <div className="mb-8">
            <button
              type="button"
              onClick={() => setShowPastCheckins(!showPastCheckins)}
              className={`w-full py-4 rounded-2xl text-xl font-bold flex items-center justify-center gap-2 transition ${
                isDark 
                  ? "bg-slate-800 text-slate-300 hover:bg-slate-700" 
                  : isWarm 
                  ? "bg-orange-100 text-stone-700 hover:bg-orange-200" 
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {showPastCheckins ? "Hide" : "View"} Past Check-ins ({myCheckins.length})
            </button>
            
            {showPastCheckins && (
              <div className="space-y-4 mt-4">
                {myCheckins.map((c) => (
                  <div
                    key={c.id}
                    className={isDark ? "rounded-2xl border-2 border-slate-800 bg-slate-900/60 p-5" : isWarm ? "rounded-2xl border-2 border-orange-200 bg-white p-5 shadow-sm" : "rounded-2xl border-2 border-slate-200 bg-white p-5 shadow-sm"}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      {c.is_private && <span className="text-base px-3 py-1 rounded-full bg-violet-500/20 text-violet-400">Private</span>}
                      <span className={`text-lg ${isDark ? "text-slate-500" : "text-stone-400"}`}>
                        {new Date(c.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className={`text-2xl ${isDark ? "text-slate-100" : "text-stone-800"}`}>
                      I&apos;m at a {c.number}.{c.message ? ` ${c.message}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
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
                  <p className={isDark ? "text-xl font-bold text-white" : "text-xl font-bold text-slate-800"}>Thanks for your feedback!</p>
                  <p className={isDark ? "text-sm text-slate-400 mt-2" : "text-sm text-slate-500 mt-2"}>We really appreciate it.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className={isDark ? "text-lg font-bold text-white" : "text-lg font-bold text-slate-800"}>Send Feedback</h3>
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
