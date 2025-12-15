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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
  const bgClass = "min-h-screen bg-[#0a0a0a] text-[#e8e6e3]";
  const cardClass = "rounded-2xl bg-[#1a1a1a] border border-[#2a2a2a] p-6";

  return (
    <div className={bgClass}>
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[#1a1a1a] bg-[#0f0f0f]/90 px-4 py-4">
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
        className="fixed top-4 left-4 z-30 h-10 w-10 rounded-full bg-[#1a1a1a] text-[#a8a6a3] flex items-center justify-center hover:bg-[#2a2a2a] transition-colors"
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
              <h2 className="text-3xl font-bold text-[#e8e6e3]">Name your group</h2>
              <p className="text-lg text-[#a8a6a3] mt-2">
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
              className="w-full rounded-2xl bg-[#0a0a0a] border-2 border-[#2a2a2a] px-6 py-5 text-2xl text-[#e8e6e3] placeholder:text-[#666] outline-none focus:border-[#888]"
              autoFocus
            />

            {error && <p className="text-rose-400 text-lg mt-3">{error}</p>}

            <button
              type="button"
              onClick={withHaptics(() => setStep("picture"))}
              disabled={!groupName.trim()}
              className="w-full mt-6 rounded-2xl bg-[#e8e6e3] px-6 py-5 text-2xl font-semibold text-[#1a1a1a] disabled:opacity-30"
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
              <h2 className="text-3xl font-bold text-[#e8e6e3]">Add a group photo</h2>
              <p className="text-lg text-[#a8a6a3] mt-2">
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
              <div className="h-40 w-40 rounded-full bg-[#1a1a1a] border-2 border-dashed border-[#3a3a3a] overflow-hidden flex items-center justify-center hover:border-[#666] transition-colors">
                {groupImagePreview ? (
                  <img src={groupImagePreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-4xl text-[#666]">+</span>
                )}
              </div>
              <p className="text-sm text-[#666] mt-3">
                Tap to upload
              </p>
            </button>

            <div className="flex gap-4 mt-8">
              <button
                type="button"
                onClick={withHaptics(() => setStep("name"))}
                className="flex-1 rounded-2xl bg-[#1a1a1a] border border-[#2a2a2a] px-6 py-5 text-xl font-medium text-[#a8a6a3] hover:bg-[#2a2a2a] transition-colors"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={withHaptics(handleCreateGroup)}
                disabled={creating}
                className="flex-1 rounded-2xl bg-[#e8e6e3] px-6 py-5 text-xl font-semibold text-[#1a1a1a] disabled:opacity-30"
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
              <p className="text-lg text-[#a8a6a3] mt-2">
                Share the group with people you care about
              </p>
            </div>

            {/* Invite link with copy button */}
            <div className="mb-6">
              <p className="text-sm text-[#666] mb-2">
                Invite Link
              </p>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-xl px-4 py-4 text-sm truncate bg-[#0a0a0a] border border-[#2a2a2a] text-[#a8a6a3]">
                  {origin}/invite/{createdGroupId}
                </div>
                <button
                  type="button"
                  onClick={withHaptics(handleCopyLink)}
                  className={`px-5 py-4 rounded-xl font-medium whitespace-nowrap transition-all ${
                    copyMessage 
                      ? "bg-[#e8e6e3] text-[#1a1a1a]" 
                      : "bg-[#2a2a2a] text-[#e8e6e3] hover:bg-[#3a3a3a]"
                  }`}
                >
                  {copyMessage ? "Copied" : "Copy"}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={withHaptics(handleDone)}
              className="w-full rounded-2xl bg-[#e8e6e3] px-6 py-5 text-2xl font-semibold text-[#1a1a1a]"
            >
              Done →
            </button>
          </motion.div>
        )}
      </main>
    </div>
  );
}
