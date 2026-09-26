export default function Loading() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center bg-[#0b0c10] text-white" aria-live="polite">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#e50914] border-t-transparent" />
        <p className="mt-4 text-sm text-white/65">Loading FlixCasa…</p>
      </div>
    </main>
  );
}
