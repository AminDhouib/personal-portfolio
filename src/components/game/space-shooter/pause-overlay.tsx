import { motion, AnimatePresence } from "framer-motion";
import type { UiState } from "./ui-state";

export function PauseOverlay({ ui, togglePause }: { ui: UiState; togglePause: () => void }) {
  return (
    <AnimatePresence>
      {ui.status === "paused" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={togglePause}
          className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-3 bg-black/50 backdrop-blur-[2px]"
        >
          <div className="text-xs font-bold tracking-[0.3em] text-white/60 uppercase">Paused</div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={(e) => {
              // The overlay behind this button resumes too — don't let the
              // same click reach it and toggle twice.
              e.stopPropagation();
              togglePause();
            }}
            className="rounded-xl border border-white/20 bg-white/10 px-6 py-2.5 text-sm font-semibold text-white backdrop-blur-md"
          >
            Resume
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
