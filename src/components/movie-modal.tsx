"use client";

import { useEffect } from "react";
import type { MovieItem } from "@/types";
import Image from "next/image";
import { Download, Play, X } from "lucide-react";
import { MyListButton } from "./my-list-button";
import { isTV, isPro } from "@/lib/variant";
import { useRouter } from "next/navigation";
import { prefetchStreamSources } from "@/lib/stream";
import { downloadProMedia } from "@/lib/offline-download";
import { requestAppFullscreen } from "@/lib/device/device-context";

interface MovieModalProps {
  item: MovieItem | null;
  onClose: () => void;
}

export function MovieModal({ item, onClose }: MovieModalProps) {
  const router = useRouter();

  useEffect(() => {
    if (!item) return;
    void prefetchStreamSources(String(item.id), item.mediaType === "tv" ? "tv" : "movie");
  }, [item]);

  if (!item) return null;

  const handlePlay = () => {
    void requestAppFullscreen(document.documentElement);
    const orientation = screen.orientation as ScreenOrientation & { lock?: (orientation: string) => Promise<void> };
    if (typeof orientation?.lock === "function") void orientation.lock("landscape").catch(() => undefined);
    router.push(`/watch/?id=${item.id}&type=${item.mediaType}&title=${encodeURIComponent(item.title)}`);
  };

  const handleDownload = async () => {
    if (!isPro || !item) return;
    const bestUrl = `https://vidsrc.pro/embed/movie/${encodeURIComponent(String(item.id))}`;
    await downloadProMedia(bestUrl, item.title);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-2 hover:bg-black focus:outline-none focus:ring-2 focus:ring-yellow-400"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="relative aspect-video w-full bg-zinc-800">
          {item.backdropPath || item.posterPath ? (
            <Image
              src={item.backdropPath || item.posterPath!}
              alt={item.title}
              fill
              className="object-cover"
              unoptimized
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-transparent" />
        </div>

        <div className="p-6 space-y-4">
          <h2 className="text-2xl font-bold">{item.title}</h2>
          <p className="text-sm text-zinc-400">
            {item.releaseDate?.slice(0, 4)} · ★ {item.voteAverage.toFixed(1)}
          </p>
          <p className="text-zinc-300 leading-relaxed">{item.overview}</p>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handlePlay}
              className={`flex items-center gap-2 rounded bg-yellow-400 px-6 py-2.5 font-semibold text-black hover:bg-yellow-300 ${isTV ? "focus:outline-none " + "focus:ring-4 focus:ring-yellow-400" : "focus:outline-none focus:ring-2 focus:ring-yellow-400"}`}
            >
              <Play className="h-5 w-5 fill-black" />
              Play
            </button>
            {isPro && (
              <button
                type="button"
                onClick={() => void handleDownload()}
                className="flex items-center gap-2 rounded border border-cyan-500 bg-cyan-500/10 px-6 py-2.5 font-semibold text-cyan-200 hover:bg-cyan-500/20 focus:outline-none focus:ring-2 focus:ring-cyan-400"
              >
                <Download className="h-5 w-5" />
                Download
              </button>
            )}
            <MyListButton item={item} />
          </div>
        </div>
      </div>
    </div>
  );
}
