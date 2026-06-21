import { MetadataError } from "./types";

const providerTimeoutMs = 8_000;

export async function fetchProvider(
  provider: "Spotify" | "Genius",
  input: string | URL,
  init: RequestInit = {},
) {
  try {
    return await fetch(input, {
      ...init,
      signal: AbortSignal.timeout(providerTimeoutMs),
    });
  } catch (error) {
    const isTimeout =
      error instanceof DOMException &&
      (error.name === "AbortError" || error.name === "TimeoutError");
    throw new MetadataError(
      isTimeout
        ? `${provider} request timed out.`
        : `${provider} request failed.`,
    );
  }
}
