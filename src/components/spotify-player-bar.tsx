"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";

// Spotify iFrame Embed API (https://developer.spotify.com/documentation/embeds).
// One persistent controller lives in the bottom bar; playing a track from any
// card swaps the loaded uri instead of mounting a new iframe per card.

type EmbedController = {
  loadUri: (uri: string) => void;
  play: () => void;
  destroy: () => void;
  addListener: (event: string, callback: () => void) => void;
};

type SpotifyIframeApi = {
  createController: (
    element: HTMLElement,
    options: { uri: string; width: string | number; height: string | number },
    callback: (controller: EmbedController) => void,
  ) => void;
};

declare global {
  interface Window {
    onSpotifyIframeApiReady?: (api: SpotifyIframeApi) => void;
    impastoSpotifyIframeApi?: SpotifyIframeApi;
  }
}

let apiPromise: Promise<SpotifyIframeApi> | null = null;

function loadIframeApi() {
  if (window.impastoSpotifyIframeApi) {
    return Promise.resolve(window.impastoSpotifyIframeApi);
  }

  if (!apiPromise) {
    apiPromise = new Promise<SpotifyIframeApi>((resolve) => {
      window.onSpotifyIframeApiReady = (api) => {
        window.impastoSpotifyIframeApi = api;
        resolve(api);
      };

      const script = document.createElement("script");
      script.src = "https://open.spotify.com/embed/iframe-api/v1";
      script.async = true;
      document.body.appendChild(script);
    });
  }

  return apiPromise;
}

export type NowPlayingTrack = {
  trackId: string;
  title: string;
};

const HINT_DISMISSED_KEY = "impasto-spotify-full-track-hint";

const hintListeners = new Set<() => void>();

function subscribeHint(onChange: () => void) {
  hintListeners.add(onChange);
  return () => {
    hintListeners.delete(onChange);
  };
}

function isHintDismissed() {
  return window.localStorage.getItem(HINT_DISMISSED_KEY) === "1";
}

function dismissHint() {
  window.localStorage.setItem(HINT_DISMISSED_KEY, "1");
  for (const listener of hintListeners) {
    listener();
  }
}

export function SpotifyPlayerBar({
  track,
  onClose,
}: {
  track: NowPlayingTrack;
  onClose: () => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<EmbedController | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [retryKey, setRetryKey] = useState(0);
  const showHint = !useSyncExternalStore(
    subscribeHint,
    isHintDismissed,
    () => true,
  );

  useEffect(() => {
    const uri = `spotify:track:${track.trackId}`;

    if (controllerRef.current) {
      controllerRef.current.loadUri(uri);
      controllerRef.current.play();
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      setStatus((current) => (current === "loading" ? "error" : current));
    }, 10000);

    void loadIframeApi().then((api) => {
      if (cancelled || !hostRef.current || controllerRef.current) {
        return;
      }

      // createController replaces the element it receives, so hand it a
      // disposable child instead of the styled host div.
      const mount = document.createElement("div");
      hostRef.current.appendChild(mount);

      api.createController(
        mount,
        { uri, width: "100%", height: 80 },
        (controller) => {
          controllerRef.current = controller;
          controller.addListener("ready", () => {
            window.clearTimeout(timeout);
            setStatus("ready");
            controller.play();
          });
        },
      );
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [track.trackId, retryKey]);

  function retry() {
    controllerRef.current?.destroy();
    controllerRef.current = null;
    hostRef.current?.replaceChildren();
    setStatus("loading");
    setRetryKey((current) => current + 1);
  }

  useEffect(() => {
    return () => {
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-4 sm:px-8">
      <div className="pointer-events-auto mx-auto w-full max-w-[860px]">
        <div className="app-player-bar overflow-hidden rounded-2xl">
          <div className="flex items-stretch">
            <div
              ref={hostRef}
              className={
                status === "error" ? "hidden" : "h-[80px] min-w-0 flex-1"
              }
            />
            {status === "error" ? (
              <div className="flex h-[80px] min-w-0 flex-1 flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 text-[13px] font-medium text-[#86868b]">
                <span>Spotify had an error and the player did not load.</span>
                <button
                  type="button"
                  onClick={retry}
                  className="rounded-full bg-[#f5f5f7] px-3 py-1 font-semibold text-[#1d1d1f] transition hover:bg-[#e8e8ed]"
                >
                  Try again
                </button>
              </div>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="app-icon-button flex w-10 shrink-0 items-center justify-center text-[#86868b] transition hover:text-[#1d1d1f]"
              aria-label={`Close player for ${track.title}`}
            >
              <X size={16} strokeWidth={1.8} />
            </button>
          </div>
          {showHint ? (
            <div className="flex items-center gap-2 border-t border-[#d2d2d7]/50 px-3 py-1.5 text-[11px] font-medium leading-4 text-[#86868b]">
              <span className="min-w-0 flex-1">
                Hearing only 30 seconds?{" "}
                <a
                  href="https://open.spotify.com"
                  target="_blank"
                  rel="noreferrer"
                  className="underline transition hover:text-[#1d1d1f]"
                >
                  Log in to Spotify Premium
                </a>{" "}
                to play full tracks.
              </span>
              <button
                type="button"
                onClick={dismissHint}
                className="shrink-0 rounded px-1 underline transition hover:text-[#1d1d1f]"
              >
                Got it
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
