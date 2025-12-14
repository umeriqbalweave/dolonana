"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { withHaptics } from "@/lib/haptics";
import { uploadImage } from "@/lib/uploadImage";
import FloatingEmojis from "@/components/FloatingEmojis";

type GroupMeta = {
  id: string;
  name: string;
  question_prompt: string | null;
  image_url?: string | null;
  owner_id: string;
};

type NotificationSettings = {
  daily_question_sms: boolean;
  message_sms: boolean;
};

type Member = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

export default function GroupSettingsPage() {
  const router = useRouter();
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;

  const [userId, setUserId] = useState<string | null>(null);
  const [group, setGroup] = useState<GroupMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notifications, setNotifications] = useState<NotificationSettings>({
    daily_question_sms: true,
    message_sms: true,
  });
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [members, setMembers] = useState<Member[]>([]);
  const [editName, setEditName] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null);
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [origin, setOrigin] = useState("");
  const [shortInviteId, setShortInviteId] = useState<string | null>(null);
  const [selectedUserProfile, setSelectedUserProfile] = useState<{ id: string; display_name: string | null; avatar_url: string | null } | null>(null);
  const [selectedUserAnswers, setSelectedUserAnswers] = useState<{ question_text: string; answer_text: string; date_et: string }[]>([]);

  const isDark = theme === "dark";
  const isOwner = group && userId ? group.owner_id === userId : false;

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem("theme");
      if (stored === "light" || stored === "dark") {
        setTheme(stored);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  useEffect(() => {
    async function load() {
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
        .select("id, name, question_prompt, image_url, owner_id")
        .eq("id", groupId)
        .single();

      if (!groupData) {
        router.replace("/groups");
        return;
      }
      setGroup(groupData);
      setEditName(groupData.name);
      setEditPrompt(groupData.question_prompt ?? "");
      setEditImageUrl(groupData.image_url ?? null);

      // Load members
      const { data: memberships } = await supabase
        .from("group_memberships")
        .select("user_id")
        .eq("group_id", groupId);

      if (memberships && memberships.length > 0) {
        const memberIds = memberships.map((m) => m.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", memberIds);
        setMembers(profiles ?? []);
      }

      // Load or create short invite link
      const { data: existingInvite } = await supabase
        .from("short_invites")
        .select("short_id")
        .eq("group_id", groupId)
        .maybeSingle();

      if (existingInvite) {
        setShortInviteId(existingInvite.short_id);
      } else {
        // Create a new short invite
        const shortId = Math.random().toString(36).substring(2, 8);
        await supabase.from("short_invites").insert({
          short_id: shortId,
          group_id: groupId,
        });
        setShortInviteId(shortId);
      }

      // Load notification settings
      const { data: notifData } = await supabase
        .from("group_notification_settings")
        .select("daily_question_sms, message_sms")
        .eq("user_id", currentUserId)
        .eq("group_id", groupId)
        .single();

      if (notifData) {
        setNotifications({
          daily_question_sms: notifData.daily_question_sms ?? true,
          message_sms: notifData.message_sms ?? true,
        });
      }

      setLoading(false);
    }

    void load();
  }, [groupId, router]);

  async function handleToggleNotification(key: "daily_question_sms" | "message_sms") {
    if (!userId) return;
    setSavingNotifications(true);

    const newValue = !notifications[key];
    setNotifications((prev) => ({ ...prev, [key]: newValue }));

    // Upsert notification settings
    await supabase.from("group_notification_settings").upsert(
      {
        user_id: userId,
        group_id: groupId,
        [key]: newValue,
      },
      { onConflict: "user_id,group_id" }
    );

    setSavingNotifications(false);
  }

  async function handleSaveChanges() {
    if (!group || !userId) return;
    setSaving(true);

    const updates: { name?: string; question_prompt?: string; image_url?: string } = {};
    const changeMessages: string[] = [];
    
    // Get user's display name for system message
    const { data: userProfile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle();
    const userName = userProfile?.display_name ?? "Someone";

    // Upload new image if selected
    if (editImageFile) {
      const uploadedUrl = await uploadImage("group-images", editImageFile, groupId);
      if (uploadedUrl) {
        updates.image_url = uploadedUrl;
        setEditImageUrl(uploadedUrl);
        changeMessages.push(`${userName} updated the group photo`);
      }
    }

    if (editName.trim() && editName !== group.name) {
      updates.name = editName.trim();
      changeMessages.push(`${userName} changed the group name to "${editName.trim()}"`);
    }
    if (editPrompt !== group.question_prompt) {
      updates.question_prompt = editPrompt;
      changeMessages.push(`${userName} updated the question prompt`);
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from("groups").update(updates).eq("id", groupId);
      setGroup({ ...group, ...updates });

      // Insert system messages for each change
      for (const msgText of changeMessages) {
        await supabase.from("messages").insert({
          group_id: groupId,
          user_id: userId,
          text: msgText,
          is_juggu: true, // Use Juggu style for system messages
        });
      }
    }

    // Clear the file input
    setEditImageFile(null);
    setEditImagePreview(null);
    setSaving(false);
    setCopyMessage("Saved!");
    setTimeout(() => setCopyMessage(null), 1500);
  }

  async function handleCopyInviteLink() {
    if (!shortInviteId) return;
    const inviteUrl = `${origin}/i/${shortInviteId}`;
    await navigator.clipboard.writeText(inviteUrl);
    setCopyMessage("Copied!");
    setTimeout(() => setCopyMessage(null), 1500);
  }

  async function handleOpenUserProfile(memberId: string) {
    // Find the member in our list
    const member = members.find((m) => m.id === memberId);
    if (!member) return;

    setSelectedUserProfile(member);

    // Fetch their answers for this group
    const { data: questions } = await supabase
      .from("daily_questions")
      .select("id, question_text, date_et")
      .eq("group_id", groupId);

    if (questions && questions.length > 0) {
      const questionIds = questions.map((q) => q.id);
      const { data: answers } = await supabase
        .from("answers")
        .select("question_id, answer_text")
        .eq("user_id", memberId)
        .in("question_id", questionIds);

      if (answers) {
        const answersWithQuestions = answers.map((ans) => {
          const q = questions.find((q) => q.id === ans.question_id);
          return {
            question_text: q?.question_text ?? "",
            answer_text: ans.answer_text,
            date_et: q?.date_et ?? "",
          };
        });
        setSelectedUserAnswers(answersWithQuestions.sort((a, b) => b.date_et.localeCompare(a.date_et)));
      }
    }
  }

  async function handleDeleteGroup() {
    if (!group || !isOwner) return;
    const confirmed = window.confirm("Delete this group for everyone? This cannot be undone.");
    if (!confirmed) return;

    setDeleting(true);
    await supabase.from("groups").delete().eq("id", groupId);
    router.replace("/groups");
  }

  async function handleLeaveGroup() {
    if (!userId || !group) return;
    
    const confirmed = window.confirm(
      "Leave this group? Your answers will be deleted."
    );
    if (!confirmed) return;

    setLeaving(true);

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

    router.replace("/groups");
  }

  if (loading) {
    return (
      <div className={isDark ? "relative flex min-h-screen items-center justify-center bg-gradient-to-br from-violet-950 via-slate-900 to-emerald-900 text-slate-50 overflow-hidden" : "relative flex min-h-screen items-center justify-center bg-gradient-to-br from-violet-100 via-slate-100 to-emerald-100 text-slate-900 overflow-hidden"}>
        <div className="absolute top-20 left-10 text-5xl opacity-20 animate-bounce">✨</div>
        <div className="absolute bottom-32 right-10 text-5xl opacity-20 animate-pulse">🎉</div>
        <div className="animate-spin text-6xl mb-4">✨</div>
      </div>
    );
  }

  const inviteUrl = shortInviteId ? `${origin}/i/${shortInviteId}` : "";

  return (
    <div className={isDark ? "relative min-h-screen bg-gradient-to-br from-violet-950 via-slate-900 to-emerald-900 text-slate-50 overflow-hidden" : "relative min-h-screen bg-gradient-to-br from-violet-100 via-slate-100 to-emerald-100 text-slate-900 overflow-hidden"}>
      <FloatingEmojis count={5} />

      <header className={isDark ? "relative z-10 flex items-center gap-4 border-b border-white/10 bg-white/5 backdrop-blur-sm px-4 py-4" : "relative z-10 flex items-center gap-4 border-b border-slate-200 bg-white/80 backdrop-blur-sm px-4 py-4 shadow-sm"}>
        <button
          type="button"
          onClick={withHaptics(() => router.push(`/groups/${groupId}`))}
          className={isDark ? "flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl text-white hover:bg-white/20 transition" : "flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-700 hover:bg-slate-200 transition"}
        >
          ←
        </button>
        <h1 className={isDark ? "text-lg font-bold" : "text-lg font-bold text-slate-800"}>Group Settings</h1>
      </header>

      <main className="relative z-10 mx-auto max-w-lg space-y-6 px-4 py-6">
        {/* Toast */}
        {copyMessage && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 rounded-full bg-emerald-500 px-6 py-2 text-sm font-semibold text-black shadow-lg">
            {copyMessage}
          </div>
        )}

        {/* INVITE LINK - Prominent at top */}
        <section className={isDark ? "rounded-2xl bg-gradient-to-r from-emerald-500/20 via-violet-500/20 to-emerald-500/20 border border-white/20 backdrop-blur-sm p-5" : "rounded-2xl bg-gradient-to-r from-emerald-50 via-violet-50 to-emerald-50 border border-emerald-200 p-5 shadow-sm"}>
          <h3 className={isDark ? "text-lg font-bold text-white mb-3" : "text-lg font-bold text-slate-800 mb-3"}>🔗 Invite Friends</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={inviteUrl}
              readOnly
              className={isDark ? "flex-1 rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-sm text-white/80" : "flex-1 rounded-xl bg-white border border-slate-300 px-4 py-3 text-sm text-slate-700"}
            />
            <button
              type="button"
              onClick={withHaptics(handleCopyInviteLink)}
              className="rounded-xl bg-emerald-500 px-6 py-3 text-sm font-bold text-black hover:bg-emerald-400 transition shadow-lg"
            >
              Copy
            </button>
          </div>
        </section>

        {/* MEMBERS */}
        <section className={isDark ? "rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 p-5" : "rounded-2xl bg-white border border-slate-200 p-5 shadow-sm"}>
          <h3 className={isDark ? "text-lg font-bold text-white mb-4" : "text-lg font-bold text-slate-800 mb-4"}>👥 Members ({members.length})</h3>
          <div className="flex flex-wrap gap-3">
            {members.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={withHaptics(() => handleOpenUserProfile(member.id))}
                className="flex flex-col items-center gap-1 hover:scale-105 transition"
              >
                <div className="h-14 w-14 overflow-hidden rounded-full bg-white/10 border-2 border-white/20 hover:border-emerald-400 transition">
                  {member.avatar_url ? (
                    <img src={member.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-white/60">
                      {(member.display_name ?? "?")[0].toUpperCase()}
                    </div>
                  )}
                </div>
                <span className={isDark ? "text-xs text-white/70 max-w-[60px] truncate" : "text-xs text-slate-600 max-w-[60px] truncate"}>
                  {member.display_name ?? "Friend"}
                  {group?.owner_id === member.id && " 👑"}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* EDIT GROUP NAME & PROMPT */}
        <section className={isDark ? "rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 p-5 space-y-4" : "rounded-2xl bg-white border border-slate-200 p-5 space-y-4 shadow-sm"}>
          <h3 className={isDark ? "text-lg font-bold text-white" : "text-lg font-bold text-slate-800"}>✏️ Edit Group</h3>
          
          {/* Group Photo */}
          <div>
            <label className={isDark ? "block text-sm text-white/70 mb-2" : "block text-sm text-slate-600 mb-2"}>Group Photo</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setEditImageFile(file);
                if (file) {
                  setEditImagePreview(URL.createObjectURL(file));
                }
              }}
              className="hidden"
            />
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={withHaptics(() => fileInputRef.current?.click())}
                className="h-20 w-20 overflow-hidden rounded-2xl bg-white/10 border-2 border-dashed border-white/30 hover:border-emerald-400 transition flex items-center justify-center"
              >
                {editImagePreview || editImageUrl ? (
                  <img 
                    src={editImagePreview || editImageUrl || ""} 
                    alt="Group" 
                    className="h-full w-full object-cover" 
                  />
                ) : (
                  <span className="text-2xl">📷</span>
                )}
              </button>
              <p className={isDark ? "text-xs text-white/50" : "text-xs text-slate-500"}>Tap to change group photo</p>
            </div>
          </div>

          <div>
            <label className={isDark ? "block text-sm text-white/70 mb-1" : "block text-sm text-slate-600 mb-1"}>Group Name</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className={isDark ? "w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-white placeholder:text-white/40 focus:border-emerald-400 outline-none" : "w-full rounded-xl bg-white border border-slate-300 px-4 py-3 text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 outline-none"}
            />
          </div>
          
          <div>
            <label className={isDark ? "block text-sm text-white/70 mb-1" : "block text-sm text-slate-600 mb-1"}>Question Prompt</label>
            <textarea
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              placeholder="What kind of questions should Juggu ask?"
              className={isDark ? "w-full min-h-[100px] rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-white placeholder:text-white/40 focus:border-emerald-400 outline-none" : "w-full min-h-[100px] rounded-xl bg-white border border-slate-300 px-4 py-3 text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 outline-none"}
            />
          </div>

          <button
            type="button"
            onClick={withHaptics(handleSaveChanges)}
            disabled={saving}
            className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-black hover:bg-emerald-400 transition shadow-lg disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </section>

        {/* Notification Settings */}
        <section className={isDark ? "rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 p-5" : "rounded-2xl bg-white border border-slate-200 p-5 shadow-sm"}>
          <h3 className={isDark ? "text-lg font-bold text-white mb-4" : "text-lg font-bold text-slate-800 mb-4"}>🔔 Notifications</h3>
          
          <div className="space-y-4">
            {/* Daily Question SMS */}
            <div className="flex items-center justify-between">
              <div>
                <p className={isDark ? "font-medium text-white" : "font-medium text-slate-800"}>Daily question SMS</p>
                <p className={isDark ? "text-xs text-white/60" : "text-xs text-slate-500"}>
                  Get notified at 12pm when the daily question drops
                </p>
              </div>
              <button
                type="button"
                onClick={withHaptics(() => handleToggleNotification("daily_question_sms"))}
                disabled={savingNotifications}
                className={`relative h-7 w-12 rounded-full transition ${
                  notifications.daily_question_sms ? "bg-emerald-500" : (isDark ? "bg-white/20" : "bg-slate-300")
                }`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
                    notifications.daily_question_sms ? "left-6" : "left-1"
                  }`}
                />
              </button>
            </div>

            {/* Message SMS */}
            <div className="flex items-center justify-between">
              <div>
                <p className={isDark ? "font-medium text-white" : "font-medium text-slate-800"}>Message notifications</p>
                <p className={isDark ? "text-xs text-white/60" : "text-xs text-slate-500"}>
                  Get notified when someone answers
                </p>
              </div>
              <button
                type="button"
                onClick={withHaptics(() => handleToggleNotification("message_sms"))}
                disabled={savingNotifications}
                className={`relative h-7 w-12 rounded-full transition ${
                  notifications.message_sms ? "bg-emerald-500" : (isDark ? "bg-white/20" : "bg-slate-300")
                }`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
                    notifications.message_sms ? "left-6" : "left-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        {/* Leave Group (non-owners) */}
        {!isOwner && (
          <section className="rounded-2xl bg-rose-500/10 backdrop-blur-sm border border-rose-500/30 p-5">
            <button
              type="button"
              onClick={withHaptics(handleLeaveGroup)}
              disabled={leaving}
              className="w-full rounded-xl bg-rose-500/20 px-4 py-3 text-sm font-bold text-rose-400 transition hover:bg-rose-500/30 disabled:opacity-50"
            >
              {leaving ? "Leaving..." : "🚪 Leave Group"}
            </button>
            <p className={isDark ? "mt-2 text-center text-xs text-white/50" : "mt-2 text-center text-xs text-slate-500"}>
              Your answers and messages will be deleted
            </p>
          </section>
        )}

        {/* Delete Group (owners only) */}
        {isOwner && (
          <section className="rounded-2xl bg-rose-500/10 backdrop-blur-sm border border-rose-500/30 p-5">
            <button
              type="button"
              onClick={withHaptics(handleDeleteGroup)}
              disabled={deleting}
              className="w-full rounded-xl bg-rose-500/20 px-4 py-3 text-sm font-bold text-rose-400 transition hover:bg-rose-500/30 disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "🗑️ Delete Group"}
            </button>
            <p className={isDark ? "mt-2 text-center text-xs text-white/50" : "mt-2 text-center text-xs text-slate-500"}>
              This will delete the group for everyone
            </p>
          </section>
        )}
      </main>

      {/* User Profile Modal */}
      {selectedUserProfile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => {
            setSelectedUserProfile(null);
            setSelectedUserAnswers([]);
          }}
        >
          <div
            className="w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl bg-gradient-to-br from-violet-950 via-slate-900 to-emerald-900 border border-white/20 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
              <div className="h-16 w-16 overflow-hidden rounded-full bg-white/10 border-2 border-emerald-400">
                {selectedUserProfile.avatar_url ? (
                  <img src={selectedUserProfile.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-white/60">
                    {(selectedUserProfile.display_name ?? "?")[0].toUpperCase()}
                  </div>
                )}
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">{selectedUserProfile.display_name ?? "Friend"}</h3>
                <p className="text-sm text-white/60">{selectedUserAnswers.length} answers in this group</p>
              </div>
            </div>

            {/* Answers */}
            {selectedUserAnswers.length > 0 ? (
              <div className="space-y-4">
                {selectedUserAnswers.map((ans, idx) => (
                  <div key={idx} className="rounded-xl bg-white/10 p-4">
                    <p className="text-xs text-emerald-400 mb-1">
                      {new Date(ans.date_et + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                    <p className="text-sm text-violet-300 mb-2">{ans.question_text}</p>
                    <p className="text-white">{ans.answer_text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-white/50">No answers yet</p>
            )}

            {/* Close button */}
            <button
              type="button"
              onClick={withHaptics(() => {
                setSelectedUserProfile(null);
                setSelectedUserAnswers([]);
              })}
              className="mt-6 w-full rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/20 transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
