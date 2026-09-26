"use client";

import { create } from "zustand";
import type { GoogleAccount, UserSettings } from "@/types";
import { cloudApi } from "@/lib/cloud-api";
import { getEncryptedItem, setEncryptedItem } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { readSafeApiResponse } from "@/lib/safe-api-response";

interface LocalAccountRecord {
  account: GoogleAccount;
  salt: string;
  passwordHash: string;
}

interface LoginResponse {
  account?: GoogleAccount;
  error?: string;
}

const LOCAL_ACCOUNTS_KEY = "flixcasa_local_accounts_v1";
const LOCAL_AUTH_MODE_KEY = "FLIXCASA_AUTH_MODE";

async function hashLocalPassword(password: string, salt: string) {
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const digest = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: encoder.encode(salt), iterations: 210_000, hash: "SHA-256" }, material, 256);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readLocalAccounts(): LocalAccountRecord[] {
  try {
    const data = window.localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    const parsed: unknown = data ? JSON.parse(data) : [];
    return Array.isArray(parsed) ? parsed as LocalAccountRecord[] : [];
  } catch {
    return [];
  }
}

async function establishLocalSession(email: string, name: string, password: string, mode: "login" | "signup", set: (state: Partial<AuthState>) => void) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || password.length < 8) {
    throw new Error("Enter a valid email and a password with at least 8 characters.");
  }

  const accounts = readLocalAccounts();
  let record = accounts.find((entry) => entry.account.email.toLowerCase() === normalizedEmail);
  if (mode === "signup") {
    if (record) throw new Error("An account with this email already exists on this device. Log in instead.");
    const salt = crypto.randomUUID();
    const account: GoogleAccount = {
      id: `local-${crypto.randomUUID()}`,
      email: normalizedEmail,
      name: name.trim() || normalizedEmail.split("@")[0],
      isOnline: true,
      lastSeen: new Date().toISOString(),
      isBlocked: false,
      isRootAdmin: false,
    };
    record = { account, salt, passwordHash: await hashLocalPassword(password, salt) };
    accounts.push(record);
    try {
      window.localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
    } catch {
      throw new Error("This device cannot save a local account. Enable app storage and try again.");
    }
  } else {
    if (!record) throw new Error("No local account was found. Create an account on this device or reconnect to the service.");
    const passwordHash = await hashLocalPassword(password, record.salt);
    if (passwordHash !== record.passwordHash) throw new Error("Email or password is incorrect.");
  }

  const account = { ...record.account, isOnline: true, lastSeen: new Date().toISOString() };
  try {
    window.localStorage.setItem(LOCAL_AUTH_MODE_KEY, "local");
    window.localStorage.setItem("FLIXCASA_ACCOUNT_ID", account.id);
    window.localStorage.setItem("FLIXCASA_USER_SESSION", JSON.stringify(account));
    await setEncryptedItem("session", account, account.id).catch(() => undefined);
  } catch {
    throw new Error("This device cannot save a local session. Enable app storage and try again.");
  }
  set({
    account,
    isAuthenticated: true,
    isLoading: false,
    authMode: "local",
    authNotice: mode === "signup" ? "Account created successfully on this device (local demo mode)." : "Signed in with this device's local demo account.",
  });
}

interface AuthState {
  account: GoogleAccount | null;
  authMode: "server" | "local" | null;
  authNotice: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setAccount: (account: GoogleAccount | null) => void;
  setLoading: (loading: boolean) => void;
  clearAuthNotice: () => void;
  login: (email: string, name: string, picture?: string, password?: string, mode?: "login" | "signup") => Promise<"server" | "local">;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  account: null,
  authMode: null,
  authNotice: null,
  isLoading: true,
  isAuthenticated: false,

  setAccount: (account) => set({ account, isAuthenticated: !!account }),
  setLoading: (isLoading) => set({ isLoading }),
  clearAuthNotice: () => set({ authNotice: null }),

  login: async (email, name, picture, password = "", mode = "login") => {
    let shouldUseLocalFallback = false;
    try {
      const response = await fetch(cloudApi("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, name, picture, password, mode }),
      });
      const parsed = await readSafeApiResponse<LoginResponse>(response);
      if (response.status === 403) throw new Error("This account is blocked. Contact support.");
      if (response.status === 404 || response.status === 405 || response.status === 501 || response.status >= 500) {
        shouldUseLocalFallback = true;
      } else if (!parsed.isJson || !parsed.data) {
        shouldUseLocalFallback = response.ok;
        if (!shouldUseLocalFallback) throw new Error("The authentication service returned an invalid response. Please try again.");
      } else if (response.ok && parsed.data.account) {
        const account = parsed.data.account;
        if (supabase) {
          if (mode === "signup") {
            await supabase.auth.signUp({ email, password, options: { data: { name: account.name, picture: account.picture } } }).catch(() => undefined);
          } else {
            await supabase.auth.signInWithPassword({ email, password }).catch(() => undefined);
          }
        }
        await setEncryptedItem("session", account, account.id);
        window.localStorage.setItem("FLIXCASA_ACCOUNT_ID", account.id);
        window.localStorage.setItem(LOCAL_AUTH_MODE_KEY, "server");
        window.localStorage.removeItem("FLIXCASA_USER_SESSION");
        set({
          account,
          isAuthenticated: true,
          isLoading: false,
          authMode: "server",
          authNotice: mode === "signup" ? "Account created successfully." : "Signed in successfully.",
        });
        return "server";
      } else if (response.status >= 500) {
        shouldUseLocalFallback = true;
      } else {
        throw new Error(parsed.data.error || (response.status === 401 ? "Invalid credentials." : "Unable to authenticate. Please try again."));
      }
    } catch (error) {
      if (error instanceof TypeError) shouldUseLocalFallback = true;
      else if (!shouldUseLocalFallback) throw error;
    }

    if (shouldUseLocalFallback || typeof navigator !== "undefined" && !navigator.onLine) {
      await establishLocalSession(email, name, password, mode, set);
      return "local";
    }
    throw new Error("Authentication is temporarily unavailable. Please try again.");
  },

  logout: async () => {
    const { account } = get();
    try {
      await fetch(cloudApi("/api/auth/logout"), { method: "POST", credentials: "include" });
    } catch {
      // Local logout must still complete while offline.
    }
    if (supabase) await supabase.auth.signOut().catch(() => undefined);
    if (account) {
      const { removeEncryptedItem } = await import("@/lib/storage");
      removeEncryptedItem("session", account.id);
    }
    set({ account: null, isAuthenticated: false, isLoading: false, authMode: null, authNotice: null });
    window.localStorage.removeItem("FLIXCASA_USER_SESSION");
    window.localStorage.removeItem("FLIXCASA_SESSION");
    window.localStorage.removeItem("FLIXCASA_PERSISTENT_USER_SESSION");
    window.localStorage.removeItem("FLIXCASA_ACCOUNT_ID");
    window.localStorage.removeItem(LOCAL_AUTH_MODE_KEY);
  },

  hydrate: async () => {
    let cachedAccount: GoogleAccount | null = null;
    try {
      const localMode = window.localStorage.getItem(LOCAL_AUTH_MODE_KEY) === "local";
      const accountId = window.localStorage.getItem("FLIXCASA_ACCOUNT_ID");
      if (accountId) cachedAccount = await getEncryptedItem<GoogleAccount>("session", accountId);
      const legacyAccount = window.localStorage.getItem("FLIXCASA_USER_SESSION");
      if (!cachedAccount && legacyAccount) cachedAccount = JSON.parse(legacyAccount) as GoogleAccount;
      if (cachedAccount && (localMode || cachedAccount.id.startsWith("local-"))) {
        set({ account: cachedAccount, isAuthenticated: true, isLoading: false, authMode: "local" });
        return;
      }
    } catch {
      cachedAccount = null;
    }

    if (cachedAccount) {
      set({ account: cachedAccount, isAuthenticated: true, isLoading: false, authMode: "server" });
      void (async () => {
        try {
          const response = await fetch(cloudApi("/api/auth/session"), { credentials: "include", cache: "no-store" });
          if (response.ok) {
            const data = await response.json();
            set({ account: data.account, isAuthenticated: true, authMode: "server" });
            await setEncryptedItem("session", data.account, data.account.id);
          } else if (response.status === 401 || response.status === 403) {
            const { removeEncryptedItem } = await import("@/lib/storage");
            removeEncryptedItem("session", cachedAccount!.id);
            set({ account: null, isAuthenticated: false, authMode: null });
          }
        } catch {
          // Keep the encrypted snapshot during transient network outages.
        }
      })();
      return;
    }

    set({ account: null, isAuthenticated: false, isLoading: false, authMode: null });
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
