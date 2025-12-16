"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
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

function CheckInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteGroupId = searchParams.get("inviteGroupId");
  const [userId, setUserId] = useState<string | null>(null);
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);
  const [step, setStep] = useState<"number" | "message" | "groups">("number");
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [useDetailedScale, setUseDetailedScale] = useState(false);
  const [message, setMessage] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [showFirstInviteCheckin, setShowFirstInviteCheckin] = useState(false);
  const [firstInviteCheckinTime, setFirstInviteCheckinTime] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [totalCheckins, setTotalCheckins] = useState<number>(0);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  
  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordingComplete, setRecordingComplete] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (typeof window !== "undefined") {
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

      const { count: existingCheckins } = await supabase
        .from("checkins")
        .select("*", { count: "exact", head: true })
        .eq("user_id", currentUserId);

      if (inviteGroupId && (existingCheckins ?? 0) === 0 && typeof window !== "undefined") {
        const bannerKey = `first-invite-checkin-shown:${inviteGroupId}`;
        const alreadyShown = window.localStorage.getItem(bannerKey);
        if (!alreadyShown) {
          setShowFirstInviteCheckin(true);
          setFirstInviteCheckinTime(
            new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
          );
          window.localStorage.setItem(bannerKey, "1");
        }
      }

      // Get user's display name for notifications
      const { data: userProfile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", currentUserId)
        .maybeSingle();
      
      if (userProfile?.display_name) {
        setUserDisplayName(userProfile.display_name);
      }

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
          // If coming from invite, only select that group; otherwise select all
          if (inviteGroupId && regularGroups.some(g => g.id === inviteGroupId)) {
            setSelectedGroups(new Set([inviteGroupId]));
          } else {
            setSelectedGroups(new Set(regularGroups.map((g) => g.id)));
          }
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
  }, [router, inviteGroupId]);

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

      const preferredTypes = ["audio/mp4", "audio/aac", "audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm"];
      const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t));

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const recordedType = mediaRecorder.mimeType || mimeType || "audio/webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: recordedType });
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

      const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
      formData.append("audio", blob, `recording.${ext}`);

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
        const ext = audioBlob.type.includes("mp4") ? "m4a" : audioBlob.type.includes("ogg") ? "ogg" : "webm";
        const fileName = `checkin-audio/${userId}/${Date.now()}.${ext}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("audio")
          .upload(fileName, audioBlob, {
            contentType: audioBlob.type || "audio/webm",
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

      // Upload media (images) if exist - supports multiple
      const mediaUrls: string[] = [];
      if (selectedMedia.length > 0) {
        for (const file of selectedMedia) {
          const ext = file.name.split('.').pop() || 'jpg';
          const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from("checkin-media")
            .upload(fileName, file, {
              contentType: file.type,
              upsert: false,
            });

          if (uploadError) {
            console.error("Media upload error:", uploadError);
          } else if (uploadData) {
            const { data: urlData } = supabase.storage
              .from("checkin-media")
              .getPublicUrl(fileName);
            mediaUrls.push(urlData.publicUrl);
          }
        }
      }
      const mediaFileUrl = mediaUrls.length > 0 ? mediaUrls.join(",") : null;

      // Insert check-in
      const { data: checkin, error: checkinError } = await supabase
        .from("checkins")
        .insert({
          user_id: userId,
          number: selectedNumber,
          message: message.trim() || null,
          is_private: false,
          audio_url: audioFileUrl,
          media_url: mediaFileUrl,
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

        // Send SMS notifications to group members
        try {
          await fetch("/api/notify-checkin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId,
              userName: userDisplayName,
              checkinNumber: selectedNumber,
              groupIds: groupsToShare,
            }),
          });
        } catch (notifyError) {
          console.error("Failed to send check-in notifications:", notifyError);
        }
      }

      // Fetch total check-in count for this user
      const { count } = await supabase
        .from("checkins")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId);
      
      setTotalCheckins(count || 1);
      setSent(true);
      setTimeout(() => {
        // If came from invite, go to that group; otherwise go to groups list
        if (inviteGroupId) {
          router.push(`/groups/${inviteGroupId}`);
        } else {
          router.push("/groups");
        }
      }, 3000);
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

  // Color scheme classes
  const bgClass = "relative flex min-h-screen flex-col bg-[#0a0a0a] text-[#e8e6e3]";
  const headerClass = "flex items-center justify-between gap-4 border-b border-[#1a1a1a] bg-[#0f0f0f]/90 px-4 py-4";
  const cardBg = "bg-[#1a1a1a]";
  const textPrimary = "text-[#e8e6e3]";
  const textSecondary = "text-[#a8a6a3]";
  const inputClass = "rounded-3xl bg-[#1a1a1a] border-2 border-[#2a2a2a] px-5 py-4 text-xl text-[#e8e6e3] placeholder:text-[#666] outline-none focus:border-[#ffaa00] transition-colors duration-200";

  return (
    <div className={bgClass}>
      
      {/* Floating Back Button */}
      <motion.button
        type="button"
        onClick={withHaptics(() => router.back())}
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        whileTap={{ scale: 0.95 }}
        className="fixed top-4 left-4 z-30 h-10 w-10 rounded-full bg-[#1a1a1a] text-[#a8a6a3] flex items-center justify-center hover:bg-[#2a2a2a] transition-colors duration-200"
      >
        ←
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
              {showFirstInviteCheckin && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-8 rounded-3xl border border-[#2a2a2a] bg-[#1a1a1a] px-6 py-5"
                >
                  <p className="text-2xl font-semibold text-[#e8e6e3]">Time for your first check-in</p>
                  {firstInviteCheckinTime && (
                    <p className="mt-2 text-lg text-[#a8a6a3]">{firstInviteCheckinTime}</p>
                  )}
                </motion.div>
              )}

              <p className="text-2xl font-semibold text-[#e8e6e3] mb-10">
                Rate yourself on a scale of 1–10, with 1 being your lowest and 10 being your highest
              </p>

              {/* Simple 1-10 scale */}
              <div className="w-full max-w-sm mx-auto">
                {/* Big editable number display with dynamic color */}
                <div className="flex flex-col items-center mb-8">
                  <div 
                    className={`w-44 h-44 rounded-3xl flex items-center justify-center cursor-pointer transition-all duration-300 ${
                      !selectedNumber ? 'bg-[#1a1a1a] border-2 border-[#2a2a2a]' :
                      selectedNumber <= 3 ? 'bg-[#8b0000]/20 border-2 border-[#8b0000]' :
                      selectedNumber <= 5 ? 'bg-[#b8860b]/20 border-2 border-[#b8860b]' :
                      selectedNumber <= 7 ? 'bg-[#2e8b57]/20 border-2 border-[#2e8b57]' :
                      'bg-[#16a34a]/20 border-2 border-[#16a34a]'
                    }`}
                    onClick={() => {
                      const input = document.getElementById('number-input') as HTMLInputElement;
                      input?.focus();
                    }}
                  >
                    <input
                      id="number-input"
                      type="number"
                      min="1"
                      max="10"
                      value={selectedNumber || ""}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (val >= 1 && val <= 10) {
                          setSelectedNumber(val);
                        } else if (e.target.value === "") {
                          setSelectedNumber(null);
                        }
                      }}
                      placeholder="5"
                      className={`w-full h-full text-8xl font-bold text-center bg-transparent outline-none transition-colors duration-300 ${
                        !selectedNumber ? 'text-[#666]' :
                        selectedNumber <= 3 ? 'text-[#dc2626]' :
                        selectedNumber <= 5 ? 'text-[#eab308]' :
                        selectedNumber <= 7 ? 'text-[#22c55e]' :
                        'text-[#16a34a]'
                      } placeholder:text-[#444]`}
                    />
                  </div>
                  <p className="text-sm text-[#666] mt-3">
                    {!selectedNumber ? 'Select a number' :
                     selectedNumber <= 3 ? 'Rough day' :
                     selectedNumber <= 5 ? 'Getting by' :
                     selectedNumber <= 7 ? 'Doing well' :
                     'Feeling great!'}
                  </p>
                </div>
                
                {/* Larger, more prominent slider */}
                <div className="relative mb-10 px-2">
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={selectedNumber || 5}
                    onChange={(e) => {
                      setSelectedNumber(parseInt(e.target.value));
                    }}
                    className="w-full h-4 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-8 [&::-webkit-slider-thumb]:h-8 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#3a3a3a] [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-8 [&::-moz-range-thumb]:h-8 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[#3a3a3a] [&::-moz-range-thumb]:cursor-pointer"
                    style={{
                      background: `linear-gradient(to right, #dc2626 0%, #eab308 50%, #22c55e 100%)`,
                    }}
                  />
                  {/* Scale labels */}
                  <div className="flex justify-between mt-3 px-1">
                    <span className="text-sm text-[#666]">1</span>
                    <span className="text-sm text-[#666]">5</span>
                    <span className="text-sm text-[#666]">10</span>
                  </div>
                </div>
                
                {/* Continue button */}
                <button
                  type="button"
                  disabled={!selectedNumber}
                  onClick={withHaptics(() => {
                    setStep("message");
                  })}
                  className="w-full rounded-2xl bg-[#e8e6e3] px-6 py-5 text-xl font-semibold text-[#1a1a1a] uppercase tracking-wider disabled:opacity-30"
                >
                  Continue
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 2: Message + Share */}
          {step === "message" && !sent && (
            <motion.div
              key="message"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-lg text-center"
            >
              <p className={`text-3xl font-bold ${textPrimary} mb-1`}>
                Add a few words <span className="text-[#666]">(optional)</span>
              </p>
              <p className={`text-lg ${textSecondary} mb-6`}>
                Share what&apos;s on your mind
              </p>

              {/* Recording states */}
              {isRecording ? (
                <motion.div
                  initial={{ scale: 0.9 }}
                  animate={{ scale: [1, 1.02, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="py-6"
                >
                  <motion.button
                    type="button"
                    onClick={withHaptics(stopRecording)}
                    className="w-24 h-24 rounded-full flex items-center justify-center text-4xl bg-[#8b0000] border-2 border-[#6b0000] mx-auto"
                  >
                    ⏹️
                  </motion.button>
                  <p className={`text-lg mt-3 ${textSecondary}`}>Tap to stop</p>
                </motion.div>
              ) : isTranscribing ? (
                <motion.div className="py-6">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="text-4xl mb-2"
                  >
                    ⏳
                  </motion.div>
                  <span className={`text-lg ${textSecondary}`}>Transcribing...</span>
                </motion.div>
              ) : (
                <>
                  {/* Large text area */}
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type here..."
                    className="w-full min-h-[160px] resize-none mb-4 text-xl rounded-2xl p-4 bg-[#1a1a1a] border border-[#2a2a2a] text-[#e8e6e3] placeholder:text-[#666]"
                  />

                  {/* Media previews - multiple images */}
                  {mediaPreviews.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {mediaPreviews.map((preview, index) => (
                        <div key={index} className="relative">
                          <img src={preview} alt={`Preview ${index + 1}`} className="h-20 w-20 object-cover rounded-xl" />
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedMedia(prev => prev.filter((_, i) => i !== index));
                              setMediaPreviews(prev => prev.filter((_, i) => i !== index));
                            }}
                            className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-zinc-800 text-white text-xs flex items-center justify-center"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Audio saved indicator */}
                  {audioUrl && (
                    <div className="mb-4 px-4 py-2 rounded-full inline-flex items-center gap-2 bg-[#1a1a1a]">
                      <span className="text-[#4CAF50]">🎙️ Voice saved</span>
                      <button type="button" onClick={withHaptics(removeAudio)} className="text-[#666] hover:text-[#a8a6a3]">✕</button>
                    </div>
                  )}

                  {/* Action buttons row: mic + image */}
                  <div className="flex items-center justify-center gap-4 mb-6">
                    <input
                      ref={mediaInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        const remaining = 5 - selectedMedia.length;
                        const newFiles = files.slice(0, remaining);
                        if (newFiles.length > 0) {
                          setSelectedMedia(prev => [...prev, ...newFiles]);
                          setMediaPreviews(prev => [...prev, ...newFiles.map(f => URL.createObjectURL(f))]);
                        }
                        e.target.value = ''; // Reset input
                      }}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={withHaptics(() => mediaInputRef.current?.click())}
                      disabled={selectedMedia.length >= 5}
                      className="h-12 w-12 rounded-full flex items-center justify-center text-xl bg-[#1a1a1a] border border-[#2a2a2a] disabled:opacity-50 transition-colors duration-200"
                    >
                      {selectedMedia.length > 0 ? `${selectedMedia.length}/5` : "📷"}
                    </button>
                    <button
                      type="button"
                      onClick={withHaptics(startRecording)}
                      className="h-12 w-12 rounded-full flex items-center justify-center text-xl bg-[#1a1a1a] border border-[#2a2a2a] transition-colors duration-200"
                    >
                      🎙️
                    </button>
                  </div>

                  {/* Single Share button - auto-share if only one group */}
                  <button
                    type="button"
                    onClick={withHaptics(() => {
                      if (groups.length === 1 && !selectedPerson) {
                        // Auto-select the single group and share
                        setSelectedGroups(new Set([groups[0].id]));
                        setTimeout(() => handleShare(), 100);
                      } else {
                        setShowGroupModal(true);
                      }
                    })}
                    className="w-full rounded-2xl bg-gradient-to-b from-[#f0f0f0] to-[#c0c0c0] px-6 py-5 text-2xl font-bold text-[#1a1a1a] shadow-lg"
                  >
                    Share
                  </button>
                </>
              )}
            </motion.div>
          )}

          {/* Step 3: Group Selection */}
          {step === "groups" && !sent && (
            <motion.div
              key="groups"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-lg"
            >
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
                  className="flex-1 rounded-2xl bg-[#1a1a1a] border border-[#2a2a2a] px-6 py-5 text-2xl font-medium text-[#a8a6a3] hover:bg-[#2a2a2a] transition-colors duration-200"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={withHaptics(handleShare)}
                  disabled={sending}
                  className="flex-1 rounded-2xl bg-gradient-to-b from-[#f0f0f0] to-[#c0c0c0] px-6 py-5 text-2xl font-bold text-[#1a1a1a] shadow-lg disabled:opacity-30"
                >
                  {sending ? "..." : selectedPerson ? `Send to ${people.find(p => p.id === selectedPerson)?.display_name || "them"} ✓` : groups.length === 0 && people.length === 0 ? "Save ✓" : "Share ✓"}
                </button>
              </div>
            </motion.div>
          )}

          {/* Success State with Checkmark Animation */}
          {sent && (
            <motion.div
              key="sent"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center flex flex-col items-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 10, delay: 0.1 }}
                className="w-24 h-24 rounded-full bg-[#22c55e] flex items-center justify-center mb-6"
              >
                <motion.span
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-5xl text-white"
                >
                  ✓
                </motion.span>
              </motion.div>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className={`text-2xl font-semibold ${textPrimary}`}
              >
                Check-in saved
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Modal for Group Selection */}
      <AnimatePresence>
        {showGroupModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60"
            onClick={() => setShowGroupModal(false)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-0 left-0 right-0 rounded-t-3xl p-6 max-h-[70vh] overflow-y-auto bg-[#0f0f0f]"
            >
              <div className="w-12 h-1 bg-zinc-600 rounded-full mx-auto mb-6" />
              
              <p className={`text-2xl font-bold ${textPrimary} mb-4 text-center`}>
                Share with
              </p>

              {/* No groups message */}
              {groups.length === 0 && people.length === 0 && (
                <div className="text-center p-6 rounded-2xl mb-4 bg-[#1a1a1a]">
                  <p className="text-lg text-[#a8a6a3]">
                    No groups yet. This will be saved privately.
                  </p>
                </div>
              )}

              {/* Group selection */}
              {groups.length > 0 && (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {groups.map((group) => (
                    <button
                      key={group.id}
                      type="button"
                      onClick={withHaptics(() => toggleGroup(group.id))}
                      className={`relative overflow-hidden rounded-2xl ${
                        selectedGroups.has(group.id) 
                          ? "ring-2 ring-[#4CAF50]"
                          : "ring-1 ring-[#2a2a2a]"
                      }`}
                    >
                      <div className="h-24 w-full overflow-hidden">
                        {group.image_url ? (
                          <img src={group.image_url} alt={group.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-3xl font-bold bg-[#1a1a1a] text-[#666]">
                            {group.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                      {selectedGroups.has(group.id) && (
                        <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-sm">✓</div>
                      )}
                      <div className="p-2 bg-[#1a1a1a]">
                        <p className="text-sm font-medium truncate text-[#e8e6e3]">{group.name}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Submit button */}
              <button
                type="button"
                onClick={withHaptics(() => {
                  setShowGroupModal(false);
                  handleShare();
                })}
                disabled={sending}
                className="w-full rounded-2xl bg-gradient-to-b from-[#f0f0f0] to-[#c0c0c0] px-6 py-5 text-xl font-bold text-[#1a1a1a] shadow-lg disabled:opacity-30"
              >
                {sending ? "Submitting..." : "Submit"}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function CheckInPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]"><span className="text-xl text-[#a8a6a3]">Loading...</span></div>}>
      <CheckInContent />
    </Suspense>
  );
}
