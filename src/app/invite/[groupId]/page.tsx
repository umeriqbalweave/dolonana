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
  const [wordIndex, setWordIndex] = useState(0);

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

  // Rotating words for tutorial animation
  const feelings = ["good", "happy", "tired", "anxious", "grateful"];
  useEffect(() => {
    if (step === "tutorial" && tutorialStep === 2) {
      const interval = setInterval(() => {
        setWordIndex((prev) => (prev + 1) % feelings.length);
      }, 1500);
      return () => clearInterval(interval);
    }
  }, [step, tutorialStep]);

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
      const isNewMember = !isMember; // They just joined
      
      setTimeout(() => {
        if (!hasName) {
          // New user needs onboarding first, then check-in
          router.replace(`/onboarding?then=/checkin?inviteGroupId=${group.id}`);
        } else if (isNewMember) {
          // New member with name - go to check-in first with group pre-selected
          router.replace(`/checkin?inviteGroupId=${group.id}`);
        } else {
          // Returning member - go straight to group
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
        title: "How it works",
        subtitle: "A simple way to stay connected",
        visual: (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-8xl"
          >
            🪷
          </motion.div>
        ),
      },
      {
        title: "Check in with a number",
        subtitle: "And add a few words",
        visual: (
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-3">
              {[3, 7].map((num, i) => (
                <motion.div
                  key={num}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1 + i * 0.15 }}
                  className="h-14 w-14 rounded-full bg-zinc-800 border border-zinc-600 flex items-center justify-center text-xl font-bold text-white"
                >
                  {num}
                </motion.div>
              ))}
            </div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 min-w-[200px]"
            >
              <span className="text-zinc-500 text-lg">Today I&apos;m feeling </span>
              <AnimatePresence mode="wait">
                <motion.span
                  key={wordIndex}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="text-white text-lg font-medium"
                >
                  {feelings[wordIndex]}
                </motion.span>
              </AnimatePresence>
            </motion.div>
          </div>
        ),
      },
      {
        title: "Share with people who matter",
        subtitle: "Your family and close ones",
        visual: (
          <div className="flex items-center justify-center gap-3">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: [0.8, 1.05, 1], opacity: 1 }}
                transition={{ delay: 0.2 + i * 0.15, duration: 0.3 }}
                className="h-16 w-16 rounded-2xl bg-zinc-800 border-2 border-zinc-600 flex items-center justify-center overflow-hidden"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.5 + i * 0.15 }}
                  className="text-white text-lg"
                >
                  ✓
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
            <div className="mb-8">{current.visual}</div>
            <p className="text-3xl font-bold text-white mb-2 text-center">{current.title}</p>
            <p className="text-lg text-zinc-400 mb-8 text-center">{current.subtitle}</p>
          </motion.div>
        </AnimatePresence>

        <div className="flex gap-3 mb-8">
          {[1, 2, 3].map(n => (
            <div
              key={n}
              className={`h-3 w-3 rounded-full transition-all ${
                n === tutorialStep ? "bg-white scale-125" : "bg-zinc-700"
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
          className="w-full max-w-xs rounded-full bg-white px-8 py-5 text-xl font-semibold text-black"
        >
          {tutorialStep < 3 ? "Next" : "Got it, let's go"}
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
      {/* Inviter pic left, Group pic right */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-center gap-6 mb-8"
      >
        {/* Inviter */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, type: "spring" }}
          className="flex flex-col items-center"
        >
          <div className="h-24 w-24 rounded-full border-2 border-zinc-600 bg-zinc-800 overflow-hidden">
            {ownerProfile?.avatar_url ? (
              <img src={ownerProfile.avatar_url} alt={adminName} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-2xl font-bold text-zinc-400">
                {adminName[0]}
              </div>
            )}
          </div>
          <p className="text-sm text-zinc-500 mt-2">{adminName}</p>
        </motion.div>

        <span className="text-2xl text-zinc-600">→</span>

        {/* Group */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring" }}
          className="flex flex-col items-center"
        >
          <div className="h-24 w-24 rounded-full border-2 border-zinc-600 bg-zinc-800 overflow-hidden">
            {group.image_url ? (
              <img src={group.image_url} alt={group.name} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-2xl font-bold text-zinc-400">
                {group.name[0]}
              </div>
            )}
          </div>
          <p className="text-sm text-zinc-500 mt-2">{group.name}</p>
        </motion.div>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-xl text-zinc-300 mb-10 text-center"
      >
        invited you to join
      </motion.p>

      <motion.button
        type="button"
        onClick={withHaptics(() => setStep("tutorial"))}
        whileTap={{ scale: 0.95 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="w-full max-w-xs rounded-full bg-white px-8 py-5 text-xl font-semibold text-black"
      >
        How it works
      </motion.button>

      {isMember && (
        <motion.button
          type="button"
          onClick={withHaptics(() => router.push(`/groups/${group.id}`))}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-6 text-lg text-zinc-500"
        >
          Already joined → Go to group
        </motion.button>
      )}
    </div>
  );
}
