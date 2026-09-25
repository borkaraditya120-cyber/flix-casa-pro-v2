import { cloudApi } from "@/lib/cloud-api";
import { supabase } from "@/lib/supabase";

export type SyncCollection = "myList" | "watchHistory" | "profiles";

export async function syncCollection(accountId: string, collection: SyncCollection, value: unknown): Promise<void> {
  if (supabase) {
    try {
      await Promise.resolve(supabase.from("flixcasa_sync").upsert({ account_id: accountId, collection, data: value, updated_at: new Date().toISOString() }, { onConflict: "account_id,collection" }));
    } catch {
      // Continue with the existing API/local fallback.
    }
  }
  try {
    await fetch(cloudApi("/api/sync"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, collection, value }),
    });
  } catch {
    // Local encrypted persistence remains the source of truth when cloud sync is unavailable.
  }
}

export async function getSyncedCollections(accountId: string): Promise<Partial<Record<SyncCollection, unknown>>> {
  if (supabase) {
    try {
      const { data: remoteRows } = await Promise.resolve(supabase.from("flixcasa_sync").select("collection,data").eq("account_id", accountId));
      if (Array.isArray(remoteRows) && remoteRows.length) return Object.fromEntries(remoteRows.map((row) => [row.collection, row.data])) as Partial<Record<SyncCollection, unknown>>;
    } catch {
      // Fall back to the existing API/local persistence path.
    }
  }
  try {
    const response = await fetch(cloudApi(`/api/sync?accountId=${encodeURIComponent(accountId)}`), { credentials: "include", cache: "no-store" });
    return response.ok ? await response.json() as Partial<Record<SyncCollection, unknown>> : {};
  } catch {
    return {};
  }
}

export async function updatePresence(accountId: string, online: boolean): Promise<void> {
  if (supabase) {
    try {
      await Promise.resolve(supabase.from("profiles").upsert({ id: accountId, is_online: online, last_seen: new Date().toISOString() }, { onConflict: "id" }));
    } catch {
      // Continue with the API presence fallback.
    }
  }
  await fetch(cloudApi("/api/sync"), { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId, collection: "presence", value: { isOnline: online, lastSeen: new Date().toISOString() } }) }).catch(() => undefined);
}