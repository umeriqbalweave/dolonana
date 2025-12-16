"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { uploadImage } from "@/lib/uploadImage";
import { withHaptics } from "@/lib/haptics";

export default function EditGroupPage() {
  const router = useRouter();
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;

  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [step, setStep] = useState<"name" | "picture" | "prompt" | "juggu" | "notifications" | "share">("name");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jugguEnabled, setJugguEnabled] = useState(true);
  const [jugguPersonality, setJugguPersonality] = useState("");
  const [showCustomize, setShowCustomize] = useState(false);
  const [origin, setOrigin] = useState("");
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [dailyQuestionSms, setDailyQuestionSms] = useState(true);
  const [messageSms, setMessageSms] = useState(true);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const [sampleWithOptions, setSampleWithOptions] = useState<{prompt: string; options: string[]}[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  function startVoiceTranscription() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Voice transcription not supported in this browser");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    
    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setPrompt(transcript);
    };
    
    recognition.onerror = () => {
      setIsRecording(false);
    };
    
    recognition.onend = () => {
      setIsRecording(false);
    };
    
    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }

  function stopVoiceTranscription() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }
  }

  async function handlePreviewQuestions() {
    if (!prompt.trim()) return;
    setPreviewLoading(true);
    try {
      const response = await fetch("/api/generate-sample-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt, count: 1 }),
      });
      const data = await response.json();
      if (data.questionsWithOptions) {
        setSampleWithOptions(data.questionsWithOptions);
      }
    } catch (e) {
      console.error("Failed to generate preview", e);
    }
    setPreviewLoading(false);
  }

  useEffect(() => {
    async function loadGroup() {
      const { data } = await supabase.auth.getUser();
      const currentUserId = data.user?.id ?? null;
      if (!currentUserId) {
        router.replace("/");
        return;
      }
      setUserId(currentUserId);

      const { data: group, error: groupError } = await supabase
        .from("groups")
        .select("id, name, question_prompt, owner_id, image_url, juggu_enabled, juggu_personality")
        .eq("id", groupId)
        .single();

      if (groupError || !group) {
        setError(groupError?.message ?? "Group not found.");
        setLoading(false);
        return;
      }

      if (group.owner_id !== currentUserId) {
        router.replace(`/groups/${groupId}`);
        return;
      }

      setName(group.name ?? "");
      setPrompt(group.question_prompt ?? "");
      setImageUrl(group.image_url ?? null);
      setJugguEnabled(group.juggu_enabled ?? true);
      setJugguPersonality(group.juggu_personality ?? "");
      if (group.juggu_personality) setShowCustomize(true);

      // Load notification settings for this user
      const { data: notifData } = await supabase
        .from("group_notification_settings")
        .select("daily_question_sms, message_sms")
        .eq("user_id", currentUserId)
        .eq("group_id", groupId)
        .single();

      if (notifData) {
        setDailyQuestionSms(notifData.daily_question_sms ?? true);
        setMessageSms(notifData.message_sms ?? true);
      }

      setLoading(false);
    }

    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }

    void loadGroup();
  }, [groupId, router]);

  async function handleToggleNotification(key: "daily_question_sms" | "message_sms") {
    if (!userId) return;
    setSavingNotifications(true);

    const newValue = key === "daily_question_sms" ? !dailyQuestionSms : !messageSms;
    if (key === "daily_question_sms") {
      setDailyQuestionSms(newValue);
    } else {
      setMessageSms(newValue);
    }

    await supabase.from("group_notification_settings").upsert(
      {
        user_id: userId,
        group_id: groupId,
        [key]: newValue,
      },
      { onConflict: "user_id,group_id" }
    );

    setSavingNotifications(false);
  }

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    setError(null);

    let newImageUrl = imageUrl ?? null;
    if (imageFile) {
      const uploaded = await uploadImage("group-images", imageFile, userId);
      if (uploaded) newImageUrl = uploaded;
    }

    const { error: updateError } = await supabase
      .from("groups")
      .update({
        name,
        question_prompt: prompt,
        image_url: newImageUrl,
        juggu_enabled: jugguEnabled,
        juggu_personality: jugguPersonality || null,
      })
      .eq("id", groupId)
      .eq("owner_id", userId);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    router.replace(`/groups/${groupId}`);
  }

  async function handleDelete() {
    if (!userId) return;
    const confirmed = window.confirm(
      "Delete this chat for everyone? This cannot be undone.",
    );
    if (!confirmed) return;

    setDeleting(true);
    const { error: deleteError } = await supabase
      .from("groups")
      .delete()
      .eq("id", groupId)
      .eq("owner_id", userId);

    if (deleteError) {
      setError(deleteError.message);
      setDeleting(false);
      return;
    }

    setDeleting(false);
    router.replace("/groups");
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <p className="text-xl text-[#a8a6a3]">Loading...</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-[#0a0a0a] text-[#e8e6e3] overflow-hidden">
      <main className="relative z-10 flex-1 px-4 pb-8 pt-4 md:px-8">
        <header className="mb-8 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={withHaptics(() => router.push(`/groups/${groupId}`))}
            className="rounded-full border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-1 text-xs text-[#a8a6a3] hover:border-[#3a3a3a] hover:text-[#e8e6e3] transition-colors"
          >
            ← Back to chat
          </button>
          <div className="h-5" />
        </header>

        <div className="mx-auto flex max-w-md flex-col justify-center gap-8">
          {step === "name" && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!name.trim()) return;
                setStep("picture");
              }}
              className="space-y-4 text-sm text-[#a8a6a3]"
            >
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-[#666]">
                  step 1 of 5
                </p>
                <h2 className="text-2xl font-semibold leading-snug text-[#e8e6e3] md:text-3xl">
                  rename this crew?
                </h2>
              </div>
              <div>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="sofía & umer fan club"
                  className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-3 text-base text-[#e8e6e3] outline-none focus:border-[#888] md:text-lg"
                  required
                />
              </div>
              {error && <p className="text-sm text-rose-400">{error}</p>}
              <button
                type="submit"
                onClick={withHaptics(() => {})}
                className="flex w-full items-center justify-center rounded-lg bg-[#e8e6e3] px-3 py-2 text-sm font-medium text-[#1a1a1a] transition hover:bg-[#d0d0d0] disabled:opacity-30"
              >
                Next
              </button>
            </form>
          )}

          {step === "picture" && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setStep("prompt");
              }}
              className="space-y-4 text-sm text-[#a8a6a3]"
            >
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-[#666]">
                  step 2 of 5
                </p>
                <h2 className="text-2xl font-semibold leading-snug text-[#e8e6e3] md:text-3xl">
                  update the chat picture ✨
                </h2>
              </div>

              <div className="space-y-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setImageFile(file);
                    if (file) {
                      const url = URL.createObjectURL(file);
                      setImagePreview(url);
                    } else {
                      setImagePreview(null);
                    }
                  }}
                  className="w-full text-xs text-[#a8a6a3] file:mr-3 file:rounded-md file:border-0 file:bg-[#2a2a2a] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-[#e8e6e3] hover:file:bg-[#3a3a3a]"
                />
                {(imagePreview || imageUrl) && (
                  <div className="pt-2 flex justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imagePreview ?? imageUrl ?? ""}
                      alt="Group preview"
                      className="h-16 w-16 rounded-full object-cover ring-2 ring-[#2a2a2a]"
                    />
                  </div>
                )}
              </div>

              {error && <p className="text-sm text-rose-400">{error}</p>}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={withHaptics(() => setStep("name"))}
                  className="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs font-medium text-[#a8a6a3] hover:border-[#3a3a3a] transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  onClick={withHaptics(() => {})}
                  className="flex-1 rounded-lg bg-[#e8e6e3] px-3 py-2 text-xs font-medium text-[#1a1a1a] transition hover:bg-[#d0d0d0]"
                >
                  Next
                </button>
              </div>
            </form>
          )}

          {step === "prompt" && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setStep("juggu");
              }}
              className="space-y-4 text-sm text-[#a8a6a3]"
            >
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-[#666]">
                  step 3 of 5
                </p>
                <h2 className="text-2xl font-semibold leading-snug text-[#e8e6e3] md:text-3xl">
                  update the question vibe
                </h2>
              </div>
              <div className="relative">
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="fun, slightly deep questions about our week and friendships"
                  className="min-h-[120px] w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-3 pr-12 text-base text-[#e8e6e3] outline-none focus:border-[#888] md:text-lg"
                />
                <button
                  type="button"
                  onClick={withHaptics(() => {
                    if (isRecording) {
                      stopVoiceTranscription();
                    } else {
                      startVoiceTranscription();
                    }
                  })}
                  className={`absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full transition ${
                    isRecording 
                      ? "bg-rose-500 text-white animate-pulse" 
                      : "bg-[#2a2a2a] text-[#a8a6a3] hover:bg-[#3a3a3a]"
                  }`}
                  title={isRecording ? "Stop recording" : "Voice input"}
                >
                  🎤
                </button>
              </div>
              
              <button
                type="button"
                disabled={previewLoading || !prompt.trim()}
                onClick={withHaptics(() => void handlePreviewQuestions())}
                className="flex w-full items-center justify-center rounded-lg bg-[#2a2a2a] px-3 py-2 text-sm font-medium text-[#e8e6e3] transition hover:bg-[#3a3a3a] disabled:opacity-60"
              >
                {previewLoading ? "🦦 thinking..." : "View example"}
              </button>

              {sampleWithOptions.length > 0 && (
                <div className="space-y-4 pt-2">
                  {sampleWithOptions.slice(0, 1).map((item, index) => (
                    <div key={index} className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] p-4">
                      <p className="mb-3 text-base font-medium text-[#e8e6e3] md:text-lg">
                        {item.prompt}
                      </p>
                      {item.options && item.options.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {item.options.map((option, optIndex) => (
                            <span
                              key={optIndex}
                              className="rounded-full border border-[#3a3a3a] bg-[#2a2a2a] px-3 py-1.5 text-sm text-[#a8a6a3]"
                            >
                              {option}
                            </span>
                          ))}
                          <span className="rounded-full border border-[#3a3a3a] bg-[#2a2a2a] px-3 py-1.5 text-sm text-[#666]">
                            + write your own
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {error && <p className="text-sm text-rose-400">{error}</p>}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={withHaptics(() => setStep("picture"))}
                  className="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs font-medium text-[#a8a6a3] hover:border-[#3a3a3a] transition-colors"
                >
                  Back
                </button>
                <button
                  type="submit"
                  onClick={withHaptics(() => {})}
                  className="flex-1 rounded-lg bg-[#e8e6e3] px-3 py-2 text-xs font-medium text-[#1a1a1a] transition hover:bg-[#d0d0d0]"
                >
                  Next
                </button>
              </div>
            </form>
          )}

          {/* Step 4 – Juggu */}
          {step === "juggu" && (
            <div className="space-y-6 text-base text-[#a8a6a3]">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold leading-snug text-[#e8e6e3] md:text-3xl">
                  juggu settings 🦦
                </h2>
              </div>

              <div className="flex flex-col items-center py-4">
                <div
                  className={`mb-4 text-7xl md:text-8xl ${jugguEnabled ? "animate-[bounce_1s_ease-in-out_3]" : "opacity-60 grayscale"}`}
                  style={{ transform: jugguEnabled ? undefined : "rotate(-10deg)" }}
                >
                  🦦
                </div>
                <p className={`mb-2 text-center text-lg font-medium md:text-xl ${jugguEnabled ? "text-[#e8e6e3]" : "text-[#666]"}`}>
                  {jugguEnabled ? "your group's playful sidekick" : "maybe next time..."}
                </p>
              </div>

              <div className="rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] px-5 py-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-base font-medium text-[#e8e6e3]">juggu is {jugguEnabled ? "on" : "off"}</p>
                    <p className="text-sm text-[#666]">sassy AI sidekick for your chat</p>
                  </div>
                  <button
                    type="button"
                    onClick={withHaptics(() => setJugguEnabled(!jugguEnabled))}
                    className={`relative h-7 w-12 rounded-full transition-colors ${
                      jugguEnabled ? "bg-[#e8e6e3]" : "bg-[#2a2a2a]"
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        jugguEnabled ? "left-6" : "left-1"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {jugguEnabled && (
                <button
                  type="button"
                  onClick={withHaptics(() => setShowCustomize(!showCustomize))}
                  className="mt-3 text-sm text-[#666] hover:text-[#a8a6a3]"
                >
                  customize
                </button>
              )}
              {jugguEnabled && showCustomize && (
                <textarea
                  value={jugguPersonality}
                  onChange={(event) => setJugguPersonality(event.target.value)}
                  placeholder="e.g. speak in roman urdu, be extra sarcastic, roast people harder..."
                  className="min-h-[80px] w-full rounded-xl border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-3 text-sm text-[#e8e6e3] outline-none placeholder:text-[#666] focus:border-[#888]"
                />
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={withHaptics(() => setStep("prompt"))}
                  className="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs font-medium text-[#a8a6a3] hover:border-[#3a3a3a] transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={withHaptics(() => setStep("notifications"))}
                  className="flex-1 rounded-lg bg-[#e8e6e3] px-3 py-2 text-xs font-medium text-[#1a1a1a] transition hover:bg-[#d0d0d0]"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Step 5 – Notifications */}
          {step === "notifications" && (
            <div className="space-y-6 text-base text-[#a8a6a3]">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-[#666]">
                  your notifications
                </p>
                <h2 className="text-2xl font-semibold leading-snug text-[#e8e6e3] md:text-3xl">
                  stay in the loop 🔔
                </h2>
              </div>

              <div className="space-y-4">
                {/* Daily Question SMS */}
                <div className="flex items-center justify-between rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-4">
                  <div>
                    <p className="font-medium text-[#e8e6e3]">Daily question SMS</p>
                    <p className="text-xs text-[#666]">Get notified at 12pm when the daily question drops</p>
                  </div>
                  <button
                    type="button"
                    onClick={withHaptics(() => handleToggleNotification("daily_question_sms"))}
                    disabled={savingNotifications}
                    className={`relative h-7 w-12 rounded-full transition ${
                      dailyQuestionSms ? "bg-[#e8e6e3]" : "bg-[#2a2a2a]"
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
                        dailyQuestionSms ? "left-6" : "left-1"
                      }`}
                    />
                  </button>
                </div>

                {/* Message SMS */}
                <div className="flex items-center justify-between rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] p-4">
                  <div>
                    <p className="font-medium text-[#e8e6e3]">Message notifications</p>
                    <p className="text-xs text-[#666]">Get notified when there&apos;s new activity</p>
                  </div>
                  <button
                    type="button"
                    onClick={withHaptics(() => handleToggleNotification("message_sms"))}
                    disabled={savingNotifications}
                    className={`relative h-7 w-12 rounded-full transition ${
                      messageSms ? "bg-[#e8e6e3]" : "bg-[#2a2a2a]"
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
                        messageSms ? "left-6" : "left-1"
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={withHaptics(() => setStep("juggu"))}
                  className="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs font-medium text-[#a8a6a3] hover:border-[#3a3a3a] transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={withHaptics(() => setStep("share"))}
                  className="flex-1 rounded-lg bg-[#e8e6e3] px-3 py-2 text-xs font-medium text-[#1a1a1a] transition hover:bg-[#d0d0d0]"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Step 6 – Share */}
          {step === "share" && (
            <div className="space-y-6 text-base text-[#a8a6a3]">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-[#666]">
                  last step!
                </p>
                <h2 className="text-2xl font-semibold leading-snug text-[#e8e6e3] md:text-3xl">
                  share & save
                </h2>
              </div>

              <div className="rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] px-5 py-5">
                <p className="mb-3 text-sm font-medium text-[#e8e6e3]">Invite link</p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${origin}/i/${groupId.slice(0, 8)}`}
                    className="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs text-[#a8a6a3]"
                  />
                  <button
                    type="button"
                    onClick={withHaptics(async () => {
                      await navigator.clipboard.writeText(`${origin}/i/${groupId.slice(0, 8)}`);
                      setCopyMessage("Copied!");
                      setTimeout(() => setCopyMessage(null), 2000);
                    })}
                    className="rounded-lg bg-[#2a2a2a] px-4 py-2 text-xs font-medium text-[#e8e6e3] hover:bg-[#3a3a3a]"
                  >
                    {copyMessage || "Copy"}
                  </button>
                </div>
                <p className="mt-2 text-xs text-[#666]">Share this link to invite friends</p>
              </div>

              {error && <p className="text-sm text-rose-400">{error}</p>}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={withHaptics(() => setStep("juggu"))}
                  className="flex-1 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-xs font-medium text-[#a8a6a3] hover:border-[#3a3a3a] transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={withHaptics(() => void handleSave())}
                  className="flex-1 rounded-lg bg-[#e8e6e3] px-3 py-2 text-xs font-medium text-[#1a1a1a] transition hover:bg-[#d0d0d0] disabled:opacity-30"
                >
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </div>

              <button
                type="button"
                disabled={deleting}
                onClick={withHaptics(handleDelete)}
                className="mt-4 w-full text-center text-[11px] text-rose-400 hover:text-rose-300 disabled:opacity-60"
              >
                {deleting ? "Deleting chat..." : "Delete chat"}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
