"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { withHaptics } from "@/lib/haptics";

type GroupInviteMeta = {
  id: string;
  name: string;
  owner_id: string;
  image_url: string | null;
  description: string | null;
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


  // Rotating check-in examples for tutorial animation
  const checkinExamples = [
    "Feeling good today, got a lot done!",
    "A bit tired but hanging in there",
    "Grateful for the little things",
    "Had a rough day, need some rest",
    "Excited about the weekend!",
  ];
  useEffect(() => {
    if (step === "tutorial" && tutorialStep === 1) {
      const interval = setInterval(() => {
        setWordIndex((prev) => (prev + 1) % checkinExamples.length);
      }, 1200);
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
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] overflow-hidden">
        <p className="text-xl text-[#a8a6a3]">Loading...</p>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-8 overflow-hidden">
        <p className="text-2xl text-[#a8a6a3] text-center">This invite has expired</p>
      </div>
    );
  }

  if (step === "joining") {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-8 overflow-hidden">
        <p className="text-2xl font-semibold text-[#e8e6e3] text-center">
          You&apos;re in!
        </p>
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
              className="h-20 w-20 rounded-full border-2 border-[#2a2a2a] bg-[#1a1a1a] overflow-hidden"
            >
              {member.avatar_url ? (
                <img src={member.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-2xl font-bold text-[#666]">
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
        title: "Check in with a number",
        subtitle: "And add a few words",
        visual: (
          <div className="flex flex-col items-center gap-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", bounce: 0.5 }}
              className="h-20 w-20 rounded-full bg-[#2a2a2a] border-2 border-[#3a3a3a] flex items-center justify-center text-3xl font-bold text-[#e8e6e3]"
            >
              7
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl px-5 py-4 min-w-[260px] text-center"
            >
              <AnimatePresence mode="wait">
                <motion.p
                  key={wordIndex}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="text-[#a8a6a3] text-lg italic"
                >
                  &quot;{checkinExamples[wordIndex]}&quot;
                </motion.p>
              </AnimatePresence>
            </motion.div>
          </div>
        ),
      },
      {
        title: "Share with people who matter",
        subtitle: group.name,
        visual: (
          <div className="flex flex-col items-center gap-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", bounce: 0.4 }}
              className="relative"
            >
              <div className="h-28 w-28 rounded-full overflow-hidden border-2 border-[#3a3a3a]">
                {group.image_url ? (
                  <img src={group.image_url} alt={group.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-3xl font-bold bg-[#1a1a1a] text-[#a8a6a3]">
                    {group.name[0]}
                  </div>
                )}
              </div>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.4, type: "spring" }}
                className="absolute -bottom-1 -right-1 h-10 w-10 rounded-full bg-[#e8e6e3] flex items-center justify-center text-[#1a1a1a] text-xl"
              >
                ✓
              </motion.div>
            </motion.div>
          </div>
        ),
      },
    ];

    const current = tutorials[tutorialStep - 1];

    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-8 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={tutorialStep}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="flex flex-col items-center"
          >
            <div className="mb-8">{current.visual}</div>
            <p className="text-3xl font-bold text-[#e8e6e3] mb-2 text-center">{current.title}</p>
            <p className="text-lg text-[#666] mb-8 text-center">{current.subtitle}</p>
          </motion.div>
        </AnimatePresence>

        <div className="flex gap-3 mb-8">
          {[1, 2].map(n => (
            <div
              key={n}
              className={`h-3 w-3 rounded-full transition-all ${
                n === tutorialStep ? "bg-[#e8e6e3] scale-125" : "bg-[#3a3a3a]"
              }`}
            />
          ))}
        </div>

        <motion.button
          type="button"
          onClick={withHaptics(() => {
            if (tutorialStep < 2) {
              setTutorialStep(tutorialStep + 1);
            } else {
              handleJoin();
            }
          })}
          whileTap={{ scale: 0.95 }}
          className="w-full max-w-xs rounded-full bg-[#e8e6e3] px-8 py-5 text-xl font-semibold text-[#1a1a1a]"
        >
          {tutorialStep < 2 ? "Next" : "Got it, let's go"}
        </motion.button>

        <button
          type="button"
          onClick={() => setStep("welcome")}
          className="mt-6 text-lg text-[#666]"
        >
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-8 py-12 overflow-hidden">
      {/* CWF Branding */}
      <motion.h1
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-4xl font-bold tracking-tight text-[#e8e6e3] mb-1"
      >
        CWF
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="text-[#666] mb-8"
      >
        Check in with your people.
      </motion.p>

      {/* Inviter and Group images */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex items-center justify-center gap-6 mb-6"
      >
        {/* Inviter */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.3, type: "spring" }}
        >
          <div className="h-24 w-24 rounded-full border-2 border-[#2a2a2a] overflow-hidden bg-[#1a1a1a]">
            {ownerProfile?.avatar_url ? (
              <img src={ownerProfile.avatar_url} alt={adminName} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-2xl font-bold bg-[#1a1a1a] text-[#a8a6a3]">
                {adminName[0]}
              </div>
            )}
          </div>
        </motion.div>

        {/* Group */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.4, type: "spring" }}
        >
          <div className="h-24 w-24 rounded-full border-2 border-[#2a2a2a] overflow-hidden bg-[#1a1a1a]">
            {group.image_url ? (
              <img src={group.image_url} alt={group.name} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-2xl font-bold bg-[#1a1a1a] text-[#a8a6a3]">
                {group.name[0]}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Inviter text */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-xl text-[#a8a6a3] mb-2 text-center"
      >
        <span className="text-[#e8e6e3] font-semibold">{adminName}</span> <span className="text-[#e8e6e3]">invited you to join</span>
      </motion.p>

      {/* Prominent Group Name */}
      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="text-3xl font-bold text-white text-center mb-8"
      >
        {group.name}
      </motion.h2>

      <motion.button
        type="button"
        onClick={withHaptics(() => setStep("tutorial"))}
        whileTap={{ scale: 0.95 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="w-full max-w-xs rounded-full bg-[#e8e6e3] px-8 py-5 text-2xl font-semibold text-[#1a1a1a]"
      >
        How does this work?
      </motion.button>

      {isMember && (
        <motion.button
          type="button"
          onClick={withHaptics(() => router.push(`/groups/${group.id}`))}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
          className="mt-6 text-lg text-[#666]"
        >
          Already joined → Go to group
        </motion.button>
      )}
    </div>
  );
}
