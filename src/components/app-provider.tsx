"use client";

import { useEffect, useCallback, useState, type ReactNode } from "react";
import { useAuthStore, useSettingsStore } from "@/stores/auth-store";
import { useProfileStore } from "@/stores/profile-store";
import { useLibraryStore } from "@/stores/library-store";
import { FlixSplash } from "@/components/flix-splash";
import { ForceUpdateGuard } from "@/components/force-update-guard";
import { useDeviceType } from "@/hooks/use-device-type";
import { updatePresence } from "@/lib/cloud-sync";
import UpdateChecker from "@/components/UpdateChecker";
import { StandardAdScript } from "@/components/standard-ad-script";
import { usePathname, useRouter } from "next/navigation";

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  useDeviceType();
  const router = useRouter();
  const pathname = usePathname();
  const [initialized, setInitialized] = useState(false);
  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const setAuthLoading = useAuthStore((s) => s.setLoading);
  const account = useAuthStore((s) => s.account);
  const hydrateProfiles = useProfileStore((s) => s.hydrate);
  const setActiveProfile = useProfileStore((s) => s.setActiveProfile);
  const hydrateLibrary = useLibraryStore((s) => s.hydrate);
  const resetLibrary = useLibraryStore((s) => s.reset);
  const resetProfiles = useProfileStore((s) => s.reset);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);

  const initialize = useCallback(async () => {
    setAuthLoading(true);
    try {
      await hydrateAuth();
      const currentAccount = useAuthStore.getState().account;
      if (currentAccount) {
        await Promise.all([
          hydrateProfiles(currentAccount.id),
          hydrateLibrary(currentAccount.id),
          hydrateSettings(currentAccount.id),
        ]);
      } else {
        setActiveProfile(null);
      }
    } catch {
      setActiveProfile(null);
    } finally {
      setAuthLoading(false);
      setInitialized(true);
    }
  }, [hydrateAuth, hydrateProfiles, hydrateLibrary, hydrateSettings, setActiveProfile, setAuthLoading]);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (!account) {
      setActiveProfile(null);
      resetLibrary();
      resetProfiles();
      return;
    }

    void Promise.all([
      hydrateProfiles(account.id),
      hydrateLibrary(account.id),
      hydrateSettings(account.id),
    ]);
  }, [account, hydrateProfiles, hydrateLibrary, hydrateSettings, resetLibrary, resetProfiles, setActiveProfile]);

  useEffect(() => {
    if (!account) return;
    void updatePresence(account.id, true);
    const heartbeat = window.setInterval(() => void updatePresence(account.id, true), 30_000);
    const markOffline = () => void updatePresence(account.id, false);
    window.addEventListener("pagehide", markOffline);
    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener("pagehide", markOffline);
      markOffline();
    };
  }, [account]);

  useEffect(() => {
    const handleRemoteBack = (event: KeyboardEvent) => {
      if (!(event.key === "BrowserBack" || event.key === "GoBack" || event.keyCode === 4)) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if (pathname === "/" || pathname === "/browse") return;
      event.preventDefault();
      router.back();
    };
    window.addEventListener("keydown", handleRemoteBack);
    return () => window.removeEventListener("keydown", handleRemoteBack);
  }, [pathname, router]);

  return (
    <ForceUpdateGuard>
      {children}
      <UpdateChecker />
      <StandardAdScript />
      <FlixSplash appReady={initialized} />
    </ForceUpdateGuard>
  );
}
