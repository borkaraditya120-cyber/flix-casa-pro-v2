import { NextRequest, NextResponse } from "next/server";
import { getMongoDb } from "@/lib/mongodb";

interface StreamLinkDoc {
  _id?: string;
  movieId?: string | number;
  url?: string;
  backupUrls?: string[];
  status?: string;
  updatedAt?: string;
}

async function verifyLink(url: string, timeoutMs = 3500): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (!url) {
    return { ok: false, error: "Empty stream URL" };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { method: "HEAD", cache: "no-store", redirect: "follow", signal: controller.signal });
    clearTimeout(timer);
    return {
      ok: response.ok,
      status: response.status,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Verification failed",
    };
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const movieId = searchParams.get("movieId");

  if (!movieId) {
    return NextResponse.json({ ok: false, error: "movieId is required" }, { status: 400 });
  }

  const db = await getMongoDb();
  if (!db) {
    return NextResponse.json({ ok: false, error: "MongoDB not configured" }, { status: 500 });
  }

  try {
    const collection = db.collection<StreamLinkDoc>("stream_links");
    const doc = await collection.findOne({ movieId: String(movieId) });

    if (!doc?.url) {
      return NextResponse.json({ ok: false, error: "No stream link found" }, { status: 404 });
    }

    const primaryCheck = await verifyLink(doc.url);
    if (primaryCheck.ok) {
      return NextResponse.json({ ok: true, primaryUrl: doc.url, fallbackUrl: doc.backupUrls?.[0] ?? null, source: "primary" });
    }

    const fallbackUrl = doc.backupUrls?.find((value: string) => Boolean(value) && value !== doc.url) ?? null;
    if (fallbackUrl) {
      const fallbackCheck = await verifyLink(fallbackUrl);
      if (fallbackCheck.ok) {
        await collection.updateOne({ _id: doc._id }, { $set: { url: fallbackUrl, status: "fallback", updatedAt: new Date().toISOString() } });
        return NextResponse.json({ ok: true, primaryUrl: fallbackUrl, fallbackUrl: doc.url, source: "fallback" });
      }
    }

    return NextResponse.json({ ok: false, error: primaryCheck.error || "Stream unavailable", primaryUrl: doc.url, fallbackUrl: null }, { status: 502 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown resolution failure";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
