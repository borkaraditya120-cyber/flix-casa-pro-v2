"use client";

import { create } from "zustand";
import type { Profile } from "@/types";
import { getEncryptedItem, setEncryptedItem } from "@/lib/storage";
import { getSyncedCollections, syncCollection } from "@/lib/cloud-sync";

const KIDS_AVATAR = "🧒";
const DEFAULT_AVATARS = ["🎬", "🎭", "🌟", "🎪", "🦁", "🐻", "🦊", "🐼"];

interface ProfileState {
  profiles: Profile[];
  activeProfile: Profile | null;
  isLoading: boolean;
  hydrate: (accountId: string) => Promise<void>;
  reset: () => void;
  setActiveProfile: (profile: Profile | null) => void;
  addProfile: (accountId: string, name: string, avatar?: string, contentRating?: Profile["contentRating"]) => Promise<Profile>;
  updateProfile: (accountId: string, id: string, updates: Partial<Pick<Profile, "name" | "avatar" | "contentRating">>) => Promise<void>;
  deleteProfile: (accountId: string, id: string) => Promise<void>;
  getKidsProfile: (accountId: string) => Profile | undefined;
}

function createKidsProfile(accountId: string): Profile {
  return {
    id: `kids-${accountId}`,
    name: "Kids",
    avatar: KIDS_AVATAR,
    isKids: true,
    accountId,
    createdAt: new Date().toISOString(),
  };
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profiles: [],
  activeProfile: null,
  isLoading: true,

  reset: () => set({ profiles: [], activeProfile: null, isLoading: true }),

  hydrate: async (accountId) => {
    set({ profiles: [], activeProfile: null, isLoading: true });
    const [stored, synced] = await Promise.all([
      getEncryptedItem<Profile[]>("profiles", accountId),
      getSyncedCollections(accountId),
    ]);
    const kids = createKidsProfile(accountId);
    const existing = ((synced.profiles as Profile[] | undefined) || stored || []).filter(Boolean);
    const hasKids = existing.some((p) => p.isKids);
    const profiles = hasKids ? existing : [kids, ...existing];
    const currentActive = get().activeProfile;
    set({
      profiles,
      activeProfile: currentActive?.accountId === accountId ? currentActive : null,
      isLoading: false,
    });
  },

  setActiveProfile: (profile) => set({ activeProfile: profile }),

  addProfile: async (accountId, name, avatar, contentRating = "all") => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Profile name is required");

    const profile: Profile = {
      id: crypto.randomUUID(),
      name: trimmed,
      avatar: avatar || DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)],
      contentRating,
      isKids: false,
      accountId,
      createdAt: new Date().toISOString(),
    };
    const profiles = [...get().profiles, profile];
    await setEncryptedItem("profiles", profiles, accountId);
    void syncCollection(accountId, "profiles", profiles);
    set({ profiles });
    return profile;
  },

  updateProfile: async (accountId, id, updates) => {
    const profiles = get().profiles.map((p) => (p.id === id && !p.isKids ? { ...p, ...updates } : p));
    await setEncryptedItem("profiles", profiles, accountId);
    void syncCollection(accountId, "profiles", profiles);
    set({ profiles });
    const active = get().activeProfile;
    if (active?.id === id) set({ activeProfile: { ...active, ...updates } });
  },

  deleteProfile: async (accountId, id) => {
    const target = get().profiles.find((p) => p.id === id);
    if (!target || target.isKids) return;

    const profiles = get().profiles.filter((p) => p.id !== id);
    const hasKids = profiles.some((p) => p.isKids);
    const finalProfiles = hasKids ? profiles : [createKidsProfile(accountId), ...profiles];

    await setEncryptedItem("profiles", finalProfiles, accountId);
    void syncCollection(accountId, "profiles", finalProfiles);
    set({ profiles: finalProfiles, activeProfile: get().activeProfile?.id === id ? null : get().activeProfile });
  },

  getKidsProfile: (accountId) => get().profiles.find((p) => p.isKids && p.accountId === accountId),
}));
