"use client";

import {
  ClipboardEvent as ReactClipboardEvent,
  DragEvent,
  FormEvent,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Disc3,
  GripVertical,
  Image,
  ListOrdered,
  Loader2,
  Lock,
  LogOut,
  Moon,
  Music,
  Pencil,
  Plus,
  Search,
  Sun,
  Trash2,
  User,
  Users,
  type LucideIcon,
  X,
} from "lucide-react";

type Category = "music" | "image" | "other";
type CategoryFilter = Category | "all";
type Rating = "like" | "neutral" | "dislike";
type MusicKind = "song" | "album";
type Visibility = "public" | "private";
type FeedScope = "all" | "mine" | "friends";
type ViewMode = "feed" | "ranking";

type Credit = {
  role: string;
  names: string[];
};

type CreditFormRow = {
  id: string;
  role: string;
  names: string;
};

type TasteLog = {
  id: string;
  itemId: string;
  category: Category;
  musicKind: MusicKind | null;
  albumTitle: string;
  genres: string[];
  title: string;
  body: string;
  rating: Rating;
  artists: string[];
  credits: Credit[];
  visibility: Visibility;
  createdAt: string;
  updatedAt: string;
  isMine?: boolean;
  ownerUsername?: string | null;
  ownerDisplayName?: string | null;
};

type FriendSummary = {
  friendshipId: string;
  userId: string;
  username: string | null;
  displayName: string | null;
};

type FriendList = {
  accepted: FriendSummary[];
  incoming: FriendSummary[];
  outgoing: FriendSummary[];
};

type MusicItemSummary = {
  id: string;
  title: string;
  musicKind: MusicKind;
  albumTitle: string;
  artists: string[];
};

type FavoriteRankingEntry = MusicItemSummary & {
  rank: number;
};

type FormState = {
  id: string | null;
  category: Category;
  musicKind: MusicKind;
  albumTitle: string;
  genres: string;
  title: string;
  body: string;
  rating: Rating;
  artists: string;
  credits: CreditFormRow[];
  visibility: Visibility;
};

type ComposerMode = "create" | "edit" | "layer";
type CreditInputField = "role" | "names";

type SelectedItem = {
  id: string;
  title: string;
  category: Category;
  musicKind: MusicKind | null;
  albumTitle: string;
  artists: string[];
};

type SelectedAlbum = {
  albumTitle: string;
  artists: string[];
};

type Profile = {
  username: string | null;
  displayName: string | null;
  email: string | null;
  usernameChangedAt: string | null;
  defaultVisibility: Visibility;
};

const usernameCooldownDays = 14;

const themeStorageKey = "impasto-theme";
const themeCookieMaxAge = 60 * 60 * 24 * 365;

const defaultCreditRoles = [
  "Written By",
  "Produced By",
  "Composed By",
  "Lyrics By",
  "Arranged By",
  "Featuring",
  "Vocals",
  "Mix Engineer",
  "Mastering Engineer",
];

function createEmptyForm(): FormState {
  return {
    id: null,
    category: "music",
    musicKind: "song",
    albumTitle: "",
    genres: "",
    title: "",
    body: "",
    rating: "like",
    artists: "",
    credits: createCreditRows(),
    visibility: "private",
  };
}

const categoryOptions: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "music", label: "Music" },
  { value: "image", label: "Images" },
  { value: "other", label: "Other" },
];

const composeCategoryOptions: { value: Category; label: string }[] = [
  { value: "music", label: "Music" },
  { value: "image", label: "Image" },
  { value: "other", label: "Other" },
];

const visibilityOptions: {
  value: Visibility;
  label: string;
  icon: LucideIcon;
}[] = [
  { value: "private", label: "Private", icon: Lock },
  { value: "public", label: "Friends", icon: Users },
];

const feedScopeOptions: { value: FeedScope; label: string }[] = [
  { value: "all", label: "All" },
  { value: "mine", label: "Mine" },
  { value: "friends", label: "Friends" },
];

const musicKindOptions: { value: MusicKind; label: string; icon: LucideIcon }[] =
  [
    { value: "song", label: "Song", icon: Music },
    { value: "album", label: "Album", icon: Disc3 },
  ];

const ratingOptions: {
  value: Rating;
  label: string;
  dotClassName: string;
}[] = [
  {
    value: "like",
    label: "Like",
    dotClassName: "bg-[#9bd36a]",
  },
  {
    value: "neutral",
    label: "Neutral",
    dotClassName: "bg-[#d6a84f]",
  },
  {
    value: "dislike",
    label: "Dislike",
    dotClassName: "bg-[#ff453a]",
  },
];

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default function Home() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>("feed");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<SelectedAlbum | null>(
    null,
  );
  const [form, setForm] = useState<FormState>(() => createEmptyForm());
  const [composerMode, setComposerMode] = useState<ComposerMode>("create");
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isCreditsFormOpen, setIsCreditsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isThemeReady, setIsThemeReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCreditIds, setExpandedCreditIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isArtistInputFocused, setIsArtistInputFocused] = useState(false);
  const [activeCreditInput, setActiveCreditInput] = useState<{
    rowId: string;
    field: CreditInputField;
  } | null>(null);
  const [rankingKind, setRankingKind] = useState<MusicKind>("song");
  const [isCandidatePickerOpen, setIsCandidatePickerOpen] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [draggingRankingId, setDraggingRankingId] = useState<string | null>(null);
  const [draggingCreditId, setDraggingCreditId] = useState<string | null>(null);
  const [isRankingSaving, setIsRankingSaving] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [isUsernameLocked, setIsUsernameLocked] = useState(false);
  const [feedScope, setFeedScope] = useState<FeedScope>("all");
  const [isFriendsOpen, setIsFriendsOpen] = useState(false);
  const [friendUsernameDraft, setFriendUsernameDraft] = useState("");
  const [friendError, setFriendError] = useState<string | null>(null);
  const [friendNotice, setFriendNotice] = useState<string | null>(null);
  const [isFriendSaving, setIsFriendSaving] = useState(false);
  const pendingScrollRef = useRef<number | null>(null);

  const debouncedSearch = useDebouncedValue(search, 180);
  const trimmedSearch = debouncedSearch.trim();
  const artistSearch = getActiveArtistQuery(form.artists);
  const debouncedArtistSearch = useDebouncedValue(artistSearch, 140);
  const activeCreditRow = activeCreditInput
    ? form.credits.find((row) => row.id === activeCreditInput.rowId) ?? null
    : null;
  const activeCreditQuery = activeCreditRow
    ? activeCreditInput?.field === "names"
      ? getActiveArtistQuery(activeCreditRow.names)
      : activeCreditRow.role.trim()
    : "";
  const debouncedCreditQuery = useDebouncedValue(activeCreditQuery, 140);
  const debouncedCandidateSearch = useDebouncedValue(candidateSearch, 180);

  const {
    data: logs = [],
    isPending,
    isError,
  } = useQuery({
    queryKey: selectedItem
      ? ["logs", "item", selectedItem.id]
      : selectedAlbum
        ? ["logs", "album", selectedAlbum.albumTitle]
      : ["logs", "feed", feedScope, trimmedSearch],
    enabled: viewMode === "feed",
    queryFn: async () => {
      const params = new URLSearchParams();

      if (selectedItem) {
        params.set("itemId", selectedItem.id);
      } else if (selectedAlbum) {
        params.set("albumTitle", selectedAlbum.albumTitle);
      } else {
        params.set("scope", feedScope);
        if (trimmedSearch) {
          params.set("search", trimmedSearch);
        }
      }

      const response = await fetch(`/api/logs?${params.toString()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Could not load logs.");
      }

      const data = (await response.json()) as { logs: TasteLog[] };
      return data.logs;
    },
    placeholderData: () => {
      if (!selectedItem && !selectedAlbum) {
        return undefined;
      }

      const cached = queryClient.getQueriesData<TasteLog[]>({
        queryKey: ["logs"],
      });
      const seen = new Set<string>();
      const matches: TasteLog[] = [];
      const selectedAlbumKey = selectedAlbum?.albumTitle.toLowerCase();

      for (const [, data] of cached) {
        for (const log of data ?? []) {
          const isMatch = selectedItem
            ? log.itemId === selectedItem.id
            : log.albumTitle.toLowerCase() === selectedAlbumKey;

          if (isMatch && !seen.has(log.id)) {
            seen.add(log.id);
            matches.push(log);
          }
        }
      }

      return matches.length > 0 ? matches : undefined;
    },
  });

  const isDrilldown = Boolean(selectedItem || selectedAlbum);
  const displayLogs = useMemo(() => {
    if (isDrilldown || category === "all") {
      return logs;
    }
    return logs.filter((log) => log.category === category);
  }, [logs, isDrilldown, category]);

  const { data: friendList } = useQuery<FriendList>({
    queryKey: ["friends"],
    queryFn: async () => {
      const response = await fetch("/api/friends", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Could not load friends.");
      }
      const data = (await response.json()) as { friends: FriendList };
      return data.friends;
    },
  });
  const incomingFriendCount = friendList?.incoming.length ?? 0;

  const { data: profile } = useQuery<Profile>({
    queryKey: ["profile"],
    queryFn: async () => {
      const response = await fetch("/api/profile", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Could not load profile.");
      }
      const data = (await response.json()) as { profile: Profile };
      return data.profile;
    },
  });

  const usernameNextChangeAt = profile?.usernameChangedAt
    ? new Date(
        new Date(profile.usernameChangedAt).getTime() +
          usernameCooldownDays * 24 * 60 * 60 * 1000,
      )
    : null;
  const profileInitial = (
    profile?.username ||
    profile?.displayName ||
    profile?.email ||
    ""
  )
    .trim()
    .charAt(0)
    .toUpperCase();

  const { data: artistSuggestions = [] } = useQuery({
    queryKey: ["artists", debouncedArtistSearch],
    enabled:
      isComposerOpen &&
      form.category === "music" &&
      isArtistInputFocused &&
      debouncedArtistSearch.length > 0,
    queryFn: async () => {
      const params = new URLSearchParams({ search: debouncedArtistSearch });
      const response = await fetch(`/api/artists?${params.toString()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Could not load artist suggestions.");
      }

      const data = (await response.json()) as { artists: string[] };
      return data.artists;
    },
  });

  const { data: creditArtistSuggestions = [] } = useQuery({
    queryKey: ["artists", "credit", debouncedCreditQuery],
    enabled:
      isComposerOpen &&
      activeCreditInput?.field === "names" &&
      debouncedCreditQuery.length > 0,
    queryFn: async () => {
      const params = new URLSearchParams({ search: debouncedCreditQuery });
      const response = await fetch(`/api/artists?${params.toString()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Could not load credit suggestions.");
      }

      const data = (await response.json()) as { artists: string[] };
      return data.artists;
    },
  });

  const {
    data: ranking = [],
    isPending: isRankingPending,
    isError: isRankingError,
  } = useQuery({
    queryKey: ["ranking", rankingKind],
    enabled: viewMode === "ranking",
    queryFn: async () => {
      const params = new URLSearchParams({ musicKind: rankingKind });
      const response = await fetch(`/api/rankings?${params.toString()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Could not load ranking.");
      }

      const data = (await response.json()) as {
        ranking: FavoriteRankingEntry[];
      };
      return data.ranking;
    },
  });

  const {
    data: candidateItems = [],
    isFetching: isCandidateFetching,
    isPending: isCandidatePending,
  } = useQuery({
    queryKey: ["music-items", rankingKind, debouncedCandidateSearch.trim()],
    enabled: viewMode === "ranking" && isCandidatePickerOpen,
    queryFn: async () => {
      const params = new URLSearchParams({ musicKind: rankingKind });
      const trimmedCandidateSearch = debouncedCandidateSearch.trim();

      if (trimmedCandidateSearch) {
        params.set("search", trimmedCandidateSearch);
      }

      const response = await fetch(`/api/music-items?${params.toString()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Could not load reviewed music.");
      }

      const data = (await response.json()) as { items: MusicItemSummary[] };
      return data.items;
    },
  });

  const activeRating = useMemo(
    () => ratingOptions.find((option) => option.value === form.rating),
    [form.rating],
  );
  const selectedArtistKeys = useMemo(
    () =>
      new Set(
        splitArtists(form.artists)
          .slice(0, -1)
          .map((artist) => artist.toLowerCase()),
      ),
    [form.artists],
  );
  const visibleArtistSuggestions = artistSuggestions.filter(
    (artist) => !selectedArtistKeys.has(artist.toLowerCase()),
  );
  const visibleCreditSuggestions = useMemo(() => {
    const query = activeCreditQuery.toLowerCase();

    if (!activeCreditInput || !activeCreditRow || !query) {
      return [];
    }

    const values =
      activeCreditInput.field === "role"
        ? [
            ...defaultCreditRoles,
            ...logs.flatMap((log) => log.credits.map((credit) => credit.role)),
          ]
        : [
            ...creditArtistSuggestions,
            ...logs.flatMap((log) => [
              ...log.artists,
              ...log.credits.flatMap((credit) => credit.names),
            ]),
          ];
    const selectedNames =
      activeCreditInput.field === "names"
        ? new Set(
            activeCreditRow.names
              .split(",")
              .slice(0, -1)
              .map((name) => name.trim().toLowerCase())
              .filter(Boolean),
          )
        : new Set<string>();
    const seen = new Set<string>();

    return values
      .filter((value) => {
        const key = value.toLowerCase();

        if (
          !key ||
          key === query ||
          !key.includes(query) ||
          seen.has(key) ||
          selectedNames.has(key)
        ) {
          return false;
        }

        seen.add(key);
        return true;
      })
      .sort((left, right) => {
        const leftStartsWith = left.toLowerCase().startsWith(query);
        const rightStartsWith = right.toLowerCase().startsWith(query);

        if (leftStartsWith !== rightStartsWith) {
          return leftStartsWith ? -1 : 1;
        }

        return left.localeCompare(right);
      })
      .slice(0, 8);
  }, [
    activeCreditInput,
    activeCreditQuery,
    activeCreditRow,
    creditArtistSuggestions,
    logs,
  ]);
  const rankedItemIds = useMemo(
    () => new Set(ranking.map((item) => item.id)),
    [ranking],
  );
  const availableCandidateItems = candidateItems.filter(
    (item) => !rankedItemIds.has(item.id),
  );
  const isCandidateLoading = isCandidatePending || isCandidateFetching;
  const errorMessage =
    error ?? (isError ? "Could not load logs." : null);
  const showInitialLoading =
    viewMode === "feed" && isPending && logs.length === 0;
  const showEmptyState =
    viewMode === "feed" && !isPending && !isError && displayLogs.length === 0;
  const themeLabel = isDarkMode ? "Switch to light mode" : "Switch to dark mode";
  const rankingTitle =
    rankingKind === "song" ? "My Favorite Songs" : "My Favorite Albums";
  const rankingEmptyLabel =
    rankingKind === "song" ? "No favorite songs yet." : "No favorite albums yet.";

  function openCreateComposer() {
    setForm({
      ...createEmptyForm(),
      visibility: profile?.defaultVisibility ?? "private",
    });
    setIsCreditsFormOpen(false);
    setComposerMode("create");
    setIsComposerOpen(true);
  }

  function openProfile() {
    setUsernameDraft(profile?.username ?? "");
    setProfileError(null);
    setProfileNotice(null);
    const lockedUntil = profile?.usernameChangedAt
      ? new Date(profile.usernameChangedAt).getTime() +
        usernameCooldownDays * 24 * 60 * 60 * 1000
      : 0;
    setIsUsernameLocked(lockedUntil > Date.now());
    setIsProfileOpen(true);
  }

  async function handleUsernameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isProfileSaving || isUsernameLocked) {
      return;
    }

    setIsProfileSaving(true);
    setProfileError(null);
    setProfileNotice(null);

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: usernameDraft.trim().toLowerCase() }),
      });

      const data = (await response.json()) as {
        profile?: Profile;
        error?: string;
      };

      if (!response.ok || !data.profile) {
        setProfileError(data.error ?? "Could not update your username.");
        return;
      }

      queryClient.setQueryData(["profile"], data.profile);
      setUsernameDraft(data.profile.username ?? "");
      setIsUsernameLocked(true);
      setProfileNotice("Username updated.");
    } catch {
      setProfileError("Could not update your username.");
    } finally {
      setIsProfileSaving(false);
    }
  }

  async function handleSetDefaultVisibility(visibility: Visibility) {
    if (visibility === (profile?.defaultVisibility ?? "private")) {
      return;
    }

    setProfileError(null);
    setProfileNotice(null);

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultVisibility: visibility }),
      });

      const data = (await response.json()) as {
        profile?: Profile;
        error?: string;
      };

      if (!response.ok || !data.profile) {
        setProfileError(data.error ?? "Could not update default visibility.");
        return;
      }

      queryClient.setQueryData(["profile"], data.profile);
    } catch {
      setProfileError("Could not update default visibility.");
    }
  }

  function openFriends() {
    setFriendUsernameDraft("");
    setFriendError(null);
    setFriendNotice(null);
    setIsFriendsOpen(true);
    void queryClient.invalidateQueries({ queryKey: ["friends"] });
  }

  async function runFriendAction(
    request: () => Promise<Response>,
    fallbackMessage: string,
    successMessage?: string,
  ) {
    setIsFriendSaving(true);
    setFriendError(null);
    setFriendNotice(null);

    try {
      const response = await request();
      const data = (await response.json()) as {
        friends?: FriendList;
        error?: string;
      };

      if (!response.ok || !data.friends) {
        setFriendError(data.error ?? fallbackMessage);
        return false;
      }

      queryClient.setQueryData(["friends"], data.friends);
      await queryClient.invalidateQueries({ queryKey: ["logs"] });
      if (successMessage) {
        setFriendNotice(successMessage);
      }
      return true;
    } catch {
      setFriendError(fallbackMessage);
      return false;
    } finally {
      setIsFriendSaving(false);
    }
  }

  async function handleSendFriendRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const username = friendUsernameDraft.trim().toLowerCase();
    if (!username || isFriendSaving) {
      return;
    }

    const ok = await runFriendAction(
      () =>
        fetch("/api/friends", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        }),
      "Could not send the friend request.",
      "Friend request sent.",
    );

    if (ok) {
      setFriendUsernameDraft("");
    }
  }

  async function handleRespondFriend(friendshipId: string, accept: boolean) {
    await runFriendAction(
      () =>
        fetch("/api/friends", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ friendshipId, accept }),
        }),
      "Could not update the friend request.",
    );
  }

  async function handleRemoveFriend(friendshipId: string) {
    await runFriendAction(
      () =>
        fetch("/api/friends", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ friendshipId }),
        }),
      "Could not update your friends.",
    );
  }

  function openEditComposer(log: TasteLog) {
    setForm({
      id: log.id,
      category: log.category,
      musicKind: log.musicKind ?? "song",
      albumTitle: log.albumTitle,
      genres: log.genres.join(", "),
      title: log.title,
      body: log.body,
      rating: log.rating,
      artists: log.artists.join(", "),
      credits: createCreditRows(log.credits),
      visibility: log.visibility,
    });
    setIsCreditsFormOpen(false);
    setComposerMode("edit");
    setIsComposerOpen(true);
  }

  function openLayerComposer(log: TasteLog) {
    setForm({
      id: null,
      category: log.category,
      musicKind: log.musicKind ?? "song",
      albumTitle: log.albumTitle,
      genres: log.genres.join(", "),
      title: log.title,
      body: "",
      rating: log.rating,
      artists: log.artists.join(", "),
      credits: createCreditRows(log.credits),
      visibility: log.visibility,
    });
    setIsCreditsFormOpen(log.credits.length > 0);
    setComposerMode("layer");
    setIsComposerOpen(true);
  }

  function openItemLayers(log: TasteLog) {
    const item: SelectedItem = {
      id: log.itemId,
      title: log.title,
      category: log.category,
      musicKind: log.musicKind,
      albumTitle: log.albumTitle,
      artists: log.artists,
    };

    window.history.replaceState(
      { view: "feed", search, category, scrollY: window.scrollY },
      "",
    );
    window.history.pushState({ view: "layers", item }, "");
    setViewMode("feed");
    setSelectedItem(item);
    setSelectedAlbum(null);
    setSearch("");
    setCategory("all");
    window.scrollTo(0, 0);
  }

  function openAlbumSongs(albumTitle: string, artists: string[]) {
    const normalizedAlbumTitle = albumTitle.trim();

    if (!normalizedAlbumTitle) {
      return;
    }

    const album: SelectedAlbum = {
      albumTitle: normalizedAlbumTitle,
      artists,
    };

    window.history.replaceState(
      { view: "feed", search, category, scrollY: window.scrollY },
      "",
    );
    window.history.pushState({ view: "album", album }, "");
    setViewMode("feed");
    setSelectedItem(null);
    setSelectedAlbum(album);
    setSearch("");
    setCategory("all");
    window.scrollTo(0, 0);
  }

  function closeItemLayers() {
    window.history.back();
  }

  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    function handlePopState(event: PopStateEvent) {
      const state = event.state as
        | {
            view?: string;
            search?: string;
            category?: CategoryFilter;
            scrollY?: number;
            item?: SelectedItem;
            album?: SelectedAlbum;
          }
        | null;

      if (state?.view === "layers" && state.item) {
        setViewMode("feed");
        setSelectedItem(state.item);
        setSelectedAlbum(null);
        setSearch("");
        setCategory("all");
        window.scrollTo(0, 0);
        return;
      }

      if (state?.view === "album" && state.album) {
        setViewMode("feed");
        setSelectedItem(null);
        setSelectedAlbum(state.album);
        setSearch("");
        setCategory("all");
        window.scrollTo(0, 0);
        return;
      }

      setViewMode("feed");
      setSelectedItem(null);
      setSelectedAlbum(null);

      if (state?.view === "feed") {
        setSearch(state.search ?? "");
        setCategory(state.category ?? "all");
        pendingScrollRef.current = state.scrollY ?? 0;
      }
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!isPending && pendingScrollRef.current !== null) {
      window.scrollTo(0, pendingScrollRef.current);
      pendingScrollRef.current = null;
    }
  }, [isPending, logs]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const storedTheme = window.localStorage.getItem(themeStorageKey);
      const documentTheme = document.documentElement.dataset.theme;
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      const theme =
        storedTheme === "dark" || storedTheme === "light"
          ? storedTheme
          : documentTheme === "dark" || documentTheme === "light"
            ? documentTheme
            : prefersDark
              ? "dark"
              : "light";

      setIsDarkMode(theme === "dark");
      setIsThemeReady(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!isThemeReady) {
      return;
    }

    const theme = isDarkMode ? "dark" : "light";

    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(themeStorageKey, theme);
    document.cookie = `${themeStorageKey}=${theme}; path=/; max-age=${themeCookieMaxAge}; SameSite=Lax`;
  }, [isDarkMode, isThemeReady]);

  function searchByArtist(artist: string) {
    setViewMode("feed");
    setSelectedItem(null);
    setSelectedAlbum(null);
    setCategory("all");
    setSearch(artist);
  }

  function openRankingView() {
    setViewMode("ranking");
    setSelectedItem(null);
    setSelectedAlbum(null);
    setSearch("");
    setCategory("all");
    setError(null);
    setIsCandidatePickerOpen(false);
  }

  function updateCreditRow(id: string, patch: Partial<CreditFormRow>) {
    setForm((current) => ({
      ...current,
      credits: current.credits.map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      ),
    }));
  }

  function addCreditRow() {
    setForm((current) => ({
      ...current,
      credits: [...current.credits, makeCreditRow("", "")],
    }));
    setIsCreditsFormOpen(true);
  }

  function removeCreditRow(id: string) {
    setForm((current) => ({
      ...current,
      credits: current.credits.filter((row) => row.id !== id),
    }));
  }

  function handleCreditDragStart(event: DragEvent<HTMLElement>, id: string) {
    setDraggingCreditId(id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
  }

  function handleCreditDrop(targetId: string) {
    if (!draggingCreditId || draggingCreditId === targetId) {
      setDraggingCreditId(null);
      return;
    }

    setForm((current) => {
      const fromIndex = current.credits.findIndex(
        (row) => row.id === draggingCreditId,
      );
      const toIndex = current.credits.findIndex((row) => row.id === targetId);

      if (fromIndex < 0 || toIndex < 0) {
        return current;
      }

      return {
        ...current,
        credits: moveArrayItem(current.credits, fromIndex, toIndex),
      };
    });
    setDraggingCreditId(null);
  }

  function selectCreditSuggestion(suggestion: string) {
    if (!activeCreditInput || !activeCreditRow) {
      return;
    }

    updateCreditRow(activeCreditRow.id, {
      [activeCreditInput.field]:
        activeCreditInput.field === "names"
          ? applyArtistSuggestion(activeCreditRow.names, suggestion)
          : suggestion,
    });
    setActiveCreditInput(null);
  }

  function handleCreditKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    rowId: string,
    field: CreditInputField,
  ) {
    if (event.key === "Escape") {
      setActiveCreditInput(null);
      return;
    }

    if (
      activeCreditInput?.rowId === rowId &&
      activeCreditInput.field === field &&
      (event.key === "Enter" || event.key === "Tab") &&
      visibleCreditSuggestions.length > 0
    ) {
      event.preventDefault();
      selectCreditSuggestion(visibleCreditSuggestions[0]);
    }
  }

  function handleCreditPaste(
    event: ReactClipboardEvent<HTMLInputElement>,
    row: CreditFormRow,
    field: CreditInputField,
  ) {
    const pastedText = event.clipboardData.getData("text/plain");

    if (!pastedText) {
      return;
    }

    event.preventDefault();
    const input = event.currentTarget;
    const value = row[field];
    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? start;
    const normalizedPaste = pastedText.replace(
      /\r?\n/g,
      field === "names" ? ", " : " ",
    );
    const maxLength = field === "role" ? 48 : 1600;
    const nextValue = `${value.slice(0, start)}${normalizedPaste}${value.slice(end)}`.slice(
      0,
      maxLength,
    );
    const nextCaret = Math.min(start + normalizedPaste.length, nextValue.length);

    updateCreditRow(row.id, { [field]: nextValue });
    window.requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(nextCaret, nextCaret);
    });
  }

  function handleNotesDoubleClick(event: ReactMouseEvent<HTMLTextAreaElement>) {
    const textarea = event.currentTarget;
    const value = textarea.value;
    let index = textarea.selectionStart;

    if (index >= value.length && value.length > 0) {
      index = value.length - 1;
    }

    if (!isNotesWordCharacter(value[index]) && isNotesWordCharacter(value[index - 1])) {
      index -= 1;
    }

    if (!isNotesWordCharacter(value[index])) {
      return;
    }

    let start = index;
    let end = index + 1;

    while (start > 0 && isNotesWordCharacter(value[start - 1])) {
      start -= 1;
    }

    while (end < value.length && isNotesWordCharacter(value[end])) {
      end += 1;
    }

    textarea.setSelectionRange(start, end);
  }

  function handleNotesClick(event: ReactMouseEvent<HTMLTextAreaElement>) {
    if (event.detail !== 3) {
      return;
    }

    const textarea = event.currentTarget;
    const value = textarea.value;
    const caret = textarea.selectionStart;
    const start = value.lastIndexOf("\n", Math.max(0, caret - 1)) + 1;
    const nextNewline = value.indexOf("\n", caret);
    const end = nextNewline === -1 ? value.length : nextNewline + 1;

    textarea.setSelectionRange(start, end);
  }

  function selectArtistSuggestion(artist: string) {
    setForm((current) => ({
      ...current,
      artists: applyArtistSuggestion(current.artists, artist),
    }));
  }

  function handleArtistKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (
      (event.key === "Enter" || event.key === "Tab") &&
      visibleArtistSuggestions.length > 0
    ) {
      event.preventDefault();
      selectArtistSuggestion(visibleArtistSuggestions[0]);
    }
  }

  function toggleCredits(logId: string) {
    setExpandedCreditIds((current) => {
      const next = new Set(current);

      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
      }

      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    const payload = {
      category: form.category,
      title: form.title,
      body: form.body,
      rating: form.rating,
      artists: splitArtists(form.artists),
      musicKind: form.category === "music" ? form.musicKind : "song",
      albumTitle: form.category === "music" ? form.albumTitle : "",
      genres: form.category === "music" ? splitGenres(form.genres) : [],
      credits: form.category === "music" ? creditRowsToCredits(form.credits) : [],
      visibility: form.visibility,
    };

    try {
      const response = await fetch(
        form.id ? `/api/logs/${form.id}` : "/api/logs",
        {
          method: form.id ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not save the log.");
      }

      setIsComposerOpen(false);
      setForm(createEmptyForm());
      setIsCreditsFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["logs"] });
      await queryClient.invalidateQueries({ queryKey: ["ranking"] });
      await queryClient.invalidateQueries({ queryKey: ["music-items"] });
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Could not save the log.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm("Move this log out of the feed?");

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/logs/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Could not delete the log.");
      }

      await queryClient.invalidateQueries({ queryKey: ["logs"] });
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete the log.",
      );
    }
  }

  async function addRankingItem(itemId: string) {
    setIsRankingSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/rankings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ musicKind: rankingKind, itemId }),
      });
      const data = (await response.json()) as {
        error?: string;
        ranking?: FavoriteRankingEntry[];
      };

      if (!response.ok || !data.ranking) {
        throw new Error(data.error ?? "Could not add this item.");
      }

      queryClient.setQueryData(["ranking", rankingKind], data.ranking);
      await queryClient.invalidateQueries({ queryKey: ["music-items"] });
    } catch (rankingError) {
      setError(
        rankingError instanceof Error
          ? rankingError.message
          : "Could not add this item.",
      );
    } finally {
      setIsRankingSaving(false);
    }
  }

  async function removeRankingItem(itemId: string) {
    setIsRankingSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/rankings", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ musicKind: rankingKind, itemId }),
      });
      const data = (await response.json()) as {
        error?: string;
        ranking?: FavoriteRankingEntry[];
      };

      if (!response.ok || !data.ranking) {
        throw new Error(data.error ?? "Could not remove this item.");
      }

      queryClient.setQueryData(["ranking", rankingKind], data.ranking);
    } catch (rankingError) {
      setError(
        rankingError instanceof Error
          ? rankingError.message
          : "Could not remove this item.",
      );
    } finally {
      setIsRankingSaving(false);
    }
  }

  async function persistRankingOrder(nextRanking: FavoriteRankingEntry[]) {
    const previousRanking = ranking;

    queryClient.setQueryData(["ranking", rankingKind], nextRanking);
    setIsRankingSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/rankings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          musicKind: rankingKind,
          itemIds: nextRanking.map((item) => item.id),
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        ranking?: FavoriteRankingEntry[];
      };

      if (!response.ok || !data.ranking) {
        throw new Error(data.error ?? "Could not save this order.");
      }

      queryClient.setQueryData(["ranking", rankingKind], data.ranking);
    } catch (rankingError) {
      queryClient.setQueryData(["ranking", rankingKind], previousRanking);
      setError(
        rankingError instanceof Error
          ? rankingError.message
          : "Could not save this order.",
      );
    } finally {
      setIsRankingSaving(false);
    }
  }

  function moveRankingItem(itemId: string, direction: -1 | 1) {
    const currentIndex = ranking.findIndex((item) => item.id === itemId);
    const nextIndex = currentIndex + direction;

    if (
      currentIndex < 0 ||
      nextIndex < 0 ||
      nextIndex >= ranking.length ||
      isRankingSaving
    ) {
      return;
    }

    void persistRankingOrder(reindexRanking(moveArrayItem(ranking, currentIndex, nextIndex)));
  }

  function handleRankingDragStart(
    event: DragEvent<HTMLElement>,
    itemId: string,
  ) {
    setDraggingRankingId(itemId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", itemId);
  }

  function handleRankingDrop(itemId: string) {
    if (!draggingRankingId || draggingRankingId === itemId || isRankingSaving) {
      setDraggingRankingId(null);
      return;
    }

    const fromIndex = ranking.findIndex((item) => item.id === draggingRankingId);
    const toIndex = ranking.findIndex((item) => item.id === itemId);

    if (fromIndex >= 0 && toIndex >= 0) {
      void persistRankingOrder(reindexRanking(moveArrayItem(ranking, fromIndex, toIndex)));
    }

    setDraggingRankingId(null);
  }

  function goHome() {
    setViewMode("feed");
    setSelectedItem(null);
    setSelectedAlbum(null);
    setSearch("");
    setCategory("all");
    setError(null);
    setIsCandidatePickerOpen(false);
    setCandidateSearch("");
    window.history.replaceState(
      { view: "feed", search: "", category: "all", scrollY: 0 },
      "",
      window.location.pathname,
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main
      data-theme={isDarkMode ? "dark" : "light"}
      className="app-shell min-h-screen bg-white text-[#1d1d1f]"
    >
      <div className="mx-auto flex min-h-screen w-full max-w-[860px] flex-col px-5 pb-16 pt-[158px] sm:px-8 sm:pt-[104px]">
        <header className="app-header fixed inset-x-0 top-0 z-20 border-b border-[#d2d2d7]/30 bg-white/90 pb-2.5 pt-[24px] backdrop-blur-2xl">
          <div className="mx-auto grid w-full max-w-[860px] grid-cols-[minmax(0,1fr)_36px_auto] items-center gap-x-3 gap-y-2 px-5 sm:grid-cols-[128px_minmax(280px,1fr)_68px] sm:gap-x-5 sm:px-8">
            <div className="col-start-1 row-start-1 min-w-0 self-start sm:row-span-2">
              <button
                type="button"
                onClick={goHome}
                className="app-logo-button block min-w-0 text-left"
                aria-label="Go to home"
              >
                <h1 className="app-title text-[24px] font-semibold leading-none tracking-normal text-[#1d1d1f] sm:text-[28px]">
                  Impasto
                </h1>
                <p className="app-subtitle mt-1 text-[10px] font-medium leading-3 text-[#6e6e73] sm:text-[12px] sm:leading-4">
                  Your take, over time.
                </p>
              </button>
            </div>

            <div className="relative col-span-3 col-start-1 row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
              <Search
                aria-hidden="true"
                className="app-search-icon pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]"
                size={15}
                strokeWidth={1.7}
              />
              <input
                value={viewMode === "ranking" ? "" : search}
                onChange={(event) => {
                  setViewMode("feed");
                  setSelectedItem(null);
                  setSelectedAlbum(null);
                  setSearch(event.target.value);
                }}
                placeholder={
                  viewMode === "ranking"
                    ? "My Favorite Ranking"
                    : "Search titles, notes, or artists"
                }
                className="app-search-input h-9 w-full rounded-full border border-transparent bg-white pl-9 pr-9 text-[13px] font-normal text-[#1d1d1f] shadow-[0_8px_24px_rgba(0,0,0,0.075)] outline-none transition placeholder:text-[#86868b] focus:shadow-[0_10px_30px_rgba(0,0,0,0.16)] sm:text-[14px]"
              />
              {viewMode === "feed" && search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="app-clear-button absolute right-3 top-1/2 -translate-y-1/2 text-[#86868b] transition hover:text-[#1d1d1f]"
                  aria-label="Clear search"
                >
                  <X size={14} strokeWidth={1.8} />
                </button>
              ) : null}
            </div>

            <button
              type="button"
              onClick={openCreateComposer}
              className="app-top-add-button col-start-2 row-start-1 inline-flex h-9 w-9 items-center justify-center self-center justify-self-end rounded-full border border-transparent bg-white text-[#1d1d1f] shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition hover:shadow-[0_10px_30px_rgba(0,0,0,0.21)] sm:col-start-3"
              aria-label="New log"
            >
              <Plus size={18} strokeWidth={2} />
            </button>

            <div className="col-start-3 row-start-1 flex items-center justify-self-end gap-1.5 self-center sm:row-start-2">
              <button
                type="button"
                onClick={openProfile}
                className="app-profile-button inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-[#d2d2d7]/70 bg-[#f5f5f7] text-[11px] font-semibold uppercase text-[#1d1d1f] transition hover:ring-1 hover:ring-[#d2d2d7]"
                aria-label="Profile"
                title="Profile"
              >
                {profileInitial ? (
                  profileInitial
                ) : (
                  <User size={13} strokeWidth={1.8} />
                )}
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={isDarkMode}
                aria-label={themeLabel}
                title={themeLabel}
                data-state={isDarkMode ? "dark" : "light"}
                onClick={() => setIsDarkMode((current) => !current)}
                className="app-theme-toggle"
              >
                <span className="app-theme-toggle-thumb">
                  {isDarkMode ? (
                    <Moon size={10} strokeWidth={2} />
                  ) : (
                    <Sun size={10} strokeWidth={2} />
                  )}
                </span>
              </button>
            </div>

            <div className="col-span-3 col-start-1 row-start-3 flex gap-4 overflow-x-auto pb-0.5 sm:col-span-1 sm:col-start-2 sm:row-start-2">
              {categoryOptions.map((option) => {
                const selected =
                  viewMode === "feed" && category === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setViewMode("feed");
                      setSelectedItem(null);
                      setSelectedAlbum(null);
                      setCategory(option.value);
                    }}
                    data-active={selected ? "true" : "false"}
                    className={`app-tab h-7 shrink-0 text-[12px] transition ${
                      selected ? "font-semibold" : "font-medium"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={openRankingView}
                data-active={viewMode === "ranking" ? "true" : "false"}
                className={`app-tab h-7 shrink-0 text-[12px] transition ${
                  viewMode === "ranking"
                    ? "font-semibold"
                    : "font-medium"
                }`}
              >
                Ranking
              </button>
            </div>
          </div>
        </header>

        <section className="flex flex-1 flex-col gap-3 pt-4">
          {viewMode === "feed" && !selectedItem && !selectedAlbum ? (
            <div className="flex items-center gap-1.5">
              {feedScopeOptions.map((option) => {
                const selected = feedScope === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFeedScope(option.value)}
                    data-active={selected ? "true" : "false"}
                    className={`app-choice h-7 rounded-full border px-3 text-[12px] font-semibold transition ${
                      selected
                        ? "border-[#1d1d1f] bg-[#1d1d1f] text-white"
                        : "border-transparent bg-[#f5f5f7] text-[#6e6e73] hover:bg-white hover:text-[#1d1d1f] hover:ring-1 hover:ring-[#d2d2d7]"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          ) : null}
          {viewMode === "feed" && (selectedItem || selectedAlbum) ? (
            <div className="app-selected-item flex items-center justify-between gap-3 rounded-lg bg-[#f5f5f7] px-5 py-5">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                {selectedItem ? (
                  <>
                    <span className="app-card-title break-words text-[30px] font-semibold leading-tight tracking-normal text-[#1d1d1f]">
                      {selectedItem.title}
                    </span>
                    {selectedItem.artists.map((artist) => (
                      <span
                        key={artist}
                        className="app-muted break-words text-[15px] font-medium leading-tight text-[#6e6e73]"
                      >
                        {artist}
                      </span>
                    ))}
                    {selectedItem.albumTitle ? (
                      <button
                        type="button"
                        onClick={() =>
                          openAlbumSongs(
                            selectedItem.albumTitle,
                            selectedItem.artists,
                          )
                        }
                        className="app-muted-link break-words text-left text-[13px] font-medium leading-tight text-[#6e6e73] transition hover:drop-shadow-[0_2px_4px_rgba(0,0,0,0.25)]"
                        aria-label={`Show songs on ${selectedItem.albumTitle}`}
                      >
                        {selectedItem.albumTitle}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <span className="app-card-title break-words text-[30px] font-semibold leading-tight tracking-normal text-[#1d1d1f]">
                      {selectedAlbum?.albumTitle}
                    </span>
                    <span className="app-muted break-words text-[15px] font-medium leading-tight text-[#6e6e73]">
                      Album
                    </span>
                    {selectedAlbum?.artists.map((artist) => (
                      <span
                        key={artist}
                        className="app-muted break-words text-[13px] font-medium leading-tight text-[#6e6e73]"
                      >
                        {artist}
                      </span>
                    ))}
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={closeItemLayers}
                className="app-secondary-button shrink-0 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-[#6e6e73] shadow-[0_4px_14px_rgba(0,0,0,0.08)] transition hover:text-[#1d1d1f]"
              >
                Back to feed
              </button>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="app-error rounded-lg border border-[#c1663f]/20 bg-[#fff7f3] px-4 py-3 text-sm font-medium text-[#9b4f31]">
              {errorMessage}
            </div>
          ) : null}

          {viewMode === "ranking" ? (
            <div className="grid gap-3">
              <div className="app-selected-item flex flex-col gap-4 rounded-lg bg-[#f5f5f7] px-5 py-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="app-muted text-[12px] font-semibold uppercase tracking-normal text-[#6e6e73]">
                      My Favorite Ranking
                    </p>
                    <h2 className="app-card-title mt-1 text-[30px] font-semibold leading-tight tracking-normal text-[#1d1d1f]">
                      {rankingTitle}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setIsCandidatePickerOpen((current) => !current)
                    }
                    className="app-card-action inline-flex h-9 items-center gap-2 rounded-full border border-transparent bg-white px-3 text-[13px] font-semibold text-[#1d1d1f]"
                  >
                    <Plus size={15} strokeWidth={1.8} />
                    Add
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {musicKindOptions.map((option) => {
                    const selected = rankingKind === option.value;
                    const Icon = option.icon;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setRankingKind(option.value);
                          setIsCandidatePickerOpen(false);
                          setCandidateSearch("");
                        }}
                        data-active={selected ? "true" : "false"}
                        className={`app-choice inline-flex h-9 items-center justify-center gap-2 rounded-full border text-[13px] font-semibold transition ${
                          selected
                            ? "border-[#1d1d1f] bg-[#1d1d1f] text-white"
                            : "border-transparent bg-[#f5f5f7] text-[#6e6e73] hover:bg-white hover:text-[#1d1d1f] hover:ring-1 hover:ring-[#d2d2d7]"
                        }`}
                      >
                        <Icon size={14} strokeWidth={1.8} />
                        {option.label}s
                      </button>
                    );
                  })}
                </div>

                {isCandidatePickerOpen ? (
                  <div className="app-credit-panel rounded-lg border px-3 py-3">
                    <div className="relative">
                      <Search
                        aria-hidden="true"
                        className="app-search-icon pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]"
                        size={14}
                        strokeWidth={1.7}
                      />
                      <input
                        value={candidateSearch}
                        onChange={(event) =>
                          setCandidateSearch(event.target.value)
                        }
                        className="app-field h-9 w-full rounded-lg border border-[#d2d2d7] bg-white pl-9 pr-3 text-[14px] text-[#1d1d1f] outline-none transition"
                        placeholder={`Search reviewed ${rankingKind}s`}
                      />
                    </div>

                    <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto">
                      {isCandidateLoading ? (
                        <div className="app-muted flex h-20 items-center justify-center text-[#86868b]">
                          <Loader2
                            className="animate-spin"
                            size={18}
                            strokeWidth={1.7}
                          />
                        </div>
                      ) : null}

                      {!isCandidateLoading &&
                      availableCandidateItems.length === 0 ? (
                        <p className="app-muted px-1 py-5 text-center text-[13px] font-medium text-[#6e6e73]">
                          No reviewed {rankingKind}s to add.
                        </p>
                      ) : null}

                      {!isCandidateLoading ? availableCandidateItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          disabled={isRankingSaving}
                          onClick={() => void addRankingItem(item.id)}
                          className="app-suggestion-button flex min-h-11 items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition"
                        >
                          <span className="min-w-0">
                            <span className="app-title block truncate text-[14px] font-semibold text-[#1d1d1f]">
                              {item.title}
                            </span>
                            <span className="app-muted block truncate text-[12px] font-medium text-[#6e6e73]">
                              {formatArtistLine(item.artists)}
                            </span>
                          </span>
                          <Plus
                            className="shrink-0"
                            size={15}
                            strokeWidth={1.8}
                          />
                        </button>
                      )) : null}
                    </div>
                  </div>
                ) : null}
              </div>

              {isRankingError ? (
                <div className="app-error rounded-lg border px-4 py-3 text-sm font-medium">
                  Could not load ranking.
                </div>
              ) : null}

              {isRankingPending ? (
                <div className="app-muted flex h-44 items-center justify-center text-[#86868b]">
                  <Loader2
                    className="animate-spin"
                    size={22}
                    strokeWidth={1.7}
                  />
                </div>
              ) : null}

              {!isRankingPending && ranking.length === 0 ? (
                <div className="app-empty flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-[#d2d2d7] bg-white px-6 text-center">
                  <ListOrdered
                    className="app-muted mb-3 text-[#6e6e73]"
                    size={24}
                    strokeWidth={1.6}
                  />
                  <p className="app-title text-[19px] font-semibold text-[#1d1d1f]">
                    {rankingEmptyLabel}
                  </p>
                </div>
              ) : null}

              {ranking.map((item, index) => (
                <article
                  key={item.id}
                  draggable={!isRankingSaving}
                  onDragStart={(event) =>
                    handleRankingDragStart(event, item.id)
                  }
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleRankingDrop(item.id)}
                  onDragEnd={() => setDraggingRankingId(null)}
                  data-dragging={
                    draggingRankingId === item.id ? "true" : "false"
                  }
                  className="app-ranking-row app-card flex items-center gap-3 rounded-lg bg-white px-4 py-3"
                >
                  <span className="app-ranking-number flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold">
                    {index + 1}
                  </span>
                  <GripVertical
                    className="app-muted shrink-0 text-[#6e6e73]"
                    size={17}
                    strokeWidth={1.6}
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="app-title truncate text-[17px] font-semibold text-[#1d1d1f]">
                      {item.title}
                    </h3>
                    <p className="app-muted truncate text-[13px] font-medium text-[#6e6e73]">
                      {formatArtistLine(item.artists)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={index === 0 || isRankingSaving}
                      onClick={() => moveRankingItem(item.id, -1)}
                      className="app-icon-button inline-flex h-8 w-8 items-center justify-center rounded-full text-[#86868b] transition hover:bg-[#f5f5f7] hover:text-[#1d1d1f] disabled:opacity-30"
                      aria-label={`Move ${item.title} up`}
                    >
                      <ArrowUp size={14} strokeWidth={1.8} />
                    </button>
                    <button
                      type="button"
                      disabled={index === ranking.length - 1 || isRankingSaving}
                      onClick={() => moveRankingItem(item.id, 1)}
                      className="app-icon-button inline-flex h-8 w-8 items-center justify-center rounded-full text-[#86868b] transition hover:bg-[#f5f5f7] hover:text-[#1d1d1f] disabled:opacity-30"
                      aria-label={`Move ${item.title} down`}
                    >
                      <ArrowDown size={14} strokeWidth={1.8} />
                    </button>
                    <button
                      type="button"
                      disabled={isRankingSaving}
                      onClick={() => void removeRankingItem(item.id)}
                      className="app-delete-button inline-flex h-8 w-8 items-center justify-center rounded-full text-[#86868b] transition hover:bg-[#fff7f3] hover:text-[#a35f36] disabled:opacity-40"
                      aria-label={`Remove ${item.title}`}
                    >
                      <Trash2 size={14} strokeWidth={1.7} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}

          {showInitialLoading ? (
            <div className="app-muted flex h-44 items-center justify-center text-[#86868b]">
              <Loader2 className="animate-spin" size={22} strokeWidth={1.7} />
            </div>
          ) : null}

          {showEmptyState ? (
            <div className="app-empty flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-[#d2d2d7] bg-white px-6 text-center">
              <p className="app-title text-[19px] font-semibold text-[#1d1d1f]">
                {!isDrilldown && feedScope === "friends"
                  ? "No friend logs yet."
                  : "No logs yet."}
              </p>
              {!isDrilldown && feedScope === "friends" ? (
                <>
                  <p className="mt-1.5 text-[13px] text-[#86868b]">
                    Add friends to see the logs they share.
                  </p>
                  <button
                    type="button"
                    onClick={openFriends}
                    className="app-primary-button mt-5 inline-flex h-10 items-center gap-2 rounded-full border border-transparent bg-[#1d1d1f] px-4 text-[14px] font-semibold text-white transition hover:bg-black"
                  >
                    <Users size={16} strokeWidth={2} />
                    Add friends
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={openCreateComposer}
                  className="app-primary-button mt-5 inline-flex h-10 items-center gap-2 rounded-full border border-transparent bg-[#1d1d1f] px-4 text-[14px] font-semibold text-white transition hover:bg-black"
                >
                  <Plus size={16} strokeWidth={2} />
                  New log
                </button>
              )}
            </div>
          ) : null}

          {viewMode === "feed" ? displayLogs.map((log) => {
            const isMine = log.isMine !== false;
            const ownerLabel = isMine
              ? null
              : log.ownerUsername
                ? `@${log.ownerUsername}`
                : log.ownerDisplayName ?? "Friend";

            return (
            <article
              key={log.id}
              className={`app-card rounded-lg bg-white px-5 pb-2 sm:shadow-[0_10px_34px_rgba(0,0,0,0.05)] ${
                ownerLabel ? "pt-3" : "pt-5"
              }`}
            >
              {ownerLabel ? (
                <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-[#6e6e73]">
                  <User size={13} strokeWidth={1.8} />
                  {ownerLabel}
                </div>
              ) : null}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {selectedItem ? null : (
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      {isMine ? (
                        <button
                          type="button"
                          onClick={() => openItemLayers(log)}
                          className="app-card-title break-words p-0 text-left text-[30px] font-semibold leading-tight tracking-normal text-[#1d1d1f] transition hover:drop-shadow-[0_2px_5px_rgba(0,0,0,0.3)] active:translate-y-0"
                          aria-label={`Show layers for ${log.title}`}
                        >
                          {log.title}
                        </button>
                      ) : (
                        <span className="app-card-title break-words text-[30px] font-semibold leading-tight tracking-normal text-[#1d1d1f]">
                          {log.title}
                        </span>
                      )}
                      {log.artists.map((artist) => (
                        <button
                          key={artist}
                          type="button"
                          onClick={() => searchByArtist(artist)}
                          className="app-muted-link break-words text-left text-[15px] font-medium leading-tight text-[#6e6e73] transition hover:drop-shadow-[0_2px_4px_rgba(0,0,0,0.25)]"
                          aria-label={`Search logs by ${artist}`}
                        >
                          {artist}
                        </button>
                      ))}
                      {log.credits.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => toggleCredits(log.id)}
                          className="app-mini-link text-[11px] font-semibold text-[#86868b] transition"
                          aria-expanded={expandedCreditIds.has(log.id)}
                        >
                          {expandedCreditIds.has(log.id)
                            ? "hide credits"
                            : "show credits"}
                        </button>
                      ) : null}
                    </div>
                  )}
                  <div
                    className={`flex flex-wrap items-center gap-3 ${
                      selectedItem ? "" : "mt-2"
                    }`}
                  >
                    <CategoryBadge category={log.category} />
                    <RatingBadge rating={log.rating} />
                    {isMine ? (
                      <span
                        className="app-badge inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#6e6e73]"
                        title={
                          log.visibility === "public"
                            ? "Visible to friends"
                            : "Only you"
                        }
                      >
                        {log.visibility === "public" ? (
                          <Users size={13} strokeWidth={1.7} />
                        ) : (
                          <Lock size={13} strokeWidth={1.7} />
                        )}
                        {log.visibility === "public" ? "Friends" : "Private"}
                      </span>
                    ) : null}
                    {log.albumTitle ? (
                      isMine ? (
                        <button
                          type="button"
                          onClick={() =>
                            openAlbumSongs(log.albumTitle, log.artists)
                          }
                          className="app-muted-link app-badge inline-flex items-center gap-1.5 text-left text-[12px] font-semibold text-[#6e6e73] transition hover:drop-shadow-[0_2px_4px_rgba(0,0,0,0.25)]"
                          aria-label={`Show songs on ${log.albumTitle}`}
                        >
                          <Disc3 size={13} strokeWidth={1.7} />
                          {log.albumTitle}
                        </button>
                      ) : (
                        <span className="app-badge inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#6e6e73]">
                          <Disc3 size={13} strokeWidth={1.7} />
                          {log.albumTitle}
                        </span>
                      )
                    ) : null}
                    {log.genres.map((genre) => (
                      <span
                        key={`${log.id}-${genre}`}
                        className="app-badge inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#6e6e73]"
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                </div>
                {isMine ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openLayerComposer(log)}
                      className="app-card-action inline-flex h-8 items-center gap-1.5 rounded-full border border-transparent bg-white px-2.5 text-[12px] font-semibold text-[#1d1d1f] shadow-[0_2px_6px_rgba(0,0,0,0.07)] transition hover:shadow-[0_3px_8px_rgba(0,0,0,0.1)]"
                      aria-label={`Add layer for ${log.title}`}
                    >
                      <Plus size={13} strokeWidth={1.8} />
                      Impasto
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditComposer(log)}
                      className="app-icon-button inline-flex h-8 w-8 items-center justify-center rounded-full text-[#86868b] transition hover:bg-[#f5f5f7] hover:text-[#1d1d1f]"
                      aria-label={`Edit ${log.title}`}
                    >
                      <Pencil size={15} strokeWidth={1.7} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(log.id)}
                      className="app-delete-button inline-flex h-8 w-8 items-center justify-center rounded-full text-[#86868b] transition hover:bg-[#fff7f3] hover:text-[#a35f36]"
                      aria-label={`Delete ${log.title}`}
                    >
                      <Trash2 size={15} strokeWidth={1.7} />
                    </button>
                  </div>
                ) : log.category === "music" ? (
                  <button
                    type="button"
                    onClick={() => openLayerComposer(log)}
                    className="app-card-action inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-transparent bg-white px-2.5 text-[12px] font-semibold text-[#1d1d1f] shadow-[0_2px_6px_rgba(0,0,0,0.07)] transition hover:shadow-[0_3px_8px_rgba(0,0,0,0.1)]"
                    aria-label={`Create your log for ${log.title}`}
                  >
                    <Plus size={13} strokeWidth={1.8} />
                    Impasto
                  </button>
                ) : null}
              </div>

              {log.credits.length > 0 && expandedCreditIds.has(log.id) ? (
                <div className="app-credit-panel mt-4 grid gap-2 rounded-lg px-3 py-3">
                  {log.credits.map((credit) => (
                    <div
                      key={`${log.id}-${credit.role}`}
                      className="grid gap-1 sm:grid-cols-[128px_minmax(0,1fr)] sm:gap-3"
                    >
                      <span className="app-label text-[12px] font-semibold text-[#6e6e73]">
                        {credit.role}
                      </span>
                      <span className="app-body break-words text-[13px] font-medium leading-5 text-[#424245]">
                        {credit.names.join(", ")}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              {!selectedAlbum ? (
                <>
                  <p className="app-body mt-4 whitespace-pre-wrap break-words text-[14px] leading-5 text-[#424245]">
                    {log.body}
                  </p>

                  <footer className="app-footer mt-5 flex items-center justify-between border-t border-[#d2d2d7]/55 pt-2 text-[12px] font-medium text-[#86868b]">
                    <span>{formatDate(log.createdAt)}</span>
                    {log.updatedAt !== log.createdAt ? (
                      <span>Edited {formatDate(log.updatedAt)}</span>
                    ) : null}
                  </footer>
                </>
              ) : null}
            </article>
            );
          }) : null}
        </section>
      </div>

      {isComposerOpen ? (
        <div className="app-overlay fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-[#1d1d1f]/24 px-3 py-6 backdrop-blur-sm sm:py-8">
          <form
            onSubmit={(event) => void handleSubmit(event)}
            className="app-composer max-h-[calc(100dvh-48px)] w-full max-w-2xl overflow-y-auto rounded-lg border border-[#d2d2d7]/80 bg-white p-5 shadow-[0_30px_90px_rgba(0,0,0,0.18)] sm:max-h-[calc(100dvh-64px)] sm:p-6"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="app-title text-[24px] font-semibold leading-tight tracking-normal text-[#1d1d1f]">
                {composerMode === "edit"
                  ? "Edit log"
                  : composerMode === "layer"
                    ? "Impasto"
                    : "New log"}
              </h2>
              <button
                type="button"
                onClick={() => setIsComposerOpen(false)}
                className="app-icon-button inline-flex h-8 w-8 items-center justify-center rounded-full text-[#86868b] transition hover:bg-[#f5f5f7] hover:text-[#1d1d1f]"
                aria-label="Close composer"
              >
                <X size={17} strokeWidth={1.7} />
              </button>
            </div>

            <div className="grid gap-3">
              <div>
                <label
                  htmlFor="category"
                  className="app-label mb-1.5 block text-[13px] font-semibold text-[#6e6e73]"
                >
                  Category
                </label>
                <div className="grid grid-cols-3 gap-2" id="category">
                  {composeCategoryOptions.map((option) => {
                    const selected = form.category === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            category: option.value,
                          }))
                        }
                        data-active={selected ? "true" : "false"}
                        className={`app-choice h-9 rounded-full border text-[13px] font-semibold transition ${
                          selected
                            ? "border-[#1d1d1f] bg-[#1d1d1f] text-white"
                            : "border-transparent bg-[#f5f5f7] text-[#6e6e73] hover:bg-white hover:text-[#1d1d1f] hover:ring-1 hover:ring-[#d2d2d7]"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label
                  htmlFor="title"
                  className="app-label mb-1.5 block text-[13px] font-semibold text-[#6e6e73]"
                >
                  Title
                </label>
                <input
                  id="title"
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  maxLength={160}
                  required
                  className="app-field h-10 w-full rounded-lg border border-[#d2d2d7] bg-white px-3 text-[15px] text-[#1d1d1f] outline-none transition placeholder:text-[#86868b] focus:border-[#86868b] focus:ring-4 focus:ring-[#d2d2d7]/35"
                  placeholder={
                    form.category === "music" ? "Song title" : "Image or idea"
                  }
                />
              </div>

              <div
                aria-hidden={form.category !== "music"}
                className={
                  form.category === "music"
                    ? ""
                    : "pointer-events-none invisible select-none"
                }
              >
                <label
                  htmlFor="artists"
                  className="app-label mb-1.5 block text-[13px] font-semibold text-[#6e6e73]"
                >
                  Artists
                </label>
                <div className="relative">
                  <input
                    id="artists"
                    value={form.artists}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        artists: event.target.value,
                      }))
                    }
                    onFocus={() => setIsArtistInputFocused(true)}
                    onBlur={() => setIsArtistInputFocused(false)}
                    onKeyDown={handleArtistKeyDown}
                    disabled={form.category !== "music"}
                    tabIndex={form.category === "music" ? undefined : -1}
                    className="app-field h-10 w-full rounded-lg border border-[#d2d2d7] bg-white px-3 text-[15px] text-[#1d1d1f] outline-none transition placeholder:text-[#86868b] focus:border-[#86868b] focus:ring-4 focus:ring-[#d2d2d7]/35 disabled:opacity-100"
                    placeholder="Frank Ocean, James Blake"
                  />
                  {isArtistInputFocused &&
                  visibleArtistSuggestions.length > 0 ? (
                    <div className="app-floating-panel absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-lg border py-1">
                      {visibleArtistSuggestions.map((artist) => (
                        <button
                          key={artist}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectArtistSuggestion(artist)}
                          className="app-suggestion-button block w-full px-3 py-2 text-left text-[14px] font-medium transition"
                        >
                          {artist}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              {form.category === "music" ? (
                <div>
                  <label
                    htmlFor="album"
                    className="app-label mb-1.5 block text-[13px] font-semibold text-[#6e6e73]"
                  >
                    Album
                  </label>
                  <input
                    id="album"
                    value={form.albumTitle}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        albumTitle: event.target.value,
                      }))
                    }
                    maxLength={160}
                    className="app-field h-10 w-full rounded-lg border border-[#d2d2d7] bg-white px-3 text-[15px] text-[#1d1d1f] outline-none transition placeholder:text-[#86868b] focus:border-[#86868b] focus:ring-4 focus:ring-[#d2d2d7]/35"
                    placeholder="Album title (optional)"
                  />
                </div>
              ) : null}

              {form.category === "music" ? (
                <div>
                  <label
                    htmlFor="genres"
                    className="app-label mb-1.5 block text-[13px] font-semibold text-[#6e6e73]"
                  >
                    Genres
                  </label>
                  <input
                    id="genres"
                    value={form.genres}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        genres: event.target.value,
                      }))
                    }
                    maxLength={240}
                    className="app-field h-10 w-full rounded-lg border border-[#d2d2d7] bg-white px-3 text-[15px] text-[#1d1d1f] outline-none transition placeholder:text-[#86868b] focus:border-[#86868b] focus:ring-4 focus:ring-[#d2d2d7]/35"
                    placeholder="R&B, Art pop, Ambient"
                  />
                </div>
              ) : null}

              {form.category === "music" ? (
                <div>
                  <button
                    type="button"
                    onClick={() => setIsCreditsFormOpen((current) => !current)}
                    className="app-credit-toggle flex h-10 w-full items-center justify-between rounded-lg border px-3 text-left text-[13px] font-semibold transition"
                    aria-expanded={isCreditsFormOpen}
                  >
                    <span>Credits</span>
                    <span className="inline-flex items-center gap-2">
                      <span className="app-muted text-[12px] font-medium text-[#6e6e73]">
                        {creditRowsToCredits(form.credits).length} filled
                      </span>
                      <ChevronDown
                        data-open={isCreditsFormOpen ? "true" : "false"}
                        className="app-chevron"
                        size={15}
                        strokeWidth={1.8}
                      />
                    </span>
                  </button>

                  {isCreditsFormOpen ? (
                    <div className="app-credit-panel mt-2 grid gap-2 rounded-lg border px-3 py-3">
                      {form.credits.map((row) => (
                        <div
                          key={row.id}
                          className="app-credit-row"
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => handleCreditDrop(row.id)}
                          data-dragging={
                            draggingCreditId === row.id ? "true" : "false"
                          }
                        >
                          <button
                            type="button"
                            draggable
                            onDragStart={(event) =>
                              handleCreditDragStart(event, row.id)
                            }
                            onDragEnd={() => setDraggingCreditId(null)}
                            className="app-credit-grip inline-flex h-9 w-6 cursor-grab items-center justify-center text-[#86868b] transition hover:text-[#1d1d1f] active:cursor-grabbing"
                            aria-label={`Reorder ${row.role || "credit"} row`}
                          >
                            <GripVertical size={15} strokeWidth={1.7} />
                          </button>
                          <div className="app-credit-role relative">
                            <input
                              value={row.role}
                              onChange={(event) =>
                                updateCreditRow(row.id, {
                                  role: event.target.value,
                                })
                              }
                              onFocus={() =>
                                setActiveCreditInput({
                                  rowId: row.id,
                                  field: "role",
                                })
                              }
                              onBlur={() => setActiveCreditInput(null)}
                              onKeyDown={(event) =>
                                handleCreditKeyDown(event, row.id, "role")
                              }
                              onPaste={(event) =>
                                handleCreditPaste(event, row, "role")
                              }
                              role="combobox"
                              aria-autocomplete="list"
                              aria-controls={creditSuggestionListId(
                                row.id,
                                "role",
                              )}
                              aria-expanded={
                                activeCreditInput?.rowId === row.id &&
                                activeCreditInput.field === "role" &&
                                visibleCreditSuggestions.length > 0
                              }
                              autoComplete="off"
                              maxLength={48}
                              className="app-field h-9 w-full rounded-lg border border-[#d2d2d7] bg-white px-3 text-[13px] text-[#1d1d1f] outline-none transition"
                              placeholder="Role"
                            />
                            {activeCreditInput?.rowId === row.id &&
                            activeCreditInput.field === "role" &&
                            visibleCreditSuggestions.length > 0 ? (
                              <CreditSuggestionList
                                id={creditSuggestionListId(row.id, "role")}
                                suggestions={visibleCreditSuggestions}
                                onSelect={selectCreditSuggestion}
                              />
                            ) : null}
                          </div>
                          <div className="app-credit-names relative">
                            <input
                              value={row.names}
                              onChange={(event) =>
                                updateCreditRow(row.id, {
                                  names: event.target.value,
                                })
                              }
                              onFocus={() =>
                                setActiveCreditInput({
                                  rowId: row.id,
                                  field: "names",
                                })
                              }
                              onBlur={() => setActiveCreditInput(null)}
                              onKeyDown={(event) =>
                                handleCreditKeyDown(event, row.id, "names")
                              }
                              onPaste={(event) =>
                                handleCreditPaste(event, row, "names")
                              }
                              role="combobox"
                              aria-autocomplete="list"
                              aria-controls={creditSuggestionListId(
                                row.id,
                                "names",
                              )}
                              aria-expanded={
                                activeCreditInput?.rowId === row.id &&
                                activeCreditInput.field === "names" &&
                                visibleCreditSuggestions.length > 0
                              }
                              autoComplete="off"
                              maxLength={1600}
                              className="app-field h-9 w-full rounded-lg border border-[#d2d2d7] bg-white px-3 text-[13px] text-[#1d1d1f] outline-none transition"
                              placeholder="Names, separated by commas"
                            />
                            {activeCreditInput?.rowId === row.id &&
                            activeCreditInput.field === "names" &&
                            visibleCreditSuggestions.length > 0 ? (
                              <CreditSuggestionList
                                id={creditSuggestionListId(row.id, "names")}
                                suggestions={visibleCreditSuggestions}
                                onSelect={selectCreditSuggestion}
                              />
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeCreditRow(row.id)}
                            className="app-credit-remove app-icon-button inline-flex h-9 w-9 items-center justify-center rounded-full text-[#86868b] transition hover:bg-[#f5f5f7] hover:text-[#1d1d1f]"
                            aria-label={`Remove ${row.role || "credit"} row`}
                          >
                            <X size={14} strokeWidth={1.7} />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={addCreditRow}
                        className="app-secondary-button mt-1 inline-flex h-9 w-fit items-center gap-2 rounded-full px-3 text-[13px] font-semibold"
                      >
                        <Plus size={14} strokeWidth={1.8} />
                        Add credit
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div>
                <label
                  htmlFor="rating"
                  className="app-label mb-1.5 block text-[13px] font-semibold text-[#6e6e73]"
                >
                  Rating
                </label>
                <div className="grid grid-cols-3 gap-2" id="rating">
                  {ratingOptions.map((option) => {
                    const selected = form.rating === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            rating: option.value,
                          }))
                        }
                        data-active={selected ? "true" : "false"}
                        className={`app-choice h-9 rounded-full border text-[13px] font-semibold transition ${
                          selected
                            ? "border-[#1d1d1f] bg-[#1d1d1f] text-white"
                            : "border-transparent bg-[#f5f5f7] text-[#6e6e73] hover:bg-white hover:text-[#1d1d1f] hover:ring-1 hover:ring-[#d2d2d7]"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label
                  htmlFor="notes"
                  className="app-label mb-1.5 block text-[13px] font-semibold text-[#6e6e73]"
                >
                  Notes
                </label>
                <textarea
                  id="notes"
                  value={form.body}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      body: event.target.value,
                    }))
                  }
                  onClick={handleNotesClick}
                  onDoubleClick={handleNotesDoubleClick}
                  maxLength={5000}
                  required
                  rows={7}
                  className="app-field w-full resize-none rounded-lg border border-[#d2d2d7] bg-white px-3 py-2.5 text-[15px] leading-6 text-[#1d1d1f] outline-none transition placeholder:text-[#86868b] focus:border-[#86868b] focus:ring-4 focus:ring-[#d2d2d7]/35"
                  placeholder="What did you like or dislike?"
                />
              </div>

              <div>
                <label
                  htmlFor="visibility"
                  className="app-label mb-1.5 block text-[13px] font-semibold text-[#6e6e73]"
                >
                  Visibility
                </label>
                <div className="grid grid-cols-2 gap-2" id="visibility">
                  {visibilityOptions.map((option) => {
                    const selected = form.visibility === option.value;
                    const Icon = option.icon;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            visibility: option.value,
                          }))
                        }
                        data-active={selected ? "true" : "false"}
                        className={`app-choice inline-flex h-9 items-center justify-center gap-1.5 rounded-full border text-[13px] font-semibold transition ${
                          selected
                            ? "border-[#1d1d1f] bg-[#1d1d1f] text-white"
                            : "border-transparent bg-[#f5f5f7] text-[#6e6e73] hover:bg-white hover:text-[#1d1d1f] hover:ring-1 hover:ring-[#d2d2d7]"
                        }`}
                      >
                        <Icon size={14} strokeWidth={1.8} />
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <span
                className="app-status-pill inline-flex h-7 items-center gap-2 rounded-full bg-[#f5f5f7] px-3 text-[12px] font-semibold text-[#424245]"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    activeRating?.dotClassName ?? "bg-[#86868b]"
                  }`}
                />
                {activeRating?.label}
              </span>
              <button
                type="submit"
                disabled={isSaving}
                className="app-primary-button inline-flex h-9 min-w-24 items-center justify-center gap-2 rounded-full bg-[#1d1d1f] px-5 text-[14px] font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? (
                  <Loader2
                    className="animate-spin"
                    size={16}
                    strokeWidth={1.7}
                  />
                ) : null}
                Save
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isProfileOpen ? (
        <div className="app-overlay fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-[#1d1d1f]/24 px-3 py-6 backdrop-blur-sm sm:py-8">
          <div className="app-composer w-full max-w-md overflow-y-auto rounded-lg border border-[#d2d2d7]/80 bg-white p-5 shadow-[0_30px_90px_rgba(0,0,0,0.18)] sm:p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="app-title text-[24px] font-semibold leading-tight tracking-normal text-[#1d1d1f]">
                Profile
              </h2>
              <button
                type="button"
                onClick={() => setIsProfileOpen(false)}
                className="app-icon-button inline-flex h-8 w-8 items-center justify-center rounded-full text-[#86868b] transition hover:bg-[#f5f5f7] hover:text-[#1d1d1f]"
                aria-label="Close profile"
              >
                <X size={17} strokeWidth={1.7} />
              </button>
            </div>

            <div className="grid gap-4">
              <div>
                <p className="app-label text-[13px] font-semibold text-[#6e6e73]">
                  {profile?.displayName ?? "Me"}
                </p>
                <p className="mt-0.5 text-[13px] text-[#86868b]">
                  {profile?.email ?? ""}
                </p>
              </div>

              <form onSubmit={(event) => void handleUsernameSubmit(event)}>
                <label
                  htmlFor="username"
                  className="app-label mb-1.5 block text-[13px] font-semibold text-[#6e6e73]"
                >
                  Username
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-[#86868b]">
                    @
                  </span>
                  <input
                    id="username"
                    type="text"
                    value={usernameDraft}
                    onChange={(event) => {
                      setUsernameDraft(event.target.value);
                      setProfileError(null);
                      setProfileNotice(null);
                    }}
                    disabled={isUsernameLocked || isProfileSaving}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="set username"
                    className="app-search-input h-9 w-full rounded-lg border border-[#d2d2d7]/80 bg-white pl-7 pr-3 text-[14px] text-[#1d1d1f] outline-none transition placeholder:text-[#86868b] focus:border-[#1d1d1f] disabled:bg-[#f5f5f7] disabled:text-[#86868b]"
                  />
                </div>
                <p className="mt-1.5 text-[12px] text-[#86868b]">
                  3–30 lowercase letters, numbers, periods, or underscores.
                  Changeable once every {usernameCooldownDays} days.
                </p>
                {isUsernameLocked && usernameNextChangeAt ? (
                  <p className="mt-1 text-[12px] text-[#86868b]">
                    Next change available on{" "}
                    {usernameNextChangeAt.toLocaleDateString()}.
                  </p>
                ) : null}
                {profileError ? (
                  <p className="mt-2 text-[12px] text-[#c9342f]" role="alert">
                    {profileError}
                  </p>
                ) : null}
                {profileNotice ? (
                  <p className="mt-2 text-[12px] text-[#1d8a4e]">
                    {profileNotice}
                  </p>
                ) : null}
                <button
                  type="submit"
                  disabled={
                    isProfileSaving ||
                    isUsernameLocked ||
                    usernameDraft.trim().toLowerCase() ===
                      (profile?.username ?? "")
                  }
                  className="app-primary-button mt-3 inline-flex h-9 min-w-24 items-center justify-center gap-2 rounded-full bg-[#1d1d1f] px-5 text-[14px] font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isProfileSaving ? (
                    <Loader2
                      className="animate-spin"
                      size={16}
                      strokeWidth={1.7}
                    />
                  ) : null}
                  Save
                </button>
              </form>

              <div>
                <p className="app-label mb-1.5 block text-[13px] font-semibold text-[#6e6e73]">
                  Default visibility for new logs
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {visibilityOptions.map((option) => {
                    const selected =
                      (profile?.defaultVisibility ?? "private") === option.value;
                    const Icon = option.icon;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          void handleSetDefaultVisibility(option.value)
                        }
                        data-active={selected ? "true" : "false"}
                        className={`app-choice inline-flex h-9 items-center justify-center gap-1.5 rounded-full border text-[13px] font-semibold transition ${
                          selected
                            ? "border-[#1d1d1f] bg-[#1d1d1f] text-white"
                            : "border-transparent bg-[#f5f5f7] text-[#6e6e73] hover:bg-white hover:text-[#1d1d1f] hover:ring-1 hover:ring-[#d2d2d7]"
                        }`}
                      >
                        <Icon size={14} strokeWidth={1.8} />
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-[#d2d2d7]/60 pt-4">
                <button
                  type="button"
                  onClick={openFriends}
                  className="app-secondary-button inline-flex h-9 items-center justify-center gap-2 rounded-full px-4 text-[14px] font-semibold transition"
                >
                  <Users size={15} strokeWidth={1.8} />
                  Friends
                  {incomingFriendCount > 0 ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#1d1d1f] px-1.5 text-[11px] font-semibold text-white">
                      {incomingFriendCount}
                    </span>
                  ) : null}
                </button>
              </div>

              <div className="border-t border-[#d2d2d7]/60 pt-4">
                <form action="/auth/signout" method="post">
                  <button
                    type="submit"
                    className="app-secondary-button inline-flex h-9 items-center justify-center gap-2 rounded-full px-4 text-[14px] font-semibold transition"
                  >
                    <LogOut size={15} strokeWidth={1.8} />
                    Sign out
                  </button>
                </form>
                <a
                  href="/privacy"
                  className="mt-3 inline-block text-[12px] text-[#86868b] underline transition hover:text-[#1d1d1f]"
                >
                  Privacy Policy
                </a>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isFriendsOpen ? (
        <div className="app-overlay fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-[#1d1d1f]/24 px-3 py-6 backdrop-blur-sm sm:py-8">
          <div className="app-composer w-full max-w-md overflow-y-auto rounded-lg border border-[#d2d2d7]/80 bg-white p-5 shadow-[0_30px_90px_rgba(0,0,0,0.18)] sm:p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="app-title text-[24px] font-semibold leading-tight tracking-normal text-[#1d1d1f]">
                Friends
              </h2>
              <button
                type="button"
                onClick={() => setIsFriendsOpen(false)}
                className="app-icon-button inline-flex h-8 w-8 items-center justify-center rounded-full text-[#86868b] transition hover:bg-[#f5f5f7] hover:text-[#1d1d1f]"
                aria-label="Close friends"
              >
                <X size={17} strokeWidth={1.7} />
              </button>
            </div>

            <form
              onSubmit={(event) => void handleSendFriendRequest(event)}
              className="mb-2"
            >
              <label
                htmlFor="friend-username"
                className="app-label mb-1.5 block text-[13px] font-semibold text-[#6e6e73]"
              >
                Add a friend by username
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-[#86868b]">
                    @
                  </span>
                  <input
                    id="friend-username"
                    type="text"
                    value={friendUsernameDraft}
                    onChange={(event) => {
                      setFriendUsernameDraft(event.target.value);
                      setFriendError(null);
                      setFriendNotice(null);
                    }}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="username"
                    className="app-search-input h-9 w-full rounded-lg border border-[#d2d2d7]/80 bg-white pl-7 pr-3 text-[14px] text-[#1d1d1f] outline-none transition placeholder:text-[#86868b] focus:border-[#1d1d1f]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isFriendSaving || !friendUsernameDraft.trim()}
                  className="app-primary-button inline-flex h-9 items-center justify-center rounded-full bg-[#1d1d1f] px-4 text-[14px] font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Add
                </button>
              </div>
            </form>
            {friendError ? (
              <p className="mb-2 text-[12px] text-[#c9342f]" role="alert">
                {friendError}
              </p>
            ) : null}
            {friendNotice ? (
              <p className="mb-2 text-[12px] text-[#1d8a4e]">{friendNotice}</p>
            ) : null}

            {friendList && friendList.incoming.length > 0 ? (
              <div className="mt-4">
                <p className="app-label mb-1.5 text-[13px] font-semibold text-[#6e6e73]">
                  Requests received
                </p>
                <div className="grid gap-1.5">
                  {friendList.incoming.map((friend) => (
                    <div
                      key={friend.friendshipId}
                      className="app-friend-row flex items-center justify-between gap-2 rounded-lg px-3 py-2"
                    >
                      <span className="app-title min-w-0 truncate text-[14px] font-medium text-[#1d1d1f]">
                        {friendDisplay(friend)}
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isFriendSaving}
                          onClick={() =>
                            void handleRespondFriend(friend.friendshipId, true)
                          }
                          className="app-primary-button inline-flex h-8 items-center justify-center rounded-full bg-[#1d1d1f] px-3 text-[12px] font-semibold text-white transition hover:bg-black disabled:opacity-60"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          disabled={isFriendSaving}
                          onClick={() =>
                            void handleRespondFriend(friend.friendshipId, false)
                          }
                          className="inline-flex h-8 items-center justify-center rounded-full app-secondary-button px-3 text-[12px] font-semibold transition disabled:opacity-60"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {friendList && friendList.outgoing.length > 0 ? (
              <div className="mt-4">
                <p className="app-label mb-1.5 text-[13px] font-semibold text-[#6e6e73]">
                  Requests sent
                </p>
                <div className="grid gap-1.5">
                  {friendList.outgoing.map((friend) => (
                    <div
                      key={friend.friendshipId}
                      className="app-friend-row flex items-center justify-between gap-2 rounded-lg px-3 py-2"
                    >
                      <span className="app-title min-w-0 truncate text-[14px] font-medium text-[#1d1d1f]">
                        {friendDisplay(friend)}
                      </span>
                      <button
                        type="button"
                        disabled={isFriendSaving}
                        onClick={() =>
                          void handleRemoveFriend(friend.friendshipId)
                        }
                        className="inline-flex h-8 shrink-0 items-center justify-center rounded-full app-secondary-button px-3 text-[12px] font-semibold transition disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-4">
              <p className="app-label mb-1.5 text-[13px] font-semibold text-[#6e6e73]">
                Your friends
              </p>
              {friendList && friendList.accepted.length > 0 ? (
                <div className="grid gap-1.5">
                  {friendList.accepted.map((friend) => (
                    <div
                      key={friend.friendshipId}
                      className="app-friend-row flex items-center justify-between gap-2 rounded-lg px-3 py-2"
                    >
                      <span className="app-title min-w-0 truncate text-[14px] font-medium text-[#1d1d1f]">
                        {friendDisplay(friend)}
                      </span>
                      <button
                        type="button"
                        disabled={isFriendSaving}
                        onClick={() =>
                          void handleRemoveFriend(friend.friendshipId)
                        }
                        className="app-delete-button inline-flex h-8 shrink-0 items-center justify-center rounded-full px-3 text-[12px] font-semibold text-[#86868b] transition hover:bg-[#fff7f3] hover:text-[#a35f36] disabled:opacity-60"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-[#86868b]">No friends yet.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function friendDisplay(friend: FriendSummary) {
  if (friend.username) {
    return `@${friend.username}`;
  }
  return friend.displayName ?? "Unknown user";
}

function CreditSuggestionList({
  id,
  suggestions,
  onSelect,
}: {
  id: string;
  suggestions: string[];
  onSelect: (suggestion: string) => void;
}) {
  return (
    <div
      id={id}
      className="app-floating-panel absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-lg border py-1"
      role="listbox"
    >
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          role="option"
          aria-selected="false"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelect(suggestion)}
          className="app-suggestion-button block w-full px-3 py-2 text-left text-[13px] font-medium transition"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}

function CategoryBadge({ category }: { category: Category }) {
  const label =
    category === "music" ? "Music" : category === "image" ? "Image" : "Other";
  const Icon =
    category === "music" ? Music : category === "image" ? Image : Search;

  return (
    <span className="app-badge inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#6e6e73]">
      <Icon size={13} strokeWidth={1.7} />
      {label}
    </span>
  );
}

function RatingBadge({ rating }: { rating: Rating }) {
  const option = ratingOptions.find((item) => item.value === rating);

  return (
    <span className="app-rating-badge inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#424245]">
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          option?.dotClassName ?? "bg-[#86868b]"
        }`}
      />
      {option?.label ?? rating}
    </span>
  );
}

function makeCreditRow(role: string, names: string): CreditFormRow {
  const key = role || "custom";

  return {
    id: `${key}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    names,
  };
}

function createCreditRows(credits: Credit[] = []) {
  const usedCreditIndexes = new Set<number>();
  const rows = defaultCreditRoles.map((role) => {
    const index = credits.findIndex(
      (credit, creditIndex) =>
        !usedCreditIndexes.has(creditIndex) &&
        credit.role.toLowerCase() === role.toLowerCase(),
    );

    if (index >= 0) {
      usedCreditIndexes.add(index);
    }

    return makeCreditRow(role, index >= 0 ? credits[index].names.join(", ") : "");
  });

  credits.forEach((credit, index) => {
    if (!usedCreditIndexes.has(index)) {
      rows.push(makeCreditRow(credit.role, credit.names.join(", ")));
    }
  });

  return rows;
}

function creditRowsToCredits(rows: CreditFormRow[]) {
  return rows
    .map((row) => ({
      role: row.role.replace(/\s+/g, " ").trim(),
      names: splitCreditNames(row.names),
    }))
    .filter((credit) => credit.role && credit.names.length > 0)
    .slice(0, 16);
}

function splitCreditNames(value: string) {
  const seen = new Set<string>();

  return value
    .split(",")
    .map((name) => name.replace(/\s+/g, " ").trim())
    .filter((name) => {
      const key = name.toLowerCase();

      if (!name || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, 16);
}

function getActiveArtistQuery(value: string) {
  const parts = value.split(",");
  return parts[parts.length - 1]?.trim() ?? "";
}

function applyArtistSuggestion(value: string, artist: string) {
  const parts = value.split(",");
  const completed = parts
    .slice(0, -1)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const nextArtists = [...completed, artist].filter((name) => {
    const key = name.toLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });

  return `${nextArtists.join(", ")}, `;
}

function isNotesWordCharacter(character: string | undefined) {
  return Boolean(character && /[\p{L}\p{N}_'’-]/u.test(character));
}

function creditSuggestionListId(rowId: string, field: CreditInputField) {
  return `credit-${rowId.replace(/[^a-zA-Z0-9_-]/g, "-")}-${field}-suggestions`;
}

function formatArtistLine(artists: string[]) {
  return artists.length > 0 ? artists.join(", ") : "No artist";
}

function moveArrayItem<T>(items: T[], fromIndex: number, toIndex: number) {
  const nextItems = [...items];
  const [item] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, item);
  return nextItems;
}

function reindexRanking(items: FavoriteRankingEntry[]) {
  return items.map((item, index) => ({ ...item, rank: index + 1 }));
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}

function splitArtists(value: string) {
  const seen = new Set<string>();

  return value
    .split(",")
    .map((artist) => artist.replace(/\s+/g, " ").trim())
    .filter((artist) => {
      const key = artist.toLowerCase();

      if (!artist || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

function splitGenres(value: string) {
  const seen = new Set<string>();

  return value
    .split(",")
    .map((genre) => genre.replace(/\s+/g, " ").trim())
    .filter((genre) => {
      const key = genre.toLowerCase();

      if (!genre || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}
