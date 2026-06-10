"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Image,
  Loader2,
  Moon,
  Music,
  Pencil,
  Plus,
  Search,
  Sun,
  Trash2,
  X,
} from "lucide-react";

type Category = "music" | "image" | "other";
type CategoryFilter = Category | "all";
type Rating = "like" | "neutral" | "dislike";

type TasteLog = {
  id: string;
  itemId: string;
  category: Category;
  title: string;
  body: string;
  rating: Rating;
  artists: string[];
  createdAt: string;
  updatedAt: string;
};

type FormState = {
  id: string | null;
  category: Category;
  title: string;
  body: string;
  rating: Rating;
  artists: string;
};

type ComposerMode = "create" | "edit" | "layer";

type SelectedItem = {
  id: string;
  title: string;
  category: Category;
  artists: string[];
};

const emptyForm: FormState = {
  id: null,
  category: "music",
  title: "",
  body: "",
  rating: "like",
  artists: "",
};

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
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [composerMode, setComposerMode] = useState<ComposerMode>("create");
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isThemeReady, setIsThemeReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingScrollRef = useRef<number | null>(null);

  const debouncedSearch = useDebouncedValue(search, 180);
  const trimmedSearch = debouncedSearch.trim();

  const {
    data: logs = [],
    isPending,
    isError,
  } = useQuery({
    queryKey: selectedItem
      ? ["logs", "item", selectedItem.id]
      : ["logs", "feed", trimmedSearch, category],
    queryFn: async () => {
      const params = new URLSearchParams();

      if (selectedItem) {
        params.set("itemId", selectedItem.id);
      } else {
        if (trimmedSearch) {
          params.set("search", trimmedSearch);
        }

        if (category !== "all") {
          params.set("category", category);
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
      if (!selectedItem) {
        return undefined;
      }

      const cached = queryClient.getQueriesData<TasteLog[]>({
        queryKey: ["logs"],
      });
      const seen = new Set<string>();
      const matches: TasteLog[] = [];

      for (const [, data] of cached) {
        for (const log of data ?? []) {
          if (log.itemId === selectedItem.id && !seen.has(log.id)) {
            seen.add(log.id);
            matches.push(log);
          }
        }
      }

      return matches.length > 0 ? matches : undefined;
    },
  });

  const activeRating = useMemo(
    () => ratingOptions.find((option) => option.value === form.rating),
    [form.rating],
  );
  const errorMessage =
    error ?? (isError ? "Could not load logs." : null);
  const showInitialLoading = isPending && logs.length === 0;
  const showEmptyState = !isPending && !isError && logs.length === 0;
  const themeLabel = isDarkMode ? "Switch to light mode" : "Switch to dark mode";

  function openCreateComposer() {
    setForm(emptyForm);
    setComposerMode("create");
    setIsComposerOpen(true);
  }

  function openEditComposer(log: TasteLog) {
    setForm({
      id: log.id,
      category: log.category,
      title: log.title,
      body: log.body,
      rating: log.rating,
      artists: log.artists.join(", "),
    });
    setComposerMode("edit");
    setIsComposerOpen(true);
  }

  function openLayerComposer(log: TasteLog) {
    setForm({
      id: null,
      category: log.category,
      title: log.title,
      body: "",
      rating: log.rating,
      artists: log.artists.join(", "),
    });
    setComposerMode("layer");
    setIsComposerOpen(true);
  }

  function openItemLayers(log: TasteLog) {
    const item: SelectedItem = {
      id: log.itemId,
      title: log.title,
      category: log.category,
      artists: log.artists,
    };

    window.history.replaceState(
      { view: "feed", search, category, scrollY: window.scrollY },
      "",
    );
    window.history.pushState({ view: "layers", item }, "");
    setSelectedItem(item);
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
          }
        | null;

      if (state?.view === "layers" && state.item) {
        setSelectedItem(state.item);
        setSearch("");
        setCategory("all");
        window.scrollTo(0, 0);
        return;
      }

      setSelectedItem(null);

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
      const storedTheme = window.localStorage.getItem("impasto-theme");
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;

      setIsDarkMode(storedTheme === "dark" || (!storedTheme && prefersDark));
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
    window.localStorage.setItem("impasto-theme", theme);
  }, [isDarkMode, isThemeReady]);

  function searchByArtist(artist: string) {
    setSelectedItem(null);
    setCategory("all");
    setSearch(artist);
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
      setForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ["logs"] });
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

  return (
    <main
      data-theme={isDarkMode ? "dark" : "light"}
      className="app-shell min-h-screen bg-white text-[#1d1d1f]"
    >
      <div className="mx-auto flex min-h-screen w-full max-w-[860px] flex-col px-5 pb-16 pt-[104px] sm:px-8">
        <header className="app-header fixed inset-x-0 top-0 z-20 border-b border-[#d2d2d7]/30 bg-white/90 pb-2.5 pt-[19px] backdrop-blur-2xl">
          <div className="mx-auto grid w-full max-w-[860px] grid-cols-[104px_minmax(0,1fr)_36px] items-center gap-x-3 gap-y-2 px-5 sm:grid-cols-[128px_minmax(280px,1fr)_36px] sm:gap-x-5 sm:px-8">
            <div className="row-span-2 min-w-0 self-start">
              <h1 className="app-title text-[24px] font-semibold leading-none tracking-normal text-[#1d1d1f] sm:text-[28px]">
                Impasto
              </h1>
              <p className="app-subtitle mt-1 text-[10px] font-medium leading-3 text-[#6e6e73] sm:text-[12px] sm:leading-4">
                Your take, over time.
              </p>
            </div>

            <div className="relative col-start-2 row-start-1">
              <Search
                aria-hidden="true"
                className="app-search-icon pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]"
                size={15}
                strokeWidth={1.7}
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search titles, notes, or artists"
                className="app-search-input h-9 w-full rounded-full border border-transparent bg-white pl-9 pr-9 text-[13px] font-normal text-[#1d1d1f] shadow-[0_8px_24px_rgba(0,0,0,0.075)] outline-none transition placeholder:text-[#86868b] focus:shadow-[0_10px_30px_rgba(0,0,0,0.16)] sm:text-[14px]"
              />
              {search ? (
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
              className="app-top-add-button col-start-3 row-start-1 inline-flex h-9 w-9 items-center justify-center self-center justify-self-end rounded-full border border-transparent bg-white text-[#1d1d1f] shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition hover:shadow-[0_10px_30px_rgba(0,0,0,0.21)]"
              aria-label="New log"
            >
              <Plus size={18} strokeWidth={2} />
            </button>

            <button
              type="button"
              role="switch"
              aria-checked={isDarkMode}
              aria-label={themeLabel}
              title={themeLabel}
              data-state={isDarkMode ? "dark" : "light"}
              onClick={() => setIsDarkMode((current) => !current)}
              className="app-theme-toggle col-start-3 row-start-2 justify-self-end self-center"
            >
              <span className="app-theme-toggle-thumb">
                {isDarkMode ? (
                  <Moon size={10} strokeWidth={2} />
                ) : (
                  <Sun size={10} strokeWidth={2} />
                )}
              </span>
            </button>

            <div className="col-start-2 flex gap-4 overflow-x-auto pb-0.5">
              {categoryOptions.map((option) => {
                const selected = category === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setCategory(option.value)}
                    data-active={selected ? "true" : "false"}
                    className={`app-tab h-7 shrink-0 text-[12px] text-[#1d1d1f] transition ${
                      selected
                        ? "font-semibold underline underline-offset-4"
                        : "font-medium opacity-50 hover:opacity-100"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </header>

        <section className="flex flex-1 flex-col gap-3 pt-4">
          {selectedItem ? (
            <div className="app-selected-item flex items-center justify-between gap-3 rounded-lg bg-[#f5f5f7] px-4 py-3">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
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

          {showInitialLoading ? (
            <div className="app-muted flex h-44 items-center justify-center text-[#86868b]">
              <Loader2 className="animate-spin" size={22} strokeWidth={1.7} />
            </div>
          ) : null}

          {showEmptyState ? (
            <div className="app-empty flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed border-[#d2d2d7] bg-white px-6 text-center">
              <p className="app-title text-[19px] font-semibold text-[#1d1d1f]">
                No logs yet.
              </p>
              <button
                type="button"
                onClick={openCreateComposer}
                className="app-primary-button mt-5 inline-flex h-10 items-center gap-2 rounded-full border border-transparent bg-[#1d1d1f] px-4 text-[14px] font-semibold text-white transition hover:bg-black"
              >
                <Plus size={16} strokeWidth={2} />
                New log
              </button>
            </div>
          ) : null}

          {logs.map((log) => (
            <article
              key={log.id}
              className="app-card rounded-lg bg-white px-5 pb-2 pt-5 sm:shadow-[0_10px_34px_rgba(0,0,0,0.05)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {selectedItem ? null : (
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <button
                        type="button"
                        onClick={() => openItemLayers(log)}
                        className="app-card-title break-words text-left text-[30px] font-semibold leading-tight tracking-normal text-[#1d1d1f] transition hover:drop-shadow-[0_2px_5px_rgba(0,0,0,0.3)]"
                        aria-label={`Show layers for ${log.title}`}
                      >
                        {log.title}
                      </button>
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
                    </div>
                  )}
                  <div
                    className={`flex flex-wrap items-center gap-3 ${
                      selectedItem ? "" : "mt-2"
                    }`}
                  >
                    <CategoryBadge category={log.category} />
                    <RatingBadge rating={log.rating} />
                  </div>
                </div>
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
              </div>

              <p className="app-body mt-4 whitespace-pre-wrap break-words text-[14px] leading-5 text-[#424245]">
                {log.body}
              </p>

              <footer className="app-footer mt-5 flex items-center justify-between border-t border-[#d2d2d7]/55 pt-2 text-[12px] font-medium text-[#86868b]">
                <span>{formatDate(log.createdAt)}</span>
                {log.updatedAt !== log.createdAt ? (
                  <span>Edited {formatDate(log.updatedAt)}</span>
                ) : null}
              </footer>
            </article>
          ))}
        </section>
      </div>

      {isComposerOpen ? (
        <div className="app-overlay fixed inset-0 z-40 flex items-center justify-center bg-[#1d1d1f]/24 px-3 py-3 backdrop-blur-sm">
          <form
            onSubmit={(event) => void handleSubmit(event)}
            className="app-composer w-full max-w-2xl rounded-lg border border-[#d2d2d7]/80 bg-white p-5 shadow-[0_30px_90px_rgba(0,0,0,0.18)] sm:p-6"
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
                  placeholder="Song, album, image, or idea"
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
                <input
                  id="artists"
                  value={form.artists}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      artists: event.target.value,
                    }))
                  }
                  disabled={form.category !== "music"}
                  tabIndex={form.category === "music" ? undefined : -1}
                  className="app-field h-10 w-full rounded-lg border border-[#d2d2d7] bg-white px-3 text-[15px] text-[#1d1d1f] outline-none transition placeholder:text-[#86868b] focus:border-[#86868b] focus:ring-4 focus:ring-[#d2d2d7]/35 disabled:opacity-100"
                  placeholder="Frank Ocean, James Blake"
                />
              </div>

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
                  maxLength={5000}
                  required
                  rows={7}
                  className="app-field w-full resize-none rounded-lg border border-[#d2d2d7] bg-white px-3 py-2.5 text-[15px] leading-6 text-[#1d1d1f] outline-none transition placeholder:text-[#86868b] focus:border-[#86868b] focus:ring-4 focus:ring-[#d2d2d7]/35"
                  placeholder="What did you like or dislike?"
                />
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
    </main>
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

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}
