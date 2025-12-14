"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { uploadImage } from "@/lib/uploadImage";
import { withHaptics } from "@/lib/haptics";

export default function NewGroupPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupImageFile, setGroupImageFile] = useState<File | null>(null);
  const [groupImagePreview, setGroupImagePreview] = useState<string | null>(null);
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"name" | "picture" | "invites">("name");
  const [invitePhone, setInvitePhone] = useState("");
  const [invitedPhones, setInvitedPhones] = useState<string[]>([]);
  const [origin, setOrigin] = useState("");
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light" | "warm">("warm");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isDark = theme === "dark";
  const isWarm = theme === "warm";

  const namePlaceholders = [
    "close friends",
    "family circle",
    "work buddies",
    "college crew",
    "wellness group",
    "support circle",
    "morning check-ins",
    "accountability partners",
  ];
  const [namePlaceholder] = useState(() => {
    return namePlaceholders[Math.floor(Math.random() * namePlaceholders.length)];
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedTheme = window.localStorage.getItem("theme");
      if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "warm") {
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

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", currentUserId)
        .maybeSingle();

      if (profile?.display_name) {
        setUserDisplayName(profile.display_name);
      }
    }

    void loadUser();
  }, [router]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  async function handleCreateGroup() {
    if (!groupName.trim() || !userId) return;

    setCreating(true);
    setError(null);

    let imageUrl: string | null = null;
    if (groupImageFile) {
      imageUrl = await uploadImage("group-images", groupImageFile, `group-${Date.now()}`);
    }

    const { data: newGroup, error: insertError } = await supabase
      .from("groups")
      .insert({
        name: groupName.trim(),
        owner_id: userId,
        image_url: imageUrl,
      })
      .select()
      .single();

    if (insertError || !newGroup) {
      setError(insertError?.message || "Failed to create group");
      setCreating(false);
      return;
    }

    // Add creator as member
    await supabase.from("group_memberships").insert({
      group_id: newGroup.id,
      user_id: userId,
      role: "admin",
      status: "active",
    });

    setCreatedGroupId(newGroup.id);
    setCreating(false);
    setStep("invites");
  }

  function toE164(input: string): string {
    const digits = input.replace(/\D/g, "");
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    if (digits.length === 10) return `+1${digits}`;
    return input.startsWith("+") ? input : `+${input}`;
  }

  async function handleAddInvite() {
    if (!invitePhone.trim()) return;
    const normalized = toE164(invitePhone.trim());
    if (!invitedPhones.includes(normalized)) {
      setInvitedPhones([...invitedPhones, normalized]);

      // Send SMS invite
      if (createdGroupId) {
        await fetch("/api/send-invites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phones: [normalized],
            groupId: createdGroupId,
            groupName: groupName,
            inviterName: userDisplayName || "Someone",
          }),
        });
      }
    }
    setInvitePhone("");
  }

  async function handleCopyLink() {
    if (!createdGroupId) return;
    const link = `${origin}/invite/${createdGroupId}`;
    await navigator.clipboard.writeText(link);
    setCopyMessage("Link copied!");
    setTimeout(() => setCopyMessage(null), 2000);
  }

  function handleDone() {
    if (createdGroupId) {
      router.push(`/groups/${createdGroupId}`);
    } else {
      router.push("/groups");
    }
  }

  // Theme classes
  const bgClass = isDark
    ? "min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50"
    : isWarm
    ? "min-h-screen bg-[#FCEADE] text-stone-800"
    : "min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900";

  const cardClass = isDark
    ? "rounded-2xl bg-slate-900/50 border border-slate-800 p-6"
    : isWarm
    ? "rounded-2xl bg-white border border-orange-200 p-6 shadow-sm"
    : "rounded-2xl bg-white border border-slate-200 p-6 shadow-sm";

  const inputClass = isDark
    ? "w-full rounded-xl bg-slate-800 border border-slate-700 px-4 py-3 text-white placeholder:text-slate-500 outline-none focus:border-amber-400"
    : isWarm
    ? "w-full rounded-xl bg-white border-2 border-orange-200 px-4 py-3 text-stone-800 placeholder:text-stone-400 outline-none focus:border-orange-400"
    : "w-full rounded-xl bg-white border border-slate-200 px-4 py-3 text-slate-800 placeholder:text-slate-400 outline-none focus:border-amber-500";

  return (
    <div className={bgClass}>
      {/* Header */}
      <header
        className={
          isDark
            ? "flex items-center justify-between border-b border-slate-800 bg-slate-950/70 px-4 py-4"
            : isWarm
            ? "flex items-center justify-between border-b border-orange-200 bg-[#FEF3E2] px-4 py-4"
            : "flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-4 shadow-sm"
        }
      >
        <button
          type="button"
          onClick={withHaptics(() => router.back())}
          className={isDark ? "text-slate-400 hover:text-white" : "text-stone-500 hover:text-stone-800"}
        >
          ← Back
        </button>
        <h1 className="text-lg font-semibold">New Group</h1>
        <div className="w-12" />
      </header>

      <main className="px-4 py-6 max-w-md mx-auto">
        {/* Step 1: Name */}
        {step === "name" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cardClass}
          >
            <div className="text-center mb-6">
              <div className="text-5xl mb-3">🪷</div>
              <h2 className="text-xl font-bold">Name your group</h2>
              <p className={isDark ? "text-sm text-slate-400 mt-1" : "text-sm text-stone-500 mt-1"}>
                Who will you be checking in with?
              </p>
            </div>

            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder={namePlaceholder}
              className={inputClass}
              autoFocus
            />

            {error && <p className="text-rose-400 text-sm mt-2">{error}</p>}

            <button
              type="button"
              onClick={withHaptics(() => setStep("picture"))}
              disabled={!groupName.trim()}
              className="w-full mt-4 rounded-xl bg-amber-500 px-4 py-3 font-bold text-white disabled:opacity-50"
            >
              Continue →
            </button>
          </motion.div>
        )}

        {/* Step 2: Picture (Optional) */}
        {step === "picture" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cardClass}
          >
            <div className="text-center mb-6">
              <div className="text-5xl mb-3">✨</div>
              <h2 className="text-xl font-bold">Add a group photo</h2>
              <p className={isDark ? "text-sm text-slate-400 mt-1" : "text-sm text-stone-500 mt-1"}>
                Optional - helps identify the group
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setGroupImageFile(file);
                if (file) {
                  setGroupImagePreview(URL.createObjectURL(file));
                }
              }}
              className="hidden"
            />

            <button
              type="button"
              onClick={withHaptics(() => fileInputRef.current?.click())}
              className="mx-auto flex flex-col items-center"
            >
              <div
                className={
                  isDark
                    ? "h-24 w-24 rounded-full bg-slate-800 border-2 border-dashed border-slate-600 overflow-hidden flex items-center justify-center hover:border-amber-400"
                    : "h-24 w-24 rounded-full bg-stone-100 border-2 border-dashed border-stone-300 overflow-hidden flex items-center justify-center hover:border-amber-500"
                }
              >
                {groupImagePreview ? (
                  <img src={groupImagePreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-3xl">📷</span>
                )}
              </div>
              <p className={isDark ? "text-xs text-slate-500 mt-2" : "text-xs text-stone-500 mt-2"}>
                Tap to upload
              </p>
            </button>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={withHaptics(() => setStep("name"))}
                className={isDark ? "flex-1 rounded-xl bg-slate-800 px-4 py-3 font-medium" : "flex-1 rounded-xl bg-stone-200 px-4 py-3 font-medium text-stone-700"}
              >
                Back
              </button>
              <button
                type="button"
                onClick={withHaptics(handleCreateGroup)}
                disabled={creating}
                className="flex-1 rounded-xl bg-amber-500 px-4 py-3 font-bold text-white disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create Group"}
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 3: Invites */}
        {step === "invites" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cardClass}
          >
            <div className="text-center mb-6">
              <div className="text-5xl mb-3">💜</div>
              <h2 className="text-xl font-bold">Invite friends</h2>
              <p className={isDark ? "text-sm text-slate-400 mt-1" : "text-sm text-stone-500 mt-1"}>
                Share the group with people you care about
              </p>
            </div>

            {/* Invite by phone */}
            <div className="flex gap-2 mb-4">
              <input
                type="tel"
                value={invitePhone}
                onChange={(e) => setInvitePhone(e.target.value)}
                placeholder="Phone number"
                className={`${inputClass} flex-1`}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddInvite();
                  }
                }}
              />
              <button
                type="button"
                onClick={withHaptics(handleAddInvite)}
                disabled={!invitePhone.trim()}
                className="rounded-xl bg-amber-500 px-4 py-3 font-bold text-white disabled:opacity-50"
              >
                Send
              </button>
            </div>

            {/* Invited list */}
            {invitedPhones.length > 0 && (
              <div className="mb-4">
                <p className={isDark ? "text-xs text-slate-500 mb-2" : "text-xs text-stone-500 mb-2"}>
                  Invites sent:
                </p>
                <div className="flex flex-wrap gap-2">
                  {invitedPhones.map((phone) => (
                    <span
                      key={phone}
                      className={isDark ? "bg-slate-800 px-3 py-1 rounded-full text-sm" : "bg-stone-200 px-3 py-1 rounded-full text-sm text-stone-700"}
                    >
                      {phone} ✓
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Copy link */}
            <button
              type="button"
              onClick={withHaptics(handleCopyLink)}
              className={
                isDark
                  ? "w-full rounded-xl bg-slate-800 border border-slate-700 px-4 py-3 text-center mb-4"
                  : "w-full rounded-xl bg-stone-100 border border-stone-300 px-4 py-3 text-center mb-4"
              }
            >
              {copyMessage || "📋 Copy invite link"}
            </button>

            <button
              type="button"
              onClick={withHaptics(handleDone)}
              className="w-full rounded-xl bg-amber-500 px-4 py-3 font-bold text-white"
            >
              Done →
            </button>
          </motion.div>
        )}
      </main>
    </div>
  );
}
