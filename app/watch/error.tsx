"use client";

export default function WatchError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-[80vh] items-center justify-center bg-black p-6 text-white">
      <section className="w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-950 p-7 text-center">
        <h1 className="text-2xl font-bold">Playback could not start</h1>
        <p className="mt-3 text-sm text-zinc-400">The player hit a temporary error. Retry to reconnect to the stream.</p>
        <button onClick={reset} className="mt-6 rounded-lg bg-[#e50914] px-5 py-3 font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white">Retry playback</button>
      </section>
    </main>
  );
}
