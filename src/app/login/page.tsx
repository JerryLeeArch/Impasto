"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NEXT_PATH_COOKIE } from "@/lib/auth-redirect";

const features = [
  {
    title: "Log what you love",
    body: "Songs and albums — with ratings, notes, and credits.",
  },
  {
    title: "Watch it evolve",
    body: "Add new layers as your opinion changes, and keep the history.",
  },
  {
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
    // The destination rides in a cookie: a query param on redirect_to makes
    // the Supabase allowlist match fail and login bounces to the Site URL.
    document.cookie = `${NEXT_PATH_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=600; samesite=lax`;
    const callback = new URL("/auth/callback", window.location.origin);
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
    <main
      className="grid min-h-screen min-h-[100svh] grid-rows-[auto_1fr_auto] overflow-hidden"
      style={{
        background:
          "linear-gradient(to right, #000 0%, #000 50%, #fff 50%, #fff 100%)",
      }}
    >
      <header className="px-3 pt-[clamp(1.5rem,4vh,3.5rem)]">
        <div className="flex items-center justify-center gap-[clamp(0.5rem,2.25vw,2.25rem)]">
          <Image
            src="/logos/white-paint-logo.png"
            alt=""
            width={1024}
            height={1024}
            priority
            className="h-[clamp(3rem,10vw,9rem)] w-[clamp(3rem,10vw,9rem)] translate-y-[clamp(0.8rem,1.55vw,1.55rem)] shrink-0 object-contain"
          />
          <h1 className="text-center text-[clamp(4.75rem,16vw,15rem)] leading-[0.8] font-semibold tracking-[-0.075em] text-white mix-blend-difference">
            impasto
          </h1>
          <Image
            src="/logos/black-paint-logo-transparent.png"
            alt=""
            width={1254}
            height={1254}
            priority
            className="h-[clamp(3rem,10vw,9rem)] w-[clamp(3rem,10vw,9rem)] translate-y-[clamp(0.8rem,1.55vw,1.55rem)] shrink-0 object-contain"
          />
        </div>
      </header>

      <div className="grid min-h-0 grid-cols-2 items-center">
        <section className="flex justify-end px-[clamp(1rem,5vw,6rem)] py-8 text-white">
          <div className="w-full max-w-xl text-right">
            <h2 className="text-[clamp(1.25rem,2.2vw,2.25rem)] leading-tight font-semibold tracking-[-0.025em]">
              A canvas for your evolving taste.
            </h2>
            <p className="mt-5 text-[clamp(0.75rem,1.2vw,1rem)] leading-relaxed text-white/70">
              Share your music taste with your friends. Capture your feelings
              today, then watch your opinions build up in layers over time — like
              paint on a canvas.
            </p>
          </div>
        </section>

        <section className="px-[clamp(1rem,5vw,6rem)] py-8 text-black">
          <ul className="w-full max-w-xl space-y-[clamp(1rem,3vh,2rem)]">
            {features.map(({ title, body }) => (
              <li key={title}>
                <h2 className="text-[clamp(0.875rem,1.35vw,1.25rem)] leading-tight font-semibold tracking-[-0.015em]">
                  {title}
                </h2>
                <p className="mt-2 text-[clamp(0.7rem,1.05vw,0.95rem)] leading-relaxed text-black/60">
                  {body}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <footer className="px-6 pb-[clamp(1.5rem,4vh,3.5rem)] text-center text-white mix-blend-difference">
        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={isLoading}
          className="mx-auto flex h-12 w-full max-w-xs items-center justify-center rounded-full border border-current bg-transparent px-6 text-sm font-semibold transition-opacity hover:opacity-65 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current disabled:cursor-wait disabled:opacity-45"
        >
          {isLoading ? "Connecting…" : "Continue with Google"}
        </button>
        {error ? (
          <p className="mt-3 text-xs font-semibold" role="alert">
            {error}
          </p>
        ) : null}
        <p className="mt-4 text-xs leading-5 opacity-65">
          Your archive is private by default. You choose what friends can see.
        </p>
        <p className="mt-1 text-xs leading-5">
          <a
            href="/privacy"
            className="underline underline-offset-4 transition-opacity hover:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current"
          >
            Privacy Policy
          </a>
        </p>
      </footer>
    </main>
  );
}
