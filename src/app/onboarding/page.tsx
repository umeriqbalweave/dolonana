"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { uploadImage } from "@/lib/uploadImage";
import { withHaptics } from "@/lib/haptics";

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
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <p className="text-xl text-[#a8a6a3]">Loading...</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#0a0a0a] text-[#e8e6e3] overflow-hidden">
      
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
              <h1 className="text-4xl md:text-5xl font-bold text-[#e8e6e3] mb-2">
                What should we call you?
              </h1>
              <p className="text-xl text-[#a8a6a3] mt-3">This is how your friends will see you</p>
            </div>

            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoFocus
              className="w-full rounded-2xl bg-[#1a1a1a] border-2 border-[#2a2a2a] px-6 py-5 text-2xl text-[#e8e6e3] placeholder:text-[#666] focus:border-[#888] focus:outline-none text-center"
            />

            <button
              type="submit"
              disabled={!name.trim() || saving}
              onClick={withHaptics(() => {})}
              className="w-full rounded-2xl bg-[#e8e6e3] px-6 py-5 text-2xl font-semibold text-[#1a1a1a] hover:bg-[#d0d0d0] transition disabled:opacity-30"
            >
              {saving ? "Saving..." : "Continue →"}
            </button>
          </form>
        )}

        {/* STEP 2: Optional Photo */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h1 className="text-4xl md:text-5xl font-bold text-[#e8e6e3] mb-2">
                Add a photo
              </h1>
              <p className="text-xl text-[#a8a6a3] mt-3">Optional, but it helps friends recognize you!</p>
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
              <div className="h-32 w-32 overflow-hidden rounded-full bg-[#1a1a1a] border-2 border-dashed border-[#3a3a3a] hover:border-[#666] transition flex items-center justify-center">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-4xl">+</span>
                )}
              </div>
              <p className="text-sm text-[#666] mt-3">Tap to upload</p>
            </button>

            <div className="space-y-3 pt-4">
              <button
                type="button"
                onClick={withHaptics(handlePhotoSubmit)}
                disabled={saving}
                className="w-full rounded-2xl bg-[#e8e6e3] px-6 py-5 text-2xl font-semibold text-[#1a1a1a] hover:bg-[#d0d0d0] transition disabled:opacity-30"
              >
                {saving ? "Saving..." : avatarFile ? "Save & Continue →" : "Continue →"}
              </button>

              {!avatarFile && (
                <button
                  type="button"
                  onClick={withHaptics(handleSkipPhoto)}
                  className="w-full rounded-2xl bg-[#1a1a1a] border border-[#2a2a2a] px-5 py-3 text-base font-medium text-[#a8a6a3] hover:bg-[#2a2a2a] transition"
                >
                  Skip for now
                </button>
              )}
            </div>
          </div>
        )}

        {/* Progress indicator */}
        <div className="flex justify-center gap-2 mt-8">
          <div className={`h-2 w-8 rounded-full ${step >= 1 ? "bg-[#e8e6e3]" : "bg-[#2a2a2a]"}`} />
          <div className={`h-2 w-8 rounded-full ${step >= 2 ? "bg-[#e8e6e3]" : "bg-[#2a2a2a]"}`} />
        </div>
      </motion.main>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
          <p className="text-xl text-[#a8a6a3]">Loading...</p>
        </div>
      }
    >
      <OnboardingContent />
    </Suspense>
  );
}
