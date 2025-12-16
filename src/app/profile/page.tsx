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
  const [dailySmsEnabled, setDailySmsEnabled] = useState(true);
  const [savingDailySms, setSavingDailySms] = useState(false);
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
        .select("display_name, avatar_url, notifications_muted, daily_sms_enabled")
        .eq("id", currentUserId)
        .maybeSingle();

      if (profile) {
        setDisplayName(profile.display_name ?? "");
        setAvatarUrl(profile.avatar_url ?? "");
        setNotificationsMuted(profile.notifications_muted ?? false);
        setDailySmsEnabled(profile.daily_sms_enabled ?? true);
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

    if (newValue) {
      setDailySmsEnabled(false);
      await supabase
        .from("profiles")
        .update({ notifications_muted: true, daily_sms_enabled: false })
        .eq("id", userId);
    } else {
      await supabase
        .from("profiles")
        .update({ notifications_muted: false })
        .eq("id", userId);
    }

    setSavingNotifications(false);
  }

  async function handleToggleDailySms() {
    if (!userId) return;
    setSavingDailySms(true);
    const next = !dailySmsEnabled;
    setDailySmsEnabled(next);
    if (next) setNotificationsMuted(false);

    await supabase
      .from("profiles")
      .update({ daily_sms_enabled: next, ...(next ? { notifications_muted: false } : {}) })
      .eq("id", userId);

    setSavingDailySms(false);
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
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <p className="text-xl text-[#a8a6a3]">Loading...</p>
      </div>
    );
  }

  const bgClass = "relative min-h-screen bg-[#0a0a0a] text-[#e8e6e3] overflow-hidden";

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
          className="fixed top-4 left-4 z-30 h-10 w-10 rounded-full bg-[#1a1a1a] text-[#a8a6a3] flex items-center justify-center hover:bg-[#2a2a2a] transition-colors"
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
            className="group relative h-40 w-40 overflow-hidden rounded-full border-2 border-[#2a2a2a] bg-[#1a1a1a] hover:border-[#3a3a3a]"
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
          <p className="mt-3 text-lg text-[#666]">Tap to change photo</p>
        </div>

        {/* Name */}
        <div className="mb-6 rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-6">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-lg text-[#666] mb-1">Name</p>
              {editingName ? (
                <form onSubmit={handleSave} className="mt-2 flex gap-3">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="flex-1 rounded-xl border-2 border-[#2a2a2a] bg-[#0a0a0a] px-4 py-3 text-2xl text-[#e8e6e3] outline-none focus:border-[#888]"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-[#e8e6e3] px-6 py-3 text-xl font-bold text-[#1a1a1a]"
                  >
                    {saving ? "..." : "Save"}
                  </button>
                </form>
              ) : (
                <p className="text-2xl font-semibold text-[#e8e6e3]">
                  {displayName || "Add your name"}
                </p>
              )}
            </div>
            {!editingName && (
              <button
                type="button"
                onClick={withHaptics(() => setEditingName(true))}
                className="text-xl text-[#a8a6a3] hover:text-[#e8e6e3] px-4 py-2"
              >
                Edit
              </button>
            )}
          </div>
        </div>

        {/* Phone */}
        <div className="mb-8 rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-6">
          <p className="text-lg text-[#666] mb-1">Phone</p>
          <p className="text-2xl text-[#a8a6a3]">{phone || "Not set"}</p>
        </div>

        {/* Settings */}
        <div className="mb-8 space-y-4">
          {/* Master Notifications Toggle */}
          <div className="flex w-full items-center justify-between rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-6">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-xl text-[#e8e6e3]">
                  {notificationsMuted ? "Notifications muted" : "Notifications on"}
                </span>
                <p className="text-lg text-[#666]">
                  {notificationsMuted ? "You won't receive any SMS" : "For all groups"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={withHaptics(handleToggleMuteNotifications)}
              disabled={savingNotifications}
              className={`relative h-10 w-18 rounded-full transition ${
                !notificationsMuted ? "bg-[#e8e6e3]" : "bg-[#2a2a2a]"
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

          <div className="flex w-full items-center justify-between rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-6">
            <div>
              <span className="text-xl text-[#e8e6e3]">Daily SMS reminder</span>
              <p className="text-lg text-[#666]">A daily nudge to check in</p>
            </div>
            <button
              type="button"
              onClick={withHaptics(handleToggleDailySms)}
              disabled={savingDailySms || notificationsMuted}
              className={`relative h-10 w-18 rounded-full transition ${
                dailySmsEnabled && !notificationsMuted ? "bg-[#e8e6e3]" : "bg-[#2a2a2a]"
              }`}
              style={{width: '72px'}}
            >
              <span
                className={`absolute top-1.5 h-7 w-7 rounded-full bg-white shadow transition ${
                  dailySmsEnabled && !notificationsMuted ? "left-9" : "left-1.5"
                }`}
              />
            </button>
          </div>

          {/* Send Feedback */}
          <button
            type="button"
            onClick={withHaptics(() => setShowFeedbackModal(true))}
            className="flex w-full items-center gap-4 rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-6 hover:border-[#3a3a3a]"
          >
            <span className="text-xl text-[#e8e6e3]">Send feedback</span>
          </button>

          {/* Logout */}
          <button
            type="button"
            onClick={withHaptics(handleLogout)}
            className="flex w-full items-center gap-4 rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-6 hover:border-[#3a3a3a]"
          >
            <span className="text-xl text-[#e8e6e3]">Log out</span>
          </button>

          {/* Delete Profile */}
          <button
            type="button"
            disabled={deleting}
            onClick={withHaptics(handleDeleteProfile)}
            className="flex w-full items-center gap-4 rounded-2xl border border-[#3a2a2a] bg-[#1a1a1a] p-6 hover:border-[#4a3a3a] disabled:opacity-50"
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
              className="w-full py-4 rounded-2xl text-xl font-bold flex items-center justify-center gap-2 transition bg-[#1a1a1a] text-[#a8a6a3] hover:bg-[#2a2a2a] border border-[#2a2a2a]"
            >
              {showPastCheckins ? "Hide" : "View"} Past Check-ins ({myCheckins.length})
            </button>
            
            {showPastCheckins && (
              <div className="space-y-4 mt-4">
                {myCheckins.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-5"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      {c.is_private && <span className="text-base px-3 py-1 rounded-full bg-violet-500/20 text-violet-400">Private</span>}
                      <span className="text-lg text-[#666]">
                        {new Date(c.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-2xl text-[#e8e6e3]">
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
            <div className="rounded-full bg-[#e8e6e3] px-4 py-2 text-xs font-medium text-[#1a1a1a] shadow-lg">
              Saved
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
              className="w-full max-w-md rounded-2xl bg-[#1a1a1a] border border-[#2a2a2a] p-6 shadow-2xl"
            >
              {feedbackSent ? (
                <div className="text-center py-8">
                  <p className="text-xl font-bold text-[#e8e6e3]">Thanks for your feedback!</p>
                  <p className="text-sm text-[#666] mt-2">We really appreciate it.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-[#e8e6e3]">Send Feedback</h3>
                    <button
                      type="button"
                      onClick={() => setShowFeedbackModal(false)}
                      className="text-[#666] hover:text-[#e8e6e3] text-xl"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="text-sm text-[#666] mb-4">
                    Got ideas, bugs, or just want to say hi? We&apos;d love to hear from you!
                  </p>
                  <textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="What's on your mind?"
                    className="w-full min-h-[150px] rounded-xl bg-[#0a0a0a] border border-[#2a2a2a] px-4 py-3 text-[#e8e6e3] placeholder:text-[#666] outline-none focus:border-[#888]"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={withHaptics(handleSendFeedback)}
                    disabled={!feedbackText.trim() || sendingFeedback}
                    className="w-full mt-4 rounded-xl bg-[#e8e6e3] px-4 py-3 text-sm font-bold text-[#1a1a1a] hover:bg-[#d0d0d0] transition disabled:opacity-50"
                  >
                    {sendingFeedback ? "Sending..." : "Send Feedback"}
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
        <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
          <p className="text-xl text-[#a8a6a3]">Loading...</p>
        </div>
      }
    >
      <ProfileContent />
    </Suspense>
  );
}
