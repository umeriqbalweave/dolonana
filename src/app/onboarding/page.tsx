"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { uploadImage } from "@/lib/uploadImage";
import { withHaptics } from "@/lib/haptics";
import FloatingEmojis from "@/components/FloatingEmojis";

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("then") || "/groups";
  
  const [userId, setUserId] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function checkUser() {
      const { data } = await supabase.auth.getUser();
      if (!data.user?.id) {
        router.replace("/");
        return;
      }
      setUserId(data.user.id);

      // Check if user already has a name
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profile?.display_name) {
        setName(profile.display_name);
      }
    }
    void checkUser();
  }, [router]);

  async function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !userId) return;

    setSaving(true);
    const { error } = await supabase.from("profiles").upsert(
      { id: userId, display_name: name.trim() },
      { onConflict: "id" }
    );
    if (error) {
      console.error("Error saving name:", error);
    }
    setSaving(false);
    setStep(2);
  }

  async function handlePhotoSubmit() {
    if (!userId) return;

    setSaving(true);

    if (avatarFile) {
      const uploadedUrl = await uploadImage("avatars", avatarFile, userId);
      if (uploadedUrl) {
        await supabase.from("profiles").upsert(
          { id: userId, avatar_url: uploadedUrl },
          { onConflict: "id" }
        );
      }
    }

    setSaving(false);
    router.replace(redirectTo);
  }

  async function handleSkipPhoto() {
    router.replace(redirectTo);
  }

  if (!userId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="animate-pulse text-4xl">🪷</div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50 overflow-hidden">
      <FloatingEmojis count={5} />

      <motion.main
        key={step}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md px-6 py-10"
      >
        {/* STEP 1: Name */}
        {step === 1 && (
          <form onSubmit={handleNameSubmit} className="space-y-6">
            <div className="text-center mb-8">
              <div className="text-6xl mb-4">🪷</div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-rose-400 via-amber-400 to-rose-400 bg-clip-text text-transparent">
                What should we call you?
              </h1>
              <p className="text-slate-400 mt-2">This is how your friends will see you</p>
              <p className="text-xs text-rose-400 mt-1">* Required</p>
            </div>

            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoFocus
              className="w-full rounded-2xl bg-white/10 border border-white/20 px-5 py-4 text-xl text-white placeholder:text-white/40 focus:border-amber-400 focus:outline-none text-center"
            />

            <button
              type="submit"
              disabled={!name.trim() || saving}
              onClick={withHaptics(() => {})}
              className="w-full rounded-2xl bg-amber-500 px-5 py-4 text-lg font-bold text-black hover:bg-amber-400 transition shadow-lg disabled:opacity-50"
            >
              {saving ? "Saving..." : "Continue →"}
            </button>
          </form>
        )}

        {/* STEP 2: Optional Photo */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <div className="text-6xl mb-4">✨</div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-rose-400 via-amber-400 to-rose-400 bg-clip-text text-transparent">
                Add a photo
              </h1>
              <p className="text-slate-400 mt-2">Optional, but it helps friends recognize you!</p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setAvatarFile(file);
                if (file) {
                  setAvatarPreview(URL.createObjectURL(file));
                }
              }}
              className="hidden"
            />

            <button
              type="button"
              onClick={withHaptics(() => fileInputRef.current?.click())}
              className="mx-auto flex flex-col items-center"
            >
              <div className="h-32 w-32 overflow-hidden rounded-full bg-white/10 border-4 border-dashed border-white/30 hover:border-amber-400 transition flex items-center justify-center">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-4xl">📷</span>
                )}
              </div>
              <p className="text-sm text-white/60 mt-3">Tap to upload</p>
            </button>

            <div className="space-y-3 pt-4">
              <button
                type="button"
                onClick={withHaptics(handlePhotoSubmit)}
                disabled={saving}
                className="w-full rounded-2xl bg-amber-500 px-5 py-4 text-lg font-bold text-black hover:bg-amber-400 transition shadow-lg disabled:opacity-50"
              >
                {saving ? "Saving..." : avatarFile ? "Save & Continue →" : "Continue →"}
              </button>

              {!avatarFile && (
                <button
                  type="button"
                  onClick={withHaptics(handleSkipPhoto)}
                  className="w-full rounded-2xl bg-white/10 px-5 py-3 text-base font-medium text-white/70 hover:bg-white/20 transition"
                >
                  Skip for now
                </button>
              )}
            </div>
          </div>
        )}

        {/* Progress indicator */}
        <div className="flex justify-center gap-2 mt-8">
          <div className={`h-2 w-8 rounded-full ${step >= 1 ? "bg-amber-400" : "bg-white/20"}`} />
          <div className={`h-2 w-8 rounded-full ${step >= 2 ? "bg-amber-400" : "bg-white/20"}`} />
        </div>
      </motion.main>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
          <div className="animate-pulse text-4xl">🪷</div>
        </div>
      }
    >
      <OnboardingContent />
    </Suspense>
  );
}
