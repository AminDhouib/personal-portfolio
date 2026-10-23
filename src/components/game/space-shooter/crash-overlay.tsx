import { RotateCcw } from "lucide-react";

export function CrashOverlay() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-black/70 p-4 backdrop-blur-md">
      <div className="text-center">
        <div className="text-xs font-bold tracking-[0.3em] text-red-400 uppercase">Game Error</div>
        <div className="mt-2 text-sm text-white/70">This game hit an error and stopped.</div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-accent-blue/50 bg-accent-blue/20 px-4 py-2 text-xs font-bold tracking-wider text-accent-blue uppercase sm:px-5 sm:py-2.5 sm:text-sm"
        >
          <RotateCcw className="h-4 w-4" />
          Reload
        </button>
      </div>
    </div>
  );
}
