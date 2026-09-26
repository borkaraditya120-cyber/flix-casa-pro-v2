"use client";

import { create } from "zustand";
import type { GoogleAccount, UserSettings } from "@/types";
import { cloudApi } from "@/lib/cloud-api";
import { getEncryptedItem, setEncryptedItem } from "@/lib/storage";
import { supabase } from "@/lib/supabase";

interface AuthState {
  account: GoogleAccount | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setAccount: (account: GoogleAccount | null) => void;
  setLoading: (loading: boolean) => void;
  login: (email: string, name: string, picture?: string, password?: string, mode?: "login" | "signup") => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  account: null,
  isLoading: true,
  isAuthenticated: false,

  setAccount: (account) => set({ account, isAuthenticated: !!account }),
  setLoading: (isLoading) => set({ isLoading }),

  login: async (email, name, picture, password = "", mode = "login") => {
    const res = await fetch(cloudApi("/api/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, name, picture, password, mode }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");
    const account: GoogleAccount = data.account;
    if (supabase) {
      if (mode === "signup") {
        await supabase.auth.signUp({ email, password, options: { data: { name: account.name, picture: account.picture } } }).catch(() => undefined);
      } else {
        await supabase.auth.signInWithPassword({ email, password }).catch(() => undefined);
      }
    }
    await setEncryptedItem("session", account, account.id);
    window.localStorage.setItem("FLIXCASA_ACCOUNT_ID", account.id);
    set({ account, isAuthenticated: true, isLoading: false });
  },

  logout: async () => {
    const { account } = get();
    await fetch(cloudApi("/api/auth/logout"), { method: "POST", credentials: "include" });
    if (supabase) await supabase.auth.signOut().catch(() => undefined);
    if (account) {
      const { removeEncryptedItem } = await import("@/lib/storage");
      removeEncryptedItem("session", account.id);
    }
    set({ account: null, isAuthenticated: false, isLoading: false });
    window.localStorage.removeItem("FLIXCASA_USER_SESSION");
    window.localStorage.removeItem("FLIXCASA_SESSION");
    window.localStorage.removeItem("FLIXCASA_PERSISTENT_USER_SESSION");
    window.localStorage.removeItem("FLIXCASA_ACCOUNT_ID");
  },

  hydrate: async () => {
    let cachedAccount: GoogleAccount | null = null;
    try {
      const accountId = window.localStorage.getItem("FLIXCASA_ACCOUNT_ID");
      if (accountId) cachedAccount = await getEncryptedItem<GoogleAccount>("session", accountId);
      const legacyAccount = window.localStorage.getItem("FLIXCASA_USER_SESSION");
      if (!cachedAccount && legacyAccount) cachedAccount = JSON.parse(legacyAccount) as GoogleAccount;
    } catch {
      cachedAccount = null;
    }

    if (cachedAccount) {
      set({ account: cachedAccount, isAuthenticated: true, isLoading: false });
      void (async () => {
        try {
          const response = await fetch(cloudApi("/api/auth/session"), { credentials: "include", cache: "no-store" });
          if (response.ok) {
            const data = await response.json();
            set({ account: data.account, isAuthenticated: true });
            await setEncryptedItem("session", data.account, data.account.id);
          } else if (response.status === 401 || response.status === 403) {
            const { removeEncryptedItem } = await import("@/lib/storage");
            removeEncryptedItem("session", cachedAccount!.id);
            set({ account: null, isAuthenticated: false });
          }
        } catch {
          // Keep the encrypted snapshot during transient network outages.
        }
      })();
      return;
    }

    set({ account: null, isAuthenticated: false, isLoading: false });
  },
}));

export const useSettingsStore = create<{
  settings: UserSettings;
  updateSettings: (partial: Partial<UserSettings>) => void;
  hydrate: (accountId: string) => Promise<void>;
  persist: (accountId: string) => Promise<void>;
}>((set, get) => ({
  settings: { theme: "dark", audioPriority: "auto", qualityPreference: "auto", autoPlayNext: true, autoSelectServer: true },

  updateSettings: (partial) => {
    set((s) => ({ settings: { ...s.settings, ...partial } }));
  },

  hydrate: async (accountId) => {
    const stored = await getEncryptedItem<UserSettings>("settings", accountId);
    if (stored) set({ settings: stored });
  },

  persist: async (accountId) => {
    await setEncryptedItem("settings", get().settings, accountId);
  },
}));
