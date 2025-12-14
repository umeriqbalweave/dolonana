"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { uploadImage } from "@/lib/uploadImage";
import { withHaptics } from "@/lib/haptics";
import FloatingEmojis from "@/components/FloatingEmojis";

export default function NewGroupPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupPrompt, setNewGroupPrompt] = useState("");
  const [newGroupImageFile, setNewGroupImageFile] = useState<File | null>(null);
  const [newGroupImagePreview, setNewGroupImagePreview] = useState<string | null>(
    null,
  );
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(null);
  const [createdGroupName, setCreatedGroupName] = useState<string | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"name" | "picture" | "prompt" | "juggu" | "invites">(
    "name",
  );
  const [sampleQuestions, setSampleQuestions] = useState<string[]>([]);
  const [sampleWithOptions, setSampleWithOptions] = useState<{prompt: string; options: string[]}[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [invitePhone, setInvitePhone] = useState("");
  const [invitedPhones, setInvitedPhones] = useState<string[]>([]);
  const [origin, setOrigin] = useState("");
  const [celebrating, setCelebrating] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [jugguEnabled, setJugguEnabled] = useState(true);
  const [jugguPersonality, setJugguPersonality] = useState("");
  const [showCustomize, setShowCustomize] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [ownedGroupsCount, setOwnedGroupsCount] = useState(0);
  const MAX_GROUPS = 999; // Effectively unlimited
  const [suggestedPrompt, setSuggestedPrompt] = useState<string | null>(null);
  const [suggestedPromptLoading, setSuggestedPromptLoading] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  function startVoiceTranscription() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setPromptError("Voice transcription not supported in this browser");
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
      setNewGroupPrompt(transcript);
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

  const presetPrompts = [
    "who's most likely to... scenarios that expose us all 👀",
    "daily check-ins to see how everyone's actually doing 💫",
    "fun challenges we dare each other to complete 🔥",
    "daily commitments to keep each other accountable 💪",
    "would you rather dilemmas that spark debates 🤔",
  ];

  const funNamePlaceholders = [
    "midnight snack squad",
    "sunday feelings circle",
    "soft launch support group",
    "friends who overshare",
    "unhinged but loyal",
    "situationship survivors",
    "main character energy",
    "delusional optimists club",
    "chaos coordinators",
    "overthinkers anonymous",
    "emotional damage support",
    "bad decisions committee",
    "romantics in denial",
    "chronically online besties",
    "lowkey high maintenance",
    "professional yappers",
    "sleepy but supportive",
    "drama free zone (lie)",
    "the group chat that never dies",
  ];
  const [namePlaceholder] = useState(() => {
    const index = Math.floor(Math.random() * funNamePlaceholders.length);
    return funNamePlaceholders[index];
  });

  useEffect(() => {
    async function loadUser() {
      const { data } = await supabase.auth.getUser();
      const currentUserId = data.user?.id ?? null;
      if (!currentUserId) {
        router.replace("/");
        return;
      }
      setUserId(currentUserId);

      // Load user's display name for invites
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", currentUserId)
        .maybeSingle();
      
      if (profile?.display_name) {
        setUserDisplayName(profile.display_name);
      }

      // Check how many groups user owns
      const { count } = await supabase
        .from("groups")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", currentUserId);
      
      setOwnedGroupsCount(count ?? 0);
    }

    void loadUser();
  }, [router]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  async function fetchSuggestedPrompt() {
    if (!newGroupName.trim() || suggestedPrompt) return;
    
    setSuggestedPromptLoading(true);
    try {
      const response = await fetch("/api/generate-prompt-suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupName: newGroupName }),
      });
      const data = await response.json();
      if (response.ok && data.suggestion) {
        setSuggestedPrompt(data.suggestion);
      }
    } catch {
      // Silently fail - it's just a suggestion
    } finally {
      setSuggestedPromptLoading(false);
    }
  }

  async function runPreview(promptText: string) {
    if (!promptText.trim()) return;

    setPreviewLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/generate-sample-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptText, count: 1 }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Failed to generate questions.");
        return;
      }
      setSampleQuestions(data.questions ?? []);
      setSampleWithOptions(data.questionsWithOptions ?? []);
    } catch (previewError) {
      setError("Failed to generate questions.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handlePreviewQuestions(event: React.FormEvent) {
    event.preventDefault();
    await runPreview(newGroupPrompt);
  }

  function handleAddInvitePhone(event: React.FormEvent) {
    event.preventDefault();
    const value = invitePhone.trim();
    if (!value) return;
    if (!invitedPhones.includes(value)) {
      setInvitedPhones((previous) => [...previous, value]);
    }
    setInvitePhone("");
  }

  function handleRemoveInvitePhone(phone: string) {
    setInvitedPhones((previous) => previous.filter((p) => p !== phone));
  }

  async function createGroupIfNeeded(): Promise<{ id: string; name: string } | null> {
    if (!userId) return null;
    if (createdGroupId && createdGroupName) {
      return { id: createdGroupId, name: createdGroupName };
    }

    if (sampleQuestions.length === 0) {
      setError("View example questions before creating the group.");
      return null;
    }

    setCreatingGroup(true);
    setError(null);

    let imageUrl: string | null = null;
    if (newGroupImageFile && userId) {
      imageUrl = await uploadImage("group-images", newGroupImageFile, userId);
    }

    const { data: group, error: createError } = await supabase
      .from("groups")
      .insert({
        name: newGroupName,
        owner_id: userId,
        question_prompt: newGroupPrompt,
        image_url: imageUrl,
        juggu_enabled: jugguEnabled,
        juggu_personality: jugguPersonality || null,
      })
      .select("id, name, question_prompt")
      .single();

    if (createError || !group) {
      setError(createError?.message ?? "Failed to create group.");
      setCreatingGroup(false);
      return null;
    }

    await supabase.from("group_memberships").insert({
      group_id: group.id,
      user_id: userId,
      role: "owner",
      status: "active",
    });

    // Lock in 5 days of questions based on the preview, using 12pm ET dates
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter
      .formatToParts(now)
      .reduce<Record<string, string>>((acc, part) => {
        if (part.type !== "literal") acc[part.type] = part.value;
        return acc;
      }, {});

    const year = parseInt(parts.year, 10);
    const month = parseInt(parts.month, 10) - 1;
    const day = parseInt(parts.day, 10);

    const baseUtc = Date.UTC(year, month, day, 16, 0, 0); // 12:00 ET ~ 16:00 UTC

    const dailyRows = sampleQuestions.map((questionText, index) => {
      const dateUtc = new Date(baseUtc);
      dateUtc.setUTCDate(dateUtc.getUTCDate() + index);
      const dateEt = dateUtc.toISOString().slice(0, 10);
      return {
        group_id: group.id,
        date_et: dateEt,
        question_text: questionText,
      };
    });

    await supabase.from("daily_questions").insert(dailyRows);

    setCreatedGroupId(group.id);
    setCreatedGroupName(group.name);
    setCelebrating(true);
    setCreatingGroup(false);

    return { id: group.id, name: group.name };
  }

  async function handleFinish(event: React.FormEvent) {
    event.preventDefault();
    if (!userId || !createdGroupId || !createdGroupName) return;

    setCreatingGroup(true);
    setError(null);

    try {
      // Auto-add any phone number still in the input field
      const phonesToInvite = [...invitedPhones];
      if (invitePhone.trim()) {
        const trimmedPhone = invitePhone.trim();
        if (!phonesToInvite.includes(trimmedPhone)) {
          phonesToInvite.push(trimmedPhone);
        }
      }

      if (phonesToInvite.length > 0) {
        const inviteRows = phonesToInvite.map((phone) => ({
          group_id: createdGroupId,
          invited_phone: phone,
          status: "pending",
        }));

        await supabase.from("invites").insert(inviteRows);

        // Include short invite URL and inviter name in SMS
        const shortId = createdGroupId.slice(0, 8);
        const inviteUrl = `${origin}/i/${shortId}`;
        const response = await fetch("/api/send-invites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phones: phonesToInvite,
            groupName: createdGroupName,
            appUrl: inviteUrl,
            inviterName: userDisplayName,
          }),
        });

        if (!response.ok) {
          console.error("/api/send-invites failed", await response.text());
        }
      }

      router.replace(`/groups/${createdGroupId}`);
    } finally {
      setCreatingGroup(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-gradient-to-br from-violet-950 via-slate-900 to-emerald-900 text-slate-50 overflow-hidden">
      <FloatingEmojis count={5} />
      <main className="flex-1 px-4 pb-8 pt-4 md:px-8">
        <header className="mb-8 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={withHaptics(() => router.push("/groups"))}
            className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1 text-xs text-slate-300 hover:border-emerald-400 hover:text-emerald-300"
          >
            ← Back to groups
          </button>
          <div className="h-5" />
        </header>

        <div className="mx-auto flex max-w-md flex-col justify-center gap-8">

        {/* Limit reached message */}
        {ownedGroupsCount >= MAX_GROUPS && (
          <div className="space-y-6 text-center">
            <div className="text-6xl">🦦</div>
            <h2 className="text-2xl font-semibold text-slate-50">
              you&apos;ve hit the limit!
            </h2>
            <p className="text-sm text-slate-400">
              we&apos;re keeping things intimate for now — max {MAX_GROUPS} groups per person.
              quality over quantity, you know? 💫
            </p>
            <p className="text-xs text-slate-500">
              delete an existing group if you want to start a new one
            </p>
            <button
              type="button"
              onClick={withHaptics(() => router.push("/groups"))}
              className="rounded-lg bg-emerald-400 px-6 py-2 text-sm font-medium text-slate-950 transition hover:bg-emerald-300"
            >
              back to groups
            </button>
          </div>
        )}

        {/* Step 1 – Name */}
        {step === "name" && ownedGroupsCount < MAX_GROUPS && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!newGroupName.trim()) return;
              setStep("picture");
            }}
            className="space-y-4 text-sm text-slate-200"
          >
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-slate-400">
                step 1 of 4
              </p>
              <h2 className="text-2xl font-semibold leading-snug text-slate-50 md:text-3xl">
                what do you want to call this crew?
              </h2>
            </div>
            <div>
              <input
                type="text"
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                placeholder={namePlaceholder}
                className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-3 text-base text-slate-50 outline-none focus:border-emerald-400 md:text-lg"
                required
              />
            </div>
            {error && <p className="text-sm text-rose-400">{error}</p>}
            <button
              type="submit"
              onClick={withHaptics(() => {})}
              className="flex w-full items-center justify-center rounded-lg bg-emerald-400 px-3 py-2 text-sm font-medium text-slate-950 transition hover:bg-emerald-300 disabled:opacity-60"
            >
              Next
            </button>
          </form>
        )}

        {/* Step 2 – Picture */}
        {step === "picture" && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setStep("prompt");
            }}
            className="space-y-4 text-sm text-slate-200"
          >
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-slate-400">
                step 2 of 4
              </p>
              <h2 className="text-2xl font-semibold leading-snug text-slate-50 md:text-3xl">
                optional: upload a group photo 📸
              </h2>
            </div>
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setNewGroupImageFile(file);
                  if (file) {
                    const url = URL.createObjectURL(file);
                    setNewGroupImagePreview(url);
                  } else {
                    setNewGroupImagePreview(null);
                  }
                }}
                className="sr-only"
              />
              <button
                type="button"
                onClick={withHaptics(() => {
                  fileInputRef.current?.click();
                })}
                className="inline-flex items-center justify-center rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-[11px] font-medium text-slate-100 hover:border-slate-500"
              >
                {newGroupImagePreview ? "Change picture" : "Add a picture"}
              </button>
              {newGroupImagePreview && (
                <div className="pt-2 flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={newGroupImagePreview}
                    alt="Group preview"
                    className="h-16 w-16 rounded-full object-cover ring-2 ring-slate-700"
                  />
                </div>
              )}
            </div>
            {error && <p className="text-sm text-rose-400">{error}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={withHaptics(() => setStep("name"))}
                className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:border-slate-500"
              >
                Back
              </button>
              <button
                type="button"
                onClick={withHaptics(() => {
                  setStep("prompt");
                  void fetchSuggestedPrompt();
                })}
                className="flex-1 rounded-lg bg-emerald-400 px-3 py-2 text-xs font-medium text-slate-950 transition hover:bg-emerald-300"
              >
                Next
              </button>
            </div>
          </form>
        )}

        {/* Step 3 – Prompt + preview */}
        {step === "prompt" && (
          <form
            onSubmit={handlePreviewQuestions}
            className="space-y-4 text-sm text-slate-200"
          >
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-slate-400">
                step 3 of 5
              </p>
              <h2 className="text-2xl font-semibold leading-snug text-slate-50 md:text-3xl">
                what kind of questions do you want in here?
              </h2>
              <p className="text-xs text-slate-400">
                the more context you give, the better the questions ✨
              </p>
            </div>
            <div className="relative">
              <textarea
                value={newGroupPrompt}
                onChange={(event) => setNewGroupPrompt(event.target.value)}
                placeholder="fun, slightly deep questions about our week and friendships"
                className="min-h-[120px] w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-3 pr-12 text-base text-slate-50 outline-none focus:border-emerald-400 md:text-lg"
                required
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
                    : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
                title={isRecording ? "Stop recording" : "Voice input"}
              >
                🎤
              </button>
            </div>

            <div>
              <div className="-mx-1 flex space-x-3 overflow-x-auto pb-1 pl-1 pr-4">
                {/* AI-suggested prompt based on group name */}
                {suggestedPromptLoading && (
                  <div className="shrink-0 rounded-full border border-violet-500/60 bg-gradient-to-r from-violet-500/30 via-violet-400/40 to-purple-400/40 px-4 py-2 text-[12px] font-semibold text-violet-50 shadow-sm shadow-violet-900/50 md:text-sm">
                    <span className="animate-pulse">✨ thinking...</span>
                  </div>
                )}
                {suggestedPrompt && !suggestedPromptLoading && (
                  <button
                    type="button"
                    onClick={withHaptics(async () => {
                      setNewGroupPrompt(suggestedPrompt);
                      setPromptError(null);
                      await runPreview(suggestedPrompt);
                    })}
                    className="shrink-0 rounded-full border border-violet-500/60 bg-gradient-to-r from-violet-500/30 via-violet-400/40 to-purple-400/40 px-4 py-2 text-[12px] font-semibold text-violet-50 shadow-sm shadow-violet-900/50 hover:border-violet-300 hover:text-white md:text-sm"
                  >
                    ✨ {suggestedPrompt}
                  </button>
                )}
                {presetPrompts.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={withHaptics(async () => {
                      setNewGroupPrompt(preset);
                      setPromptError(null);
                      await runPreview(preset);
                    })}
                    className="shrink-0 rounded-full border border-emerald-500/60 bg-gradient-to-r from-emerald-500/30 via-emerald-400/40 to-teal-400/40 px-4 py-2 text-[12px] font-semibold text-emerald-50 shadow-sm shadow-emerald-900/50 hover:border-emerald-300 hover:text-white md:text-sm"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="submit"
              disabled={previewLoading}
              onClick={withHaptics(() => {})}
              className="flex w-full items-center justify-center rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-700 disabled:opacity-60"
            >
              {previewLoading ? "🦦 thinking..." : "View example"}
            </button>

            {sampleWithOptions.length > 0 && (
              <div className="space-y-4 pt-2">
                {sampleWithOptions.slice(0, 1).map((item, index) => (
                  <div key={index} className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                    <p className="mb-3 text-base font-medium text-slate-50 md:text-lg">
                      {item.prompt}
                    </p>
                    {item.options && item.options.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {item.options.map((option, optIndex) => (
                          <span
                            key={optIndex}
                            className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm text-emerald-300"
                          >
                            {option}
                          </span>
                        ))}
                        <span className="rounded-full border border-slate-600 bg-slate-800/50 px-3 py-1.5 text-sm text-slate-400">
                          + write your own
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {error && <p className="text-sm text-rose-400">{error}</p>}
            {promptError && <p className="text-sm text-amber-400">{promptError}</p>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={withHaptics(() => setStep("picture"))}
                className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:border-slate-500"
              >
                Back
              </button>
              <button
                type="button"
                onClick={withHaptics(() => {
                  if (!newGroupPrompt.trim()) {
                    setPromptError("🦦 hey! add a prompt so juggu knows what to ask");
                    return;
                  }
                  setPromptError(null);
                  setStep("juggu");
                })}
                className="flex-1 rounded-lg bg-emerald-400 px-3 py-2 text-xs font-medium text-slate-950 transition hover:bg-emerald-300"
              >
                Next
              </button>
            </div>
          </form>
        )}

        {/* Step 4 – Meet Juggu */}
        {step === "juggu" && (
          <div className="space-y-6 text-base text-slate-200">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-slate-400">
                last step!
              </p>
              <h2 className="text-2xl font-semibold leading-snug text-slate-50 md:text-3xl">
                add juggu? 🦦
              </h2>
            </div>

            <div className="flex flex-col items-center py-6">
              <div
                className={`mb-4 text-7xl md:text-8xl ${jugguEnabled ? "animate-[bounce_1s_ease-in-out_3]" : "opacity-60 grayscale"}`}
                style={{ transform: jugguEnabled ? undefined : "rotate(-10deg)" }}
              >
                {jugguEnabled ? "🦦" : "🦦"}
              </div>
              <p className={`mb-2 text-center text-lg font-medium md:text-xl ${jugguEnabled ? "text-slate-100" : "text-slate-400"}`}>
                {jugguEnabled ? "your group's playful sidekick" : "maybe next time..."}
              </p>
              <p className="max-w-xs text-center text-sm text-slate-400 md:text-base">
                juggu chimes in with fun messages that match your group&apos;s vibe.
                he&apos;s warm and quirky, sometimes sarcastic, but always supportive.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-900/60 px-5 py-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-base font-medium text-slate-100">Add juggu to this chat</p>
                  <p className="text-sm text-slate-400">you can change him anytime in settings</p>
                </div>
                <button
                  type="button"
                  onClick={withHaptics(() => setJugguEnabled(!jugguEnabled))}
                  className={`relative h-7 w-12 rounded-full transition-colors ${
                    jugguEnabled ? "bg-emerald-400" : "bg-slate-600"
                  }`}
                >
                  <span
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      jugguEnabled ? "left-6" : "left-1"
                    }`}
                  />
                </button>
              </div>
              {jugguEnabled && (
                <button
                  type="button"
                  onClick={withHaptics(() => setShowCustomize(!showCustomize))}
                  className="mt-3 text-sm text-slate-400 hover:text-slate-200"
                >
                  customize
                </button>
              )}
            </div>

            {jugguEnabled && showCustomize && (
              <textarea
                value={jugguPersonality}
                onChange={(event) => setJugguPersonality(event.target.value)}
                placeholder="e.g. speak in roman urdu, be extra sarcastic, roast people harder..."
                className="min-h-[80px] w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm text-slate-50 outline-none placeholder:text-slate-600 focus:border-emerald-400"
              />
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={withHaptics(() => setStep("prompt"))}
                className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:border-slate-500"
              >
                Back
              </button>
              <button
                type="button"
                onClick={withHaptics(async () => {
                  if (creatingGroup) return;
                  const group = await createGroupIfNeeded();
                  if (!group) return;
                  setCelebrating(true);
                  setStep("invites");
                  setTimeout(() => setCelebrating(false), 1300);
                })}
                className="flex-1 rounded-lg bg-emerald-400 px-3 py-2 text-xs font-medium text-slate-950 transition hover:bg-emerald-300 disabled:opacity-60"
              >
                {creatingGroup ? "Creating..." : "Create group"}
              </button>
            </div>
          </div>
        )}

        {/* Step 5 – Invites */}
        {step === "invites" && (
          <form
            onSubmit={handleFinish}
            className="space-y-4 text-sm text-slate-200"
          >
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-slate-400">
                step 5 of 5
              </p>
              <h2 className="text-2xl font-semibold leading-snug text-slate-50 md:text-3xl">
                who should be in this chat?
              </h2>
              <p className="text-xs text-slate-400 md:text-sm">
                your chat is ready. share this link with your people, or add phone
                numbers and we&apos;ll text them an invite.
              </p>
            </div>

            {createdGroupId && origin && (
              <div className="space-y-2 rounded-2xl bg-slate-950/90 px-5 py-4 shadow-[0_0_30px_rgba(15,23,42,0.9)]">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">
                  Share link
                </p>
                <div className="flex items-center gap-3 text-sm text-slate-50">
                  <span className="flex-1 truncate font-medium">
                    {origin}/i/{createdGroupId?.slice(0, 8)}
                  </span>
                  <button
                    type="button"
                    onClick={withHaptics(() => {
                      if (navigator?.clipboard?.writeText) {
                        void navigator.clipboard.writeText(
                          `${origin}/i/${createdGroupId?.slice(0, 8)}`,
                        );
                      }
                      setCopyMessage("Link copied");
                      setTimeout(() => setCopyMessage(null), 1500);
                    })}
                    className="shrink-0 rounded-full border border-slate-600 bg-slate-900 px-3 py-1 text-[11px] text-slate-50 hover:border-slate-400"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-xs text-slate-400">Invite by phone</label>
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={invitePhone}
                  onChange={(event) => setInvitePhone(event.target.value)}
                  placeholder="+1 (555) 123-4567"
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-base text-slate-50 outline-none focus:border-emerald-400 md:text-lg"
                />
                <button
                  type="button"
                  onClick={withHaptics(handleAddInvitePhone)}
                  className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-slate-700"
                >
                  Add
                </button>
              </div>
              {invitedPhones.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {invitedPhones.map((phone) => (
                    <button
                      key={phone}
                      type="button"
                      onClick={withHaptics(() => handleRemoveInvitePhone(phone))}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-3 py-1 text-[11px] text-slate-100 hover:bg-slate-700"
                    >
                      <span>{phone}</span>
                      <span className="text-slate-400">×</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {error && <p className="text-sm text-rose-400">{error}</p>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={withHaptics(() => setStep("prompt"))}
                className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:border-slate-500"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={creatingGroup}
                onClick={withHaptics(() => {})}
                className="flex-1 rounded-lg bg-emerald-400 px-3 py-2 text-xs font-medium text-slate-950 transition hover:bg-emerald-300 disabled:opacity-60"
              >
                {creatingGroup ? "Finishing..." : "Finish"}
              </button>
            </div>
          </form>
        )}
          {/* Celebration overlay */}
          {celebrating && (
            <div className="pointer-events-none fixed inset-0 z-30 flex flex-col items-center justify-center bg-black/40">
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                {Array.from({ length: 80 }).map((_, index) => (
                  <span
                    key={index}
                    className="absolute animate-bounce text-xl text-emerald-300/90 md:text-2xl"
                    style={{
                      left: `${(index * 13) % 100}%`,
                      top: `${(index * 7) % 100}%`,
                      animationDelay: `${index * 25}ms`,
                    }}
                  >
                    🎉
                  </span>
                ))}
              </div>
              <div className="relative rounded-2xl bg-slate-950/90 px-6 py-3 text-center text-sm font-semibold text-emerald-100 shadow-[0_0_40px_rgba(16,185,129,0.8)] md:text-base">
                Your group is ready!
              </div>
            </div>
          )}

          {/* Copy toast */}
          {copyMessage && (
            <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center">
              <div className="rounded-full bg-slate-900/90 px-4 py-2 text-xs font-medium text-slate-100 shadow-lg shadow-black/60">
                {copyMessage}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
