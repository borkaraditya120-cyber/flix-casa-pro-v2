"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useProfileStore } from "@/stores/profile-store";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Settings, LogOut, Home, Film, Tv, Sparkles, Search, User, Trophy, LayoutGrid } from "lucide-react";
import { useDeviceType } from "@/hooks/use-device-type";

interface AppShellProps {
  children: ReactNode;
  showNav?: boolean;
}

const dockItems = [
  { href: "/browse", label: "Home", icon: Home },
  { href: "/browse?tab=search", label: "Search", icon: Search },
  { href: "/browse?tab=movies", label: "Movies", icon: Film },
  { href: "/browse?tab=tv", label: "Web Series", icon: Tv },
  { href: "/browse?tab=anime", label: "Anime", icon: Sparkles },
  { href: "/settings", label: "Profile", icon: User },
];

const tvItems = [
  { href: "/browse", label: "Home", icon: Home },
  { href: "/browse?tab=search", label: "Search", icon: Search },
  { href: "/browse?tab=movies", label: "Movies", icon: Film },
  { href: "/browse?tab=tv", label: "Web Series", icon: Tv },
  { href: "/browse?tab=sports", label: "Sports", icon: Trophy },
  { href: "/browse?tab=categories", label: "Categories", icon: LayoutGrid },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children, showNav = true }: AppShellProps) {
  const router = useRouter();
  const device = useDeviceType();
  const isLoading = useAuthStore((s) => s.isLoading);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const activeProfile = useProfileStore((s) => s.activeProfile);
  const [tvExpanded, setTvExpanded] = useState(false);
  const tvExpandedRef = useRef(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    if (!device.isTV) return;
    const handleRemote = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(event.key)) {
        tvExpandedRef.current = true;
        setTvExpanded(true);
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        const target = event.target;
        if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
        const focusable = Array.from(document.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), [tabindex]:not([tabindex="-1"])'))
          .filter((element) => element.getClientRects().length > 0);
        const active = document.activeElement as HTMLElement | null;
        if (!active || !focusable.includes(active)) {
          event.preventDefault();
          focusable[0]?.focus();
          return;
        }
        const current = active.getBoundingClientRect();
        const currentX = current.left + current.width / 2;
        const currentY = current.top + current.height / 2;
        const direction = event.key;
        const candidates = focusable.filter((element) => element !== active).map((element) => {
          const rect = element.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;
          const primary = direction === "ArrowRight" ? x - currentX : direction === "ArrowLeft" ? currentX - x : direction === "ArrowDown" ? y - currentY : currentY - y;
          const secondary = direction === "ArrowRight" || direction === "ArrowLeft" ? Math.abs(y - currentY) : Math.abs(x - currentX);
          return { element, primary, secondary };
        }).filter((candidate) => candidate.primary > 0).sort((left, right) => left.primary + left.secondary * 1.4 - (right.primary + right.secondary * 1.4));
        if (candidates[0]) {
          event.preventDefault();
          candidates[0].element.focus();
        }
      }
      if (event.key === "Escape" || event.key === "BrowserBack" || event.key === "GoBack") {
        if (tvExpandedRef.current) {
          tvExpandedRef.current = false;
          setTvExpanded(false);
        } else {
          router.back();
        }
      }
    };
    window.addEventListener("keydown", handleRemote);
    return () => window.removeEventListener("keydown", handleRemote);
  }, [device.isTV, router]);

  if (isLoading && !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-4">
          <div className="h-14 w-14 animate-spin rounded-full border-4 border-yellow-400 border-t-transparent" />
          <p className="text-zinc-400">Loading FlixCasa Pro...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#0b0c10] text-white">
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-white/[0.06] bg-[#08090c]/75 px-4 backdrop-blur-xl md:px-8">
        <Link href="/browse" className="flex items-center gap-2 font-black tracking-tight text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#e50914]">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#e50914] to-[#7f0710] text-lg shadow-[0_0_24px_rgba(229,9,20,.32)]">F</span>
          <span className="text-lg">FlixCasa</span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <button onClick={() => setSearchOpen((open) => !open)} className="rounded-full border border-white/10 bg-white/[0.05] p-2.5 text-white/80 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#e50914]" aria-label="Open search"><Search className="h-4 w-4" /></button>
          <select aria-label="Browse categories" defaultValue="" onChange={(event) => { if (event.target.value) router.push(event.target.value); }} className="hidden max-w-36 rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs text-white/80 sm:block">
            <option value="" className="bg-[#0b0c10]">Discover</option>
            <option value="/browse?tab=movies" className="bg-[#0b0c10]">Movies</option>
            <option value="/browse?tab=tv" className="bg-[#0b0c10]">TV Shows</option>
            <option value="/browse?tab=anime" className="bg-[#0b0c10]">Anime</option>
            <option value="/browse?tab=sports" className="bg-[#0b0c10]">Sports</option>
          </select>
          <Link href="/settings" className="grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-white/15 bg-gradient-to-br from-[#e50914] to-[#69060d] text-xs font-bold text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#e50914]" aria-label="Account settings">
            {activeProfile?.avatar ? <span>{activeProfile.avatar}</span> : <User className="h-4 w-4" />}
          </Link>
        </div>
        <AnimatePresence>
          {searchOpen && <motion.form initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} onSubmit={(event) => { event.preventDefault(); router.push(`/browse?tab=search&q=${encodeURIComponent(searchText.trim())}`); setSearchOpen(false); }} className="absolute right-4 top-[4.5rem] flex w-[min(88vw,420px)] items-center gap-2 rounded-2xl border border-white/10 bg-[#101116]/95 p-2 shadow-2xl backdrop-blur-xl md:right-8">
            <Search className="ml-2 h-4 w-4 text-white/50" />
            <input autoFocus value={searchText} onChange={(event) => setSearchText(event.target.value)} aria-label="Search titles" placeholder="Search movies, series, anime" className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-white/35" />
            <button className="rounded-xl bg-[#e50914] px-3 py-2 text-xs font-bold">Search</button>
          </motion.form>}
        </AnimatePresence>
      </header>

      {showNav && isAuthenticated && activeProfile && device.isTV && <motion.aside initial={false} animate={{ width: tvExpanded ? 248 : 76 }} transition={{ type: "spring", stiffness: 300, damping: 25 }} onMouseEnter={() => { tvExpandedRef.current = true; setTvExpanded(true); }} onMouseLeave={() => { tvExpandedRef.current = false; setTvExpanded(false); }} onFocusCapture={() => { tvExpandedRef.current = true; setTvExpanded(true); }} className="fixed left-0 top-0 z-50 flex h-full flex-col gap-2 border-r border-white/10 bg-black/60 px-3 pb-6 pt-24 backdrop-blur-2xl">
        {tvItems.map(({ href, label, icon: Icon }, index) => <Link key={href} href={href} className="flex h-12 shrink-0 items-center gap-4 rounded-xl px-3 text-white/75 transition-colors hover:bg-white/10 hover:text-white focus-visible:scale-[1.03] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#e50914]">
          <Icon className="h-5 w-5 shrink-0" />
          <AnimatePresence initial={false}>{tvExpanded && <motion.span key={`tv-label-${label}`} initial={{ opacity: 0, x: -10, width: 0 }} animate={{ opacity: 1, x: 0, width: "auto" }} exit={{ opacity: 0, x: -8, width: 0 }} transition={{ type: "spring", stiffness: 300, damping: 25, delay: index * 0.025 }} className="overflow-hidden whitespace-nowrap text-sm font-semibold">{label}</motion.span>}</AnimatePresence>
        </Link>)}
        <div className="mt-auto border-t border-white/10 pt-4">
          <p className={`truncate px-3 text-xs text-white/55 ${tvExpanded ? "block" : "hidden"}`}>{activeProfile.name}</p>
          <button onClick={() => void logout()} className="mt-2 flex h-11 w-full items-center gap-4 rounded-xl px-3 text-white/65 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#e50914]" aria-label="Sign out"><LogOut className="h-5 w-5 shrink-0" />{tvExpanded && <span className="text-sm">Sign out</span>}</button>
        </div>
      </motion.aside>}

      {showNav && isAuthenticated && activeProfile && !device.isTV && <motion.nav initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 24, delay: 0.12 }} className="fixed bottom-5 left-1/2 z-50 flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-full border border-white/10 bg-black/40 px-3 py-2 shadow-2xl backdrop-blur-xl sm:bottom-6 sm:gap-2 sm:px-6 sm:py-3">
        {dockItems.map(({ href, label, icon: Icon }) => <motion.div key={href} whileHover={{ scale: 1.1, y: -2 }} whileFocus={{ scale: 1.1, y: -2 }} className="group relative">
          <Link href={href} aria-label={label} className="grid h-11 w-11 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#e50914] sm:h-12 sm:w-12"><Icon className="h-5 w-5" /></Link>
          <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-black/85 px-2.5 py-1.5 text-[11px] font-semibold text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">{label}</span>
        </motion.div>)}
      </motion.nav>}

      <main className={`min-h-screen pt-16 ${showNav && isAuthenticated && activeProfile ? (device.isTV ? "pl-[76px] pb-8" : "pb-24") : ""}`}>{children}</main>
    </div>
  );
}
