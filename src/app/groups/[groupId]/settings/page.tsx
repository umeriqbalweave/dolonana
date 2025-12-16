"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { withHaptics } from "@/lib/haptics";
import { uploadImage } from "@/lib/uploadImage";

type GroupMeta = {
  id: string;
  name: string;
  image_url?: string | null;
  owner_id: string;
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
  const [members, setMembers] = useState<Member[]>([]);
  const [editName, setEditName] = useState("");
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null);
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [origin, setOrigin] = useState("");

  const isOwner = group && userId ? group.owner_id === userId : false;

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
        .select("id, name, image_url, owner_id")
        .eq("id", groupId)
        .single();

      if (!groupData) {
        router.replace("/groups");
        return;
      }
      setGroup(groupData);
      setEditName(groupData.name);
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

      setLoading(false);
    }

    void load();
  }, [groupId, router]);

  async function handleSave() {
    if (!group || !isOwner) return;
    setSaving(true);

    let imageUrl = editImageUrl;
    if (editImageFile) {
      const uploaded = await uploadImage("group-images", editImageFile, `group-${groupId}`);
      if (uploaded) imageUrl = uploaded;
    }

    await supabase
      .from("groups")
      .update({ name: editName.trim(), image_url: imageUrl })
      .eq("id", groupId);

    setGroup({ ...group, name: editName.trim(), image_url: imageUrl });
    setSaving(false);
  }

  async function handleLeaveGroup() {
    if (!userId) return;
    setLeaving(true);

    await supabase
      .from("group_memberships")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", userId);

    router.replace("/groups");
  }

  async function handleDeleteGroup() {
    if (!isOwner) return;
    setDeleting(true);

    // Delete memberships first
    await supabase.from("group_memberships").delete().eq("group_id", groupId);
    // Delete group
    await supabase.from("groups").delete().eq("id", groupId);

    router.replace("/groups");
  }

  function handleCopyInviteLink() {
    const link = `${origin}/invite/${groupId}`;
    navigator.clipboard.writeText(link);
    setCopyMessage("Link copied!");
    setTimeout(() => setCopyMessage(null), 2000);
  }

  // Theme classes
  const bgClass = "min-h-screen bg-[#0a0a0a] text-[#e8e6e3]";
  const cardClass = "rounded-2xl bg-[#1a1a1a] border border-[#2a2a2a] p-4";
  const inputClass = "w-full rounded-xl bg-[#0a0a0a] border border-[#2a2a2a] px-4 py-3 text-[#e8e6e3] placeholder:text-[#666] outline-none focus:border-[#888]";

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-xl text-[#a8a6a3]">Loading...</p>
      </div>
    );
  }

  return (
    <div className={bgClass}>
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

      {/* Header */}
      <header className="flex items-center justify-center gap-4 border-b border-[#1a1a1a] bg-[#0f0f0f]/90 px-4 py-4">
        <h1 className="text-xl font-bold">Settings</h1>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Group Image */}
        <div className="flex flex-col items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                setEditImageFile(file);
                setEditImagePreview(URL.createObjectURL(file));
              }
            }}
          />
          <button
            type="button"
            onClick={withHaptics(() => isOwner && fileInputRef.current?.click())}
            disabled={!isOwner}
            className={`h-24 w-24 rounded-full overflow-hidden bg-[#1a1a1a] border-2 border-[#2a2a2a] ${isOwner ? "cursor-pointer hover:border-[#3a3a3a]" : "cursor-default"}`}
          >
            {(editImagePreview || editImageUrl) ? (
              <img src={editImagePreview || editImageUrl || ""} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-3xl">
                {editName?.[0]?.toUpperCase() || "G"}
              </div>
            )}
          </button>
          {isOwner && <p className="text-sm mt-2 text-[#666]">Tap to change</p>}
        </div>

        {/* Group Name */}
        <div className={cardClass}>
          <label className="block text-sm font-medium mb-2 text-[#666]">
            Group Name
          </label>
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            disabled={!isOwner}
            className={inputClass}
          />
          {isOwner && (
            <button
              type="button"
              onClick={withHaptics(handleSave)}
              disabled={saving || !editName.trim()}
              className="mt-3 w-full rounded-xl bg-[#e8e6e3] px-4 py-3 text-lg font-bold text-[#1a1a1a] disabled:opacity-30"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          )}
        </div>

        {/* Invite Link */}
        <div className={cardClass}>
          <label className="block text-sm font-medium mb-2 text-[#666]">
            Invite Friends
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-xl px-3 py-3 text-sm truncate bg-[#0a0a0a] border border-[#2a2a2a] text-[#a8a6a3]">
              {origin}/invite/{groupId}
            </div>
            <button
              type="button"
              onClick={withHaptics(handleCopyInviteLink)}
              className={`px-4 py-3 rounded-xl font-medium whitespace-nowrap transition-colors ${
                copyMessage 
                  ? "bg-[#e8e6e3] text-[#1a1a1a]" 
                  : "bg-[#2a2a2a] text-[#e8e6e3] hover:bg-[#3a3a3a]"
              }`}
            >
              {copyMessage ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        {/* Members */}
        <div className={cardClass}>
          <label className="block text-sm font-medium mb-3 text-[#666]">
            Members ({members.length})
          </label>
          <div className="space-y-2">
            {members.map((member) => (
              <div key={member.id} className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full overflow-hidden bg-[#1a1a1a] border border-[#2a2a2a]">
                  {member.avatar_url ? (
                    <img src={member.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-sm font-bold">
                      {member.display_name?.[0]?.toUpperCase() || "?"}
                    </div>
                  )}
                </div>
                <span className="font-medium">
                  {member.display_name || "Friend"}
                  {member.id === group?.owner_id && <span className="ml-2 text-xs text-[#a8a6a3]">Owner</span>}
                  {member.id === userId && <span className="ml-2 text-xs text-[#666]">(You)</span>}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Leave/Delete */}
        <div className="space-y-3 pt-4">
          {!isOwner && (
            <button
              type="button"
              onClick={withHaptics(handleLeaveGroup)}
              disabled={leaving}
              className="w-full rounded-xl bg-rose-500/20 border border-rose-500 px-4 py-3 text-lg font-medium text-rose-500"
            >
              {leaving ? "Leaving..." : "Leave Group"}
            </button>
          )}
          {isOwner && (
            <button
              type="button"
              onClick={withHaptics(handleDeleteGroup)}
              disabled={deleting}
              className="w-full rounded-xl bg-rose-500 px-4 py-3 text-lg font-bold text-white"
            >
              {deleting ? "Deleting..." : "Delete Group"}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
