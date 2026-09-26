"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AppShell } from "@/components/app-shell";
import { PosterRow } from "@/components/poster-row";
import { MovieModal } from "@/components/movie-modal";
import { useAuthStore } from "@/stores/auth-store";
import { useProfileStore } from "@/stores/profile-store";
import { useLibraryStore } from "@/stores/library-store";
import { KIDS_BLOCKED_GENRES } from "@/lib/tmdb";
import type { MovieItem } from "@/types";
import { Search, Play, Sparkles, Info, Volume2, VolumeX } from "lucide-react";
import Image from "next/image";
import { PosterCard } from "@/components/poster-card";
import { cloudApi } from "@/lib/cloud-api";
import { useDeviceType } from "@/hooks/use-device-type";

function BrowseContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");
  const routeQuery = searchParams.get("q") || "";
  const device = useDeviceType();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const account = useAuthStore((s) => s.account);
  const activeProfile = useProfileStore((s) => s.activeProfile);
  const myList = useLibraryStore((s) => s.myList);
  const watchHistory = useLibraryStore((s) => s.watchHistory);
  const addSearch = useLibraryStore((s) => s.addSearch);

  const [trending, setTrending] = useState<MovieItem[]>([]);
  const [global, setGlobal] = useState<MovieItem[]>([]);
  const [upcoming, setUpcoming] = useState<MovieItem[]>([]);
  const [trendingTv, setTrendingTv] = useState<MovieItem[]>([]);
  const [genreRows, setGenreRows] = useState<{ title: string; items: MovieItem[] }[]>([]);
  const [selected, setSelected] = useState<MovieItem | null>(null);
  const [searchQuery, setSearchQuery] = useState(routeQuery);
  const [searchResults, setSearchResults] = useState<MovieItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [focusedMovie, setFocusedMovie] = useState<MovieItem | null>(null);
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [trailerMuted, setTrailerMuted] = useState(false);
  const [trailerAudioActivated, setTrailerAudioActivated] = useState(false);
  const trailerTimerRef = useRef<number | null>(null);
  const focusSequenceRef = useRef(0);
  const trailerFrameRef = useRef<HTMLIFrameElement | null>(null);

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
        setUpcoming(uniqueItems(filterKids(data.upcoming || [])));
        setTrendingTv(uniqueItems(filterKids(data.tv || [])));

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

  useEffect(() => {
    setSearchQuery(routeQuery);
    if (!routeQuery.trim()) {
      setSearchResults([]);
      return;
    }
    let active = true;
    fetch(cloudApi(`/api/tmdb?q=${encodeURIComponent(routeQuery)}`))
      .then((response) => response.json())
      .then((data) => { if (active) setSearchResults(data.results || []); })
      .catch(() => { if (active) setSearchResults([]); });
    return () => { active = false; };
  }, [routeQuery]);

  useEffect(() => () => {
    if (trailerTimerRef.current) window.clearTimeout(trailerTimerRef.current);
    focusSequenceRef.current += 1;
  }, []);

  const activatePreview = (item: MovieItem) => {
    setFocusedMovie(item);
    setTrailerKey(null);
    setTrailerMuted(false);
    setTrailerAudioActivated(false);
    focusSequenceRef.current += 1;
    const sequence = focusSequenceRef.current;
    if (trailerTimerRef.current) window.clearTimeout(trailerTimerRef.current);
    trailerTimerRef.current = window.setTimeout(() => {
      fetch(cloudApi(`/api/tmdb?type=videos&id=${item.id}&mediaType=${item.mediaType}`))
        .then((response) => response.json())
        .then((data) => { if (sequence === focusSequenceRef.current) setTrailerKey(data.trailerKey || null); })
        .catch(() => { if (sequence === focusSequenceRef.current) setTrailerKey(null); });
    }, 1500);
  };

  const clearPreview = (item: MovieItem) => {
    if (focusedMovie?.id !== item.id) return;
    if (trailerTimerRef.current) window.clearTimeout(trailerTimerRef.current);
    focusSequenceRef.current += 1;
    setFocusedMovie(null);
    setTrailerKey(null);
    setTrailerAudioActivated(false);
  };

  const featured = useMemo(() => trending[0] || global[0] || null, [trending, global]);
  const heroMovie = focusedMovie || featured;
  const accent = useMemo(() => {
    if (!heroMovie) return "#e50914";
    if (heroMovie.genreIds.includes(878)) return "#087e8b";
    if (heroMovie.genreIds.includes(12) || heroMovie.genreIds.includes(14)) return "#147a56";
    if (heroMovie.genreIds.includes(28) || heroMovie.genreIds.includes(80)) return "#9f1239";
    if (heroMovie.genreIds.includes(10749)) return "#9d174d";
    return "#e50914";
  }, [heroMovie]);
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
            <PosterRow title="Saved for Later" items={myList} onSelect={setSelected} onFocusItem={activatePreview} onBlurItem={clearPreview} onHoverItem={activatePreview} onLeaveItem={clearPreview} />
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
        ) : searchQuery || tab === "search" ? (
          <PosterRow title={`Results for "${searchQuery}"`} items={searchResults} onSelect={setSelected} onFocusItem={activatePreview} onBlurItem={clearPreview} onHoverItem={activatePreview} onLeaveItem={clearPreview} />
        ) : (
          <>
            {heroMovie && <motion.section layout className="relative mb-9 -mx-3 min-h-[62vh] overflow-hidden border-b border-white/[0.06] bg-[#101116] transition-colors duration-500 ease-out md:-mx-6" style={{ background: `radial-gradient(ellipse at 78% 54%, ${accent}35 0%, transparent 46%), #0b0c10` }}>
              <AnimatePresence mode="wait">
                {heroMovie.backdropPath && <motion.div key={`backdrop-${heroMovie.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.45 }} className="absolute inset-0">
                  <Image src={heroMovie.backdropPath} alt="" fill priority className="object-cover object-center opacity-70" sizes="100vw" unoptimized />
                </motion.div>}
              </AnimatePresence>
              <AnimatePresence>
                {trailerKey && focusedMovie && <motion.iframe ref={trailerFrameRef} key={`${focusedMovie.mediaType}-${focusedMovie.id}-${trailerKey}`} initial={{ opacity: 0 }} animate={{ opacity: 0.55 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }} className="pointer-events-none absolute left-1/2 top-1/2 aspect-video h-[130%] min-w-[180%] -translate-x-1/2 -translate-y-1/2 scale-110" src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&mute=${trailerMuted ? 1 : 0}&controls=0&loop=1&playlist=${trailerKey}&playsinline=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(typeof window === "undefined" ? "" : window.location.origin)}`} title={`Official ${focusedMovie.title} trailer`} allow="autoplay; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" />}
              </AnimatePresence>
              <AnimatePresence>{trailerKey && focusedMovie && <motion.button initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onClick={() => {
                if (!trailerAudioActivated) {
                  setTrailerMuted(false);
                  setTrailerAudioActivated(true);
                  trailerFrameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "playVideo", args: [] }), "https://www.youtube-nocookie.com");
                  trailerFrameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "unMute", args: [] }), "https://www.youtube-nocookie.com");
                  trailerFrameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "setVolume", args: [80] }), "https://www.youtube-nocookie.com");
                  return;
                }
                const nextMuted = !trailerMuted;
                setTrailerMuted(nextMuted);
                trailerFrameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: nextMuted ? "mute" : "unMute", args: [] }), "https://www.youtube-nocookie.com");
              }} className="absolute right-5 top-5 z-30 flex items-center gap-2 rounded-full border border-white/20 bg-black/55 px-3 py-2 text-xs font-semibold text-white backdrop-blur-md hover:bg-black/75 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white sm:right-8 sm:top-8" aria-label={!trailerAudioActivated ? "Enable trailer audio" : trailerMuted ? "Unmute trailer preview" : "Mute trailer preview"}>{!trailerAudioActivated || !trailerMuted ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}{!trailerAudioActivated ? "Enable audio" : trailerMuted ? "Unmute preview" : "Mute preview"}</motion.button>}</AnimatePresence>
              <div className="absolute inset-0 bg-gradient-to-t from-[#0b0c10] via-[#0b0c10]/35 to-black/40" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#0b0c10] via-[#0b0c10]/75 to-transparent" />
              <motion.div key={heroMovie.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className={`relative z-10 flex min-h-[62vh] max-w-3xl flex-col justify-end px-4 pb-10 pt-24 sm:px-8 md:px-12 ${device.isTV ? "md:pb-16" : ""}`}>
                <div className="mb-4 flex w-fit items-center gap-2 rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/80 backdrop-blur-md"><Sparkles className="h-3.5 w-3.5 text-[#ff3342]" />FlixCasa spotlight</div>
                <h1 className="max-w-2xl text-3xl font-black leading-tight text-white sm:text-4xl md:text-5xl">{heroMovie.title}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold text-white/75"><span className="rounded bg-[#e50914] px-2 py-1">★ {heroMovie.voteAverage.toFixed(1)}</span><span>{heroMovie.releaseDate?.slice(0, 4) || "New"}</span><span>{heroMovie.contentRating || "Unrated"}</span><span>{heroMovie.mediaType === "tv" ? "Series" : "Film"}</span></div>
                <p className="mt-4 line-clamp-3 max-w-xl text-sm leading-6 text-white/75 sm:text-base">{heroMovie.overview || "A hand-picked story for your next movie night."}</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }} onClick={() => setSelected(heroMovie)} className="flex items-center gap-2 rounded-lg bg-[#e50914] px-5 py-3 text-sm font-bold text-white shadow-[0_8px_28px_rgba(229,9,20,.24)] transition-colors hover:bg-[#f21b27] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white"><Play className="h-4 w-4 fill-current" />Play Now</motion.button>
                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }} onClick={() => setSelected(heroMovie)} className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/[0.08] px-5 py-3 text-sm font-bold text-white backdrop-blur-md hover:bg-white/[0.14] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white"><Info className="h-4 w-4" />More Info</motion.button>
                </div>
              </motion.div>
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-b from-transparent to-[#0b0c10]" />
            </motion.section>}

            {trending.length > 0 && <section className="mb-9">
              <div className="mb-4 flex items-end justify-between"><div><p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#e50914]">Popular today</p><h2 className="text-xl font-bold sm:text-2xl">Top 10 Trending Today</h2></div><span className="text-xs text-white/40">Updated daily</span></div>
              <div className="flex snap-x gap-3 overflow-x-auto overflow-y-visible pb-5 pt-2">
                {trending.slice(0, 10).map((item, index) => <div key={`top-${item.id}`} className="flex w-[170px] shrink-0 snap-start items-end sm:w-[205px]">
                  <span aria-hidden="true" className="z-10 -mr-7 select-none text-[7rem] font-black italic leading-[0.72] text-[#0b0c10] [-webkit-text-stroke:2px_rgba(255,255,255,.68)] sm:-mr-9 sm:text-[8rem]">{index + 1}</span>
                  <div className="min-w-0 flex-1"><PosterCard item={item} onClick={setSelected} onFocusItem={activatePreview} onBlurItem={clearPreview} onHoverItem={activatePreview} onLeaveItem={clearPreview} /></div>
                </div>)}
              </div>
            </section>}

            {upcoming.length > 0 && <PosterRow title="Coming Soon" items={upcoming} onSelect={setSelected} onFocusItem={activatePreview} onBlurItem={clearPreview} onHoverItem={activatePreview} onLeaveItem={clearPreview} releaseBadge={(item) => item.releaseDate ? `Releases ${new Date(item.releaseDate).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}` : "Trailer available"} />}

            {watchHistory.length > 0 && <PosterRow title="Continue Watching" items={watchHistory.flatMap((progress) => { const item = [...myList, ...trending, ...global].find((saved) => saved.id === progress.movieId && saved.mediaType === progress.mediaType); return item ? [item] : []; })} onSelect={setSelected} onFocusItem={activatePreview} onBlurItem={clearPreview} onHoverItem={activatePreview} onLeaveItem={clearPreview} progressFor={(item) => { const progress = watchHistory.find((entry) => entry.movieId === item.id && entry.mediaType === item.mediaType); return progress?.duration ? progress.progress / progress.duration * 100 : undefined; }} remainingFor={(item) => { const progress = watchHistory.find((entry) => entry.movieId === item.id && entry.mediaType === item.mediaType); return progress?.duration ? `${Math.max(1, Math.ceil((progress.duration - progress.progress) / 60))} min left` : undefined; }} />}

            {trendingTv.length > 0 && <PosterRow title="Upcoming Episodes & Series" items={trendingTv} onSelect={setSelected} onFocusItem={activatePreview} onBlurItem={clearPreview} onHoverItem={activatePreview} onLeaveItem={clearPreview} releaseBadge={(item) => item.releaseDate ? `Next · ${new Date(item.releaseDate).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}` : "New episodes"} />}

            {filteredRows.map((row) => <PosterRow key={row.title} title={row.title} items={row.items} onSelect={setSelected} onFocusItem={activatePreview} onBlurItem={clearPreview} onHoverItem={activatePreview} onLeaveItem={clearPreview} />)}
            {myList.length > 0 && <PosterRow title="Watchlist & Ratings" items={myList} onSelect={setSelected} onFocusItem={activatePreview} onBlurItem={clearPreview} onHoverItem={activatePreview} onLeaveItem={clearPreview} />}
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
