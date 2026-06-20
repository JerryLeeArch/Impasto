"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Layers, Music, Users, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const features: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Music,
    title: "Log what you love",
    body: "Music, images, and more — with ratings, notes, and credits.",
  },
  {
    icon: Layers,
    title: "Watch it evolve",
    body: "Add new layers as your opinion changes, and keep the history.",
  },
  {
    icon: Users,
    title: "Share with friends",
    body: "Add friends and follow each other's evolving taste.",
  },
];

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
    <main className="flex min-h-screen items-center justify-center bg-[#f5f5f7] px-6 py-12 text-[#1d1d1f]">
      <section className="w-full max-w-md rounded-3xl border border-black/5 bg-white px-8 py-10 shadow-[0_24px_80px_rgba(0,0,0,0.09)]">
        <h1 className="text-3xl font-semibold tracking-tight">Impasto</h1>
        <p className="mt-2 text-[15px] font-medium text-[#1d1d1f]">
          A canvas for your evolving taste.
        </p>
        <p className="mt-2 text-sm leading-6 text-[#6e6e73]">
          A private journal for the things you love. Capture your take today,
          then watch your opinions build up in layers over time — like paint on a
          canvas.
        </p>

        <ul className="mt-7 space-y-4">
          {features.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f5f5f7] text-[#1d1d1f]">
                <Icon size={16} strokeWidth={1.8} />
              </span>
              <span>
                <span className="block text-sm font-semibold text-[#1d1d1f]">
                  {title}
                </span>
                <span className="block text-[13px] leading-5 text-[#6e6e73]">
                  {body}
                </span>
              </span>
            </li>
          ))}
        </ul>

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
          Your archive is private by default. You choose what friends can see.
        </p>
        <p className="mt-3 text-center text-xs leading-5 text-[#86868b]">
          <a href="/privacy" className="underline transition hover:text-[#1d1d1f]">
            Privacy Policy
          </a>
        </p>
      </section>
    </main>
  );
}
