"use client";

import { useEffect } from "react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("FlixCasa route failure", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0c10] p-6 text-white">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-7 text-center shadow-2xl">
        <h1 className="text-2xl font-bold">This screen hit a snag</h1>
        <p className="mt-3 text-sm text-white/65">Your playback progress is safe. Retry this screen or return to FlixCasa.</p>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={reset} className="rounded-lg bg-[#e50914] px-4 py-2.5 text-sm font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white">Try again</button>
          <a href="/" className="rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#e50914]">Home</a>
        </div>
      </section>
    </main>
  );
}
