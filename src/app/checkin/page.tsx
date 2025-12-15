"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { withHaptics } from "@/lib/haptics";

type Group = {
  id: string;
  name: string;
  image_url?: string | null;
  is_dm?: boolean;
  member_count?: number;
};

type Person = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

export default function CheckInPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [step, setStep] = useState<"number" | "message" | "groups">("number");
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [useDetailedScale, setUseDetailedScale] = useState(false);
  const [message, setMessage] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light" | "warm">("dark");
  
  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordingComplete, setRecordingComplete] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const isDark = theme === "dark";
  const isWarm = theme === "warm";

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedTheme = window.localStorage.getItem("theme");
      if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "warm") {
        setTheme(savedTheme);
      }
      // Load saved check-in style preference
      const savedScale = window.localStorage.getItem("checkin-scale");
      if (savedScale === "detailed") {
        setUseDetailedScale(true);
      }
    }
  }, []);

  // Handle Enter key for groups step
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Enter" && step === "groups" && !sending && !sent) {
        if (selectedGroups.size > 0) {
          e.preventDefault();
          handleShare();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [step, sending, sent, selectedGroups]);

  useEffect(() => {
    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      const currentUserId = data.user?.id ?? null;

      if (!currentUserId) {
        router.replace("/");
        return;
      }

      setUserId(currentUserId);

      // Load user's groups
      const { data: memberships } = await supabase
        .from("group_memberships")
        .select("group_id")
        .eq("user_id", currentUserId);

      if (memberships && memberships.length > 0) {
        const groupIds = memberships.map((m) => m.group_id);
        const { data: groupsData } = await supabase
          .from("groups")
          .select("id, name, image_url")
          .in("id", groupIds);

        if (groupsData) {
          // Filter out DM groups (2-member groups with names containing " + ")
          const regularGroups = groupsData.filter(g => !g.name.includes(" + "));
          setGroups(regularGroups);
          // Select all regular groups by default
          setSelectedGroups(new Set(regularGroups.map((g) => g.id)));
        }

        // Fetch all unique members across all groups (for DM option)
        const { data: allMemberships } = await supabase
          .from("group_memberships")
          .select("user_id")
          .in("group_id", groupIds);

        if (allMemberships) {
          const uniqueUserIds = [...new Set(allMemberships.map(m => m.user_id))]
            .filter(id => id !== currentUserId); // Exclude self

          if (uniqueUserIds.length > 0) {
            const { data: profiles } = await supabase
              .from("profiles")
              .select("id, display_name, avatar_url")
              .in("id", uniqueUserIds);

            if (profiles) {
              setPeople(profiles);
            }
          }
        }
      }
    }

    void loadUser();
  }, [router]);

  function handleNumberSelect(num: number) {
    setSelectedNumber(num);
    // Auto-advance after selection with slight delay
    setTimeout(() => setStep("message"), 300);
  }

  function handleMessageNext() {
    setStep("groups");
  }

  // Voice recording functions
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setAudioBlob(audioBlob);
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
        
        // Transcribe the audio
        await transcribeAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Error starting recording:", error);
      alert("Could not access microphone. Please allow microphone access.");
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }

  async function transcribeAudio(blob: Blob) {
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const { text } = await response.json();
        setMessage((prev) => prev ? `${prev} ${text}` : text);
      } else {
        console.error("Transcription failed");
      }
    } catch (error) {
      console.error("Transcription error:", error);
    } finally {
      setIsTranscribing(false);
      setRecordingComplete(true);
    }
  }

  function removeAudio() {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingComplete(false);
  }

  function toggleGroup(groupId: string) {
    // When selecting a group, clear person selection
    setSelectedPerson(null);
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  function selectPerson(personId: string) {
    // When selecting a person, clear group selections
    if (selectedPerson === personId) {
      setSelectedPerson(null);
      // Re-select all groups
      setSelectedGroups(new Set(groups.map((g) => g.id)));
    } else {
      setSelectedPerson(personId);
      setSelectedGroups(new Set());
    }
  }

  async function findOrCreateDMGroup(otherUserId: string): Promise<string | null> {
    if (!userId) return null;

    // Get my profile name
    const { data: myProfile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .single();

    const { data: theirProfile } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", otherUserId)
      .single();

    const myName = myProfile?.display_name || "Me";
    const theirName = theirProfile?.display_name || "Friend";

    // Check if DM group already exists between these two users
    // DM groups have exactly 2 members and name contains " + "
    const { data: myGroups } = await supabase
      .from("group_memberships")
      .select("group_id")
      .eq("user_id", userId);

    const { data: theirGroups } = await supabase
      .from("group_memberships")
      .select("group_id")
      .eq("user_id", otherUserId);

    if (myGroups && theirGroups) {
      const myGroupIds = myGroups.map(g => g.group_id);
      const theirGroupIds = theirGroups.map(g => g.group_id);
      const sharedGroupIds = myGroupIds.filter(id => theirGroupIds.includes(id));

      // Check each shared group to see if it's a DM (exactly 2 members, name has " + ")
      for (const groupId of sharedGroupIds) {
        const { data: group } = await supabase
          .from("groups")
          .select("id, name")
          .eq("id", groupId)
          .single();

        if (group && group.name.includes(" + ")) {
          const { count } = await supabase
            .from("group_memberships")
            .select("*", { count: "exact", head: true })
            .eq("group_id", groupId);

          if (count === 2) {
            return groupId; // Found existing DM
          }
        }
      }
    }

    // Create new DM group
    const dmName = `${myName} + ${theirName}`;
    const { data: newGroup, error: groupError } = await supabase
      .from("groups")
      .insert({
        name: dmName,
        owner_id: userId,
        image_url: theirProfile?.avatar_url || null,
      })
      .select()
      .single();

    if (groupError || !newGroup) return null;

    // Add both users to the group
    await supabase.from("group_memberships").insert([
      { group_id: newGroup.id, user_id: userId, role: "owner", status: "active" },
      { group_id: newGroup.id, user_id: otherUserId, role: "member", status: "active" },
    ]);

    return newGroup.id;
  }

  async function handleShare() {
    if (!userId || selectedNumber === null) return;
    // Allow saving even with no groups (personal history)
    const hasNoGroupsOrPeople = groups.length === 0 && people.length === 0;
    if (!hasNoGroupsOrPeople && selectedGroups.size === 0 && !selectedPerson) return;

    setSending(true);

    try {
      // If sharing to a specific person, find or create DM group
      let groupsToShare = Array.from(selectedGroups);
      
      if (selectedPerson) {
        const dmGroupId = await findOrCreateDMGroup(selectedPerson);
        if (dmGroupId) {
          groupsToShare = [dmGroupId];
        } else {
          throw new Error("Could not create DM");
        }
      }

      // Upload audio to Supabase Storage if exists
      let audioFileUrl: string | null = null;
      if (audioBlob) {
        const fileName = `checkin-audio/${userId}/${Date.now()}.webm`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("audio")
          .upload(fileName, audioBlob, {
            contentType: "audio/webm",
            upsert: false,
          });

        if (uploadError) {
          console.error("Audio upload error:", uploadError);
        } else if (uploadData) {
          const { data: urlData } = supabase.storage
            .from("audio")
            .getPublicUrl(fileName);
          audioFileUrl = urlData.publicUrl;
        }
      }

      // Insert check-in
      const { data: checkin, error: checkinError } = await supabase
        .from("checkins")
        .insert({
          user_id: userId,
          number: selectedNumber,
          message: message.trim() || null,
          is_private: false,
          audio_url: audioFileUrl,
        })
        .select()
        .single();

      if (checkinError) throw checkinError;

      // Link check-in to groups
      if (groupsToShare.length > 0) {
        const checkinGroups = groupsToShare.map((groupId) => ({
          checkin_id: checkin.id,
          group_id: groupId,
        }));

        const { error: linkError } = await supabase
          .from("checkin_groups")
          .insert(checkinGroups);
        
        if (linkError) throw linkError;
      }

      setSent(true);
      setTimeout(() => {
        router.push("/groups");
      }, 2000);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : JSON.stringify(err);
      console.error("Error sharing check-in:", errorMsg, err);
      alert(`Failed to share check-in: ${errorMsg}`);
      setSending(false);
    }
  }

  // Get color based on number (handles emoji scale 101-103 and number scale 1-10)
  function getNumberColor(num: number): string {
    if (num === 101) return "from-rose-500 to-red-600"; // sad emoji
    if (num === 102) return "from-amber-500 to-orange-500"; // okay emoji
    if (num === 103) return "from-emerald-400 to-teal-500"; // good emoji
    // Number scale 1-10
    if (num <= 3) return "from-rose-500 to-red-600";
    if (num <= 5) return "from-amber-500 to-orange-500";
    if (num <= 7) return "from-emerald-400 to-teal-500";
    return "from-violet-400 to-purple-500";
  }

  // Get display text for check-in (emoji scale shows emoji, number scale shows number)
  function getCheckinDisplay(num: number): string {
    if (num === 101) return "😔 Not great";
    if (num === 102) return "😐 Okay";
    if (num === 103) return "😊 Good";
    return `${num}`;
  }

  // Check if using emoji scale
  function isEmojiScale(num: number): boolean {
    return num >= 101 && num <= 103;
  }

  // Theme-aware classes
  const bgClass = isDark
    ? "relative flex min-h-screen flex-col bg-black text-slate-50"
    : isWarm
    ? "relative flex min-h-screen flex-col bg-[#FCEADE] text-stone-800"
    : "relative flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900";

  const headerClass = isDark
    ? "flex items-center justify-between gap-4 border-b border-slate-800 bg-slate-950/70 px-4 py-4"
    : isWarm
    ? "flex items-center justify-between gap-4 border-b border-orange-200 bg-[#FEF3E2] px-4 py-4"
    : "flex items-center justify-between gap-4 border-b border-slate-200 bg-white/80 px-4 py-4";
  
  const cardBg = isDark ? "bg-slate-900/50" : isWarm ? "bg-white" : "bg-white";
  const textPrimary = isDark ? "text-white" : "text-stone-800";
  const textSecondary = isDark ? "text-slate-400" : "text-stone-600";
  const inputClass = isDark 
    ? "rounded-3xl bg-slate-800 border-3 border-slate-700 px-5 py-4 text-xl text-white placeholder:text-slate-500 outline-none focus:border-amber-400"
    : "rounded-3xl bg-white border-3 border-orange-200 px-5 py-4 text-xl text-stone-800 placeholder:text-stone-400 outline-none focus:border-orange-400";

  return (
    <div className={bgClass}>
      {/* Floating Back Button */}
      <motion.button
        type="button"
        onClick={withHaptics(() => router.back())}
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        whileTap={{ scale: 0.95 }}
        className="fixed top-4 left-4 z-30 h-14 px-5 rounded-full bg-rose-500 text-white text-xl font-bold flex items-center gap-2 shadow-2xl hover:bg-rose-600"
      >
        ← Back
      </motion.button>

      {/* Header */}
      <header className={headerClass}>
        <div className="w-24" />
        <h1 className={`text-2xl font-bold ${textPrimary}`}>Check In</h1>
        <div className="w-24" />
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        <AnimatePresence mode="wait">
          {/* Step 1: Number Selection */}
          {step === "number" && (
            <motion.div
              key="number"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-lg text-center"
            >
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`text-4xl font-bold ${textPrimary} mb-6`}
              >
                How are you feeling?
              </motion.p>

              {!useDetailedScale ? (
                <>
                  {/* Simple 3-emoji mode - SPREAD OUT with gaps */}
                  <div className="flex justify-center gap-4 md:gap-12 w-full max-w-lg mx-auto mb-8">
                    <motion.button
                      type="button"
                      onClick={withHaptics(() => {
                        window.localStorage.setItem("checkin-scale", "emoji");
                        setSelectedNumber(101);
                        setStep("message");
                      })}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                      className="flex flex-col items-center gap-4"
                    >
                      <div className="h-24 w-24 md:h-36 md:w-36 rounded-full bg-gradient-to-br from-rose-400 to-rose-600 flex items-center justify-center text-5xl md:text-7xl shadow-2xl">
                        😔
                      </div>
                      <span className="text-lg md:text-2xl font-bold text-rose-600">Not great</span>
                    </motion.button>

                    <motion.button
                      type="button"
                      onClick={withHaptics(() => {
                        window.localStorage.setItem("checkin-scale", "emoji");
                        setSelectedNumber(102);
                        setStep("message");
                      })}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                      className="flex flex-col items-center gap-4"
                    >
                      <div className="h-24 w-24 md:h-36 md:w-36 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-5xl md:text-7xl shadow-2xl">
                        😐
                      </div>
                      <span className="text-lg md:text-2xl font-bold text-amber-600">Okay</span>
                    </motion.button>

                    <motion.button
                      type="button"
                      onClick={withHaptics(() => {
                        window.localStorage.setItem("checkin-scale", "emoji");
                        setSelectedNumber(103);
                        setStep("message");
                      })}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                      className="flex flex-col items-center gap-4"
                    >
                      <div className="h-24 w-24 md:h-36 md:w-36 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-5xl md:text-7xl shadow-2xl">
                        😊
                      </div>
                      <span className="text-lg md:text-2xl font-bold text-emerald-600">Good!</span>
                    </motion.button>
                  </div>

                  <button
                    type="button"
                    onClick={withHaptics(() => {
                      setUseDetailedScale(true);
                      window.localStorage.setItem("checkin-scale", "detailed");
                    })}
                    className="text-lg text-stone-500 underline hover:text-stone-700"
                  >
                    Use 1-10 scale instead
                  </button>
                </>
              ) : (
                <>
                  {/* Detailed 1-10 scale - MUCH BIGGER & SPREAD OUT */}
                  <p className="text-3xl text-stone-600 mb-12">
                    1 = struggling &nbsp;•&nbsp; 10 = thriving
                  </p>

                  <div className="grid grid-cols-5 gap-6 w-full max-w-5xl mx-auto mb-12">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                      const color = num <= 3 ? "from-rose-500 to-rose-600" 
                        : num <= 5 ? "from-amber-500 to-amber-600"
                        : num <= 7 ? "from-emerald-500 to-emerald-600"
                        : "from-violet-500 to-violet-600";
                      return (
                        <motion.button
                          key={num}
                          type="button"
                          onClick={withHaptics(() => {
                            window.localStorage.setItem("checkin-scale", "detailed");
                            handleNumberSelect(num);
                          })}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className={`h-28 md:h-32 w-full rounded-3xl text-5xl md:text-6xl font-bold text-white shadow-2xl transition-all bg-gradient-to-br ${color} ${
                            selectedNumber === num ? "ring-4 ring-stone-800 scale-110" : ""
                          }`}
                        >
                          {num}
                        </motion.button>
                      );
                    })}
                  </div>

                  {selectedNumber && isEmojiScale(selectedNumber) && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-9xl mb-6"
                    >
                      {selectedNumber === 101 ? "😔" : selectedNumber === 102 ? "😐" : "😊"}
                    </motion.div>
                  )}

                  <button
                    type="button"
                    onClick={withHaptics(() => {
                      setUseDetailedScale(false);
                      window.localStorage.setItem("checkin-scale", "emoji");
                    })}
                    className="text-lg text-stone-500 underline hover:text-stone-700 mt-4"
                  >
                    Use simple emojis instead
                  </button>
                </>
              )}
            </motion.div>
          )}

          {/* Step 2: Optional Message */}
          {step === "message" && (
            <motion.div
              key="message"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-lg text-center"
            >
              <div className="mb-8">
                <span className={`inline-block px-6 py-3 rounded-full text-4xl font-bold text-white bg-gradient-to-br ${getNumberColor(selectedNumber || 5)}`}>
                  {getCheckinDisplay(selectedNumber || 5)}
                </span>
              </div>

              <p className={`text-3xl font-bold ${textPrimary} mb-2`}>
                What&apos;s going on?
              </p>
              <p className={`text-xl ${textSecondary} mb-8`}>
                Optional - share as much or as little as you want
              </p>

              {/* Voice Recording - SIMPLIFIED: hide other UI during recording/transcribing */}
              {isRecording ? (
                <motion.div
                  initial={{ scale: 0.9 }}
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="py-12"
                >
                  <motion.button
                    type="button"
                    onClick={withHaptics(stopRecording)}
                    className="w-40 h-40 rounded-full flex items-center justify-center text-7xl shadow-2xl bg-rose-500 ring-8 ring-rose-300/50"
                  >
                    ⏹️
                  </motion.button>
                  <div className="mt-6 flex items-center justify-center gap-2">
                    <span className="h-5 w-5 rounded-full bg-rose-500 animate-pulse" />
                    <span className="text-3xl font-bold text-rose-600">Recording...</span>
                  </div>
                  <p className="text-2xl text-stone-600 mt-3">Tap to stop</p>
                </motion.div>
              ) : isTranscribing ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="py-12"
                >
                  <div className="flex flex-col items-center gap-4">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="text-7xl"
                    >
                      ⏳
                    </motion.div>
                    <span className="text-3xl font-bold text-amber-700">Transcribing...</span>
                    <p className="text-xl text-amber-600">Please wait</p>
                  </div>
                </motion.div>
              ) : (
                <>
                  {/* Normal state - BIG mic button with text area side by side */}
                  <div className="flex items-start gap-4 w-full mb-4">
                    <motion.button
                      type="button"
                      onClick={withHaptics(startRecording)}
                      whileTap={{ scale: 0.95 }}
                      whileHover={{ scale: 1.05 }}
                      className="w-32 h-32 md:w-40 md:h-40 rounded-full flex-shrink-0 flex items-center justify-center text-6xl md:text-7xl shadow-2xl bg-gradient-to-br from-amber-400 to-orange-500"
                    >
                      🎙️
                    </motion.button>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          handleMessageNext();
                        }
                      }}
                      placeholder="Or type here..."
                      className={`flex-1 min-h-[128px] md:min-h-[160px] resize-none shadow-lg ${inputClass}`}
                    />
                  </div>

                  {/* Audio saved indicator */}
                  {audioUrl && (
                    <div className="mb-4 p-3 bg-emerald-50 rounded-2xl border-2 border-emerald-200 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-emerald-500 flex items-center justify-center text-xl text-white">✓</div>
                      <span className="text-lg font-bold text-emerald-700 flex-1">Voice saved</span>
                      <button
                        type="button"
                        onClick={withHaptics(removeAudio)}
                        className="h-8 w-8 rounded-full bg-rose-100 text-rose-500 flex items-center justify-center text-lg hover:bg-rose-200"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={withHaptics(() => setStep("number"))}
                      className="flex-1 rounded-2xl bg-rose-500 px-6 py-5 text-2xl font-bold text-white shadow-lg hover:bg-rose-600"
                    >
                      ← Back
                    </button>
                    <button
                      type="button"
                      onClick={withHaptics(handleMessageNext)}
                      className="flex-1 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-500 px-6 py-5 text-2xl font-bold text-white shadow-lg"
                    >
                      Next →
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* Step 3: Group Selection - IMAGE HEAVY */}
          {step === "groups" && !sent && (
            <motion.div
              key="groups"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-lg"
            >
              <div className="text-center mb-8">
                <span className={`inline-block px-6 py-3 rounded-full text-4xl font-bold text-white bg-gradient-to-br ${getNumberColor(selectedNumber || 5)}`}>
                  {getCheckinDisplay(selectedNumber || 5)}
                </span>
              </div>

              <p className={`text-3xl font-bold ${textPrimary} mb-6 text-center`}>
                Share with...
              </p>

              {/* No groups message */}
              {groups.length === 0 && people.length === 0 && (
                <div className="text-center p-8 bg-amber-50 rounded-3xl border-2 border-amber-200 mb-8">
                  <div className="text-6xl mb-4">📝</div>
                  <p className="text-2xl font-bold text-amber-800 mb-2">No groups yet</p>
                  <p className="text-lg text-amber-700">
                    This check-in will be saved to your personal history. You can view it in Settings later.
                  </p>
                </div>
              )}

              {/* Group Grid - BIG IMAGE CARDS */}
              <div className="grid grid-cols-2 gap-4 mb-8">
                {groups.map((group) => (
                  <motion.button
                    key={group.id}
                    type="button"
                    onClick={withHaptics(() => toggleGroup(group.id))}
                    whileTap={{ scale: 0.95 }}
                    className={`relative overflow-hidden rounded-3xl ${
                      selectedGroups.has(group.id) 
                        ? "ring-4 ring-emerald-500" 
                        : "ring-2 ring-stone-200"
                    }`}
                  >
                    {/* HUGE group image */}
                    <div className="h-40 w-full overflow-hidden">
                      {group.image_url ? (
                        <img src={group.image_url} alt={group.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full bg-gradient-to-br from-orange-400 to-amber-400 flex items-center justify-center text-5xl font-bold text-white/50">
                          {group.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>
                    
                    {/* Selected checkmark */}
                    {selectedGroups.has(group.id) && (
                      <div className="absolute top-3 right-3 h-10 w-10 rounded-full bg-emerald-500 flex items-center justify-center text-2xl text-white shadow-lg">
                        ✓
                      </div>
                    )}
                    
                    {/* Group name */}
                    <div className="p-3 bg-white">
                      <p className="text-xl font-bold text-stone-800 text-center truncate">
                        {group.name}
                      </p>
                    </div>
                  </motion.button>
                ))}
              </div>

              {/* Individual Person Selection */}
              {people.length > 0 && (
                <>
                  <p className="text-xl text-stone-500 mb-4 text-center">
                    Or share with just one person...
                  </p>
                  <div className="grid grid-cols-3 gap-3 mb-8">
                    {people.map((person) => (
                      <motion.button
                        key={person.id}
                        type="button"
                        onClick={withHaptics(() => selectPerson(person.id))}
                        whileTap={{ scale: 0.95 }}
                        className={`relative overflow-hidden rounded-2xl ${
                          selectedPerson === person.id 
                            ? "ring-4 ring-violet-500" 
                            : "ring-2 ring-stone-200"
                        }`}
                      >
                        {/* Person photo */}
                        <div className="h-24 w-full overflow-hidden">
                          {person.avatar_url ? (
                            <img src={person.avatar_url} alt={person.display_name || ""} className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full bg-gradient-to-br from-violet-400 to-purple-400 flex items-center justify-center text-3xl font-bold text-white/50">
                              {(person.display_name || "?")[0]}
                            </div>
                          )}
                        </div>
                        
                        {/* Selected checkmark */}
                        {selectedPerson === person.id && (
                          <div className="absolute top-2 right-2 h-8 w-8 rounded-full bg-violet-500 flex items-center justify-center text-lg text-white shadow-lg">
                            ✓
                          </div>
                        )}
                        
                        {/* Person name */}
                        <div className="p-2 bg-white">
                          <p className="text-base font-bold text-stone-800 text-center truncate">
                            {person.display_name || "Friend"}
                          </p>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </>
              )}

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={withHaptics(() => setStep("message"))}
                  className="flex-1 rounded-2xl bg-rose-500 px-6 py-5 text-2xl font-bold text-white shadow-lg hover:bg-rose-600"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={withHaptics(handleShare)}
                  disabled={sending}
                  className={`flex-1 rounded-2xl px-6 py-5 text-2xl font-bold text-white shadow-lg disabled:opacity-50 ${
                    selectedPerson 
                      ? "bg-gradient-to-r from-violet-500 to-purple-500" 
                      : groups.length === 0 && people.length === 0
                      ? "bg-gradient-to-r from-amber-500 to-orange-500"
                      : "bg-gradient-to-r from-emerald-500 to-teal-500"
                  }`}
                >
                  {sending ? "..." : selectedPerson ? `Send to ${people.find(p => p.id === selectedPerson)?.display_name || "them"} ✓` : groups.length === 0 && people.length === 0 ? "Save ✓" : "Share ✓"}
                </button>
              </div>
            </motion.div>
          )}

          {/* Success State */}
          {sent && (
            <motion.div
              key="sent"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 0.5, repeat: 2 }}
                className="text-9xl mb-8"
              >
                💜
              </motion.div>
              <p className={`text-4xl font-bold ${textPrimary} mb-4`}>
                Shared!
              </p>
              <p className={`text-xl ${textSecondary}`}>
                Your family can see how you&apos;re doing
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
