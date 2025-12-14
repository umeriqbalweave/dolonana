"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { withHaptics } from "@/lib/haptics";
import confetti from "canvas-confetti";

type GroupInviteMeta = {
  id: string;
  name: string;
  owner_id: string;
  question_prompt: string | null;
  image_url: string | null;
};

type ProfileMeta = {
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
  const [userId, setUserId] = useState<string | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExplainer, setShowExplainer] = useState(false);
  const [explainerStep, setExplainerStep] = useState(1); // 1, 2, or 3
  const [demoAnswered, setDemoAnswered] = useState(false);
  const [selectedDemoAnswer, setSelectedDemoAnswer] = useState<string | null>(null);
  const [generatedDemo, setGeneratedDemo] = useState<{ prompt: string; options: string[] } | null>(null);

  useEffect(() => {
    async function loadInvite() {
      setLoading(true);
      setError(null);

      // Check current session
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData.session?.user?.id ?? null;
      setUserId(currentUserId);

      // Use server-side API to bypass RLS for unauthenticated users
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

      if (owner) {
        setOwnerProfile(owner as ProfileMeta);
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

    if (groupId) {
      void loadInvite();
    }
  }, [groupId]);

  // Trigger confetti when page loads successfully
  useEffect(() => {
    if (!loading && group && !error) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    }
  }, [loading, group, error]);

  // Generate AI-based demo question when group loads
  useEffect(() => {
    async function generateDemoQuestion() {
      if (!group?.question_prompt) return;
      
      try {
        const res = await fetch("/api/generate-sample-questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: group.question_prompt, count: 1 }),
        });
        
        if (res.ok) {
          const data = await res.json();
          if (data.questionsWithOptions?.[0]) {
            setGeneratedDemo(data.questionsWithOptions[0]);
          }
        }
      } catch (err) {
        console.error("Failed to generate demo question:", err);
      }
    }

    if (group) {
      void generateDemoQuestion();
    }
  }, [group]);

  async function handleJoin() {
    if (!group) return;

    // If not logged in, send them through existing phone login,
    // tagging the group so we can join them afterwards.
    if (!userId) {
      // User not logged in - redirect to login with invite context
      router.push(`/?inviteGroupId=${group.id}`);
      return;
    }

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
          return;
        }
      }

      // Check if user has a name set (returning user vs new user)
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle();

      const hasName = profile?.display_name && profile.display_name.trim().length > 0;
      if (!hasName) {
        // New user - send to onboarding first, then to group
        router.replace(`/onboarding?then=/groups/${group.id}`);
      } else {
        // Returning user - go directly to group
        router.replace(`/groups/${group.id}`);
      }
    } catch (joinError) {
      setError("Could not join this group.");
      setJoining(false);
    }
  }

  const title = group?.name ?? "";
  const adminName = ownerProfile?.display_name ?? "Someone";
  const tagline =
    group?.question_prompt ?? "Fun scenarios with friends.";

  if (loading) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-violet-950 via-slate-900 to-emerald-900 text-slate-50 overflow-hidden">
        {/* Floating background elements */}
        <motion.div
          className="absolute top-20 left-10 text-5xl opacity-20"
          animate={{ y: [0, -15, 0], rotate: [0, 10, 0] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
        >
          ✨
        </motion.div>
        <motion.div
          className="absolute bottom-32 right-10 text-5xl opacity-20"
          animate={{ y: [0, 12, 0], rotate: [0, -10, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
        >
          🎉
        </motion.div>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="text-6xl mb-4"
        >
          🦦
        </motion.div>
        <p className="text-lg text-slate-300">checking this invite for you...</p>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-slate-300">
        <div className="px-6 text-center">
          <p className="mb-3 text-xl font-medium">This invite can&apos;t be used.</p>
          <p className="text-base text-slate-500">{error ?? "Please ask your friend to send a new link."}</p>
        </div>
      </div>
    );
  }

  // Extract names from prompt (look for capitalized words that could be names)
  const extractNames = (prompt: string): string[] => {
    const commonWords = new Set(["fun", "group", "chat", "friends", "family", "couples", "dating", "closer", "fitness", "workout", "the", "and", "for", "with", "to", "a", "an", "of", "in", "on", "at", "by", "is", "are", "be", "get", "stay", "keep", "make", "have", "our", "we", "us", "my", "your", "their", "this", "that", "daily", "questions", "polls"]);
    const words = prompt.match(/\b[A-Z][a-z]+\b/g) || [];
    return words.filter(w => !commonWords.has(w.toLowerCase()));
  };

  const namesInPrompt = extractNames(tagline);

  // Get demo content - prefer AI-generated, fallback to hardcoded
  const getDemoContent = () => {
    // Use AI-generated demo if available
    if (generatedDemo && generatedDemo.prompt && generatedDemo.options?.length > 0) {
      return {
        question: generatedDemo.prompt,
        answers: generatedDemo.options.slice(0, 3),
        inviterAnswer: generatedDemo.options[0] || "Great question! 😄"
      };
    }

    // Fallback to hardcoded based on keywords
    const lower = tagline.toLowerCase();
    const name1 = namesInPrompt[0] || adminName;
    const name2 = namesInPrompt[1] || "you";
    
    if (lower.includes("closer") || lower.includes("dating") || lower.includes("couple")) {
      return {
        question: `Who's more likely to double-text when they don't get a reply? 👀`,
        answers: [`${name1} obviously 😂`, `${name2} no question`, `Both of you let's be real`],
        inviterAnswer: `${name1} obviously 😂`
      };
    } else if (lower.includes("fun") || lower.includes("chat") || lower.includes("friend")) {
      return {
        question: `Who's most likely to ghost the group chat for a week?`,
        answers: [`${name1} 100% 💀`, `Not ${name2}... right?`, `We all know who 👀`],
        inviterAnswer: `${name1} 100% 💀`
      };
    } else if (lower.includes("fitness") || lower.includes("workout") || lower.includes("gym")) {
      return {
        question: `Who's gonna skip leg day this week? Be honest.`,
        answers: [`${name1} already did 😂`, `${name2} would never...`, `Everyone's skipping tbh`],
        inviterAnswer: `${name1} already did 😂`
      };
    } else if (lower.includes("family")) {
      return {
        question: `Who's most likely to "forget" to reply to the family group?`,
        answers: [`${name1} classic move`, `${name2} always busy 🙄`, `The whole family lol`],
        inviterAnswer: `${name1} classic move`
      };
    }
    return {
      question: `Who's more likely to laugh at their own joke before finishing it?`,
      answers: [`${adminName} for sure 😂`, `Probably me tbh`, `This is targeted 😭`],
      inviterAnswer: `${adminName} for sure 😂`
    };
  };

  const demoContent = getDemoContent();

  const handleDemoAnswer = (answer: string) => {
    setSelectedDemoAnswer(answer);
    setDemoAnswered(true);
    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.7 },
    });
  };

  // Screen 2: Explainer (2-step flow)
  if (showExplainer) {
    // Step 1: Here's how it works + animated 4 steps with pzazz
    if (explainerStep === 1) {
      return (
        <div className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-violet-950 via-slate-900 to-emerald-900 text-slate-50 px-6 overflow-hidden">
          {/* Floating background elements */}
          <motion.div
            className="absolute top-20 left-10 text-6xl opacity-20"
            animate={{ y: [0, -20, 0], rotate: [0, 10, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            ✨
          </motion.div>
          <motion.div
            className="absolute top-40 right-8 text-5xl opacity-20"
            animate={{ y: [0, 20, 0], rotate: [0, -15, 0] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
          >
            🎯
          </motion.div>
          <motion.div
            className="absolute bottom-32 left-8 text-5xl opacity-20"
            animate={{ y: [0, -15, 0], rotate: [0, 20, 0] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          >
            💬
          </motion.div>
          <motion.div
            className="absolute bottom-40 right-12 text-6xl opacity-20"
            animate={{ y: [0, 15, 0], rotate: [0, -10, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
          >
            🎉
          </motion.div>

          <motion.main
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="relative z-10 flex w-full max-w-md flex-col items-center py-8"
          >
            {/* Big animated title */}
            <motion.h1
              initial={{ opacity: 0, y: -30, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.6, type: "spring", bounce: 0.4 }}
              className="mb-12 text-center text-4xl font-bold text-white md:text-5xl drop-shadow-[0_0_30px_rgba(167,139,250,0.5)]"
            >
              here&apos;s how it works 🦦
            </motion.h1>

            {/* Animated 4 steps with bounce effect */}
            <div className="mb-10 w-full space-y-5">
              <motion.div
                initial={{ opacity: 0, x: -50, scale: 0.8 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ delay: 0.3, type: "spring", bounce: 0.4 }}
                className="rounded-2xl bg-white/10 backdrop-blur-sm px-5 py-4 border border-white/20"
              >
                <p className="text-xl text-white font-semibold">Get a new question every day</p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: -50, scale: 0.8 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ delay: 0.5, type: "spring", bounce: 0.4 }}
                className="rounded-2xl bg-white/10 backdrop-blur-sm px-5 py-4 border border-white/20"
              >
                <p className="text-xl text-white font-semibold">Answer before seeing others</p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: -50, scale: 0.8 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ delay: 0.7, type: "spring", bounce: 0.4 }}
                className="rounded-2xl bg-white/10 backdrop-blur-sm px-5 py-4 border border-white/20"
              >
                <p className="text-xl text-white font-semibold">Laugh at your group&apos;s answers</p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: -50, scale: 0.8 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ delay: 0.9, type: "spring", bounce: 0.4 }}
                className="rounded-2xl bg-white/10 backdrop-blur-sm px-5 py-4 border border-white/20"
              >
                <p className="text-xl text-white font-semibold">Questions refresh daily to keep things fresh</p>
              </motion.div>
            </div>

            <motion.button
              type="button"
              onClick={withHaptics(() => setExplainerStep(2))}
              whileTap={{ scale: 0.95 }}
              whileHover={{ scale: 1.02 }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1, type: "spring", bounce: 0.4 }}
              className="w-full rounded-full bg-emerald-500 px-8 py-4 text-xl font-bold text-black shadow-[0_0_30px_rgba(16,185,129,0.4)] transition hover:bg-emerald-400 hover:shadow-[0_0_40px_rgba(16,185,129,0.6)]"
            >
              Let&apos;s try it out →
            </motion.button>

            <button
              type="button"
              onClick={() => {
                setShowExplainer(false);
                setExplainerStep(1);
              }}
              className="mt-6 text-lg text-slate-300 hover:text-slate-100"
            >
              ← back
            </button>
          </motion.main>
        </div>
      );
    }

    // Step 2: Try the demo poll
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-violet-950 via-slate-900 to-emerald-900 text-slate-50 px-6 overflow-hidden">
        {/* Floating background elements */}
        <motion.div
          className="absolute top-24 left-6 text-5xl opacity-20"
          animate={{ y: [0, -15, 0], rotate: [0, 8, 0] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
        >
          🤔
        </motion.div>
        <motion.div
          className="absolute top-32 right-6 text-4xl opacity-20"
          animate={{ y: [0, 12, 0], rotate: [0, -10, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
        >
          💭
        </motion.div>
        <motion.div
          className="absolute bottom-36 right-10 text-5xl opacity-20"
          animate={{ y: [0, -12, 0], rotate: [0, 15, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
        >
          😂
        </motion.div>

        <motion.main
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="relative z-10 flex w-full max-w-md flex-col items-center py-8"
        >
          {/* Juggu avatar + Question bubble (chat-style) */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-6 w-full flex items-start gap-3"
          >
            <div className="h-12 w-12 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center text-2xl flex-shrink-0">
              🦦
            </div>
            <div className="flex-1 rounded-2xl rounded-tl-sm bg-white/10 backdrop-blur-sm border border-white/20 px-4 py-3">
              <p className="text-xl font-semibold text-white">
                {demoContent.question}
              </p>
            </div>
          </motion.div>

          {/* Answer Chips (no container) */}
          {!demoAnswered ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-6 w-full space-y-3"
            >
              {demoContent.answers.map((answer, idx) => (
                <motion.button
                  key={idx}
                  type="button"
                  onClick={withHaptics(() => handleDemoAnswer(answer))}
                  whileTap={{ scale: 0.95 }}
                  whileHover={{ scale: 1.02 }}
                  className="w-full rounded-full border-2 border-white/30 bg-white/10 backdrop-blur-sm px-5 py-4 text-lg font-medium text-white transition hover:border-emerald-400 hover:bg-white/20"
                >
                  {answer}
                </motion.button>
              ))}
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-6 w-full space-y-4 relative"
            >
              {/* Floating reaction notification - appears at top then disappears */}
              <motion.div
                initial={{ opacity: 0, y: -50, scale: 0.8 }}
                animate={{ 
                  opacity: [0, 1, 1, 1, 0], 
                  y: [-50, 0, 0, 0, -20], 
                  scale: [0.8, 1.05, 1, 1, 0.9] 
                }}
                transition={{ duration: 2.5, times: [0, 0.15, 0.2, 0.8, 1], delay: 1.2 }}
                className="fixed top-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
              >
                <div className="flex items-center gap-3 bg-gradient-to-r from-violet-600/90 to-purple-600/90 backdrop-blur-md border border-white/30 rounded-2xl px-5 py-3 shadow-2xl shadow-violet-500/30">
                  <motion.span 
                    className="text-2xl"
                    animate={{ scale: [1, 1.4, 1], rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 0.5, delay: 1.4, repeat: 1 }}
                  >
                    😂
                  </motion.span>
                  <p className="text-base font-medium text-white">
                    <span className="font-bold">{adminName}</span> loved your answer!
                  </p>
                </div>
              </motion.div>

              {/* Your answer - chat bubble on right */}
              <div className="flex items-start gap-3 justify-end relative">
                <div className="relative">
                  <div className="rounded-2xl rounded-tr-sm bg-emerald-600 px-4 py-3">
                    <p className="text-lg font-semibold text-white">{selectedDemoAnswer}</p>
                  </div>
                  {/* Animated laugh reaction appearing */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ delay: 1.0, type: "spring", bounce: 0.6 }}
                    className="absolute -bottom-3 -left-2 bg-slate-800 rounded-full px-1.5 py-0.5 border border-white/20"
                  >
                    <motion.span
                      animate={{ scale: [1, 1.3, 1] }}
                      transition={{ duration: 0.4, delay: 1.0, repeat: 2 }}
                      className="text-sm"
                    >
                      😂
                    </motion.span>
                  </motion.div>
                </div>
                <div className="h-10 w-10 rounded-full bg-slate-700 flex items-center justify-center text-lg flex-shrink-0">
                  🙂
                </div>
              </div>

              {/* Inviter's answer - chat bubble on left */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex items-start gap-3"
              >
                <div className="h-10 w-10 rounded-full bg-slate-700 overflow-hidden flex-shrink-0">
                  {ownerProfile?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ownerProfile.avatar_url} alt={adminName} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-semibold">
                      {adminName.split(" ").map((w) => w[0]).join("")}
                    </div>
                  )}
                </div>
                <div className="rounded-2xl rounded-tl-sm bg-slate-800 px-4 py-3">
                  <p className="text-sm text-slate-400 mb-1">{adminName}</p>
                  <p className="text-lg font-semibold text-slate-200">{demoContent.inviterAnswer}</p>
                </div>
              </motion.div>
            </motion.div>
          )}

          {error && (
            <p className="mb-4 text-lg text-rose-400">{error}</p>
          )}

          {/* Got it, let's go button - show after answering */}
          {demoAnswered && (
            <motion.button
              type="button"
              onClick={withHaptics(handleJoin)}
              disabled={joining}
              whileTap={{ scale: joining ? 1 : 0.95 }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="w-full rounded-full bg-emerald-500 px-8 py-4 text-xl font-bold text-black transition hover:bg-emerald-400 disabled:opacity-60"
            >
              {joining ? "Joining..." : isMember ? "Go to chat" : "Got it, let's go! 🎉"}
            </motion.button>
          )}

          <button
            type="button"
            onClick={() => {
              setExplainerStep(1);
              setDemoAnswered(false);
              setSelectedDemoAnswer(null);
            }}
            className="mt-6 text-lg text-slate-400 hover:text-slate-200"
          >
            ← back
          </button>
        </motion.main>
      </div>
    );
  }

  // Screen 1: Invite Landing
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-violet-950 via-slate-900 to-emerald-900 text-slate-50 px-6 overflow-hidden">
      {/* Floating background elements */}
      <motion.div
        className="absolute top-16 left-8 text-6xl opacity-20"
        animate={{ y: [0, -20, 0], rotate: [0, 10, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        ✨
      </motion.div>
      <motion.div
        className="absolute top-28 right-6 text-5xl opacity-20"
        animate={{ y: [0, 15, 0], rotate: [0, -12, 0] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
      >
        🎉
      </motion.div>
      <motion.div
        className="absolute bottom-28 left-6 text-5xl opacity-20"
        animate={{ y: [0, -12, 0], rotate: [0, 15, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      >
        💬
      </motion.div>
      <motion.div
        className="absolute bottom-40 right-8 text-6xl opacity-20"
        animate={{ y: [0, 18, 0], rotate: [0, -8, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
      >
        🦦
      </motion.div>

      <motion.main
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="relative z-10 flex w-full max-w-md flex-col items-center py-10"
      >
        {/* Inviter profile + Group image side by side */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="mb-8 flex items-center gap-5"
        >
          {/* Inviter profile */}
          <div className="h-28 w-28 overflow-hidden rounded-full border-2 border-white/30 bg-white/10 backdrop-blur-sm shadow-[0_0_30px_rgba(167,139,250,0.3)]">
            {ownerProfile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ownerProfile.avatar_url}
                alt={adminName ?? "Admin"}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-white">
                {adminName.split(" ").map((word) => word[0]).join("")}
              </div>
            )}
          </div>
          {/* Group image */}
          <div className="h-28 w-28 overflow-hidden rounded-full border-2 border-white/30 bg-white/10 backdrop-blur-sm shadow-[0_0_30px_rgba(16,185,129,0.3)]">
            {group?.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={group.image_url}
                alt={title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-4xl">🦦</div>
            )}
          </div>
        </motion.div>

        {/* Main invite text - BIG */}
        <motion.p
          className="mb-4 text-center text-2xl text-slate-200 md:text-3xl"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          <span className="font-bold text-white">{adminName}</span> invited you to join his group
        </motion.p>

        {/* Group name - HUGE */}
        <motion.h1
          className="mb-8 text-center text-4xl font-bold tracking-wide text-white drop-shadow-[0_0_30px_rgba(167,139,250,0.5)] md:text-5xl"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          {title}
        </motion.h1>

        {/* What you'll vibe over - BIGGER */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
          className="mb-10 max-w-sm text-center rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 px-6 py-4"
        >
          <p className="mb-2 text-base uppercase tracking-widest text-slate-400">
            what you&apos;ll vibe over
          </p>
          <p className="text-2xl text-white italic md:text-3xl">
            &quot;{tagline}&quot;
          </p>
        </motion.div>

        {error && (
          <p className="mb-4 text-base text-rose-400">{error}</p>
        )}

        {/* How does this work button */}
        <motion.button
          type="button"
          onClick={withHaptics(() => setShowExplainer(true))}
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.02 }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="w-full rounded-full bg-emerald-500 px-8 py-4 text-xl font-bold text-black shadow-[0_0_30px_rgba(16,185,129,0.4)] transition hover:bg-emerald-400 hover:shadow-[0_0_40px_rgba(16,185,129,0.6)]"
        >
          How does this work?
        </motion.button>

        {/* Already a member - go straight to chat */}
        {isMember && (
          <motion.button
            type="button"
            onClick={withHaptics(handleJoin)}
            disabled={joining}
            whileTap={{ scale: 0.95 }}
            className="mt-4 w-full rounded-full border-2 border-white/30 bg-white/10 backdrop-blur-sm px-8 py-3 text-lg font-semibold text-white transition hover:border-white/50 hover:bg-white/20"
          >
            {joining ? "Loading..." : "Go to chat →"}
          </motion.button>
        )}
      </motion.main>
    </div>
  );
}
