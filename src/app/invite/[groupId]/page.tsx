"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { withHaptics } from "@/lib/haptics";
import confetti from "canvas-confetti";

type GroupInviteMeta = {
  id: string;
  name: string;
  owner_id: string;
  image_url: string | null;
};

type ProfileMeta = {
  display_name: string | null;
  avatar_url: string | null;
};

type MemberProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

export default function GroupInvitePage() {
  const router = useRouter();
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;

  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [group, setGroup] = useState<GroupInviteMeta | null>(null);
  const [ownerProfile, setOwnerProfile] = useState<ProfileMeta | null>(null);
  const [memberProfiles, setMemberProfiles] = useState<MemberProfile[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"welcome" | "tutorial" | "joining">("welcome");
  const [tutorialStep, setTutorialStep] = useState(1);

  useEffect(() => {
    async function loadInvite() {
      setLoading(true);
      setError(null);

      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData.session?.user?.id ?? null;
      setUserId(currentUserId);

      const res = await fetch(`/api/invite-lookup?groupId=${groupId}`);
      if (!res.ok) {
        setError("This invite link is no longer valid.");
        setLoading(false);
        return;
      }

      const { group: groupData, owner } = await res.json();

      if (!groupData) {
        setError("This invite link is no longer valid.");
        setLoading(false);
        return;
      }

      setGroup(groupData as GroupInviteMeta);
      if (owner) setOwnerProfile(owner as ProfileMeta);

      const { data: memberships } = await supabase
        .from("group_memberships")
        .select("user_id")
        .eq("group_id", groupId);

      if (memberships && memberships.length > 0) {
        const memberIds = memberships.map(m => m.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", memberIds);
        
        if (profiles) setMemberProfiles(profiles);
      }

      if (currentUserId) {
        const { data: membership } = await supabase
          .from("group_memberships")
          .select("id")
          .eq("group_id", groupId)
          .eq("user_id", currentUserId)
          .maybeSingle();

        if (membership) setIsMember(true);
      }

      setLoading(false);
    }

    if (groupId) void loadInvite();
  }, [groupId]);

  useEffect(() => {
    if (!loading && group && !error && step === "welcome") {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }
  }, [loading, group, error, step]);

  async function handleJoin() {
    if (!group) return;

    if (!userId) {
      router.push(`/?inviteGroupId=${group.id}`);
      return;
    }

    setStep("joining");
    setJoining(true);
    setError(null);

    try {
      if (!isMember) {
        const { error: insertError } = await supabase
          .from("group_memberships")
          .insert({
            group_id: group.id,
            user_id: userId,
            role: "member",
            status: "active",
          });

        if (insertError) {
          setError(insertError.message);
          setJoining(false);
          setStep("welcome");
          return;
        }
      }

      confetti({ particleCount: 150, spread: 100, origin: { y: 0.5 } });

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle();

      const hasName = profile?.display_name && profile.display_name.trim().length > 0;
      
      setTimeout(() => {
        if (!hasName) {
          router.replace(`/onboarding?then=/groups/${group.id}`);
        } else {
          router.replace(`/groups/${group.id}`);
        }
      }, 2000);
    } catch {
      setError("Could not join this group.");
      setJoining(false);
      setStep("welcome");
    }
  }

  const adminName = ownerProfile?.display_name ?? "Someone";

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black">
        <motion.div
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="text-8xl"
        >
          🪷
        </motion.div>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black px-8">
        <div className="text-8xl mb-6">😔</div>
        <p className="text-2xl text-zinc-400 text-center">This invite has expired</p>
      </div>
    );
  }

  if (step === "joining") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black px-8">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", bounce: 0.5 }}
          className="text-9xl mb-8"
        >
          ✅
        </motion.div>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-3xl font-bold text-white text-center"
        >
          You&apos;re in!
        </motion.p>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="flex -space-x-4 mt-8"
        >
          {memberProfiles.slice(0, 5).map((member, i) => (
            <motion.div
              key={member.id}
              initial={{ scale: 0, x: -20 }}
              animate={{ scale: 1, x: 0 }}
              transition={{ delay: 0.8 + i * 0.1 }}
              className="h-20 w-20 rounded-full border-4 border-zinc-700 bg-zinc-800 overflow-hidden shadow-lg"
            >
              {member.avatar_url ? (
                <img src={member.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-2xl font-bold text-zinc-400">
                  {member.display_name?.[0] || "?"}
                </div>
              )}
            </motion.div>
          ))}
        </motion.div>
      </div>
    );
  }

  if (step === "tutorial") {
    const tutorials = [
      {
        emoji: "",
        title: "Pick how you feel",
        visual: (
          <div className="flex items-center justify-center gap-6">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1 }}
              className="h-24 w-24 rounded-full bg-gradient-to-br from-rose-400 to-rose-600 flex items-center justify-center text-5xl shadow-xl"
            >
              😔
            </motion.div>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2 }}
              className="h-24 w-24 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-5xl shadow-xl"
            >
              😐
            </motion.div>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3 }}
              className="h-24 w-24 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-5xl shadow-xl"
            >
              😊
            </motion.div>
          </div>
        ),
      },
      {
        emoji: "🎤",
        title: "Add a voice note",
        visual: (
          <div className="flex flex-col items-center gap-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="h-32 w-32 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-6xl shadow-xl"
            >
              🎙️
            </motion.div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-2xl text-stone-500"
            >
              or type a message
            </motion.p>
          </div>
        ),
      },
      {
        emoji: "💜",
        title: "Send to your family",
        visual: (
          <div className="flex -space-x-6 justify-center">
            {memberProfiles.slice(0, 4).map((member, i) => (
              <motion.div
                key={member.id}
                initial={{ scale: 0, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ delay: i * 0.15 }}
                className="relative"
              >
                <div className="h-24 w-24 rounded-full border-4 border-white bg-stone-200 overflow-hidden shadow-xl">
                  {member.avatar_url ? (
                    <img src={member.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-3xl font-bold text-stone-500">
                      {member.display_name?.[0] || "?"}
                    </div>
                  )}
                </div>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.5 + i * 0.1 }}
                  className="absolute -bottom-1 -right-1 text-2xl"
                >
                  ❤️
                </motion.div>
              </motion.div>
            ))}
          </div>
        ),
      },
    ];

    const current = tutorials[tutorialStep - 1];

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black px-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={tutorialStep}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="flex flex-col items-center"
          >
            <div className="text-8xl mb-6">{current.emoji}</div>
            <p className="text-4xl font-bold text-white mb-10 text-center">{current.title}</p>
            <div className="mb-12">{current.visual}</div>
          </motion.div>
        </AnimatePresence>

        <div className="flex gap-3 mb-8">
          {[1, 2, 3].map(n => (
            <div
              key={n}
              className={`h-4 w-4 rounded-full transition-all ${
                n === tutorialStep ? "bg-zinc-300 scale-125" : "bg-zinc-700"
              }`}
            />
          ))}
        </div>

        <motion.button
          type="button"
          onClick={withHaptics(() => {
            if (tutorialStep < 3) {
              setTutorialStep(tutorialStep + 1);
            } else {
              handleJoin();
            }
          })}
          whileTap={{ scale: 0.95 }}
          className="w-full max-w-xs rounded-full bg-gradient-to-r from-rose-400 via-amber-400 to-rose-400 px-8 py-6 text-3xl font-bold text-white shadow-xl"
        >
          {tutorialStep < 3 ? "→" : "Join! 💜"}
        </motion.button>

        <button
          type="button"
          onClick={() => setStep("welcome")}
          className="mt-6 text-xl text-zinc-500"
        >
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black px-8 py-12">
      {/* Group Image */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", bounce: 0.4 }}
        className="mb-4"
      >
        <div className="h-40 w-40 rounded-full border-4 border-zinc-700 bg-zinc-800 overflow-hidden shadow-2xl">
          {group.image_url ? (
            <img src={group.image_url} alt={group.name} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-5xl font-bold text-zinc-500 bg-gradient-to-br from-zinc-700 to-zinc-800">
              {group.name[0]}
            </div>
          )}
        </div>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-4xl font-bold text-white text-center mb-2"
      >
        {group.name}
      </motion.h1>

      {/* Inviter info */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex items-center gap-3 mb-8"
      >
        <div className="h-12 w-12 rounded-full border-2 border-zinc-700 bg-zinc-800 overflow-hidden shadow">
          {ownerProfile?.avatar_url ? (
            <img src={ownerProfile.avatar_url} alt={adminName} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-lg font-bold text-zinc-500">
              {adminName[0]}
            </div>
          )}
        </div>
        <p className="text-xl text-zinc-400">
          {adminName} invited you
        </p>
      </motion.div>

      {memberProfiles.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex -space-x-5 mb-10"
        >
          {memberProfiles.slice(0, 5).map((member, i) => (
            <motion.div
              key={member.id}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5 + i * 0.1, type: "spring" }}
              className="h-24 w-24 rounded-full border-4 border-zinc-800 bg-zinc-700 overflow-hidden shadow-lg"
            >
              {member.avatar_url ? (
                <img src={member.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-3xl font-bold text-zinc-400">
                  {member.display_name?.[0] || "?"}
                </div>
              )}
            </motion.div>
          ))}
          {memberProfiles.length > 5 && (
            <div className="h-24 w-24 rounded-full border-4 border-zinc-800 bg-zinc-700 flex items-center justify-center text-2xl font-bold text-zinc-300 shadow-lg">
              +{memberProfiles.length - 5}
            </div>
          )}
        </motion.div>
      )}

      <motion.button
        type="button"
        onClick={withHaptics(() => setStep("tutorial"))}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="w-full max-w-xs rounded-full bg-gradient-to-r from-rose-400 via-amber-400 to-rose-400 px-8 py-7 text-4xl font-bold text-white shadow-2xl flex items-center justify-center gap-4"
      >
        <span>Join</span>
        <span className="text-5xl">✓</span>
      </motion.button>

      {isMember && (
        <motion.button
          type="button"
          onClick={withHaptics(() => router.push(`/groups/${group.id}`))}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-6 text-xl text-zinc-500 underline"
        >
          Already joined → Go to group
        </motion.button>
      )}
    </div>
  );
}
