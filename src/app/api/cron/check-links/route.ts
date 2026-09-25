import { NextRequest, NextResponse } from "next/server";
import { getMongoDb } from "@/lib/mongodb";

interface StreamLinkDoc {
  _id?: string;
  movieId?: string | number;
  title?: string;
  url?: string;
  backupUrls?: string[];
  status?: string;
  updatedAt?: string;
}

async function verifyLink(url: string, timeoutMs = 4000): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { method: "HEAD", cache: "no-store", signal: controller.signal, redirect: "follow" });
    clearTimeout(timer);
    return {
      ok: response.ok,
      status: response.status,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Link verification failed",
    };
  }
}

async function fetchTelegramBackupStream(): Promise<string | null> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    return null;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?limit=1`, { cache: "no-store" });
    if (!response.ok) return null;

    const data = await response.json();
    const messages = data?.result ?? [];
    const latest = messages.filter((item: any) => item.message?.video || item.message?.document || item.message?.text)?.at(-1);
    const text = latest?.message?.text || latest?.message?.caption || "";

    if (!text) return null;

    const candidates = [text, ...text.match(/https?:\/\/[^\s)>"]+/g) ?? []];
    return candidates.find((value) => value.includes(".m3u8") || value.includes(".mp4") || value.includes(".mkv") || value.includes("stream")) ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const db = await getMongoDb();
  if (!db) {
    return NextResponse.json({ ok: false, error: "MongoDB not configured" }, { status: 500 });
  }

  try {
    const collection = db.collection<StreamLinkDoc>("stream_links");
    const docs = await collection.find({ url: { $exists: true } }).limit(50).toArray();

    const repaired: Array<{ id?: string; url?: string; repairedUrl?: string | null; status: string }> = [];

    for (const doc of docs) {
      const url = doc.url;
      if (!url) continue;

      const status = await verifyLink(url);
      if (status.ok) {
        repaired.push({ id: String(doc._id), url, status: "healthy" });
        continue;
      }

      const backup = doc.backupUrls?.find(Boolean) ?? (await fetchTelegramBackupStream());
      const repairedUrl = backup || null;

      if (repairedUrl) {
        await collection.updateOne(
          { _id: doc._id },
          {
            $set: {
              url: repairedUrl,
              backupUrls: [...new Set([...(doc.backupUrls ?? []), repairedUrl])],
              status: "repaired",
              updatedAt: new Date().toISOString(),
            },
          },
          { upsert: true }
        );
      }

      repaired.push({ id: String(doc._id), url, repairedUrl, status: repairedUrl ? "repaired" : "failed" });
    }

    return NextResponse.json({ ok: true, count: repaired.length, repaired });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown cron failure";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
