import { supabase } from "@/lib/supabase";

export interface PlaybackSyncEntry {
  user_id: string;
  profile_id?: string | null;
  movie_id: number;
  media_type?: "movie" | "tv";
  progress: number;
  duration: number;
  updated_at: string;
}

export async function upsertPlaybackProgress(entry: PlaybackSyncEntry) {
  if (!supabase) {
    return { ok: false, reason: "supabase-missing-config" };
  }

  const { error } = await supabase.from("watch_history").upsert(
    {
      user_id: entry.user_id,
      profile_id: entry.profile_id ?? null,
      movie_id: Number(entry.movie_id),
      media_type: entry.media_type ?? "movie",
      progress: Number(entry.progress || 0),
      duration: Number(entry.duration || 0),
      updated_at: entry.updated_at || new Date().toISOString(),
    },
    { onConflict: "user_id,profile_id,movie_id" }
  );

  if (error) {
    throw new Error(`Supabase playback sync failed: ${error.message}`);
  }

  return { ok: true };
}

export async function getPlaybackProgress(userId: string, profileId?: string | null, movieId?: number) {
  if (!supabase) {
    return null;
  }

  let query = supabase.from("watch_history").select("*").eq("user_id", userId);

  if (profileId) {
    query = query.eq("profile_id", profileId);
  }

  if (movieId) {
    query = query.eq("movie_id", movieId);
  }

  const { data, error } = await query.order("updated_at", { ascending: false }).limit(1);
  if (error) return null;
  return data?.[0] ?? null;
}
