"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { useProfileStore } from "@/stores/profile-store";
import { ProfileCard } from "@/components/profile-card";
import { GoogleLoginButton } from "@/components/google-login-button";
import type { Profile } from "@/types";

export default function WelcomePage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const account = useAuthStore((s) => s.account);
  const authNotice = useAuthStore((s) => s.authNotice);
  const clearAuthNotice = useAuthStore((s) => s.clearAuthNotice);
  const profiles = useProfileStore((s) => s.profiles);
  const setActiveProfile = useProfileStore((s) => s.setActiveProfile);
  const addProfile = useProfileStore((s) => s.addProfile);
  const updateProfile = useProfileStore((s) => s.updateProfile);
  const deleteProfile = useProfileStore((s) => s.deleteProfile);
  const [profileName, setProfileName] = useState("");
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [profileToDelete, setProfileToDelete] = useState<Profile | null>(null);
  const [profileAvatar, setProfileAvatar] = useState("🎬");
  const [profileRating, setProfileRating] = useState<Profile["contentRating"]>("all");

  useEffect(() => {
    if (!isLoading && isAuthenticated && useProfileStore.getState().activeProfile) {
      router.replace("/browse");
    }
  }, [isLoading, isAuthenticated, router]);

  const handleSelect = (profile: Profile) => {
    setActiveProfile(profile);
    router.push("/browse");
  };

  const handleAdd = async () => {
    if (!account) return;
    if (!profileName.trim()) return;
    await addProfile(account.id, profileName.trim(), profileAvatar, profileRating);
    setProfileName("");
    setProfileAvatar("🎬");
    setProfileRating("all");
    setProfileDialogOpen(false);
  };

  const handleEdit = async (profile: Profile, newName: string, contentRating: Profile["contentRating"]) => {
    if (!account) return;
    await updateProfile(account.id, profile.id, { name: newName, contentRating });
  };

  const handleDelete = async (profile: Profile) => {
    setProfileToDelete(profile);
  };

  const confirmDelete = async () => {
    if (!account || !profileToDelete) return;
    await deleteProfile(account.id, profileToDelete.id);
    setProfileToDelete(null);
  };

  const kidsProfile = profiles.find((profile) => profile.isKids) || null;
  const customProfiles = profiles.filter((profile) => !profile.isKids);

  useEffect(() => {
    if (!authNotice) return;
    const timeout = window.setTimeout(clearAuthNotice, 8000);
    return () => window.clearTimeout(timeout);
  }, [authNotice, clearAuthNotice]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-yellow-400 border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4">
        <h1 className="mb-2 text-4xl font-bold text-yellow-400 md:text-5xl">FlixCasa Pro</h1>
        <p className="mb-8 text-zinc-400">Smart Media Streaming for Android TV, mobile, and desktop</p>
        <GoogleLoginButton />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 py-8">
      <h1 className="mb-2 text-3xl font-bold md:text-4xl">Who&apos;s Watching?</h1>
      <p className="mb-10 text-zinc-400">Choose a profile to continue</p>
      {authNotice && <p role="status" className="mb-6 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">{authNotice}</p>}

      <div className="flex flex-wrap items-start justify-center gap-6 md:gap-10">
        {kidsProfile && (
          <ProfileCard
            key={kidsProfile.id}
            profile={kidsProfile}
            onSelect={handleSelect}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        )}
        {customProfiles.map((profile) => (
          <ProfileCard
            key={profile.id}
            profile={profile}
            onSelect={handleSelect}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ))}
        <ProfileCard isAdd onAdd={() => setProfileDialogOpen(true)} profile={{} as Profile} onSelect={() => {}} />
      </div>
      {profileDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" role="dialog" aria-modal="true" aria-labelledby="add-profile-title">
          <form onSubmit={(event) => { event.preventDefault(); void handleAdd(); }} className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
            <h2 id="add-profile-title" className="text-lg font-semibold">Add Profile</h2>
            <input autoFocus required value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="Profile Name" className="mt-4 w-full rounded-lg bg-zinc-950 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-yellow-400" />
            <div className="mt-4 flex flex-wrap gap-2" aria-label="Avatar selector">{["🎬", "🎭", "🌟", "🎪", "🦁", "🐼"].map((avatar) => <button type="button" key={avatar} onClick={() => setProfileAvatar(avatar)} className={`rounded-lg px-3 py-2 text-2xl ${profileAvatar === avatar ? "bg-yellow-400" : "bg-zinc-800"}`} aria-label={`Use ${avatar} avatar`}>{avatar}</button>)}</div>
            <fieldset className="mt-4"><legend className="mb-2 text-sm text-zinc-400">Content Rating</legend><div className="flex flex-wrap gap-2">{(["all", "18+", "16+", "13+", "10+"] as const).map((rating) => <label key={rating} className={`cursor-pointer rounded px-3 py-2 text-xs ${profileRating === rating ? "bg-yellow-400 text-black" : "bg-zinc-800 text-zinc-300"}`}><input type="radio" name="contentRating" value={rating} checked={profileRating === rating} onChange={() => setProfileRating(rating)} className="sr-only" />{rating === "all" ? "All" : rating}</label>)}</div></fieldset>
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setProfileDialogOpen(false)} className="rounded bg-zinc-700 px-4 py-2 text-sm">Cancel</button><button type="submit" className="rounded bg-yellow-400 px-4 py-2 text-sm font-semibold text-black">Add Profile</button></div>
          </form>
        </div>
      )}
      {profileToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" role="dialog" aria-modal="true" aria-labelledby="delete-profile-title">
          <div className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl"><h2 id="delete-profile-title" className="text-lg font-semibold">Delete profile?</h2><p className="mt-2 text-sm text-zinc-400">This will remove {profileToDelete.name} from this device.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setProfileToDelete(null)} className="rounded bg-zinc-700 px-4 py-2 text-sm">Cancel</button><button type="button" onClick={() => void confirmDelete()} className="rounded bg-red-700 px-4 py-2 text-sm font-semibold">Delete</button></div></div>
        </div>
      )}
    </div>
  );
}
