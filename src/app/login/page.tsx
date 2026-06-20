"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(
    searchParams.get("error") ? "Google sign-in could not be completed." : "",
  );

  async function signInWithGoogle() {
    setIsLoading(true);
    setError("");
    const nextParam = searchParams.get("next");
    const next = nextParam?.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/";
    const callback = new URL("/auth/callback", window.location.origin);
    callback.searchParams.set("next", next);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString() },
    });

    if (signInError) {
      setError("Google sign-in could not be started.");
      setIsLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f5f7] px-6 text-[#1d1d1f]">
      <section className="w-full max-w-sm rounded-3xl border border-black/5 bg-white px-8 py-10 shadow-[0_24px_80px_rgba(0,0,0,0.09)]">
        <h1 className="text-3xl font-semibold tracking-tight">Impasto</h1>
        <p className="mt-2 text-sm text-[#6e6e73]">Your take, over time.</p>
        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={isLoading}
          className="mt-8 flex h-11 w-full items-center justify-center rounded-full bg-[#1d1d1f] px-5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-wait disabled:opacity-60"
        >
          {isLoading ? "Connecting…" : "Continue with Google"}
        </button>
        {error ? (
          <p className="mt-4 text-center text-xs text-[#c9342f]" role="alert">
            {error}
          </p>
        ) : null}
        <p className="mt-6 text-center text-xs leading-5 text-[#86868b]">
          Your archive is private to your account.
        </p>
      </section>
    </main>
  );
}
