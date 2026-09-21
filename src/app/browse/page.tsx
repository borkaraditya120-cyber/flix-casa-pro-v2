"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PosterRow } from "@/components/poster-row";
import { MovieModal } from "@/components/movie-modal";
import { useAuthStore } from "@/stores/auth-store";
import { useProfileStore } from "@/stores/profile-store";
import { useLibraryStore } from "@/stores/library-store";
import { KIDS_BLOCKED_GENRES } from "@/lib/tmdb";
import type { MovieItem } from "@/types";
import { Search, Play, Plus, Sparkles } from "lucide-react";
import Image from "next/image";
import { cloudApi } from "@/lib/cloud-api";

function BrowseContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const account = useAuthStore((s) => s.account);
  const activeProfile = useProfileStore((s) => s.activeProfile);
  const myList = useLibraryStore((s) => s.myList);
  const watchHistory = useLibraryStore((s) => s.watchHistory);
  const addSearch = useLibraryStore((s) => s.addSearch);

  const [trending, setTrending] = useState<MovieItem[]>([]);
  const [global, setGlobal] = useState<MovieItem[]>([]);
  const [genreRows, setGenreRows] = useState<{ title: string; items: MovieItem[] }[]>([]);
  const [selected, setSelected] = useState<MovieItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MovieItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/");
    if (!isLoading && isAuthenticated && !activeProfile) router.replace("/");
  }, [isLoading, isAuthenticated, activeProfile, router]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(cloudApi("/api/tmdb"));
        const data = await res.json();

        const filterKids = (items: MovieItem[]) =>
          items.filter((m) => {
            if (m.genreIds.some((g) => KIDS_BLOCKED_GENRES.includes(g)) && activeProfile?.isKids) return false;
            const ratingRank = { "10+": 1, "13+": 2, "16+": 3, "18+": 4 };
            const profileRating = activeProfile?.contentRating || (activeProfile?.isKids ? "13+" : "all");
            if (profileRating === "all") return true;
            return (ratingRank[m.contentRating || "13+"] || 2) <= (ratingRank[profileRating as keyof typeof ratingRank] || 2);
          });

        const uniqueItems = (items: MovieItem[]) => {
          const seen = new Set<string>();
          return items.filter((item) => {
            const key = String(item.id);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        };

        setTrending(uniqueItems(filterKids(data.trending || [])));
        setGlobal(uniqueItems(filterKids(data.global || [])));

        const genres = data.genres || [];
        const rows = await Promise.all(
          genres.map(async (g: { title: string; genreId: number }) => {
            const r = await fetch(cloudApi(`/api/tmdb?genreId=${g.genreId}&category=${encodeURIComponent(g.title)}`));
            const d = await r.json();
            return { title: g.title, items: uniqueItems(filterKids(d.results || [])) };
          })
        );
        setGenreRows(rows);
      } catch {
        /* offline fallback */
      } finally {
        setLoading(false);
        window.dispatchEvent(new Event("flixcasa:catalog-ready"));
      }
    }
    if (activeProfile) load();
  }, [activeProfile]);

  const featured = useMemo(() => trending[0] || global[0] || null, [trending, global]);
  const filteredRows = useMemo(() => {
    // Build rows based on active tab and ensure no duplicate movie IDs across rows
    const used = new Set<string>();
    const indianLanguages = new Set(["hi", "ta", "te", "kn", "ml"]);
    const itemKey = (item: MovieItem) => String(item.id);
    const isIndian = (item: MovieItem) =>
      item.originCountry?.includes("IN") || indianLanguages.has(item.originalLanguage || "");
    const isHorror = (item: MovieItem) => item.genreIds.includes(27);
    const catalog = [...trending, ...global, ...genreRows.flatMap((row) => row.items || [])];

    const takeUnique = (items: MovieItem[], limit = 12) => {
      const out: MovieItem[] = [];
      for (const it of items) {
        if (used.has(itemKey(it))) continue;
        if ((it.voteAverage || 0) < 6.5) continue; // enforce quality threshold
        out.push(it);
        used.add(itemKey(it));
        if (out.length >= limit) break;
      }
      return out;
    };

    if (tab === "movies") {
      return [{ title: "Popular Movies", items: takeUnique(global, 24) }];
    }
    if (tab === "tv") {
      return [{ title: "Top TV Series", items: takeUnique(trending, 24) }];
    }
    if (tab === "kids") {
      const kidsItems = trending.filter((item) => !item.genreIds.some((g) => KIDS_BLOCKED_GENRES.includes(g)));
      return [{ title: "Kids Zone", items: takeUnique(kidsItems, 24) }];
    }

    // Featured movie should be excluded from other rows
    if (featured) used.add(itemKey(featured));

    const rows: { title: string; items: MovieItem[] }[] = [];
    const continueWatching = watchHistory
      .filter((progress) => progress.progress > 0)
      .map((progress) => myList.find((item) => item.id === progress.movieId && item.mediaType === progress.mediaType))
      .filter((item): item is MovieItem => Boolean(item));
    rows.push({ title: "Continue Watching", items: takeUnique(continueWatching, 8) });
    rows.push({ title: "Indian Movies", items: takeUnique(catalog.filter((item) => isIndian(item) && !isHorror(item)), 24) });
    rows.push({ title: "Foreign & Hollywood Movies", items: takeUnique(catalog.filter((item) => !isIndian(item) && !isHorror(item)), 24) });
    rows.push({ title: "Indian Horror Movies", items: takeUnique(catalog.filter((item) => isIndian(item) && isHorror(item)), 24) });
    rows.push({ title: "Hollywood / Foreign Horror Movies", items: takeUnique(catalog.filter((item) => !isIndian(item) && isHorror(item)), 24) });
    rows.push({ title: "Trending in India", items: takeUnique(trending, 24) });
    rows.push({ title: "Popular Movies", items: takeUnique(global, 24) });
    rows.push({ title: "Top TV Series", items: takeUnique(trending.slice(0, 20), 24) });

    // Append genre-specific rows from fetched genreRows (already requested in same order as GENRE_ROWS)
    for (const gRow of genreRows) {
      const items = takeUnique(gRow.items || [], 24);
      if (items.length > 0) rows.push({ title: gRow.title, items });
    }

    return rows;
  }, [tab, trending, global, myList, watchHistory, genreRows, featured]);

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); return; }
    if (account) await addSearch(account.id, q);
    const res = await fetch(cloudApi(`/api/tmdb?q=${encodeURIComponent(q)}`));
    const data = await res.json();
    const filterKids = activeProfile?.isKids
      ? (data.results || []).filter((m: MovieItem) => !m.genreIds.some((g: number) => KIDS_BLOCKED_GENRES.includes(g)))
      : data.results || [];
    setSearchResults(filterKids);
  };

  if (isLoading || !activeProfile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-yellow-400 border-t-transparent" />
      </div>
    );
  }

  if (tab === "library") {
    return (
      <AppShell>
        <div className="px-3 py-4 md:px-6">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-2xl font-bold">My List</h1>
            <span className="text-sm text-zinc-400">{myList.length} saved</span>
          </div>
          {myList.length === 0 ? (
            <p className="text-zinc-400">Your list is empty. Add movies with the + button on any poster.</p>
          ) : (
            <PosterRow title="Saved for Later" items={myList} onSelect={setSelected} />
          )}
          <MovieModal item={selected} onClose={() => setSelected(null)} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="px-3 py-3 md:px-6 md:py-6">
        <div className="relative mb-6 max-w-xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search movies & shows..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full rounded-full border border-zinc-700 bg-zinc-800/90 py-3 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-4 focus:ring-yellow-400"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-yellow-400 border-t-transparent" />
          </div>
        ) : searchQuery ? (
          <PosterRow title={`Results for "${searchQuery}"`} items={searchResults} onSelect={setSelected} />
        ) : (
          <>
            {featured && (
              <section className="relative mb-8 overflow-hidden rounded-[28px] border border-zinc-800 bg-zinc-900 shadow-2xl">
                <div className="absolute inset-0 bg-gradient-to-r from-black via-black/50 to-transparent" />
                {featured.posterPath ? (
                  <Image src={featured.posterPath} alt={featured.title} fill className="object-cover" unoptimized />
                ) : null}
                <div className="relative flex min-h-[320px] flex-col justify-end p-5 sm:p-8 md:min-h-[420px] md:p-10">
                  <div className="mb-3 flex w-fit items-center gap-2 rounded-full border border-yellow-400/40 bg-yellow-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-yellow-300">
                    <Sparkles className="h-3.5 w-3.5" /> Featured
                  </div>
                  <h1 className="max-w-2xl text-3xl font-bold text-white sm:text-4xl">{featured.title}</h1>
                  <p className="mt-2 max-w-xl text-sm text-zinc-200 sm:text-base">{featured.description || featured.overview || "Discover a cinematic experience with premium entertainment for every mood."}</p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button className="flex items-center gap-2 rounded-full bg-yellow-400 px-4 py-2.5 font-semibold text-black transition-all duration-200 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-yellow-400">
                      <Play className="h-4 w-4" /> Watch Now
                    </button>
                    <button className="flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900/70 px-4 py-2.5 font-semibold text-white transition-all duration-200 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-yellow-400">
                      <Plus className="h-4 w-4" /> Add to Watchlist
                    </button>
                  </div>
                </div>
              </section>
            )}

            {filteredRows.map((row) => (
              <PosterRow key={row.title} title={row.title} items={row.items} onSelect={setSelected} />
            ))}
          </>
        )}

        <MovieModal item={selected} onClose={() => setSelected(null)} />
      </div>
    </AppShell>
  );
}

export default function BrowsePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-950">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-yellow-400 border-t-transparent" />
        </div>
      }
    >
      <BrowseContent />
    </Suspense>
  );
}
