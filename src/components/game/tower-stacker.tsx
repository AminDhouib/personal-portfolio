"use client";

import { Stage } from "./tower-stacker/stage";

/**
 * Tower Stacker: the first-party canvas game. The stage, engine, painter and audio live in
 * `./tower-stacker/`; this entry only forwards the optional `?tower-seed=` text.
 */
export default function TowerStacker({ initialSeed }: { initialSeed?: string } = {}) {
  return (
    <div
      className="relative flex w-full flex-col items-center justify-center gap-2"
      style={{ minHeight: 480 }}
    >
      <Stage seedText={initialSeed} />
    </div>
  );
}
