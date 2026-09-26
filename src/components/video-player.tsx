"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Pause, Play, RefreshCw, Settings, X } from "lucide-react";
import Hls from "hls.js";
import { isSafeStreamUrl, normalizeStreamUrl, type StreamSource } from "@/lib/stream";
import { getPlayerRemoteConfig, resolvePlayerServers, type PlayerRemoteConfig } from "@/lib/player-config";
import type { DeviceType } from "@/hooks/use-device-type";
import { upsertPlaybackProgress } from "@/lib/supabase-sync";
import { useProfileStore } from "@/stores/profile-store";
import { isRemoteBackKey, requestAppFullscreen } from "@/lib/device/device-context";

interface VideoPlayerProps {
  src?: string;
  sources?: StreamSource[];
  title: string;
  tmdbId?: string | number | null;
  poster?: string;
  preferredServerUrl?: string;
  isHindiUnavailable?: boolean;
  onClose?: () => void;
  onProgress?: (progress: number, duration?: number) => void;
  onComplete?: () => void;
  accountId?: string;
  deviceType?: DeviceType;
  onRefresh?: (resumeAt: number) => Promise<void> | void;
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function appendResumeParam(url: string, seconds: number) {
  if (!seconds || seconds <= 0) return url;
  const timeParam = `t=${Math.floor(seconds)}`;
  if (url.includes("#")) return `${url}&${timeParam}`;
  return `${url}#${timeParam}`;
}

function cleanTmdbId(value: string | number | null | undefined) {
  if (value == null) return "";
  return String(value).trim().replace(/[^0-9]/g, "");
}

export function VideoPlayer({ src, sources, title, tmdbId, poster, preferredServerUrl, isHindiUnavailable = false, onClose, onProgress, onComplete, accountId, deviceType = "desktop", onRefresh }: VideoPlayerProps) {
  const [currentServerIndex, setCurrentServerIndex] = useState(0);
  const [isAutoMode, setIsAutoMode] = useState(true);
  const [showServerMenu, setShowServerMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [statusText, setStatusText] = useState("Probing servers...");
  const [statusBannerVisible, setStatusBannerVisible] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [seekFeedback, setSeekFeedback] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [resumeAt, setResumeAt] = useState(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [englishFallbackNotice, setEnglishFallbackNotice] = useState(false);
  const [hasManualSelection, setHasManualSelection] = useState(false);
  const [remoteConfig, setRemoteConfig] = useState<PlayerRemoteConfig | null>(null);
  const controlsTimeoutRef = useRef<number | null>(null);
  const trackingRef = useRef<number | null>(null);
  const manualSelectionRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const tapTimerRef = useRef<number | null>(null);
  const iframeLoadedRef = useRef(false);
  const playerRootRef = useRef<HTMLDivElement | null>(null);
  const currentTimeRef = useRef(0);
  const progressSyncRef = useRef(0);
  const playbackRateRef = useRef(1);
  const qualityRef = useRef("Auto");
  const [playbackRate, setPlaybackRate] = useState(1);
  const [preferredLanguage, setPreferredLanguage] = useState<"Hindi" | "English" | "Auto">("Hindi");
  const [subtitleTrack, setSubtitleTrack] = useState("Off");
  const [quality, setQuality] = useState("Auto");
  const [isScanning, setIsScanning] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showPosterBackdrop, setShowPosterBackdrop] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const activeProfileId = useProfileStore((state) => state.activeProfile?.id ?? null);
  const scanStartedRef = useRef(false);
  const completionHandledRef = useRef(false);
  const fullscreenAttemptedRef = useRef(false);

  const cleanId = cleanTmdbId(tmdbId);
  const storageKey = cleanId ? `flixcasa_resume_${cleanId}` : "";
  const audioHintText = remoteConfig?.audioHint || "Hindi default. Alternate tracks may be available in the player settings.";

  const servers = useMemo(() => {
    const configured = cleanId ? resolvePlayerServers(cleanId, remoteConfig) : [];
    const supplied = sources?.map((source) => ({ label: source.label, url: normalizeStreamUrl(source.url) })).filter((source) => source.url && isSafeStreamUrl(source.url)) || [];
    const combined = [...supplied, ...configured].filter((server) => isSafeStreamUrl(server.url));
    if (combined.length) {
      const seen = new Set<string>();
      return combined.filter((server) => {
        if (seen.has(server.url)) return false;
        seen.add(server.url);
        return true;
      });
    }
    const fallbackUrl = normalizeStreamUrl(src);
    return fallbackUrl ? [{ label: "Fallback Source", url: fallbackUrl }] : [];
  }, [cleanId, sources, src, remoteConfig]);

  const directServers = useMemo(
    () => servers.filter((server) => !/legacy\s*embed/i.test(server.label)),
    [servers],
  );
  const legacyServers = useMemo(
    () => servers.filter((server) => /legacy\s*embed/i.test(server.label)),
    [servers],
  );

  const activeSrc = useMemo(() => {
    const normalizedPreferredUrl = normalizeStreamUrl(preferredServerUrl);
    if (normalizedPreferredUrl && !hasManualSelection) return appendResumeParam(normalizedPreferredUrl, resumeAt);
    const server = servers[currentServerIndex];
    if (!server?.url) return "";
    return appendResumeParam(server.url, resumeAt);
  }, [hasManualSelection, preferredServerUrl, servers, currentServerIndex, resumeAt]);
  const isNativeSource = /\.(?:m3u8|mp4|webm)(?:[?#]|$)/i.test(activeSrc);

  useEffect(() => {
    setMediaReady(false);
    iframeLoadedRef.current = false;
  }, [activeSrc]);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) {
      window.clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = window.setTimeout(() => {
      setControlsVisible(false);
    }, 1000);
  }, []);

  const saveResumeTime = useCallback(
    (seconds: number) => {
      if (!storageKey) return;
      try {
        window.localStorage.setItem(storageKey, String(Math.max(0, Math.floor(seconds))));
      } catch {
        // ignore localStorage errors
      }
    },
    [storageKey],
  );

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    let isMounted = true;
    const refreshRemoteConfig = async () => {
      try {
        const config = await getPlayerRemoteConfig();
        if (isMounted) {
          setRemoteConfig(config);
        }
      } catch {
        if (isMounted) {
          setRemoteConfig(null);
        }
      }
    };

    void refreshRemoteConfig();
    const interval = window.setInterval(() => void refreshRemoteConfig(), 60_000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const stored = window.localStorage.getItem(storageKey);
      const seconds = stored ? Number(stored) : 0;
      if (!Number.isNaN(seconds) && seconds > 0) {
        setCurrentTime(seconds);
        setResumeAt(seconds);
        setStatusText(`Resuming at ${formatTime(seconds)}...`);
      }
    } catch {
      // ignore
    }
  }, [storageKey]);

  useEffect(() => {
    if (!isPlaying) {
      if (trackingRef.current) {
        window.clearInterval(trackingRef.current);
      }
      return;
    }

    trackingRef.current = window.setInterval(() => {
      setCurrentTime((prev) => {
        const next = Math.max(0, prev + 1);
        if (next % 5 === 0) saveResumeTime(next);
        return next;
      });
    }, 1000);

    return () => {
      if (trackingRef.current) {
        window.clearInterval(trackingRef.current);
      }
    };
  }, [isPlaying, saveResumeTime]);

  useEffect(() => {
    if (!storageKey) return;
    const intervalId = window.setInterval(() => {
      saveResumeTime(currentTime);
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [currentTime, saveResumeTime, storageKey]);

  useEffect(() => {
    if (!englishFallbackNotice) return;
    const timeout = window.setTimeout(() => setEnglishFallbackNotice(false), 3000);
    return () => window.clearTimeout(timeout);
  }, [englishFallbackNotice]);

  useEffect(() => {
    if (isHindiUnavailable) setEnglishFallbackNotice(true);
  }, [isHindiUnavailable]);

  useEffect(() => {
    if (!preferredServerUrl || manualSelectionRef.current) return;
    const preferredIndex = servers.findIndex((server) => server.url === preferredServerUrl);
    if (preferredIndex < 0) return;
    setCurrentServerIndex(preferredIndex);
    setStatusText(`Selected ${servers[preferredIndex].label}`);
  }, [preferredServerUrl, servers]);

  useEffect(() => {
    if (scanStartedRef.current || !servers.length || manualSelectionRef.current) return;
    scanStartedRef.current = true;
    setIsScanning(false);
    setStatusText(preferredServerUrl ? "Playing prefetched server" : "Playing selected source");
  }, [preferredServerUrl, servers]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setStatusBannerVisible(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [activeSrc]);

  useEffect(() => {
    if (!videoRef.current) return;
    if (!isNativeSource) return;
    const video = videoRef.current;
    let hls: Hls | null = null;
    if (/\.m3u8(?:[?#]|$)/i.test(activeSrc) && !video.canPlayType("application/vnd.apple.mpegurl")) {
      if (Hls.isSupported()) {
        hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        hlsRef.current = hls;
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (qualityRef.current === "Auto") {
            hls!.currentLevel = -1;
            return;
          }
          const targetHeight = Number.parseInt(qualityRef.current, 10);
          const closestIndex = hls!.levels.reduce((bestIndex, level, index, levels) => {
            const bestDistance = Math.abs(levels[bestIndex].height - targetHeight);
            return Math.abs(level.height - targetHeight) < bestDistance ? index : bestIndex;
          }, 0);
          hls!.currentLevel = closestIndex;
        });
        hls.loadSource(activeSrc);
        hls.attachMedia(video);
      }
    } else {
      video.src = activeSrc;
    }
    return () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
      hls?.destroy();
      if (hlsRef.current === hls) hlsRef.current = null;
    };
  }, [activeSrc, isNativeSource]);

  useEffect(() => {
    if (!activeSrc || fullscreenAttemptedRef.current) return;
    fullscreenAttemptedRef.current = true;
    void requestAppFullscreen(videoRef.current || playerRootRef.current);
  }, [activeSrc]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isNativeSource) return;
    video.playbackRate = playbackRate;
  }, [playbackRate, isNativeSource]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isNativeSource) return;
    if (isPlaying) {
      hlsRef.current?.startLoad(-1);
      void video.play().catch(() => setIsPlaying(false));
    } else {
      hlsRef.current?.stopLoad();
      video.pause();
    }
  }, [isPlaying, isNativeSource]);

  useEffect(() => () => {
    if (controlsTimeoutRef.current) window.clearTimeout(controlsTimeoutRef.current);
    if (trackingRef.current) window.clearInterval(trackingRef.current);
    if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
    hlsRef.current?.destroy();
    hlsRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
  }, []);

  useEffect(() => {
    if (!poster || !activeSrc) {
      setShowPosterBackdrop(false);
      return;
    }
    const timer = window.setTimeout(() => setShowPosterBackdrop(true), 500);
    return () => window.clearTimeout(timer);
  }, [poster, activeSrc]);

  useEffect(() => {
    if (!isNativeSource || !hlsRef.current) return;
    if (quality === "Auto") {
      hlsRef.current.currentLevel = -1;
      return;
    }

    const targetHeight = Number.parseInt(quality, 10);
    let closestIndex = -1;
    let closestDistance = Number.POSITIVE_INFINITY;
    hlsRef.current.levels.forEach((level, index) => {
      const distance = Math.abs(level.height - targetHeight);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    if (closestIndex >= 0) hlsRef.current.currentLevel = closestIndex;
  }, [quality, isNativeSource]);

  useEffect(() => {
    const originalOpen = window.open;
    const originalAssign = window.location.assign.bind(window.location);
    const originalReplace = window.location.replace.bind(window.location);
    const originalAnchorClick = HTMLAnchorElement.prototype.click;
    const originalOnBeforeUnload = window.onbeforeunload;
    const onBlur = () => {
      window.setTimeout(() => {
        if (document.hidden) return;
        window.focus?.();
      }, 100);
    };

    const isAllowedNavigation = (url: string) => {
      if (!url) return true;
      if (url.startsWith("/") || url.startsWith("#") || url.startsWith("mailto:") || url.startsWith("tel:")) return true;
      return url.startsWith(window.location.origin);
    };

    const blockExternalNavigation = (event: MouseEvent | KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a") as HTMLAnchorElement | null;
      if (!anchor?.href) return;
      if (!isAllowedNavigation(anchor.href)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    if (typeof window !== "undefined") {
      window.open = () => null;
      window.location.assign = (url: string | URL) => {
        const nextUrl = typeof url === "string" ? url : url.toString();
        if (!isAllowedNavigation(nextUrl)) return;
        return originalAssign(nextUrl);
      };
      window.location.replace = (url: string | URL) => {
        const nextUrl = typeof url === "string" ? url : url.toString();
        if (!isAllowedNavigation(nextUrl)) return;
        return originalReplace(nextUrl);
      };
      HTMLAnchorElement.prototype.click = function clickIntercept() {
        const href = this.href || "";
        if (!isAllowedNavigation(href)) return;
        return originalAnchorClick.call(this);
      };
      window.onbeforeunload = () => "Are you sure you want to leave this stream?";
    }
    window.addEventListener("blur", onBlur);
    document.addEventListener("click", blockExternalNavigation, true);
    document.addEventListener("keydown", blockExternalNavigation, true);

    return () => {
      window.open = originalOpen;
      window.location.assign = originalAssign;
      window.location.replace = originalReplace;
      HTMLAnchorElement.prototype.click = originalAnchorClick;
      window.onbeforeunload = originalOnBeforeUnload;
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("click", blockExternalNavigation, true);
      document.removeEventListener("keydown", blockExternalNavigation, true);
    };
  }, []);

  const handleIframeLoad = () => {
    iframeLoadedRef.current = true;
    setMediaReady(true);
    setStatusBannerVisible(false);
    setStatusText(`Loaded ${servers[currentServerIndex]?.label || "Server"}; waiting for player...`);
    showControls();
  };

  const autoSwitchServer = useCallback(() => {
    if (currentServerIndex < servers.length - 1) {
      setResumeAt(currentTimeRef.current);
      setHasManualSelection(true);
      setCurrentServerIndex((index) => index + 1);
      setStatusText(`Switching to ${servers[currentServerIndex + 1]?.label || "next server"}...`);
      return;
    }
    setStatusText("All configured servers are unavailable.");
  }, [currentServerIndex, servers]);

  const handleRefresh = useCallback(async () => {
    const resume = currentTimeRef.current;
    saveResumeTime(resume);
    setResumeAt(resume);
    setIsRefreshing(true);
    setStatusText("Refreshing playback link...");
    try {
      if (onRefresh) {
        await onRefresh(resume);
      } else {
        autoSwitchServer();
      }
    } finally {
      setIsRefreshing(false);
      setStatusBannerVisible(true);
      showControls();
    }
  }, [autoSwitchServer, onRefresh, saveResumeTime, showControls]);

  const handleIframeError = () => {
    autoSwitchServer();
  };

  const handleNativeError = () => {
    autoSwitchServer();
  };

  useEffect(() => {
    if (!activeSrc || isNativeSource || preferredServerUrl) return;
    iframeLoadedRef.current = false;
    const timeout = window.setTimeout(() => {
      if (!iframeLoadedRef.current) autoSwitchServer();
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [activeSrc, autoSwitchServer, isNativeSource, preferredServerUrl]);

  const seekBy = (seconds: number) => {
    if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime + seconds);
    setCurrentTime((current) => Math.max(0, current + seconds));
    setResumeAt((current) => Math.max(0, current + seconds));
    setSeekFeedback(seconds);
    showControls();
  };

  const handleTap = (event: React.MouseEvent<HTMLDivElement>) => {
    if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
    tapTimerRef.current = window.setTimeout(() => {
      const bounds = event.currentTarget.getBoundingClientRect();
      const position = event.clientX - bounds.left;
      if (position > bounds.width * 0.33 && position < bounds.width * 0.67) {
        setIsPlaying((playing) => !playing);
      }
      tapTimerRef.current = null;
    }, 220);
  };

  const handleDoubleTap = (event: React.MouseEvent<HTMLDivElement>) => {
    if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
    const bounds = event.currentTarget.getBoundingClientRect();
    seekBy(event.clientX - bounds.left < bounds.width / 2 ? -10 : 10);
  };

  const handleManualSelect = (index: number) => {
    setIsAutoMode(false);
    setHasManualSelection(true);
    setShowServerMenu(false);
    manualSelectionRef.current = true;
    setResumeAt(currentTime);
    setCurrentServerIndex(index);
    const selectedUrl = servers[index]?.url;
    setStatusText(`Loading Server ${index + 1}...`);
    const value = `${servers[index]?.label || ""} ${selectedUrl || ""}`.toLowerCase();
    if (!/hindi|\bhi\b|[?&](?:ds_)?lang(?:uage)?=hi(?:&|$)/i.test(value)) {
      setEnglishFallbackNotice(true);
    }
    showControls();
  };

  const onContainerInteraction = () => {
    showControls();
    if (deviceType === "mobile") {
      const orientation = screen.orientation as ScreenOrientation & { lock?: (orientation: string) => Promise<void> };
      if (orientation.lock) void orientation.lock("landscape").catch(() => undefined);
    }
  };

  const handlePlayerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const focusable = Array.from(playerRootRef.current?.querySelectorAll<HTMLElement>("button, select, [tabindex]:not([tabindex='-1'])") || []);
    const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
    if (isRemoteBackKey(event.nativeEvent) || event.key === "Backspace") {
      event.preventDefault();
      onClose?.();
      return;
    }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      if (event.target instanceof HTMLSelectElement) {
        showControls();
        return;
      }
      event.preventDefault();
      if (focusable.length) {
        const step = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
        focusable[(activeIndex + step + focusable.length) % focusable.length]?.focus();
      }
      showControls();
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setCurrentTime((prev) => {
          const next = Math.max(0, prev + 10);
          saveResumeTime(next);
          setResumeAt(next);
          return next;
        });
        setSeekFeedback(10);
        showControls();
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setCurrentTime((prev) => {
          const next = Math.max(0, prev - 10);
          saveResumeTime(next);
          setResumeAt(next);
          return next;
        });
        setSeekFeedback(-10);
        showControls();
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setIsPlaying((prev) => !prev);
        showControls();
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setStatusText("Focus up");
        showControls();
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setStatusText("Focus down");
        showControls();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousemove", showControls);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousemove", showControls);
    };
  }, [saveResumeTime, showControls]);

  useEffect(() => {
    if (seekFeedback == null) return;
    const timer = window.setTimeout(() => setSeekFeedback(null), 800);
    return () => window.clearTimeout(timer);
  }, [seekFeedback]);

  return (
    <div ref={playerRootRef} data-device={deviceType} className={`fixed inset-0 z-[60] flex flex-col bg-transparent ${deviceType === "tv" ? "[& button]:min-h-12 [& button]:min-w-12" : ""}`} style={{ transform: "translateZ(0)", backfaceVisibility: "hidden" }} onMouseMove={onContainerInteraction} onClick={onContainerInteraction} onKeyDown={handlePlayerKeyDown} tabIndex={-1}>
      {englishFallbackNotice && (
        <div role="status" className="absolute inset-x-0 top-0 z-[10000] bg-yellow-400 px-4 py-3 text-center text-sm font-semibold text-black shadow-lg">
          Hindi audio not available on this server. Playing in default audio.
        </div>
      )}
      <div className={`relative overflow-visible z-[9999] flex items-center justify-between bg-transparent px-4 py-3 text-sm text-white transition-opacity duration-200 ${controlsVisible ? "opacity-100" : "opacity-0"}`} style={{ transform: "translateZ(0)", backfaceVisibility: "hidden" }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-zinc-400">{title}</span>
          <span className="rounded-full border border-zinc-700 bg-zinc-900/80 px-2.5 py-1 text-[11px] uppercase tracking-wide text-zinc-300">{isAutoMode ? "Auto" : "Manual"}</span>
          {statusBannerVisible && <span className="text-xs text-zinc-400">{isScanning ? `Scanning ${servers.length} Fast Hindi Servers... (4s max)` : statusText}</span>}
          <span className="text-[11px] text-zinc-500">Audio: {remoteConfig?.defaultLanguage === "hi" ? "Hindi default" : "Auto"} • {audioHintText}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleRefresh()}
            disabled={isRefreshing}
            className="rounded border border-zinc-700 bg-zinc-900/80 p-2 text-zinc-200 hover:bg-zinc-800 focus:outline-none focus:ring-4 focus:ring-yellow-400 disabled:opacity-50"
            aria-label="Refresh broken playback link"
            title="Not playing? Refresh link"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => {
              setIsPlaying((prev) => !prev);
              showControls();
            }}
            className="rounded border border-zinc-700 bg-zinc-900/80 p-2 text-zinc-200 hover:bg-zinc-800 focus:outline-none focus:ring-4 focus:ring-yellow-400"
            aria-label={isPlaying ? "Pause playback" : "Resume playback"}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <div className="relative">
            <button
              onClick={() => {
                setShowServerMenu((prev) => !prev);
                showControls();
              }}
              className="flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 focus:outline-none focus:ring-4 focus:ring-yellow-400"
            >
              Select Server
              <ChevronDown className="h-4 w-4" />
            </button>
            {showServerMenu && (
              <div className="absolute right-0 mt-2 min-w-[180px] rounded border border-zinc-800 bg-zinc-950/95 p-1 shadow-xl z-[9999] overflow-visible">
                {directServers.map((server) => {
                  const index = servers.indexOf(server);
                  return <button
                    key={server.label}
                    onClick={() => handleManualSelect(index)}
                    className={`block w-full rounded px-3 py-2 text-left text-sm transition ${currentServerIndex === index ? "bg-yellow-400 text-black" : "text-zinc-200 hover:bg-zinc-800"}`}
                  >
                    {server.label}
                  </button>;
                })}
                {legacyServers.length > 0 && <div className="border-t border-zinc-800 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Backup Embeds</div>}
                {legacyServers.map((server) => {
                  const index = servers.indexOf(server);
                  return <button
                    key={server.label}
                    onClick={() => handleManualSelect(index)}
                    className={`block w-full rounded px-3 py-2 text-left text-sm transition ${currentServerIndex === index ? "bg-yellow-400 text-black" : "text-zinc-200 hover:bg-zinc-800"}`}
                  >
                    {server.label}
                  </button>;
                })}
              </div>
            )}
          </div>
          <div className="relative">
            <button
              onClick={() => setShowSettingsMenu((visible) => !visible)}
              className="rounded border border-zinc-700 bg-zinc-900/80 p-2 text-zinc-200 hover:bg-zinc-800 focus:outline-none focus:ring-4 focus:ring-yellow-400"
              aria-label="Open playback settings"
            >
              <Settings className="h-4 w-4" />
            </button>
            {showSettingsMenu && (
              <div className="absolute right-0 top-full z-[9999] mt-2 grid min-w-[220px] gap-2 rounded border border-zinc-800 bg-zinc-950 p-3 shadow-xl">
                <label className="text-xs text-zinc-400">Speed<select value={playbackRate} onChange={(event) => { const next = Number(event.target.value); playbackRateRef.current = next; setPlaybackRate(next); }} className="mt-1 w-full rounded bg-zinc-900 px-2 py-1 text-white"><option value="0.5">0.5x</option><option value="1">1.0x</option><option value="1.25">1.25x</option><option value="1.5">1.5x</option><option value="2">2.0x</option></select></label>
                <label className="text-xs text-zinc-400">Audio<select value={preferredLanguage} onChange={(event) => setPreferredLanguage(event.target.value as "Hindi" | "English" | "Auto")} className="mt-1 w-full rounded bg-zinc-900 px-2 py-1 text-white"><option>Hindi</option><option>English</option><option>Auto</option></select></label>
                <label className="text-xs text-zinc-400">Subtitles<select value={subtitleTrack} onChange={(event) => setSubtitleTrack(event.target.value)} className="mt-1 w-full rounded bg-zinc-900 px-2 py-1 text-white"><option>Off</option><option>English</option><option>Hindi</option></select></label>
                <label className="text-xs text-zinc-400">Quality<select value={quality} onChange={(event) => { const next = event.target.value; qualityRef.current = next; setQuality(next); }} className="mt-1 w-full rounded bg-zinc-900 px-2 py-1 text-white"><option>Auto</option><option value="2160">4K</option><option>1080p</option><option>720p</option><option>480p</option><option>128p</option></select></label>
              </div>
            )}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded p-2 text-zinc-300 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-yellow-400"
              aria-label="Close player"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
      <div className="z-50 relative w-screen h-screen overflow-hidden bg-transparent" style={{ transform: "translateZ(0)", backfaceVisibility: "hidden" }} onClick={handleTap} onDoubleClick={handleDoubleTap}>
        {poster && showPosterBackdrop && !mediaReady && (
          <div className="absolute inset-0 z-10 bg-cover bg-center bg-no-repeat" style={{ backgroundImage: `url(${poster})`, filter: "brightness(0.45) saturate(1.1)" }} />
        )}
        {!activeSrc && <div className="absolute inset-0 z-40 flex items-center justify-center bg-transparent" role="status"><div className="h-10 w-10 animate-spin rounded-full border-4 border-yellow-400 border-t-transparent" /></div>}
        {activeSrc && isNativeSource && <video
          ref={videoRef}
          key={activeSrc}
          src={activeSrc}
          className="relative z-30 block h-screen w-screen object-cover opacity-100"
          style={{ transform: "translateZ(0)", backfaceVisibility: "hidden" }}
          autoPlay
          playsInline
          controls
          onError={handleNativeError}
          onEnded={() => {
            if (completionHandledRef.current) return;
            completionHandledRef.current = true;
            onComplete?.();
          }}
          onPlay={() => {
            setIsPlaying(true);
            setMediaReady(true);
            setStatusBannerVisible(false);
            void requestAppFullscreen(videoRef.current || playerRootRef.current);
          }}
          onPause={() => setIsPlaying(false)}
          onLoadedMetadata={(event) => {
            if (resumeAt > 0 && event.currentTarget.currentTime < 1) {
              event.currentTarget.currentTime = resumeAt;
              setCurrentTime(resumeAt);
            }
          }}
          onTimeUpdate={(event) => {
            const current = event.currentTarget.currentTime;
            const duration = event.currentTarget.duration;
            setCurrentTime(current);

            if (duration > 0 && current / duration >= 0.92 && !completionHandledRef.current) {
              completionHandledRef.current = true;
              onComplete?.();
            }
            if (current - progressSyncRef.current >= 5) {
              progressSyncRef.current = current;
              onProgress?.(current, event.currentTarget.duration);
              if (accountId && cleanId) {
                void (async () => {
                  try {
                    const result = await upsertPlaybackProgress({ user_id: accountId, profile_id: activeProfileId, movie_id: Number(cleanId), progress: current, duration: duration || 0, updated_at: new Date().toISOString() });
                    if (!result.ok) saveResumeTime(current);
                  } catch {
                    saveResumeTime(current);
                  }
                })();
              }
            }
          }}
        />}
        {activeSrc && !isNativeSource && <iframe
          key={currentServerIndex}
          src={activeSrc}
          className="relative z-30 block h-screen w-screen border-0 bg-transparent opacity-100"
          style={{ transform: "translateZ(0)", backfaceVisibility: "hidden" }}
          referrerPolicy="no-referrer"
          title={title}
          onLoad={handleIframeLoad}
          onError={handleIframeError}
        />}
        {seekFeedback !== null && (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 flex justify-center text-2xl font-semibold text-white">
            <span className="rounded-full bg-black/70 px-4 py-2">{seekFeedback > 0 ? `+${seekFeedback}s` : `${seekFeedback}s`}</span>
          </div>
        )}
      </div>
    </div>
  );
}
