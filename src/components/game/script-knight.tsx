"use client";

import { Stage, type StageProps } from "./script-knight/stage";

/**
 * Script Knight: write JavaScript that walks a knight up a tower. The engine, sandbox, renderer
 * and stage live in `./script-knight/`; this entry only mounts the stage.
 */
export function ScriptKnightGame(props: StageProps = {}) {
  return (
    <div className="w-full" style={{ minHeight: 480 }}>
      <Stage {...props} />
    </div>
  );
}
