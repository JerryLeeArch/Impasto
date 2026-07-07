"use client";

import { useEffect, useRef } from "react";
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
  }
}

let apiPromise: Promise<SpotifyIframeApi> | null = null;

// The script calls window.onSpotifyIframeApiReady exactly once, so the promise
// is cached for the lifetime of the page.
function loadIframeApi() {
  if (!apiPromise) {
    apiPromise = new Promise<SpotifyIframeApi>((resolve) => {
      window.onSpotifyIframeApiReady = (api) => resolve(api);

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

export function SpotifyPlayerBar({
  track,
  onClose,
}: {
  track: NowPlayingTrack;
  onClose: () => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<EmbedController | null>(null);

  useEffect(() => {
    const uri = `spotify:track:${track.trackId}`;

    if (controllerRef.current) {
      controllerRef.current.loadUri(uri);
      controllerRef.current.play();
      return;
    }

    let cancelled = false;

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
            controller.play();
          });
        },
      );
    });

    return () => {
      cancelled = true;
    };
  }, [track.trackId]);

  useEffect(() => {
    return () => {
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-4 sm:px-8">
      <div className="pointer-events-auto mx-auto w-full max-w-[860px]">
        <div className="app-player-bar flex items-stretch overflow-hidden rounded-2xl">
          <div ref={hostRef} className="h-[80px] min-w-0 flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="app-icon-button flex w-10 shrink-0 items-center justify-center text-[#86868b] transition hover:text-[#1d1d1f]"
            aria-label={`Close player for ${track.title}`}
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </div>
  );
}
