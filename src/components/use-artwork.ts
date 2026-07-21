// Shared fetcher for the artist and album view headers. A failed lookup is not
// worth surfacing as an error — the caller renders without art.
export async function fetchArtwork<T>(
  params: Record<string, string>,
): Promise<T | null> {
  const query = new URLSearchParams(params);
  const response = await fetch(`/api/artwork?${query.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as { artwork: T | null };
  return data.artwork;
}
