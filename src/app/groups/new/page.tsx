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

  // Handle Enter key for steps without text inputs
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Enter") {
        if (step === "picture" && !creating) {
          e.preventDefault();
          handleCreateGroup();
        } else if (step === "invites" && !invitePhone.trim()) {
          e.preventDefault();
          handleDone();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [step, creating, invitePhone]);

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
        <div className="w-24" />
        <h1 className="text-2xl font-bold">New Group</h1>
        <div className="w-24" />
      </header>

      {/* Floating Back Button */}
      <motion.button
        type="button"
        onClick={withHaptics(() => router.back())}
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        whileTap={{ scale: 0.95 }}
        className={isDark 
          ? "fixed top-4 left-4 z-30 h-10 w-10 rounded-full bg-white/10 text-white/80 flex items-center justify-center hover:bg-white/20"
          : "fixed top-4 left-4 z-30 h-10 w-10 rounded-full bg-stone-200 text-stone-600 flex items-center justify-center hover:bg-stone-300"}
      >
        ←
      </motion.button>

      <main className="px-6 py-8 max-w-lg mx-auto">
        {/* Step 1: Name */}
        {step === "name" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cardClass}
          >
            <div className="text-center mb-8">
              <div className="text-8xl mb-4">🪷</div>
              <h2 className="text-3xl font-bold">Name your group</h2>
              <p className={isDark ? "text-xl text-slate-400 mt-2" : "text-xl text-stone-500 mt-2"}>
                Who will you be checking in with?
              </p>
            </div>

            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && groupName.trim()) {
                  e.preventDefault();
                  setStep("picture");
                }
              }}
              placeholder={namePlaceholder}
              className="w-full rounded-2xl bg-white border-3 border-orange-200 px-6 py-5 text-2xl text-stone-800 placeholder:text-stone-400 outline-none focus:border-orange-400"
              autoFocus
            />

            {error && <p className="text-rose-400 text-lg mt-3">{error}</p>}

            <button
              type="button"
              onClick={withHaptics(() => setStep("picture"))}
              disabled={!groupName.trim()}
              className="w-full mt-6 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-5 text-2xl font-bold text-white disabled:opacity-50 shadow-lg"
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
            <div className="text-center mb-8">
              <div className="text-8xl mb-4">✨</div>
              <h2 className="text-3xl font-bold">Add a group photo</h2>
              <p className={isDark ? "text-xl text-slate-400 mt-2" : "text-xl text-stone-500 mt-2"}>
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
                    ? "h-40 w-40 rounded-full bg-slate-800 border-4 border-dashed border-slate-600 overflow-hidden flex items-center justify-center hover:border-amber-400"
                    : "h-40 w-40 rounded-full bg-stone-100 border-4 border-dashed border-stone-300 overflow-hidden flex items-center justify-center hover:border-amber-500"
                }
              >
                {groupImagePreview ? (
                  <img src={groupImagePreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-6xl">📷</span>
                )}
              </div>
              <p className={isDark ? "text-lg text-slate-500 mt-3" : "text-lg text-stone-500 mt-3"}>
                Tap to upload
              </p>
            </button>

            <div className="flex gap-4 mt-8">
              <button
                type="button"
                onClick={withHaptics(() => setStep("name"))}
                className={isDark ? "flex-1 rounded-2xl bg-slate-800 px-6 py-5 text-xl font-medium" : "flex-1 rounded-2xl bg-stone-200 px-6 py-5 text-xl font-medium text-stone-700"}
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={withHaptics(handleCreateGroup)}
                disabled={creating}
                className="flex-1 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-5 text-xl font-bold text-white disabled:opacity-50 shadow-lg"
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
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold">Invite friends</h2>
              <p className={isDark ? "text-xl text-slate-400 mt-2" : "text-xl text-stone-500 mt-2"}>
                Share the group with people you care about
              </p>
            </div>

            {/* Invite link with copy button */}
            <div className="mb-6">
              <p className={isDark ? "text-sm text-slate-500 mb-2" : "text-sm text-stone-500 mb-2"}>
                Invite Link
              </p>
              <div className="flex items-center gap-2">
                <div className={`flex-1 rounded-xl px-4 py-4 text-sm truncate ${isDark ? "bg-slate-800 text-slate-300" : "bg-stone-100 text-stone-600"}`}>
                  {origin}/invite/{createdGroupId}
                </div>
                <button
                  type="button"
                  onClick={withHaptics(handleCopyLink)}
                  className={`px-5 py-4 rounded-xl font-medium whitespace-nowrap transition-all ${
                    copyMessage 
                      ? "bg-emerald-500 text-white" 
                      : isDark 
                        ? "bg-slate-700 text-slate-200 hover:bg-slate-600" 
                        : "bg-orange-500 text-white hover:bg-orange-600"
                  }`}
                >
                  {copyMessage ? "✓ Copied" : "Copy"}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={withHaptics(handleDone)}
              className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-5 text-2xl font-bold text-white shadow-lg"
            >
              Done →
            </button>
          </motion.div>
        )}
      </main>
    </div>
  );
}
