"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { uploadImage } from "@/lib/uploadImage";
import { withHaptics } from "@/lib/haptics";

type DailyQuestion = {
  id: string;
  question_text: string;
  answer_options?: string[] | null;
};

type Answer = {
  id: string;
  user_id: string;
  answer_text: string;
  created_at?: string;
  image_url?: string | null;
  reactions?: Record<string, string[]>;
};

type Message = {
  id: string;
  user_id: string;
  text: string;
  created_at: string;
  is_juggu?: boolean;
  reactions?: Record<string, string[]>; // emoji -> array of user_ids
};

const REACTION_EMOJIS = ["❤️", "😂", "😢", "😮", "👍"];

type GroupMeta = {
  id: string;
  name: string;
  question_prompt: string | null;
  owner_id: string;
  image_url?: string | null;
  juggu_enabled?: boolean;
  juggu_personality?: string | null;
};

export default function GroupDetailPage() {
  const router = useRouter();
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;

  const [userId, setUserId] = useState<string | null>(null);
  const [group, setGroup] = useState<GroupMeta | null>(null);
  const [question, setQuestion] = useState<DailyQuestion | null>(null);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [answersLoading, setAnswersLoading] = useState(false);
  const [pastQuestions, setPastQuestions] = useState<{ id: string; question_text: string; date_et: string; answers: Answer[]; messages: Message[] }[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [myAnswerText, setMyAnswerText] = useState("");
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [newMessageText, setNewMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [newQuestionLoading, setNewQuestionLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsName, setSettingsName] = useState("");
  const [settingsPrompt, setSettingsPrompt] = useState("");
  const [settingsImageUrl, setSettingsImageUrl] = useState("");
  const [settingsImageFile, setSettingsImageFile] = useState<File | null>(null);
  const [settingsJugguEnabled, setSettingsJugguEnabled] = useState(true);
  const [settingsJugguPersonality, setSettingsJugguPersonality] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [profilesById, setProfilesById] = useState<Record<string, { avatar_url: string | null; display_name: string | null }>>({});
  const [initialLoading, setInitialLoading] = useState(true);
  const [answerImageFile, setAnswerImageFile] = useState<File | null>(null);
  const [answerImagePreview, setAnswerImagePreview] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [answerCelebrating, setAnswerCelebrating] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserProfile, setSelectedUserProfile] = useState<{ display_name: string; avatar_url: string | null } | null>(null);
  const [selectedUserAnswers, setSelectedUserAnswers] = useState<{ question_text: string; answer_text: string; created_at: string; image_url?: string | null }[]>([]);
  const [loadingUserProfile, setLoadingUserProfile] = useState(false);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
  const [reactionPickerAnswerId, setReactionPickerAnswerId] = useState<string | null>(null);
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [lastTapTime, setLastTapTime] = useState<Record<string, number>>({});

  const hasAnswered = answers.some((answer) => answer.user_id === userId);

  function formatTimeAgo(iso?: string) {
    if (!iso) return "";
    const created = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    const diffSec = Math.max(0, Math.floor(diffMs / 1000));
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffDay > 0) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
    if (diffHour > 0)
      return `${diffHour} hour${diffHour === 1 ? "" : "s"} ago`;
    if (diffMin > 0)
      return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
    return "Just now";
  }

  useEffect(() => {
    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      const currentUserId = data.user?.id ?? null;
      if (!currentUserId) {
        router.replace("/");
        return;
      }
      setUserId(currentUserId);
      const { data: groupData } = await supabase
        .from("groups")
        .select("id, name, question_prompt, owner_id, image_url, juggu_enabled, juggu_personality")
        .eq("id", groupId)
        .single();
      if (groupData) {
        setGroup(groupData as GroupMeta);
        setSettingsName(groupData.name ?? "");
        setSettingsPrompt(groupData.question_prompt ?? "");
        setSettingsImageUrl(groupData.image_url ?? "");
        setSettingsJugguEnabled(groupData.juggu_enabled ?? true);
        setSettingsJugguPersonality(groupData.juggu_personality ?? "");
      }
      await loadTodayQuestionAndAnswers(groupId, currentUserId);
      setInitialLoading(false);
    }

    void loadUser();
  }, [groupId, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
    }
  }, []);

  useEffect(() => {
    function computeTimeLeft() {
      const now = new Date();

      // Get current time in EST/EDT timezone
      const etNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
      const etHour = etNow.getHours();
      const etMinute = etNow.getMinutes();
      const etSecond = etNow.getSeconds();

      // Calculate seconds until next 12:00 PM ET
      let secondsUntilTarget: number;
      const targetHour = 12;
      const targetMinute = 0;
      
      const currentMinutes = etHour * 60 + etMinute;
      const targetMinutes = targetHour * 60 + targetMinute;
      
      if (currentMinutes < targetMinutes || (currentMinutes === targetMinutes && etSecond === 0)) {
        // Before 12:12pm today - count down to today's 12:12pm
        secondsUntilTarget = (targetMinutes - currentMinutes) * 60 - etSecond;
      } else {
        // After 12:12pm - count down to tomorrow's 12:12pm
        secondsUntilTarget = (24 * 60 - currentMinutes + targetMinutes) * 60 - etSecond;
      }

      const totalSeconds = Math.max(0, secondsUntilTarget);
      const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
      const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
      const seconds = String(totalSeconds % 60).padStart(2, "0");
      setTimeLeft(`${hours}:${minutes}:${seconds}`);

      // When timer hits zero, trigger new question loading animation
      if (totalSeconds === 0 && !newQuestionLoading) {
        setNewQuestionLoading(true);
        // Wait a few seconds for cron to run, then reload the question
        setTimeout(() => {
          if (userId) {
            void loadTodayQuestionAndAnswers(groupId, userId);
          }
          setNewQuestionLoading(false);
        }, 10000); // Wait 10 seconds for cron to create the question
      }
    }

    computeTimeLeft();
    const interval = setInterval(computeTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [newQuestionLoading, userId, groupId]);

  useEffect(() => {
    if (!question) {
      setMessages([]);
      return;
    }

    void loadMessages(question.id);

    const channel = supabase
      .channel(`messages-question-${question.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `question_id=eq.${question.id}`,
        },
        (payload) => {
          const newRecord = payload.new as Message;
          setMessages((previous) => [...previous, newRecord]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [question?.id]);

  // Load profile avatars for any user_ids we see in answers/messages/past questions
  useEffect(() => {
    const ids = new Set<string>();
    for (const answer of answers) {
      if (answer.user_id) ids.add(answer.user_id);
    }
    for (const message of messages) {
      if (message.user_id) ids.add(message.user_id);
    }
    // Also include users from past questions
    for (const pq of pastQuestions) {
      for (const ans of pq.answers) {
        if (ans.user_id) ids.add(ans.user_id);
      }
      for (const msg of pq.messages) {
        if (msg.user_id) ids.add(msg.user_id);
      }
    }
    
    // Always include current user so their name is available for SMS notifications
    if (userId) ids.add(userId);

    const allIds = Array.from(ids);
    if (allIds.length === 0) return;

    async function loadProfiles() {
      // Always fetch fresh profile data to get updated names/avatars
      const { data } = await supabase
        .from("profiles")
        .select("id, avatar_url, display_name")
        .in("id", allIds);

      if (!data) return;

      setProfilesById((previous) => {
        const next = { ...previous };
        for (const row of data as { id: string; avatar_url: string | null; display_name: string | null }[]) {
          next[row.id] = { avatar_url: row.avatar_url, display_name: row.display_name };
        }
        return next;
      });
    }

    void loadProfiles();
  }, [answers, messages, pastQuestions, userId]);

  async function loadTodayQuestionAndAnswers(
    groupId: string,
    currentUserId: string
  ) {
    setQuestionLoading(true);
    setAnswersLoading(true);
    setError(null);

    // Get the most recent question for this group (questions are updated by cron at 12pm EST)
    const { data: existingQuestions, error: questionError } = await supabase
      .from("daily_questions")
      .select("id, question_text, answer_options, date_et")
      .eq("group_id", groupId)
      .order("date_et", { ascending: false })
      .limit(1);

    let currentQuestion: DailyQuestion | null = null;

    if (questionError) {
      setError(questionError.message);
      setQuestionLoading(false);
      setAnswersLoading(false);
      return;
    }

    if (!existingQuestions || existingQuestions.length === 0) {
      // No question exists - don't insert placeholder, just show waiting message
      // The cron job at 12pm ET will generate the first question
      setQuestion(null);
      setQuestionLoading(false);
      setAnswersLoading(false);
      return;
    } else {
      currentQuestion = existingQuestions[0] as DailyQuestion;
    }

    // Generate answer options if missing
    if (!currentQuestion.answer_options || currentQuestion.answer_options.length === 0) {
      try {
        const response = await fetch("/api/generate-sample-questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: currentQuestion.question_text, count: 1 }),
        });
        const data = await response.json();
        if (data.questionsWithOptions?.[0]?.options) {
          currentQuestion = { ...currentQuestion, answer_options: data.questionsWithOptions[0].options };
          // Save options to DB for future
          await supabase
            .from("daily_questions")
            .update({ answer_options: data.questionsWithOptions[0].options })
            .eq("id", currentQuestion.id);
        }
      } catch (e) {
        console.error("Failed to generate answer options", e);
      }
    }

    setQuestion(currentQuestion);
    setQuestionLoading(false);

    const { data: existingAnswers, error: answersError } = await supabase
      .from("answers")
      .select("id, user_id, answer_text, created_at, image_url, reactions")
      .eq("question_id", currentQuestion.id);

    if (answersError) {
      setError(answersError.message);
      setAnswers([]);
      setAnswersLoading(false);
      return;
    }

    setAnswers(existingAnswers ?? []);
    setAnswersLoading(false);

    const mine = (existingAnswers ?? []).find(
      (answer) => answer.user_id === currentUserId
    );
    if (mine) {
      void loadMessages(currentQuestion.id);
    }

    // Load past questions (excluding the current one)
    const { data: pastQuestionsData } = await supabase
      .from("daily_questions")
      .select("id, question_text, date_et")
      .eq("group_id", groupId)
      .neq("id", currentQuestion.id)
      .order("date_et", { ascending: false })
      .limit(30);

    if (pastQuestionsData && pastQuestionsData.length > 0) {
      const pastQIds = pastQuestionsData.map((q) => q.id);
      
      // Load answers for past questions
      const { data: pastAnswersData } = await supabase
        .from("answers")
        .select("id, user_id, answer_text, created_at, image_url, reactions, question_id")
        .in("question_id", pastQIds);

      // Load messages for past questions
      const { data: pastMessagesData } = await supabase
        .from("messages")
        .select("id, user_id, text, created_at, is_juggu, reactions, question_id")
        .in("question_id", pastQIds)
        .order("created_at", { ascending: true });

      const pastWithAnswersAndMessages = pastQuestionsData.map((q) => ({
        ...q,
        answers: (pastAnswersData ?? []).filter((a) => a.question_id === q.id) as Answer[],
        messages: (pastMessagesData ?? []).filter((m) => m.question_id === q.id) as Message[],
      }));
      setPastQuestions(pastWithAnswersAndMessages);
    }
  }

  async function loadMessages(questionId: string) {
    setMessagesLoading(true);
    const { data, error: messagesError } = await supabase
      .from("messages")
      .select("id, user_id, text, created_at, is_juggu, reactions")
      .eq("question_id", questionId)
      .order("created_at", { ascending: true });

    if (messagesError) {
      setMessages([]);
      setMessagesLoading(false);
      return;
    }

    setMessages(data ?? []);
    setMessagesLoading(false);
  }

  async function handleOpenUserProfile(targetUserId: string) {
    setSelectedUserId(targetUserId);
    setLoadingUserProfile(true);
    setSelectedUserAnswers([]);

    // Fetch user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", targetUserId)
      .maybeSingle();

    setSelectedUserProfile(profile ?? { display_name: "Friend", avatar_url: null });

    // Fetch all questions for this group
    const { data: questions } = await supabase
      .from("daily_questions")
      .select("id, question_text")
      .eq("group_id", groupId);

    if (!questions || questions.length === 0) {
      setLoadingUserProfile(false);
      return;
    }

    const questionIds = questions.map((q) => q.id);
    const questionMap: Record<string, string> = {};
    for (const q of questions) {
      questionMap[q.id] = q.question_text;
    }

    // Fetch all answers by this user for questions in this group
    const { data: userAnswers } = await supabase
      .from("answers")
      .select("question_id, answer_text, created_at, image_url")
      .eq("user_id", targetUserId)
      .in("question_id", questionIds)
      .order("created_at", { ascending: false });

    const answersWithQuestions = (userAnswers ?? []).map((a) => ({
      question_text: questionMap[a.question_id] ?? "Unknown question",
      answer_text: a.answer_text,
      created_at: a.created_at,
      image_url: a.image_url,
    }));

    setSelectedUserAnswers(answersWithQuestions);
    setLoadingUserProfile(false);
  }

  async function handleSubmitAnswer(event: React.FormEvent) {
    event.preventDefault();
    if (!userId || !question) return;
    if (!myAnswerText.trim() && !answerImageFile) return;
    if (hasAnswered) return;

    setSubmittingAnswer(true);
    setError(null);

    let imageUrl: string | null = null;
    if (answerImageFile) {
      imageUrl = await uploadImage("answer-images", answerImageFile, userId);
    }

    const { error: insertError } = await supabase.from("answers").insert({
      question_id: question.id,
      user_id: userId,
      answer_text: myAnswerText.trim(),
      image_url: imageUrl,
    });

    if (insertError) {
      setError(insertError.message);
      setSubmittingAnswer(false);
      return;
    }

    await loadTodayQuestionAndAnswers(groupId, userId);
    setAnswerImageFile(null);
    setAnswerImagePreview(null);
    setAnswerCelebrating(true);
    setTimeout(() => setAnswerCelebrating(false), 4500);
    setSubmittingAnswer(false);

    // Notify other group members via SMS
    const userProfile = profilesById[userId];
    fetch("/api/notify-answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groupId,
        answerUserId: userId,
        answerUserName: userProfile?.display_name || "Someone",
        questionText: question.question_text,
      }),
    })
      .then(res => res.json())
      .then(data => console.log("SMS notification result:", data))
      .catch(err => console.error("SMS notification error:", err));
  }

  async function handleSendMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!userId || !question || !newMessageText.trim()) return;

    setSendingMessage(true);

    const messageText = newMessageText.trim();
    
    const { data, error: insertError } = await supabase
      .from("messages")
      .insert({
        group_id: groupId,
        question_id: question.id,
        user_id: userId,
        text: messageText,
      })
      .select("id, user_id, text, created_at")
      .single();

    if (insertError || !data) {
      setSendingMessage(false);
      return;
    }

    setMessages((previous) => [...previous, data as Message]);

    setNewMessageText("");
    setSendingMessage(false);

    // Check if user mentioned juggu and juggu is enabled
    const mentionedJuggu = messageText.toLowerCase().includes("juggu");
    if (mentionedJuggu && group?.juggu_enabled) {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", userId)
          .maybeSingle();

        const response = await fetch("/api/juggu-message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "mention_reply",
            userName: profile?.display_name || "Friend",
            answerText: messageText,
            groupPrompt: group.question_prompt,
            customPersonality: group.juggu_personality,
          }),
        });

        if (response.ok) {
          const { message: jugguText } = await response.json();
          if (jugguText) {
            const { data: jugguMsg } = await supabase.from("messages").insert({
              group_id: groupId,
              question_id: question.id,
              user_id: null,
              text: jugguText,
              is_juggu: true,
            }).select("id, user_id, text, created_at, is_juggu").single();
            
            if (jugguMsg) {
              setMessages((prev) => [...prev, jugguMsg as Message & { is_juggu?: boolean }]);
            }
          }
        }
      } catch (jugguError) {
        console.error("Juggu mention reply failed:", jugguError);
      }
    }
  }

  const isOwner = group && userId ? group.owner_id === userId : false;

  async function handleReaction(messageId: string, emoji: string) {
    if (!userId) return;
    setReactionPickerMessageId(null);
    
    // Update local state immediately
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== messageId) return msg;
        const reactions = { ...(msg.reactions || {}) };
        const users = reactions[emoji] || [];
        if (users.includes(userId)) {
          // Remove reaction
          reactions[emoji] = users.filter((id) => id !== userId);
          if (reactions[emoji].length === 0) delete reactions[emoji];
        } else {
          // Add reaction
          reactions[emoji] = [...users, userId];
        }
        return { ...msg, reactions };
      })
    );

    // Update in database
    const message = messages.find((m) => m.id === messageId);
    if (!message) return;
    const reactions = { ...(message.reactions || {}) };
    const users = reactions[emoji] || [];
    if (users.includes(userId)) {
      reactions[emoji] = users.filter((id) => id !== userId);
      if (reactions[emoji].length === 0) delete reactions[emoji];
    } else {
      reactions[emoji] = [...users, userId];
    }

    await supabase
      .from("messages")
      .update({ reactions: Object.keys(reactions).length > 0 ? reactions : null })
      .eq("id", messageId);
  }

  function handleLongPressStart(id: string, e: React.TouchEvent | React.MouseEvent, type: "message" | "answer" = "message") {
    e.preventDefault();
    const timer = setTimeout(() => {
      if (type === "message") {
        setReactionPickerMessageId(id);
      } else {
        setReactionPickerAnswerId(id);
      }
      withHaptics(() => {})();
    }, 400);
    setLongPressTimer(timer);
  }

  function handleLongPressEnd() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  }

  function handleCloseReactionPicker() {
    setReactionPickerMessageId(null);
    setReactionPickerAnswerId(null);
  }

  async function handleAnswerReaction(answerId: string, emoji: string) {
    if (!userId) return;
    setReactionPickerAnswerId(null);
    
    // Update local state immediately
    setAnswers((prev) =>
      prev.map((ans) => {
        if (ans.id !== answerId) return ans;
        const reactions = { ...(ans.reactions || {}) };
        const users = reactions[emoji] || [];
        if (users.includes(userId)) {
          reactions[emoji] = users.filter((id) => id !== userId);
          if (reactions[emoji].length === 0) delete reactions[emoji];
        } else {
          reactions[emoji] = [...users, userId];
        }
        return { ...ans, reactions };
      })
    );

    // Update in database
    const answer = answers.find((a) => a.id === answerId);
    if (!answer) return;
    const reactions = { ...(answer.reactions || {}) };
    const users = reactions[emoji] || [];
    if (users.includes(userId)) {
      reactions[emoji] = users.filter((id) => id !== userId);
      if (reactions[emoji].length === 0) delete reactions[emoji];
    } else {
      reactions[emoji] = [...users, userId];
    }

    await supabase
      .from("answers")
      .update({ reactions: Object.keys(reactions).length > 0 ? reactions : null })
      .eq("id", answerId);
  }

  function handleDoubleTap(id: string, type: "message" | "answer") {
    const now = Date.now();
    const lastTap = lastTapTime[id] || 0;
    
    if (now - lastTap < 300) {
      // Double tap detected
      if (type === "message") {
        setReactionPickerMessageId(id);
      } else {
        setReactionPickerAnswerId(id);
      }
      setLastTapTime((prev) => ({ ...prev, [id]: 0 }));
    } else {
      setLastTapTime((prev) => ({ ...prev, [id]: now }));
    }
  }

  async function handleSaveSettings() {
    if (!group || !isOwner) return;
    setSavingSettings(true);

    let newImageUrl = settingsImageUrl || null;
    if (settingsImageFile && userId) {
      const uploaded = await uploadImage("group-images", settingsImageFile, userId);
      if (uploaded) newImageUrl = uploaded;
    }

    await supabase
      .from("groups")
      .update({
        name: settingsName,
        question_prompt: settingsPrompt,
        image_url: newImageUrl,
        juggu_enabled: settingsJugguEnabled,
        juggu_personality: settingsJugguPersonality || null,
      })
      .eq("id", group.id)
      .eq("owner_id", userId);

    setGroup({
      ...group,
      name: settingsName,
      question_prompt: settingsPrompt,
      image_url: newImageUrl,
      juggu_enabled: settingsJugguEnabled,
      juggu_personality: settingsJugguPersonality || null,
    });

    setSavingSettings(false);
    setSettingsOpen(false);
  }

  async function handleDeleteGroup() {
    if (!group || !isOwner) return;
    const confirmed = window.confirm(
      "Delete this chat for everyone? This cannot be undone.",
    );
    if (!confirmed) return;
    setDeletingGroup(true);
    await supabase
      .from("groups")
      .delete()
      .eq("id", group.id)
      .eq("owner_id", userId);
    setDeletingGroup(false);
    router.replace("/groups");
  }

  const isDark = theme === "dark";

  if (initialLoading) {
    return (
      <div className={isDark ? "relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-violet-950 via-slate-900 to-emerald-900 text-slate-50 overflow-hidden" : "relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-violet-100 via-slate-100 to-emerald-100 text-slate-900 overflow-hidden"}>
        <div className="absolute top-20 left-10 text-5xl opacity-20 animate-bounce">✨</div>
        <div className="absolute top-32 right-8 text-4xl opacity-20 animate-pulse">🎯</div>
        <div className="absolute bottom-32 right-10 text-5xl opacity-20 animate-pulse">🎉</div>
        <div className="absolute bottom-40 left-8 text-4xl opacity-20 animate-bounce">💬</div>
        <div className="animate-spin text-6xl mb-4">🦦</div>
        <p className={isDark ? "text-lg text-slate-300" : "text-lg text-slate-600"}>juggu is setting things up...</p>
      </div>
    );
  }

  return (
    <div
      className={
        isDark
          ? "relative flex min-h-screen flex-col bg-gradient-to-br from-violet-950 via-slate-900 to-emerald-900 text-slate-50 overflow-hidden"
          : "relative flex min-h-screen flex-col bg-gradient-to-br from-violet-100 via-slate-100 to-emerald-100 text-slate-900 overflow-hidden"
      }
    >
      {/* Floating background emojis */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-6 text-4xl opacity-10 animate-bounce">✨</div>
        <div className="absolute top-40 right-8 text-3xl opacity-10 animate-pulse">💬</div>
        <div className="absolute bottom-32 left-10 text-4xl opacity-10 animate-pulse">🎉</div>
        <div className="absolute bottom-20 right-6 text-3xl opacity-10 animate-bounce">🦦</div>
      </div>

      {/* Header with back button, group image, and settings */}
      <header className={isDark ? "relative z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-white/5 backdrop-blur-sm px-4 py-3 md:px-6" : "relative z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/80 backdrop-blur-sm px-4 py-3 md:px-6 shadow-sm"}>
        <div className="flex items-center gap-3">
          {/* Prominent back button */}
          <button
            type="button"
            onClick={withHaptics(() => router.push("/groups"))}
            className={isDark ? "flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl text-white hover:bg-white/20 transition" : "flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-700 hover:bg-slate-200 transition"}
          >
            ←
          </button>
          {/* Group image - click to view large */}
          <button
            type="button"
            onClick={withHaptics(() => {
              if (group?.image_url) {
                setPreviewImage(group.image_url);
              }
            })}
            className={isDark ? "h-12 w-12 overflow-hidden rounded-full bg-white/10 border-2 border-white/20 shadow-lg cursor-pointer hover:border-emerald-400 transition" : "h-12 w-12 overflow-hidden rounded-full bg-slate-100 border-2 border-slate-200 shadow-lg cursor-pointer hover:border-emerald-400 transition"}
          >
            {group?.image_url ? (
              <img src={group.image_url} alt={group?.name} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xl">✨</div>
            )}
          </button>
          {/* Group name - click to open settings */}
          <button
            type="button"
            onClick={withHaptics(() => router.push(`/groups/${groupId}/settings`))}
            className={isDark ? "text-lg font-bold text-white md:text-xl hover:text-emerald-300 transition text-left" : "text-lg font-bold text-slate-800 md:text-xl hover:text-emerald-600 transition text-left"}
          >
            {group?.name}
          </button>
        </div>
        {/* Settings button */}
        <button
          type="button"
          onClick={withHaptics(() => router.push(`/groups/${groupId}/settings`))}
          className={isDark ? "flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-xl text-white hover:bg-white/20 transition" : "flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl text-slate-700 hover:bg-slate-200 transition"}
        >
          ⚙️
        </button>
      </header>

      <main className="relative z-10 flex-1 overflow-y-auto px-4 pb-6 pt-4 md:px-6">
        {/* SUPER PROMINENT Timer Card */}
        <div className={isDark ? "mb-6 rounded-2xl bg-gradient-to-r from-violet-500/20 via-purple-500/20 to-emerald-500/20 border border-white/20 backdrop-blur-sm p-5 text-center shadow-lg" : "mb-6 rounded-2xl bg-gradient-to-r from-violet-100 via-purple-50 to-emerald-100 border border-violet-200 p-5 text-center shadow-lg"}>
          <p className={isDark ? "text-lg font-semibold text-white/80 mb-1" : "text-lg font-semibold text-slate-600 mb-1"}>⏰ Next question drops in</p>
          <p className={isDark ? "text-4xl font-bold font-mono text-emerald-400 tracking-wider md:text-5xl" : "text-4xl font-bold font-mono text-emerald-600 tracking-wider md:text-5xl"}>{timeLeft}</p>
          <p className={isDark ? "mt-2 text-sm text-white/60" : "mt-2 text-sm text-slate-500"}>New questions every day at 12pm ET</p>
        </div>

        {/* Today's Question - Full Width Card */}
        <div className={isDark ? "mb-6 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 p-5 shadow-lg" : "mb-6 rounded-2xl bg-white border border-slate-200 p-5 shadow-lg"}>
          <p className={isDark ? "text-xs uppercase tracking-widest text-emerald-400 mb-2 font-semibold" : "text-xs uppercase tracking-widest text-emerald-600 mb-2 font-semibold"}>Today&apos;s Question</p>
          {newQuestionLoading ? (
            <div className="flex flex-col items-center justify-center py-6">
              <div className="animate-spin text-5xl mb-3">🦦</div>
              <p className="text-xl font-semibold text-emerald-400">New question incoming...</p>
            </div>
          ) : (
            <p className={isDark ? "text-2xl font-bold leading-relaxed text-white md:text-3xl" : "text-2xl font-bold leading-relaxed text-slate-800 md:text-3xl"}>
              {questionLoading || !question
                ? "🦦 thinking of something fun..."
                : question.question_text}
            </p>
          )}
        </div>

        <section className="space-y-3">

          {!hasAnswered && (
            <form onSubmit={handleSubmitAnswer} className="mb-4 space-y-4">
              {/* Answer chips - quick select options */}
              {question?.answer_options && question.answer_options.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {question.answer_options.map((option, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={withHaptics(async () => {
                        setMyAnswerText(option);
                        // Auto-submit when chip is selected
                        setSubmittingAnswer(true);
                        const { error: answerError } = await supabase.from("answers").insert({
                          question_id: question.id,
                          user_id: userId,
                          answer_text: option,
                        });
                        if (!answerError) {
                          await loadTodayQuestionAndAnswers(groupId, userId!);
                          setMyAnswerText("");
                          setAnswerCelebrating(true);
                          setTimeout(() => setAnswerCelebrating(false), 4500);
                          
                          // Notify other group members via SMS
                          const userProfile = profilesById[userId!];
                          fetch("/api/notify-answer", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              groupId,
                              answerUserId: userId,
                              answerUserName: userProfile?.display_name || "Someone",
                              questionText: question.question_text,
                            }),
                          })
                            .then(res => res.json())
                            .then(data => console.log("SMS notification result:", data))
                            .catch(err => console.error("SMS notification error:", err));
                        }
                        setSubmittingAnswer(false);
                      })}
                      disabled={submittingAnswer}
                      className={isDark ? "rounded-2xl border-2 border-emerald-400/50 bg-emerald-500/20 backdrop-blur-sm px-5 py-3 text-lg font-semibold text-white transition hover:bg-emerald-500/30 hover:border-emerald-300 hover:scale-105 disabled:opacity-50 shadow-lg" : "rounded-2xl border-2 border-emerald-500 bg-emerald-50 px-5 py-3 text-lg font-semibold text-emerald-700 transition hover:bg-emerald-100 hover:border-emerald-600 hover:scale-105 disabled:opacity-50 shadow-lg"}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
              <textarea
                value={myAnswerText}
                onChange={(event) => setMyAnswerText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (myAnswerText.trim() || answerImageFile) {
                      handleSubmitAnswer(event as unknown as React.FormEvent);
                    }
                  }
                }}
                placeholder={question?.answer_options?.length ? "Or write your own answer..." : "Write your answer here. Once you submit, you'll see what everyone else shared."}
                className={isDark ? "min-h-[100px] w-full rounded-2xl border-2 border-white/20 bg-white/10 backdrop-blur-sm px-4 py-3 text-lg text-white placeholder:text-white/50 outline-none focus:border-emerald-400 md:text-xl" : "min-h-[100px] w-full rounded-2xl border-2 border-slate-300 bg-white px-4 py-3 text-lg text-slate-800 placeholder:text-slate-400 outline-none focus:border-emerald-500 md:text-xl shadow-sm"}
              />
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <input
                    id="answer-image-input"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setAnswerImageFile(file);
                      if (file) {
                        const url = URL.createObjectURL(file);
                        setAnswerImagePreview(url);
                      } else {
                        setAnswerImagePreview(null);
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={withHaptics(() => {
                      const input = document.getElementById(
                        "answer-image-input",
                      ) as HTMLInputElement | null;
                      input?.click();
                    })}
                    className={isDark ? "inline-flex items-center rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-[11px] font-medium text-slate-100 hover:border-slate-500" : "inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:border-slate-400 shadow-sm"}
                  >
                    {answerImagePreview ? "Change photo" : "Add photo"}
                  </button>
                  {answerImagePreview && (
                    <div className="h-10 w-10 overflow-hidden rounded-lg border border-slate-700">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={answerImagePreview}
                        alt="Answer preview"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={submittingAnswer}
                  onClick={withHaptics(() => {})}
                  className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-8 py-3 text-lg font-bold text-black shadow-[0_0_20px_rgba(16,185,129,0.4)] transition hover:bg-emerald-400 hover:shadow-[0_0_30px_rgba(16,185,129,0.6)] disabled:opacity-60"
                >
                  {submittingAnswer ? "Sharing..." : "Share →"}
                </button>
              </div>
            </form>
          )}

          {hasAnswered && (
            <div className="space-y-3">
              {/* History Button */}
              {pastQuestions.length > 0 && (
                <button
                  type="button"
                  onClick={withHaptics(() => setShowHistory(!showHistory))}
                  className={isDark ? "w-full rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 px-4 py-3 text-sm font-semibold text-white/80 hover:bg-white/20 transition flex items-center justify-center gap-2" : "w-full rounded-xl bg-white border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition flex items-center justify-center gap-2 shadow-sm"}
                >
                  {showHistory ? "Hide History" : `📜 View Past Questions (${pastQuestions.length})`}
                </button>
              )}

              {/* Past Questions & Answers - Only show when History is open */}
              {showHistory && pastQuestions.length > 0 && (
                <div className="space-y-3 pb-4">
                  {[...pastQuestions].reverse().map((pq) => (
                    <div key={pq.id} className="space-y-3">
                      {/* Question displayed like a message with Juggu avatar */}
                      <div className="flex items-start gap-3 px-1 py-1">
                        <div className={isDark ? "mt-1 flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-slate-700" : "mt-1 flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-slate-200"}>
                          <span className="text-2xl">🦦</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={isDark ? "text-[12px] font-medium text-emerald-400" : "text-[12px] font-medium text-emerald-600"}>
                            {new Date(pq.date_et + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                          </p>
                          <p className={isDark ? "whitespace-pre-wrap text-lg font-medium text-white md:text-xl" : "whitespace-pre-wrap text-lg font-medium text-slate-800 md:text-xl"}>
                            {pq.question_text}
                          </p>
                        </div>
                      </div>
                      {/* Answers displayed like regular messages */}
                      {pq.answers.map((ans) => {
                        const isMe = ans.user_id === userId;
                        const profile = ans.user_id ? profilesById[ans.user_id] : undefined;
                        const avatarUrl = profile?.avatar_url ?? null;
                        const ansDisplayName = isMe ? "You" : (profile?.display_name || "Friend");
                        return (
                          <div key={ans.id} className="flex items-start gap-3 px-1 py-1">
                            <button
                              type="button"
                              onClick={withHaptics(() => handleOpenUserProfile(ans.user_id))}
                              className={isDark ? "mt-1 flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-emerald-500/20 text-[11px] font-semibold text-emerald-200 hover:ring-2 hover:ring-emerald-400 transition" : "mt-1 flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-emerald-500/20 text-[11px] font-semibold text-emerald-700 hover:ring-2 hover:ring-emerald-400 transition"}
                            >
                              {avatarUrl ? (
                                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                              ) : ansDisplayName.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                            </button>
                            <div className="min-w-0 flex-1">
                              <p className={isDark ? "text-[12px] font-medium text-slate-200" : "text-[12px] font-medium text-slate-800"}>
                                {ansDisplayName}
                              </p>
                              <p className={isDark ? "whitespace-pre-wrap text-lg text-slate-50 md:text-xl" : "whitespace-pre-wrap text-lg text-slate-900 md:text-xl"}>
                                {ans.answer_text}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                      {/* Messages for this past question */}
                      {pq.messages.map((msg) => {
                        const isMe = msg.user_id === userId;
                        const profile = msg.user_id ? profilesById[msg.user_id] : undefined;
                        const avatarUrl = profile?.avatar_url ?? null;
                        const msgDisplayName = msg.is_juggu ? "Juggu" : (isMe ? "You" : (profile?.display_name || "Friend"));
                        return (
                          <div key={msg.id} className="flex items-start gap-3 px-1 py-1">
                            <button
                              type="button"
                              onClick={withHaptics(() => !msg.is_juggu && handleOpenUserProfile(msg.user_id))}
                              disabled={msg.is_juggu}
                              className={isDark ? "mt-1 flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-slate-700 text-[11px] font-semibold text-slate-200 hover:ring-2 hover:ring-emerald-400 transition disabled:hover:ring-0" : "mt-1 flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-[11px] font-semibold text-slate-700 hover:ring-2 hover:ring-emerald-400 transition disabled:hover:ring-0"}
                            >
                              {msg.is_juggu ? (
                                <span className="text-lg">🦦</span>
                              ) : avatarUrl ? (
                                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                              ) : msgDisplayName.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                            </button>
                            <div className="min-w-0 flex-1">
                              <p className={isDark ? "text-[12px] font-medium text-slate-400" : "text-[12px] font-medium text-slate-600"}>
                                {msgDisplayName}
                              </p>
                              <p className={isDark ? "whitespace-pre-wrap text-base text-slate-200 md:text-lg" : "whitespace-pre-wrap text-base text-slate-800 md:text-lg"}>
                                {msg.text}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3">
                {answersLoading && (
                  <p
                    className={
                      isDark
                        ? "text-xs text-slate-500"
                        : "text-xs text-slate-600"
                    }
                  >
                    🦦 gathering everyone&apos;s thoughts...
                  </p>
                )}

                {/* Today's Answers feed */}
                {answers.map((answer, index) => {
                  const isMe = answer.user_id === userId;
                  const profile = answer.user_id
                    ? profilesById[answer.user_id]
                    : undefined;
                  const displayName = isMe ? "You" : (profile?.display_name || "Friend");
                  const initials = displayName
                    .split(" ")
                    .map((word) => word[0])
                    .join("");
                  const avatarUrl = profile?.avatar_url ?? null;

                  return (
                    <motion.div
                      key={answer.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: index * 0.02 }}
                      className="relative flex items-start gap-3 px-1 py-1"
                      onTouchStart={(e) => handleLongPressStart(answer.id, e, "answer")}
                      onTouchEnd={handleLongPressEnd}
                      onClick={() => handleDoubleTap(answer.id, "answer")}
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      {/* Reaction picker for answers */}
                      {reactionPickerAnswerId === answer.id && (
                        <>
                          <div 
                            className="fixed inset-0 z-10" 
                            onClick={handleCloseReactionPicker}
                          />
                          <div className="absolute -top-10 left-12 z-20 flex gap-1 rounded-full border border-slate-700 bg-slate-900 px-2 py-1 shadow-lg">
                            {REACTION_EMOJIS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={withHaptics(() => handleAnswerReaction(answer.id, emoji))}
                                className="p-1 text-lg hover:scale-125 transition"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={withHaptics(() => handleOpenUserProfile(answer.user_id))}
                        className="mt-1 flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-emerald-500/20 text-[11px] font-semibold text-emerald-200 transition hover:ring-2 hover:ring-emerald-400"
                      >
                        {avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={avatarUrl}
                            alt={displayName}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          initials
                        )}
                      </button>
                      <div className="min-w-0 flex-1 group">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p
                              className={
                                isDark
                                  ? "text-[12px] font-medium text-slate-200"
                                  : "text-[12px] font-medium text-slate-800"
                              }
                            >
                              {displayName}
                            </p>
                            <p
                              className={
                                isDark
                                  ? "whitespace-pre-wrap text-lg text-slate-50 md:text-xl"
                                  : "whitespace-pre-wrap text-lg text-slate-900 md:text-xl"
                              }
                            >
                              {answer.answer_text}
                            </p>
                          </div>
                          {/* Hover reaction button for desktop */}
                          <button
                            type="button"
                            onClick={withHaptics(() => setReactionPickerAnswerId(answer.id))}
                            className="hidden md:flex opacity-0 group-hover:opacity-100 transition-opacity items-center justify-center w-8 h-8 rounded-full bg-slate-800/80 hover:bg-slate-700 text-sm"
                          >
                            😊
                          </button>
                        </div>
                        {answer.image_url && (
                          <button
                            type="button"
                            className="mt-2 inline-block overflow-hidden rounded-2xl border border-slate-800/60 bg-slate-950/60"
                            onClick={withHaptics(() => setPreviewImage(answer.image_url!))}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={answer.image_url}
                              alt="Answer attachment"
                              className="h-32 w-auto max-w-full object-cover md:h-40"
                            />
                          </button>
                        )}
                        {/* Show reactions on answers */}
                        {answer.reactions && Object.keys(answer.reactions).length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {Object.entries(answer.reactions).map(([emoji, users]) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={withHaptics(() => handleAnswerReaction(answer.id, emoji))}
                                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                                  users.includes(userId || "") 
                                    ? "bg-emerald-500/20 border border-emerald-500/40" 
                                    : "bg-slate-800 border border-slate-700"
                                }`}
                              >
                                <span>{emoji}</span>
                                <span className="text-slate-400">{users.length}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <p
                          className={
                            isDark
                              ? "mt-0.5 text-[10px] text-slate-500"
                              : "mt-0.5 text-[10px] text-slate-600"
                          }
                        >
                          {formatTimeAgo(answer.created_at)}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}

                {/* Messages feed */}
                {messagesLoading && (
                  <p
                    className={
                      isDark
                        ? "text-xs text-slate-500"
                        : "text-xs text-slate-600"
                    }
                  >
                    🦦 fetching the gossip...
                  </p>
                )}
                {messages.map((message, index) => {
                  const isJuggu = (message as Message & { is_juggu?: boolean }).is_juggu === true || message.user_id === null;
                  const isMe = message.user_id === userId;
                  const profile = message.user_id
                    ? profilesById[message.user_id]
                    : undefined;
                  const displayName = isJuggu ? "Juggu" : (isMe ? "You" : (profile?.display_name || "Friend"));
                  const initials = isJuggu ? "🦦" : displayName
                    .split(" ")
                    .map((word) => word[0])
                    .join("");
                  const avatarUrl = isJuggu ? null : (profile?.avatar_url ?? null);

                  // Juggu messages with amber styling
                  if (isJuggu) {
                    return (
                      <motion.div
                        key={message.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.18, delay: index * 0.015 }}
                        className="flex items-start gap-3 px-1 py-1"
                      >
                        <div className="mt-1 text-2xl">
                          🦦
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={isDark ? "text-[12px] font-medium text-amber-400" : "text-[12px] font-medium text-amber-600"}>
                            juggu
                          </p>
                          <p className={isDark ? "whitespace-pre-wrap text-base text-amber-100" : "whitespace-pre-wrap text-base text-amber-800"}>
                            {message.text}
                          </p>
                          <p className={isDark ? "mt-0.5 text-[10px] text-slate-500" : "mt-0.5 text-[10px] text-slate-600"}>
                            {formatTimeAgo(message.created_at)}
                          </p>
                        </div>
                      </motion.div>
                    );
                  }

                  return (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, delay: index * 0.015 }}
                      className="relative flex items-start gap-3 px-1 py-1"
                      onMouseDown={(e) => handleLongPressStart(message.id, e, "message")}
                      onMouseUp={handleLongPressEnd}
                      onMouseLeave={handleLongPressEnd}
                      onTouchStart={(e) => handleLongPressStart(message.id, e, "message")}
                      onTouchEnd={handleLongPressEnd}
                      onClick={() => handleDoubleTap(message.id, "message")}
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      {/* Reaction picker */}
                      {reactionPickerMessageId === message.id && (
                        <>
                          <div 
                            className="fixed inset-0 z-10" 
                            onClick={handleCloseReactionPicker}
                          />
                          <div className="absolute -top-10 left-12 z-20 flex gap-1 rounded-full border border-slate-700 bg-slate-900 px-2 py-1 shadow-lg">
                            {REACTION_EMOJIS.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={withHaptics(() => handleReaction(message.id, emoji))}
                                className="p-1 text-lg hover:scale-125 transition"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={withHaptics(() => handleOpenUserProfile(message.user_id))}
                        className="mt-1 flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-slate-700 text-[11px] font-semibold text-slate-100 transition hover:ring-2 hover:ring-emerald-400"
                      >
                        {avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={avatarUrl}
                            alt={displayName}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          initials
                        )}
                      </button>
                      <div className="min-w-0 flex-1 group">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p
                              className={
                                isDark
                                  ? "text-[12px] font-medium text-slate-200"
                                  : "text-[12px] font-medium text-slate-800"
                              }
                            >
                              {displayName}
                            </p>
                            <p
                              className={
                                isDark
                                  ? "whitespace-pre-wrap text-lg text-slate-50 md:text-xl"
                                  : "whitespace-pre-wrap text-lg text-slate-900 md:text-xl"
                              }
                            >
                              {message.text}
                            </p>
                          </div>
                          {/* Hover reaction button - visible on desktop hover */}
                          <button
                            type="button"
                            onClick={withHaptics(() => setReactionPickerMessageId(message.id))}
                            className="hidden md:flex opacity-0 group-hover:opacity-100 transition-opacity items-center justify-center w-8 h-8 rounded-full bg-slate-800/80 hover:bg-slate-700 text-sm"
                          >
                            😊
                          </button>
                        </div>
                        {/* Show reactions */}
                        {message.reactions && Object.keys(message.reactions).length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {Object.entries(message.reactions).map(([emoji, users]) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={withHaptics(() => handleReaction(message.id, emoji))}
                                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                                  users.includes(userId || "") 
                                    ? "bg-emerald-500/20 border border-emerald-500/40" 
                                    : "bg-slate-800 border border-slate-700"
                                }`}
                              >
                                <span>{emoji}</span>
                                <span className="text-slate-400">{users.length}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <p
                          className={
                            isDark
                              ? "mt-0.5 text-[10px] text-slate-500"
                              : "mt-0.5 text-[10px] text-slate-600"
                          }
                        >
                          {formatTimeAgo(message.created_at)}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {hasAnswered && (
          <form onSubmit={handleSendMessage} className="mt-6 flex gap-3 pt-1">
            <input
              type="text"
              value={newMessageText}
              onChange={(event) => setNewMessageText(event.target.value)}
              placeholder="Type here"
              className={
                isDark
                  ? "flex-1 rounded-full border border-slate-700 bg-slate-950 px-5 py-3 text-sm text-slate-50 outline-none focus:border-slate-500 md:text-base"
                  : "flex-1 rounded-full border border-slate-300 bg-white/90 px-5 py-3 text-sm text-slate-900 outline-none focus:border-emerald-400 md:text-base"
              }
            />
            <button
              type="submit"
              disabled={sendingMessage || !newMessageText.trim()}
              onClick={withHaptics(() => {})}
              className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-60 md:text-base"
            >
              {sendingMessage ? "Sending" : "Send"}
            </button>
          </form>
        )}
      </main>

      {previewImage && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 px-4"
          onClick={withHaptics(() => setPreviewImage(null))}
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw]"
            onClick={(event) => event.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage}
              alt="Full-size answer"
              className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain"
            />
            <button
              type="button"
              onClick={withHaptics(() => setPreviewImage(null))}
              className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-medium text-slate-100 hover:bg-black/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {answerCelebrating && (
        <div className="pointer-events-none fixed inset-0 z-30 flex flex-col items-center justify-center">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {Array.from({ length: 40 }).map((_, index) => (
              <span
                // eslint-disable-next-line react/no-array-index-key
                key={index}
                className="absolute animate-bounce text-lg text-emerald-300/90 md:text-xl"
                style={{
                  left: `${(index * 17) % 100}%`,
                  top: `${(index * 11) % 100}%`,
                  animationDelay: `${index * 20}ms`,
                }}
              >
                ✨
              </span>
            ))}
          </div>
          <div className="relative rounded-3xl bg-gradient-to-br from-violet-900/95 via-slate-900/95 to-emerald-900/95 border border-white/20 px-8 py-6 text-center shadow-[0_0_50px_rgba(16,185,129,0.5)]">
            <p className="text-4xl mb-2">🎉</p>
            <p className="text-2xl font-bold text-white mb-2">Great answer!</p>
            <p className="text-base text-white/70">
              {answers.filter(a => a.user_id !== userId).length > 0 
                ? `Next question in ${timeLeft || "a few hours"} ⏰`
                : "We'll notify you when others answer 📱"}
            </p>
          </div>
        </div>
      )}

      {isOwner && settingsOpen && group && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-950 p-4 text-xs text-slate-50">
            <h2 className="mb-2 text-sm font-semibold">Chat settings</h2>
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="block text-[11px] text-slate-400">
                  Name
                </label>
                <input
                  type="text"
                  value={settingsName}
                  onChange={(event) => setSettingsName(event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-50 outline-none focus:border-emerald-400"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] text-slate-400">
                  Question style / prompt
                </label>
                <textarea
                  value={settingsPrompt}
                  onChange={(event) => setSettingsPrompt(event.target.value)}
                  className="min-h-[80px] w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-50 outline-none focus:border-emerald-400"
                />
              </div>

              <div className="mt-3 space-y-1">
                <label className="block text-[11px] text-slate-400">
                  Picture (optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setSettingsImageFile(file);
                  }}
                  className="w-full text-xs text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-100 hover:file:bg-slate-700"
                />
              </div>

              <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-medium text-slate-100">juggu 🦦</p>
                    <p className="text-[10px] text-slate-400">AI sidekick for fun messages</p>
                  </div>
                  <button
                    type="button"
                    onClick={withHaptics(() => setSettingsJugguEnabled(!settingsJugguEnabled))}
                    className={`relative h-6 w-10 rounded-full transition-colors ${
                      settingsJugguEnabled ? "bg-emerald-400" : "bg-slate-600"
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                        settingsJugguEnabled ? "left-5" : "left-1"
                      }`}
                    />
                  </button>
                </div>
                {settingsJugguEnabled && (
                  <div className="mt-3 border-t border-slate-700 pt-3">
                    <p className="mb-1 text-[10px] text-slate-400">
                      customize juggu (optional)
                    </p>
                    <textarea
                      value={settingsJugguPersonality}
                      onChange={(event) => setSettingsJugguPersonality(event.target.value)}
                      placeholder="e.g. speak in roman urdu, be extra sarcastic, roast harder..."
                      className="min-h-[60px] w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-50 outline-none placeholder:text-slate-600 focus:border-emerald-400"
                    />
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={withHaptics(() => setSettingsOpen(false))}
                  className="rounded-full border border-slate-700 px-3 py-1.5 text-[11px] text-slate-300 hover:border-slate-500"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={savingSettings}
                  onClick={withHaptics(handleSaveSettings)}
                  className="rounded-full bg-emerald-400 px-4 py-1.5 text-[11px] font-medium text-slate-950 transition hover:bg-emerald-300 disabled:opacity-60"
                >
                  {savingSettings ? "Saving..." : "Save"}
                </button>
              </div>

              <button
                type="button"
                disabled={deletingGroup}
                onClick={withHaptics(handleDeleteGroup)}
                className="mt-4 w-full rounded-full border border-rose-500/70 px-3 py-1.5 text-[11px] text-rose-300 hover:bg-rose-500/10 disabled:opacity-60"
              >
                {deletingGroup ? "Deleting..." : "Delete chat"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Profile Modal */}
      {selectedUserId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={withHaptics(() => {
            setSelectedUserId(null);
            setSelectedUserProfile(null);
            setSelectedUserAnswers([]);
          })}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
            className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {loadingUserProfile ? (
              <p className="text-center text-xs text-slate-400">🦦 looking them up...</p>
            ) : (
              <>
                <div className="mb-6 flex flex-col items-center">
                  <div className="mb-3 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-emerald-500/20 text-xl font-semibold text-emerald-200">
                    {selectedUserProfile?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={selectedUserProfile.avatar_url}
                        alt={selectedUserProfile.display_name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      (selectedUserProfile?.display_name ?? "?")[0].toUpperCase()
                    )}
                  </div>
                  <h2 className="text-xl font-semibold text-slate-50">
                    {selectedUserProfile?.display_name ?? "Friend"}
                  </h2>
                </div>

                <div className="space-y-4">
                  <p className="text-center text-[10px] uppercase tracking-widest text-slate-500">
                    their answers in this group
                  </p>
                  {selectedUserAnswers.length === 0 ? (
                    <p className="text-center text-xs text-slate-400">
                      No answers yet
                    </p>
                  ) : (
                    selectedUserAnswers.map((item, index) => (
                      <div
                        key={index}
                        className="rounded-xl border border-slate-800 bg-slate-900/50 p-4"
                      >
                        <p className="mb-2 text-xs text-emerald-400">
                          {item.question_text}
                        </p>
                        <p className="text-sm text-slate-100">
                          {item.answer_text}
                        </p>
                        {item.image_url && (
                          <button
                            type="button"
                            className="mt-2 inline-block overflow-hidden rounded-xl border border-slate-800/60"
                            onClick={withHaptics(() => setPreviewImage(item.image_url!))}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.image_url}
                              alt="Answer attachment"
                              className="h-24 w-auto max-w-full object-cover"
                            />
                          </button>
                        )}
                        <p className="mt-1 text-[10px] text-slate-500">
                          {formatTimeAgo(item.created_at)}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                <button
                  type="button"
                  onClick={withHaptics(() => {
                    setSelectedUserId(null);
                    setSelectedUserProfile(null);
                    setSelectedUserAnswers([]);
                  })}
                  className="mt-6 w-full rounded-full border border-slate-700 py-2 text-xs text-slate-300 hover:border-slate-500"
                >
                  Close
                </button>
              </>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
