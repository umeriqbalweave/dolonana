"use client";

import { Suspense, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { withHaptics } from "@/lib/haptics";
import FloatingEmojis from "@/components/FloatingEmojis";

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteGroupId = searchParams.get("inviteGroupId");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        router.replace("/groups");
      }
    }

    void checkSession();
  }, [router]);

  function toE164(input: string): string {
    const digits = input.replace(/\D/g, "");

    // US numbers
    if (digits.length === 11 && digits.startsWith("1")) {
      return `+${digits}`;
    }
    if (digits.length === 10) {
      return `+1${digits}`;
    }

    // If already starts with +, keep as is; otherwise just prefix +
    return input.startsWith("+") ? input : `+${input}`;
  }

  async function handleSendOtp(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const normalizedPhone = toE164(phone.trim());

    const { error: signInError } = await supabase.auth.signInWithOtp({
      phone: normalizedPhone,
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    setStep("otp");
  }

  async function handleVerifyOtp(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const normalizedPhone = toE164(phone.trim());

    const { error: verifyError } = await supabase.auth.verifyOtp({
      phone: normalizedPhone,
      token: otp,
      type: "sms",
    });

    setLoading(false);

    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    // After successful verification, decide whether to send user to
    // onboarding (name + picture) or straight to groups.
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id ?? null;
    const userPhone = data.user?.phone ?? null;

    if (!userId) {
      router.replace("/groups");
      return;
    }

    // Save phone number to profile (upsert to handle both new and existing users)
    if (userPhone) {
      await supabase.from("profiles").upsert(
        { id: userId, phone_number: userPhone },
        { onConflict: "id" }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, avatar_url, phone")
      .eq("id", userId)
      .maybeSingle();

    const hasName = profile?.display_name && profile.display_name.trim().length > 0;
    const hasAvatar = !!profile?.avatar_url;

    // If user came from an invite link, add them to that group now
    if (inviteGroupId) {
      // Check if already a member
      const { data: existing } = await supabase
        .from("group_memberships")
        .select("id")
        .eq("group_id", inviteGroupId)
        .eq("user_id", userId)
        .maybeSingle();

      if (!existing) {
        await supabase.from("group_memberships").insert({
          group_id: inviteGroupId,
          user_id: userId,
          role: "member",
          status: "active",
        });
      }

      // Send to onboarding if no name, otherwise straight to the group
      if (!hasName) {
        router.replace(`/onboarding?then=/groups/${inviteGroupId}`);
      } else {
        router.replace(`/groups/${inviteGroupId}`);
      }
      return;
    }

    // New user without name goes to onboarding, otherwise to groups
    if (!hasName) {
      router.replace("/onboarding");
    } else {
      router.replace("/groups");
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-violet-950 via-slate-900 to-emerald-900 text-slate-50 overflow-hidden">
      <FloatingEmojis count={5} />
      <motion.main
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="w-full max-w-md px-6 py-10 md:px-8"
      >
        {/* Show minimal UI if coming from invite flow */}
        {!inviteGroupId && (
          <>
            <motion.h1
              className="mb-2 text-center text-4xl font-bold tracking-tight md:text-5xl bg-gradient-to-r from-violet-400 via-emerald-400 to-violet-400 bg-clip-text text-transparent"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              QWF
            </motion.h1>
            <motion.p
              className="mb-8 text-center text-lg text-slate-300 md:text-xl"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.18 }}
            >
              Answer first. Then see theirs.
            </motion.p>
          </>
        )}
        {step === "phone" && (
          <form onSubmit={handleSendOtp} className="space-y-5">
            <motion.h2
              className="text-center text-2xl font-bold text-slate-50 md:text-3xl"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              Enter your phone number
            </motion.h2>
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+1 555 555 5555"
              className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-5 py-4 text-xl text-slate-50 text-center outline-none focus:border-emerald-400"
              required
            />
            {error && (
              <p className="text-base text-rose-400 text-center">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              onClick={withHaptics(() => {})}
              className="flex w-full items-center justify-center rounded-xl bg-emerald-400 px-5 py-4 text-xl font-bold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-60"
            >
              {loading ? "Sending..." : "Send code"}
            </button>
            {!inviteGroupId && (
              <p className="text-center text-base text-slate-500">
                We&apos;ll text you a one-time code.
              </p>
            )}
          </form>
        )}
        {step === "otp" && (
          <form onSubmit={handleVerifyOtp} className="space-y-5">
            <motion.h2
              className="text-center text-2xl font-bold text-slate-50 md:text-3xl"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              Enter verification code
            </motion.h2>
            <input
              type="text"
              inputMode="numeric"
              value={otp}
              onChange={(event) => {
                setError(null); // Clear any previous error when typing
                const value = event.target.value.replace(/\D/g, "").slice(0, 6);
                setOtp(value);
                // Auto-submit when 6 digits entered
                if (value.length === 6 && !loading) {
                  setTimeout(() => {
                    const form = event.target.closest("form");
                    if (form) form.requestSubmit();
                  }, 150);
                }
              }}
              placeholder="123456"
              className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-5 py-4 text-2xl text-slate-50 text-center outline-none focus:border-emerald-400 tracking-[0.3em]"
              required
              maxLength={6}
            />
            {error && (
              <p className="text-base text-rose-400 text-center">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              onClick={withHaptics(() => {})}
              className="flex w-full items-center justify-center rounded-xl bg-emerald-400 px-5 py-4 text-xl font-bold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-60"
            >
              {loading ? "Verifying..." : "Verify"}
            </button>
            <button
              type="button"
              onClick={withHaptics(() => setStep("phone"))}
              className="w-full text-center text-lg text-slate-400 hover:text-slate-200 py-3"
            >
              ← Different number
            </button>
          </form>
        )}
      </motion.main>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-900 text-slate-50">
          <p className="text-base text-slate-400">Loading...</p>
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
