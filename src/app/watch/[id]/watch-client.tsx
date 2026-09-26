"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { VideoPlayer } from "@/components/video-player";
import { useAuthStore } from "@/stores/auth-store";
import { useLibraryStore } from "@/stores/library-store";
import { useSettingsStore } from "@/stores/auth-store";
import { buildStreamSources, prefetchFastestServer, type StreamSource } from "@/lib/stream";
import { getCachedSources, resolveStreamSources, saveResolvedSources } from "@/lib/providers";
import { cloudApi } from "@/lib/cloud-api";
import { useDeviceType } from "@/hooks/use-device-type";

function buildBackupEmbedUrl(id: string, mediaType: "movie" | "tv") {
  void mediaType;
  return `https://vidsrc.pro/embed/movie/${encodeURIComponent(id)}`;
}

function normalizeTitle(value: string | null) {
  let decoded = (value || "Movie").replace(/\+/g, " ").trim();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded.replace(/%3A|%20|\+/gi, " ").replace(/[<>"'`{}[\]|\\^~]/g, " ").replace(/\s+/g, " ").trim() || "Movie";
}

function WatchContent() {
  const { deviceType } = useDeviceType();
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const routeId = searchParams.get("id") || String(params.id || "");
  const title = normalizeTitle(searchParams.get("title"));
  const mediaType = (searchParams.get("type") || "movie") as "movie" | "tv";
  const season = searchParams.get("season") || undefined;
  const episode = searchParams.get("episode") || undefined;
  const hindiUnavailableFromQuery = searchParams.get("hindiUnavailable") === "1";
  const movieId = parseInt(routeId, 10) || 0;
  const account = useAuthStore((s) => s.account);
  const saveProgress = useLibraryStore((s) => s.saveProgress);
  const removeProgress = useLibraryStore((s) => s.removeProgress);
  const qualityPref = useSettingsStore((s) => s.settings.qualityPreference);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [sources, setSources] = useState<StreamSource[]>([]);
  const [tmdbId, setTmdbId] = useState<string | number | null>(null);
  const [prefetchedUrl, setPrefetchedUrl] = useState<string | null>(null);
  const [poster, setPoster] = useState<string | undefined>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [englishTitle, setEnglishTitle] = useState("Movie");
  const mountedRef = useRef(false);

  useEffect(() => {
    const cleanUrl = `${window.location.pathname}?id=${encodeURIComponent(routeId)}&type=${encodeURIComponent(mediaType)}&title=${encodeURIComponent(title)}`;
    window.history.replaceState({}, "", cleanUrl);
  }, [mediaType, routeId, title]);

  useEffect(() => {
    mountedRef.current = true;
    async function findStream() {
      setLoading(true); setIsScanning(false); setError(""); setStreamUrl(null);
      try {
        const tmdbRes = await fetch(cloudApi(`/api/tmdb?id=${encodeURIComponent(routeId)}&type=${encodeURIComponent(mediaType)}`));
        const tmdbData = await tmdbRes.json();
        const match = tmdbData.result;
        if (!mountedRef.current) return;
        if (match?.posterPath) setPoster(match.posterPath);
        const resolvedTmdbId = match?.id || routeId;
        const resolvedTitle = [match?.title, match?.originalTitle, match?.original_title, match?.name].find((value): value is string => typeof value === "string" && /^[\x00-\x7F]+$/.test(value.trim()) && value.trim().length > 0)?.trim() || `Movie ${resolvedTmdbId}`;
        setEnglishTitle(resolvedTitle); setTmdbId(resolvedTmdbId);
        const fallbackUrl = buildBackupEmbedUrl(routeId, mediaType);
        const providerContext = { tmdbId: resolvedTmdbId, mediaType, season, episode } as const;
        const cachedSources = getCachedSources(providerContext);
        const nextSources = cachedSources.length ? cachedSources : resolveStreamSources(providerContext);
        const fastestSource = cachedSources[0] || nextSources[0];
        if (!mountedRef.current) return;
        if (!cachedSources.length) saveResolvedSources(providerContext, nextSources);
        setSources(nextSources); setPrefetchedUrl(fastestSource?.url || null); setStreamUrl(fastestSource?.url || fallbackUrl || nextSources[0]?.url || null);
      } catch {
        if (!mountedRef.current) return;
        const fallbackSources = buildStreamSources(routeId, mediaType, season, episode);
        const fallbackUrl = fallbackSources[0]?.url || buildBackupEmbedUrl(routeId, mediaType);
        setSources(fallbackSources); setPrefetchedUrl(fallbackUrl); setStreamUrl(fallbackUrl); setError("");
      } finally {
        if (mountedRef.current) { setIsScanning(false); setLoading(false); }
      }
    }
    void findStream();
    return () => { mountedRef.current = false; };
  }, [title, qualityPref, mediaType, routeId, season, episode]);

  const handleProgress = (current: number, duration = 0) => {
    if (!account || !movieId) return;
    saveProgress(account.id, { movieId, mediaType, progress: current, duration, updatedAt: new Date().toISOString() });
  };

  const handleComplete = useCallback(() => {
    if (!account || !movieId) return;
    void removeProgress(account.id, movieId);
    try {
      window.localStorage.removeItem(`flixcasa_resume_${movieId}`);
    } catch {
      // Local resume cleanup is best effort.
    }
  }, [account, movieId, removeProgress]);

  const refreshPlayback = useCallback(async () => {
    const resolvedId = tmdbId || routeId;
    const providerContext = { tmdbId: String(resolvedId), mediaType, season, episode, forceRefresh: true } as const;
    const refreshedSources = resolveStreamSources(providerContext);
    const refreshed = await prefetchFastestServer(refreshedSources, 1000);
    const orderedSources = refreshed ? [refreshed, ...refreshedSources.filter((source) => source.url !== refreshed.url)] : refreshedSources;
    saveResolvedSources(providerContext, orderedSources);
    setSources(orderedSources);
    setPrefetchedUrl(refreshed?.url || orderedSources[0]?.url || null);
    setStreamUrl(refreshed?.url || orderedSources[0]?.url || streamUrl);
  }, [episode, mediaType, routeId, season, streamUrl, tmdbId]);
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-black"><div className="text-center"><div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-yellow-400 border-t-transparent" /><p className="text-zinc-400">{isScanning ? "Scanning 20 Fast Hindi Servers... (4s max)" : "Preparing playback..."}</p></div></div>;
  if (!streamUrl) return <div className="flex min-h-screen flex-col items-center justify-center bg-black p-8"><p className="mb-4 text-center text-zinc-300">{error || "No Direct Hindi Stream Found. Click below to try Backup Embeds."}</p><button onClick={() => router.back()} className="rounded bg-yellow-400 px-6 py-2 font-semibold text-black">Go Back</button></div>;
  return <VideoPlayer src={streamUrl} sources={sources} title={englishTitle} tmdbId={tmdbId} preferredServerUrl={prefetchedUrl || undefined} isHindiUnavailable={hindiUnavailableFromQuery} poster={poster} onClose={() => router.back()} onProgress={handleProgress} onComplete={handleComplete} onRefresh={refreshPlayback} accountId={account?.id} deviceType={deviceType} />;
}

export default function WatchClient() {
  return <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-black"><div className="h-12 w-12 animate-spin rounded-full border-4 border-yellow-400 border-t-transparent" /></div>}><WatchContent /></Suspense>;
}
