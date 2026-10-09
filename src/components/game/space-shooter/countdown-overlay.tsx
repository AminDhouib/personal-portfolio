import { motion } from "framer-motion";

/** The 3-2-1 shows over the armed screen while counting, and nowhere else. */
export function countdownVisible(step: number | null, status: string, panelOpen: boolean): boolean {
  return step !== null && status === "armed" && !panelOpen;
}

export function CountdownOverlay({
  step,
  status,
  panelOpen,
}: {
  step: number | null;
  status: string;
  panelOpen: boolean;
}) {
  if (step === null || !countdownVisible(step, status, panelOpen)) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
      role="status"
      aria-live="assertive"
    >
      <motion.div
        key={step}
        initial={{ opacity: 0, scale: 1.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="font-display text-8xl font-black text-white tabular-nums drop-shadow-lg"
      >
        {step}
      </motion.div>
    </div>
  );
}
