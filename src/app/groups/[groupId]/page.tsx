"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { withHaptics } from "@/lib/haptics";

type CheckIn = {
  id: string;
  user_id: string;
  number: number;
  message: string | null;
  audio_url?: string | null;
  created_at: string;
  profile?: {
    display_name: string | null;
    avatar_url: string | null;
  };
  reactions?: { emoji: string; user_id: string }[];
};

type Message = {
  id: string;
  user_id: string;
  text: string;
  audio_url?: string | null;
  image_url?: string | null;
  created_at: string;
  checkin_id?: string | null;
  group_id?: string | null;
  profile?: {
    display_name: string | null;
    avatar_url: string | null;
  };
};

type GroupMeta = {
  id: string;
  name: string;
  owner_id: string;
  image_url?: string | null;
};

const REACTION_EMOJIS = ["❤️", "🫂", "💪", "🙏", "💜"];

export default function GroupDetailPage() {
  const router = useRouter();
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [group, setGroup] = useState<GroupMeta | null>(null);
  const [checkins, setCheckins] = useState<CheckIn[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessageText, setNewMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [profilesById, setProfilesById] = useState<Record<string, { avatar_url: string | null; display_name: string | null }>>({});
  const [showFullImage, setShowFullImage] = useState(false);
  const [reactionPickerCheckinId, setReactionPickerCheckinId] = useState<string | null>(null);
  const [lastTapTime, setLastTapTime] = useState<Record<string, number>>({});
  
  // Image upload state
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null);
  const [isReadyToSend, setIsReadyToSend] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const bgClass = "flex flex-col min-h-screen bg-[#0a0a0a] text-[#e8e6e3]";
  const headerClass =
    "flex items-center justify-between gap-4 border-b border-[#1a1a1a] bg-[#0f0f0f]/90 px-4 py-4";
  const cardClass = "rounded-2xl bg-[#1a1a1a] border border-[#2a2a2a] p-4";
  const inputClass =
    "flex-1 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] px-4 py-3 text-[#e8e6e3] placeholder:text-[#666] outline-none focus:border-[#888]";

  useEffect(() => {
    async function loadData() {
      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData.user?.id ?? null;

      if (!currentUserId) {
        router.replace("/");
        return;
      }

      setUserId(currentUserId);

      // Fetch group details
      const { data: groupData } = await supabase
        .from("groups")
        .select("id, name, owner_id, image_url")
        .eq("id", groupId)
        .single();

      if (groupData) {
        // Check if this is a DM (name contains " + " pattern)
        const isDM = groupData.name.includes(" + ");
        
        if (isDM) {
          // Fetch group members to find the other person
          const { data: members } = await supabase
            .from("group_memberships")
            .select("user_id")
            .eq("group_id", groupId);
          
          if (members && members.length === 2) {
            const otherUserId = members.find(m => m.user_id !== currentUserId)?.user_id;
            if (otherUserId) {
              const { data: otherProfile } = await supabase
                .from("profiles")
                .select("display_name, avatar_url")
                .eq("id", otherUserId)
                .single();
              
              if (otherProfile) {
                // Override group name and image with other person's info
                setGroup({
                  ...groupData,
                  name: otherProfile.display_name || "Friend",
                  image_url: otherProfile.avatar_url || groupData.image_url,
                });
              } else {
                setGroup(groupData);
              }
            } else {
              setGroup(groupData);
            }
          } else {
            setGroup(groupData);
          }
        } else {
          setGroup(groupData);
        }
      }

      // Fetch check-ins for this group (via checkin_groups junction)
      const { data: checkinGroupsData } = await supabase
        .from("checkin_groups")
        .select("checkin_id")
        .eq("group_id", groupId);

      const checkinIds = checkinGroupsData?.map(cg => cg.checkin_id) || [];

      if (checkinIds.length > 0) {
        const { data: checkinsData } = await supabase
          .from("checkins")
          .select("*")
          .in("id", checkinIds)
          .order("created_at", { ascending: true });

        if (checkinsData) {
          // Fetch profiles for check-in users
          const userIds = [...new Set(checkinsData.map(c => c.user_id))];
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, display_name, avatar_url")
            .in("id", userIds);

          const profileMap: Record<string, { avatar_url: string | null; display_name: string | null }> = {};
          profiles?.forEach(p => {
            profileMap[p.id] = { avatar_url: p.avatar_url, display_name: p.display_name };
          });
          setProfilesById(prev => ({ ...prev, ...profileMap }));

          // Fetch reactions for check-ins
          const { data: reactionsData } = await supabase
            .from("reactions")
            .select("checkin_id, emoji, user_id")
            .in("checkin_id", checkinIds);

          const reactionsMap: Record<string, { emoji: string; user_id: string }[]> = {};
          reactionsData?.forEach(r => {
            if (!reactionsMap[r.checkin_id]) reactionsMap[r.checkin_id] = [];
            reactionsMap[r.checkin_id].push({ emoji: r.emoji, user_id: r.user_id });
          });

          const checkinsWithData = checkinsData.map(c => ({
            ...c,
            profile: profileMap[c.user_id],
            reactions: reactionsMap[c.id] || [],
          }));

          setCheckins(checkinsWithData);
        }
      }

      // Fetch free-form messages for this group
      const { data: messagesData } = await supabase
        .from("messages")
        .select("*")
        .eq("group_id", groupId)
        .order("created_at", { ascending: true });

      if (messagesData) {
        const msgUserIds = [...new Set(messagesData.map(m => m.user_id))];
        const { data: msgProfiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", msgUserIds);

        const msgProfileMap: Record<string, { avatar_url: string | null; display_name: string | null }> = {};
        msgProfiles?.forEach(p => {
          msgProfileMap[p.id] = { avatar_url: p.avatar_url, display_name: p.display_name };
        });
        setProfilesById(prev => ({ ...prev, ...msgProfileMap }));

        const messagesWithProfiles = messagesData.map(m => ({
          ...m,
          profile: msgProfileMap[m.user_id],
        }));

        setMessages(messagesWithProfiles);
      }

      setLoading(false);

      // Mark group as visited for unread tracking
      if (typeof window !== "undefined") {
        const lastVisitsRaw = window.localStorage.getItem("groupLastVisits");
        const lastVisits = lastVisitsRaw ? JSON.parse(lastVisitsRaw) : {};
        lastVisits[groupId] = new Date().toISOString();
        window.localStorage.setItem("groupLastVisits", JSON.stringify(lastVisits));
      }
    }

    void loadData();
  }, [groupId, router]);

  // Real-time subscription for new messages
  useEffect(() => {
    if (!groupId) return;

    const channel = supabase
      .channel(`group-${groupId}-messages`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `group_id=eq.${groupId}` },
        async (payload) => {
          const newMsg = payload.new as Message;
          // Fetch profile for new message
          const { data: profile } = await supabase
            .from("profiles")
            .select("display_name, avatar_url")
            .eq("id", newMsg.user_id)
            .single();

          setMessages(prev => [...prev, { ...newMsg, profile: profile || undefined }]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId]);

  // Real-time subscription for new check-ins
  useEffect(() => {
    if (!groupId) return;

    const channel = supabase
      .channel(`group-${groupId}-checkins`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "checkin_groups", filter: `group_id=eq.${groupId}` },
        async (payload) => {
          const checkinGroupRow = payload.new as { checkin_id: string };
          // Fetch the full check-in
          const { data: checkinData } = await supabase
            .from("checkins")
            .select("*")
            .eq("id", checkinGroupRow.checkin_id)
            .single();

          if (checkinData) {
            // Fetch profile
            const { data: profile } = await supabase
              .from("profiles")
              .select("display_name, avatar_url")
              .eq("id", checkinData.user_id)
              .single();

            const newCheckin = { ...checkinData, profile: profile || undefined, reactions: [] };
            // Avoid duplicates and add to end
            setCheckins(prev => {
              if (prev.some(c => c.id === newCheckin.id)) return prev;
              return [...prev, newCheckin];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId]);

  // Scroll to bottom when messages or checkins change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, checkins]);

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessageText.trim() || !userId || !groupId) return;

    setSendingMessage(true);

    const { data, error } = await supabase.from("messages").insert({
      group_id: groupId,
      user_id: userId,
      text: newMessageText.trim(),
    }).select();

    console.log("Message insert result:", { data, error });

    if (error) {
      console.error("Error sending message:", error);
    } else {
      setNewMessageText("");
      // Manually add message to state if realtime doesn't work
      if (data && data[0]) {
        const newMsg = data[0];
        // Fetch user's own profile if not already in state
        let profile = profilesById[userId];
        if (!profile) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("display_name, avatar_url")
            .eq("id", userId)
            .single();
          if (profileData) {
            profile = profileData;
            setProfilesById(prev => ({ ...prev, [userId]: profileData }));
          }
        }
        setMessages(prev => [...prev, { ...newMsg, profile }]);
      }
    }

    setSendingMessage(false);
  }

  // Image upload functions
  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  async function sendImageMessage() {
    if (!userId || !selectedImage) return;
    setUploadingImage(true);

    try {
      // Upload image to Supabase storage
      const fileName = `chat-images/${groupId}/${userId}/${Date.now()}-${selectedImage.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("images")
        .upload(fileName, selectedImage, {
          contentType: selectedImage.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage.from("images").getPublicUrl(fileName);
      const imageUrl = urlData.publicUrl;

      // Insert message with image
      const { data, error } = await supabase.from("messages").insert({
        group_id: groupId,
        user_id: userId,
        text: newMessageText.trim() || "📷 Photo",
        image_url: imageUrl,
      }).select();

      if (error) throw error;

      // Add to local state
      if (data && data[0]) {
        const newMsg = data[0];
        let profile = profilesById[userId];
        if (!profile) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("display_name, avatar_url")
            .eq("id", userId)
            .single();
          if (profileData) {
            profile = profileData;
            setProfilesById(prev => ({ ...prev, [userId]: profileData }));
          }
        }
        setMessages(prev => [...prev, { ...newMsg, profile }]);
      }

      // Clear state
      setSelectedImage(null);
      setImagePreview(null);
      setNewMessageText("");
    } catch (err) {
      console.error("Error uploading image:", err);
      alert("Failed to upload image. Please try again.");
    }

    setUploadingImage(false);
  }

  // Audio recording functions
  async function startRecording() {
    // Reset any previous recording
    setRecordedAudioBlob(null);
    setIsReadyToSend(false);
    
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

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach(track => track.stop());
        // Save blob and show ready to send state
        setRecordedAudioBlob(audioBlob);
        setIsReadyToSend(true);
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

  function cancelRecording() {
    setRecordedAudioBlob(null);
    setIsReadyToSend(false);
  }

  async function confirmSendAudio() {
    if (recordedAudioBlob) {
      await sendAudioMessage(recordedAudioBlob);
      setRecordedAudioBlob(null);
      setIsReadyToSend(false);
    }
  }

  async function sendAudioMessage(audioBlob: Blob) {
    if (!userId || !groupId) return;
    setIsTranscribing(true);
    setSendingMessage(true);

    try {
      // Upload audio to Supabase Storage
      const fileName = `chat-audio/${groupId}/${userId}/${Date.now()}.webm`;
      const { error: uploadError } = await supabase.storage
        .from("audio")
        .upload(fileName, audioBlob, { contentType: "audio/webm" });

      if (uploadError) {
        console.error("Audio upload error:", uploadError);
        throw uploadError;
      }

      const { data: urlData } = supabase.storage.from("audio").getPublicUrl(fileName);
      const audioUrl = urlData.publicUrl;

      // Transcribe the audio
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");
      const transcribeResponse = await fetch("/api/transcribe", { method: "POST", body: formData });
      let transcribedText = "";
      if (transcribeResponse.ok) {
        const { text } = await transcribeResponse.json();
        transcribedText = text || "";
      }

      // Send message with audio URL and transcription
      const messageText = transcribedText || "🎤 Voice message";
      const { data, error } = await supabase.from("messages").insert({
        group_id: groupId,
        user_id: userId,
        text: messageText,
        audio_url: audioUrl,
      }).select();

      if (error) throw error;

      if (data && data[0]) {
        let profile = profilesById[userId];
        if (!profile) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("display_name, avatar_url")
            .eq("id", userId)
            .single();
          if (profileData) {
            profile = profileData;
            setProfilesById(prev => ({ ...prev, [userId]: profileData }));
          }
        }
        setMessages(prev => [...prev, { ...data[0], profile }]);
      }
    } catch (error) {
      console.error("Error sending audio message:", error);
    } finally {
      setIsTranscribing(false);
      setSendingMessage(false);
    }
  }

  function handleDoubleTap(checkinId: string) {
    const now = Date.now();
    const lastTap = lastTapTime[checkinId] || 0;
    if (now - lastTap < 300) {
      // Double tap detected - show reaction picker
      setReactionPickerCheckinId(checkinId);
      setLastTapTime(prev => ({ ...prev, [checkinId]: 0 }));
    } else {
      setLastTapTime(prev => ({ ...prev, [checkinId]: now }));
    }
  }

  function handleCloseReactionPicker() {
    setReactionPickerCheckinId(null);
  }

  async function handleReaction(checkinId: string, emoji: string) {
    if (!userId) return;
    setReactionPickerCheckinId(null); // Close picker after reaction

    // Check if user already reacted with this emoji
    const existing = checkins.find(c => c.id === checkinId)?.reactions?.find(
      r => r.user_id === userId && r.emoji === emoji
    );

    if (existing) {
      // Remove reaction
      await supabase
        .from("reactions")
        .delete()
        .eq("checkin_id", checkinId)
        .eq("user_id", userId)
        .eq("emoji", emoji);

      setCheckins(prev =>
        prev.map(c =>
          c.id === checkinId
            ? { ...c, reactions: c.reactions?.filter(r => !(r.user_id === userId && r.emoji === emoji)) }
            : c
        )
      );
    } else {
      // Add reaction
      await supabase.from("reactions").insert({
        checkin_id: checkinId,
        user_id: userId,
        emoji,
      });

      setCheckins(prev =>
        prev.map(c =>
          c.id === checkinId
            ? { ...c, reactions: [...(c.reactions || []), { emoji, user_id: userId }] }
            : c
        )
      );
    }
  }

  function formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  // Combine check-ins and messages into a single timeline sorted by created_at
  type TimelineItem = 
    | { type: "checkin"; data: CheckIn; created_at: string }
    | { type: "message"; data: Message; created_at: string };
  
  const timeline: TimelineItem[] = [
    ...checkins.map(c => ({ type: "checkin" as const, data: c, created_at: c.created_at })),
    ...messages.map(m => ({ type: "message" as const, data: m, created_at: m.created_at })),
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <p className="text-xl text-[#a8a6a3]">Loading...</p>
      </div>
    );
  }

  return (
    <div className={bgClass}>
      {/* Back Button - simple style */}
      <button
        type="button"
        onClick={withHaptics(() => router.push("/groups"))}
        className="fixed top-4 left-4 z-30 h-10 w-10 rounded-full bg-[#1a1a1a] text-[#a8a6a3] flex items-center justify-center hover:bg-[#2a2a2a] transition-colors"
      >
        ←
      </button>

      {/* Header - QWF style with group image */}
      <header className={headerClass}>
        <div className="w-24" /> {/* Spacer for floating back button */}
        {/* Title - clickable to open settings */}
        <button
          type="button"
          onClick={withHaptics(() => router.push(`/groups/${groupId}/settings`))}
          className="flex items-center justify-center gap-3 flex-1 hover:opacity-80 transition"
        >
          {/* Group Image */}
          <div className="h-12 w-12 rounded-full overflow-hidden flex-shrink-0 bg-[#1a1a1a] border border-[#2a2a2a]">
            {group?.image_url ? (
              <img src={group.image_url} alt={group.name} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-lg font-bold text-[#a8a6a3]">
                {group?.name?.[0]?.toUpperCase() || "G"}
              </div>
            )}
          </div>
          <h1 className="text-2xl font-bold truncate max-w-[200px]">{group?.name || "Group"}</h1>
        </button>
        <div className="w-16" /> {/* Spacer for balance */}
      </header>

      {/* Main Content - Scrollable - UNIFIED TIMELINE */}
      <main className="flex-1 overflow-y-auto px-4 py-4 pb-32">
        {timeline.length === 0 && (
          <div className="text-center py-20">
            <p className="text-2xl font-bold text-[#e8e6e3]">No messages yet</p>
            <p className="text-lg mt-2 text-[#666]">Start the conversation.</p>
          </div>
        )}

        {timeline.length > 0 && (
          <div className="space-y-6">
            {timeline.map((item, index) => {
              if (item.type === "checkin") {
                const checkin = item.data;
                const isMe = checkin.user_id === userId;
                const displayName = isMe ? "You" : (checkin.profile?.display_name || "Friend");
                const avatarUrl = checkin.profile?.avatar_url;

                return (
                  <motion.div
                    key={checkin.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.05 }}
                    className="relative flex items-start gap-4 cursor-pointer"
                    onClick={() => handleDoubleTap(checkin.id)}
                  >
                    {/* Reaction picker */}
                    {reactionPickerCheckinId === checkin.id && (
                      <>
                        <div 
                          className="fixed inset-0 z-10" 
                          onClick={(e) => { e.stopPropagation(); handleCloseReactionPicker(); }}
                        />
                        <div className="absolute -top-12 left-20 z-20 flex gap-2 rounded-full border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-2 shadow-lg">
                          {REACTION_EMOJIS.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={(e) => { e.stopPropagation(); withHaptics(() => handleReaction(checkin.id, emoji))(); }}
                              className="text-3xl hover:scale-125 transition"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    
                    {/* Avatar - clickable to play audio if available */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (checkin.audio_url) {
                          const audio = document.getElementById(`checkin-audio-${checkin.id}`) as HTMLAudioElement;
                          const playBtn = document.getElementById(`checkin-play-${checkin.id}`);
                          if (audio) {
                            if (audio.paused) {
                              audio.play();
                              if (playBtn) playBtn.textContent = "⏸";
                            } else {
                              audio.pause();
                              if (playBtn) playBtn.textContent = "▶";
                            }
                          }
                        }
                      }}
                      className={`flex-shrink-0 h-12 w-12 rounded-full overflow-hidden shadow ${checkin.audio_url ? "cursor-pointer hover:scale-105 transition" : ""}`}
                    >
                      {avatarUrl ? (
                        <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-lg font-bold bg-[#1a1a1a] border border-[#2a2a2a] text-[#a8a6a3]">
                          {displayName[0]}
                        </div>
                      )}
                    </button>
                    
                    {/* Audio Play Button */}
                    {checkin.audio_url && (
                      <div className="flex flex-col items-center flex-shrink-0">
                        <button
                          id={`checkin-play-${checkin.id}`}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const audio = document.getElementById(`checkin-audio-${checkin.id}`) as HTMLAudioElement;
                            const btn = e.currentTarget;
                            if (audio) {
                              if (audio.paused) {
                                audio.play();
                                btn.textContent = "⏸";
                              } else {
                                audio.pause();
                                btn.textContent = "▶";
                              }
                            }
                          }}
                          className="h-10 w-10 rounded-full bg-[#2a2a2a] border border-[#3a3a3a] text-[#e8e6e3] text-xl font-bold flex items-center justify-center hover:bg-[#3a3a3a] transition-colors"
                        >
                          ▶
                        </button>
                        <span id={`checkin-time-${checkin.id}`} className="text-xs text-[#666] mt-1 font-medium">0:00</span>
                        <audio 
                          id={`checkin-audio-${checkin.id}`} 
                          src={checkin.audio_url} 
                          preload="metadata"
                          className="hidden"
                          onError={(e) => console.error("Audio error:", e)}
                          onTimeUpdate={(e) => {
                            const audio = e.currentTarget;
                            const timeEl = document.getElementById(`checkin-time-${checkin.id}`);
                            if (timeEl && audio.duration) {
                              const mins = Math.floor(audio.currentTime / 60);
                              const secs = Math.floor(audio.currentTime % 60);
                              const totalMins = Math.floor(audio.duration / 60);
                              const totalSecs = Math.floor(audio.duration % 60);
                              timeEl.textContent = `${mins}:${secs.toString().padStart(2, "0")} / ${totalMins}:${totalSecs.toString().padStart(2, "0")}`;
                            }
                          }}
                          onEnded={(e) => {
                            const playBtn = document.getElementById(`checkin-play-${checkin.id}`);
                            if (playBtn) playBtn.textContent = "▶";
                          }}
                        />
                      </div>
                    )}
                    
                    {/* Content - text to the right */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xl font-bold mb-1 text-[#e8e6e3]">
                        {displayName}
                      </p>
                      
                      {/* Check-in text - emoji scale (101-103) vs number scale (1-10) */}
                      <p className="text-2xl text-[#e8e6e3]">
                        {checkin.number === 101 
                          ? `I'm feeling sad today.${checkin.message ? ` ${checkin.message}` : ""}`
                          : checkin.number === 102 
                          ? `I'm feeling okay today.${checkin.message ? ` ${checkin.message}` : ""}`
                          : checkin.number === 103 
                          ? `I'm feeling good today.${checkin.message ? ` ${checkin.message}` : ""}`
                          : `I'm at a ${checkin.number} today.${checkin.message ? ` ${checkin.message}` : ""}`
                        }
                      </p>
                      
                      {/* Reactions */}
                      {checkin.reactions && checkin.reactions.length > 0 && (
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {Object.entries(
                            checkin.reactions.reduce((acc, r) => {
                              acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                              return acc;
                            }, {} as Record<string, number>)
                          ).map(([emoji, count]) => {
                            const hasReacted = checkin.reactions?.some(r => r.emoji === emoji && r.user_id === userId);
                            return (
                              <button
                                key={emoji}
                                type="button"
                                onClick={(e) => { e.stopPropagation(); withHaptics(() => handleReaction(checkin.id, emoji))(); }}
                                className={`px-3 py-1 rounded-full text-lg transition ${
                                  hasReacted
                                    ? "bg-[#e8e6e3] text-[#1a1a1a] border border-[#e8e6e3]"
                                    : "bg-[#1a1a1a] text-[#e8e6e3] border border-[#2a2a2a] hover:border-[#3a3a3a]"
                                }`}
                              >
                                {emoji} {count}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      
                      <p className="mt-2 text-base text-[#666]">
                        {formatTime(checkin.created_at)}
                      </p>
                    </div>
                  </motion.div>
                );
              } else {
                // Message item
                const msg = item.data;
                const isMe = msg.user_id === userId;
                const displayName = isMe ? "You" : (msg.profile?.display_name || "Friend");
                const avatarUrl = msg.profile?.avatar_url;

                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.03 }}
                    className="flex items-start gap-5"
                  >
                    {/* Avatar - clickable to play audio if available */}
                    <button
                      type="button"
                      onClick={() => {
                        if (msg.audio_url) {
                          const audio = document.getElementById(`audio-${msg.id}`) as HTMLAudioElement;
                          const playBtn = document.getElementById(`msg-play-${msg.id}`);
                          if (audio) {
                            if (audio.paused) {
                              audio.play();
                              if (playBtn) playBtn.textContent = "⏸";
                            } else {
                              audio.pause();
                              if (playBtn) playBtn.textContent = "▶";
                            }
                          }
                        }
                      }}
                      className={`flex-shrink-0 h-12 w-12 rounded-full overflow-hidden shadow ${msg.audio_url ? "cursor-pointer hover:scale-105 transition" : ""}`}
                    >
                      {avatarUrl ? (
                        <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-lg font-bold bg-[#1a1a1a] border border-[#2a2a2a] text-[#a8a6a3]">
                          {displayName[0]}
                        </div>
                      )}
                    </button>
                    
                    {/* Audio Play Button */}
                    {msg.audio_url && (
                      <div className="flex flex-col items-center flex-shrink-0">
                        <button
                          id={`msg-play-${msg.id}`}
                          type="button"
                          onClick={(e) => {
                            const audio = document.getElementById(`audio-${msg.id}`) as HTMLAudioElement;
                            const btn = e.currentTarget;
                            if (audio) {
                              if (audio.paused) {
                                audio.play();
                                btn.textContent = "⏸";
                              } else {
                                audio.pause();
                                btn.textContent = "▶";
                              }
                            }
                          }}
                          className="h-10 w-10 rounded-full bg-[#2a2a2a] border border-[#3a3a3a] text-[#e8e6e3] text-xl font-bold flex items-center justify-center hover:bg-[#3a3a3a] transition-colors"
                        >
                          ▶
                        </button>
                        <span id={`msg-time-${msg.id}`} className="text-xs text-[#666] mt-1 font-medium">0:00</span>
                        <audio 
                          id={`audio-${msg.id}`} 
                          src={msg.audio_url} 
                          preload="metadata"
                          className="hidden"
                          onError={(e) => console.error("Audio error:", e)}
                          onTimeUpdate={(e) => {
                            const audio = e.currentTarget;
                            const timeEl = document.getElementById(`msg-time-${msg.id}`);
                            if (timeEl && audio.duration) {
                              const mins = Math.floor(audio.currentTime / 60);
                              const secs = Math.floor(audio.currentTime % 60);
                              const totalMins = Math.floor(audio.duration / 60);
                              const totalSecs = Math.floor(audio.duration % 60);
                              timeEl.textContent = `${mins}:${secs.toString().padStart(2, "0")} / ${totalMins}:${totalSecs.toString().padStart(2, "0")}`;
                            }
                          }}
                          onEnded={() => {
                            const playBtn = document.getElementById(`msg-play-${msg.id}`);
                            if (playBtn) playBtn.textContent = "▶";
                          }}
                        />
                      </div>
                    )}
                    
                    {/* Content - text to the right */}
                    <div className="flex-1 min-w-0">
                      <p className="text-2xl font-bold text-[#e8e6e3]">
                        {displayName}
                      </p>
                      {/* Image if present */}
                      {msg.image_url && (
                        <img 
                          src={msg.image_url} 
                          alt="Shared image" 
                          className="mt-2 rounded-2xl max-w-full max-h-80 object-contain cursor-pointer hover:opacity-90 transition"
                          onClick={() => setViewingImage(msg.image_url!)}
                        />
                      )}
                      <p className="text-2xl mt-1 text-[#a8a6a3]">
                        {msg.text}
                      </p>
                      <p className="mt-2 text-lg text-[#666]">
                        {formatTime(msg.created_at)}
                      </p>
                    </div>
                  </motion.div>
                );
              }
            })}
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Hidden Image Input */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*,video/*"
        onChange={handleImageSelect}
        className="hidden"
      />

      {/* Image Preview Modal */}
      {imagePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-3xl p-6 max-w-lg w-full">
            <img src={imagePreview} alt="Preview" className="w-full rounded-2xl mb-4 max-h-80 object-contain" />
            <input
              type="text"
              value={newMessageText}
              onChange={(e) => setNewMessageText(e.target.value)}
              placeholder="Add a caption..."
              className="w-full rounded-full border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-3 text-lg mb-4 outline-none text-[#e8e6e3] placeholder:text-[#666] focus:border-[#888]"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setSelectedImage(null); setImagePreview(null); }}
                className="flex-1 py-4 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#e8e6e3] text-xl font-bold hover:bg-[#2a2a2a] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={sendImageMessage}
                disabled={uploadingImage}
                className="flex-1 py-4 rounded-full bg-[#e8e6e3] text-[#1a1a1a] text-xl font-bold disabled:opacity-30 hover:bg-[#d0d0d0] transition-colors"
              >
                {uploadingImage ? "Sending..." : "Send →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Message Input - Fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-[#0f0f0f]/90 border-t border-[#1a1a1a]">
        <form onSubmit={handleSendMessage} className="flex items-center gap-3 max-w-2xl mx-auto">
          {/* Image/Video Upload Button */}
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className="h-10 w-10 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#a8a6a3] text-lg flex items-center justify-center flex-shrink-0 hover:bg-[#2a2a2a] transition-colors"
          >
            +
          </button>
          <input
            type="text"
            value={newMessageText}
            onChange={(e) => setNewMessageText(e.target.value)}
            placeholder="Type a message..."
            className={inputClass}
          />
          <button
            type="submit"
            disabled={!newMessageText.trim() || sendingMessage}
            className="h-10 w-10 rounded-full bg-[#e8e6e3] text-[#1a1a1a] text-lg flex items-center justify-center disabled:opacity-30 flex-shrink-0 hover:bg-[#d0d0d0] transition-colors"
          >
            {sendingMessage ? "..." : "→"}
          </button>
        </form>
      </div>


      {/* Full Image Modal - for group image */}
      <AnimatePresence>
        {showFullImage && group?.image_url && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
            onClick={() => setShowFullImage(false)}
          >
            <motion.img
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              src={group.image_url}
              alt={group.name}
              className="max-w-full max-h-full rounded-2xl object-contain"
            />
            <button
              type="button"
              onClick={() => setShowFullImage(false)}
              className="absolute top-6 right-6 text-white text-3xl"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Message Image Modal - for viewing shared images */}
      <AnimatePresence>
        {viewingImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4"
            onClick={() => setViewingImage(null)}
          >
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              src={viewingImage}
              alt="Shared image"
              className="max-w-full max-h-full object-contain"
            />
            <button
              type="button"
              onClick={() => setViewingImage(null)}
              className="absolute top-6 right-6 h-12 w-12 rounded-full bg-white/10 text-white text-2xl flex items-center justify-center hover:bg-white/20"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
