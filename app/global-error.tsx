"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0b0c10] text-white">
        <main className="flex min-h-screen items-center justify-center p-6">
          <section className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-7 text-center shadow-2xl">
            <h1 className="text-2xl font-bold">FlixCasa needs a refresh</h1>
            <p className="mt-3 text-sm text-white/65">A temporary app error occurred. Reload this screen to continue.</p>
            <button onClick={reset} className="mt-6 rounded-lg bg-[#e50914] px-4 py-2.5 text-sm font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white">Reload screen</button>
          </section>
        </main>
      </body>
    </html>
  );
}
