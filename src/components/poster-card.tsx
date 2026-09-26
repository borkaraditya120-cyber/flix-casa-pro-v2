"use client";

import type { MovieItem } from "@/types";
import Image from "next/image";
import { useState, type FocusEvent, type MouseEvent } from "react";
import { motion } from "framer-motion";

interface PosterCardProps {
  item: MovieItem;
  onClick?: (item: MovieItem) => void;
  onFocusItem?: (item: MovieItem) => void;
  onBlurItem?: (item: MovieItem) => void;
  onHoverItem?: (item: MovieItem) => void;
  onLeaveItem?: (item: MovieItem) => void;
  progress?: number;
  releaseBadge?: string;
  remaining?: string;
}

export function PosterCard({ item, onClick, onFocusItem, onBlurItem, onHoverItem, onLeaveItem, progress, releaseBadge, remaining }: PosterCardProps) {
  const [posterSrc, setPosterSrc] = useState(item.posterPath || "/icon-192.png");

  return (
    <motion.button
      type="button"
      onClick={() => onClick?.(item)}
      onFocus={() => onFocusItem?.(item)}
      onBlur={(event: FocusEvent<HTMLButtonElement>) => { if (!event.currentTarget.contains(event.relatedTarget)) onBlurItem?.(item); }}
      onMouseEnter={() => onHoverItem?.(item)}
      onMouseLeave={(event: MouseEvent<HTMLButtonElement>) => { if (!event.currentTarget.matches(":focus")) onLeaveItem?.(item); }}
      whileHover={{ scale: 1.05, y: -3 }}
      whileFocus={{ scale: 1.05, y: -4 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
      className="group relative block aspect-[2/3] w-full overflow-hidden rounded-xl border border-white/10 bg-[#15161b] text-left shadow-xl focus:outline-none focus:ring-4 focus:ring-[#e50914] focus:z-30"
      aria-label={`Watch ${item.title}`}
    >
      {posterSrc ? (
        <Image
          src={posterSrc}
          alt={item.title}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105 group-focus:scale-105"
          sizes="(max-width: 640px) 40vw, (max-width: 1024px) 22vw, 14vw"
          unoptimized
          onError={() => setPosterSrc("/icon-192.png")}
        />
      ) : (
        <div className="flex h-full items-center justify-center p-2 text-center text-xs text-zinc-500">
          {item.title}
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/5 to-transparent" />
      <div className="absolute left-2 right-2 top-2 flex items-start justify-between gap-2">
        <span className="rounded-md border border-white/15 bg-black/65 px-2 py-1 text-[10px] font-bold text-white backdrop-blur">★ {item.voteAverage.toFixed(1)}</span>
        {releaseBadge && <span className="max-w-[60%] rounded-md bg-[#e50914] px-2 py-1 text-[9px] font-bold text-white">{releaseBadge}</span>}
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-3 text-left">
        <p className="line-clamp-2 text-sm font-bold text-white sm:text-base">{item.title}</p>
        <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-white/65">
          <span>{item.releaseDate?.slice(0, 4) || "New"} · {item.contentRating || "Unrated"}</span>
          {remaining && <span className="truncate">{remaining}</span>}
        </div>
        {typeof progress === "number" && <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/25"><div className="h-full rounded-full bg-[#e50914]" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} /></div>}
      </div>
    </motion.button>
  );
}
