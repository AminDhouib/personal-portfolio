"use client";

import {
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AbilityList } from "./ability-list";
import { createKnightAudio, type KnightAudio } from "./audio";
import {
  CODE_MAX_CHARS,
  type CodeStore,
  loadCode,
  saveCode,
  setTowerCode,
  TOO_LONG_MESSAGE,
} from "./code-store";
import { EventLog } from "./event-log";
import { FloorView } from "./floor-view";
import { getLevel } from "./engine/core/level";
import { getGradeLetter } from "./engine/scoring";
import { configForRef, createRun } from "./engine/run";
import { TOWER_IDS, type TowerId, TOWERS } from "./engine/towers";
import { LevelPanel } from "./level-panel";
import { buildFrames } from "./playback";
import {
  FLOORS_PER_TOWER,
  isTowerUnlocked,
  loadProgress,
  type Progress,
  recordClear,
  recordEpic,
  saveProgress,
  setAt,
} from "./progress";
import { ResultCard } from "./result-card";
import { type FloorRun, type Runner, startFloorRun, WARRIOR_NAME } from "./run-floor";
import { runInSandbox } from "./sandbox/run-client";
import { CUES, cueFor } from "./sound-cues";
import { STARTER } from "./starter";
import { TextareaEditor, type EditorProps } from "./textarea-editor";
import { Transport } from "./transport";
import { usePlayback } from "./use-playback";

const SAVE_DEBOUNCE_MS = 500;
const BUTTON =
  "rounded-md border border-(--border) px-3 py-1.5 text-sm text-(--foreground) hover:border-[#4ade80] disabled:opacity-40";

export interface StageProps {
  /** The sandbox entry point; a test passes a fake. */
  runner?: Runner;
  /** T7-4 swaps in CodeMirror here with the same props. */
  editor?: ComponentType<EditorProps>;
  /** T7-5: the daily board and submit panel. */
  boardPanel?: ReactNode;
  /** T7-7: the hand-play pad. */
  handPad?: ReactNode;
}

/** True when a key press belongs to a field, so page-wide shortcuts must leave it alone. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName);
}

function floorLabel(tower: TowerId, level: number, epic: boolean): string {
  return `${TOWERS[tower].name}, floor ${level}${epic ? " (epic)" : ""}`;
}

interface EpicSummary {
  grades: number[];
  average: number;
}

function summarizeEpic(runs: readonly FloorRun[]): EpicSummary {
  const grades = runs.map((run) => (run.result.passed ? (run.result.grade ?? 0) : 0));
  const average = grades.reduce((sum, grade) => sum + grade, 0) / Math.max(1, grades.length);
  return { grades, average };
}

export function Stage({
  runner = runInSandbox,
  editor: Editor = TextareaEditor,
  boardPanel,
  handPad,
}: StageProps) {
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [codes, setCodes] = useState<CodeStore>(() => loadCode());
  const [tower, setTower] = useState<TowerId>(() => progress.at.tower);
  const [level, setLevel] = useState(() => progress.at.level);
  const [epic, setEpic] = useState(() => progress.at.epic);
  const [running, setRunning] = useState(false);
  const [floorRun, setFloorRun] = useState<FloorRun | null>(null);
  const [epicRuns, setEpicRuns] = useState<FloorRun[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

  const cancelRef = useRef<(() => void) | null>(null);
  const audioRef = useRef<KnightAudio | null>(null);
  const codesRef = useRef(codes);
  const dirtyRef = useRef(false);

  const code = codes.towers[tower] || STARTER;
  const towerProgress = progress.towers[tower];
  const epicAvailable = towerProgress.best[String(FLOORS_PER_TOWER)] !== undefined;
  const useEpic = epic && epicAvailable;

  const config = useMemo(
    () => configForRef({ kind: "tower", tower, level, epic: useEpic }, WARRIOR_NAME),
    [tower, level, useEpic],
  );
  const info = useMemo(() => getLevel(config), [config]);
  const idleFrames = useMemo(() => buildFrames(config, createRun(config).initial, []), [config]);

  // What the replay shows: the last run on this floor, or the bare floor before any run.
  const shown =
    useEpic && epicRuns
      ? (epicRuns[level - 1] ?? null)
      : floorRun?.ref.level === level
        ? floorRun
        : null;
  const frames = shown?.frames ?? idleFrames;
  const playback = usePlayback(frames);

  useEffect(() => {
    const audio = createKnightAudio();
    audioRef.current = audio;
    setMuted(audio.isMuted());
    return () => {
      audio.close();
      audioRef.current = null;
      cancelRef.current?.();
    };
  }, []);

  // Sound: a cue for each event as it plays, and one for how the replay ends.
  const frameIndex = playback.index;
  const playing = playback.playing;
  useEffect(() => {
    if (!playing) return;
    const cue = cueFor(frames[frameIndex]?.event?.action.type ?? "");
    if (cue) audioRef.current?.play(CUES[cue]);
  }, [playing, frameIndex, frames]);

  // The code is saved 500 ms after the last keystroke, and once more when the page goes away.
  useEffect(() => {
    codesRef.current = codes;
    if (!dirtyRef.current) return;
    const timer = setTimeout(() => {
      saveCode(codes);
      dirtyRef.current = false;
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [codes]);
  useEffect(
    () => () => {
      if (dirtyRef.current) saveCode(codesRef.current);
    },
    [],
  );

  const commitProgress = useCallback((next: Progress) => {
    setProgress(next);
    saveProgress(next);
  }, []);

  const changeCode = useCallback(
    (value: string) => {
      const next = setTowerCode(codes, tower, value);
      if (!next.ok) {
        setNotice(TOO_LONG_MESSAGE);
        return;
      }
      setNotice(null);
      dirtyRef.current = true;
      setCodes(next.store);
    },
    [codes, tower],
  );

  const goTo = useCallback(
    (nextTower: TowerId, nextLevel: number, nextEpic: boolean) => {
      cancelRef.current?.();
      setRunning(false);
      setTower(nextTower);
      setLevel(nextLevel);
      setEpic(nextEpic);
      setFloorRun(null);
      setEpicRuns(null);
      setNotice(null);
      commitProgress(setAt(progress, { tower: nextTower, level: nextLevel, epic: nextEpic }));
    },
    [commitProgress, progress],
  );

  const finishFloor = useCallback(
    (done: FloorRun) => {
      setFloorRun(done);
      if (!done.result.passed || !done.result.score) return;
      const clear = {
        score: done.result.score.total,
        grade: done.result.grade ?? 0,
        turns: done.result.turns,
      };
      commitProgress(recordClear(progress, tower, level, clear));
    },
    [commitProgress, level, progress, tower],
  );

  const runOne = useCallback(async () => {
    const handle = startFloorRun({ kind: "tower", tower, level, epic: useEpic }, code, runner);
    cancelRef.current = handle.cancel;
    const done = await handle.done;
    finishFloor(done);
  }, [code, finishFloor, level, runner, tower, useEpic]);

  const runEpic = useCallback(async () => {
    const runs: FloorRun[] = [];
    for (let floor = 1; floor <= FLOORS_PER_TOWER; floor += 1) {
      const handle = startFloorRun(
        { kind: "tower", tower, level: floor, epic: true },
        code,
        runner,
      );
      cancelRef.current = handle.cancel;
      const done = await handle.done;
      runs.push(done);
      if (done.outcome && done.ranNothing) break;
    }
    setEpicRuns(runs);
    if (runs.length === FLOORS_PER_TOWER) {
      const { grades } = summarizeEpic(runs);
      const score = runs.reduce((sum, run) => sum + (run.result.score?.total ?? 0), 0);
      commitProgress(recordEpic(progress, tower, { score, grades }));
    }
  }, [code, commitProgress, progress, runner, tower]);

  const run = useCallback(async () => {
    if (running) return;
    audioRef.current?.unlock();
    setRunning(true);
    setNotice(null);
    setFloorRun(null);
    setEpicRuns(null);
    try {
      await (useEpic ? runEpic() : runOne());
    } catch (error) {
      // silent-ok: shown to the player in the notice line; the page stays usable.
      setNotice(error instanceof Error ? error.message : "The run could not start.");
    } finally {
      cancelRef.current = null;
      setRunning(false);
    }
  }, [running, runEpic, runOne, useEpic]);

  const stop = useCallback(() => cancelRef.current?.(), []);

  const resetCode = useCallback(() => {
    const next = setTowerCode(codes, tower, STARTER);
    if (!next.ok) return;
    dirtyRef.current = true;
    setCodes(next.store);
    setNotice(null);
  }, [codes, tower]);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.setMuted(!audio.isMuted());
    setMuted(audio.isMuted());
  }, []);

  // Space plays or pauses the replay, but never while the player is typing or on a button.
  const toggle = playback.toggle;
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== " " || event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      toggle();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  const frame = playback.frame ?? frames[0];
  if (!frame) return null;
  const failedShown = shown !== null && !shown.result.passed;
  const reason = shown ? (shown.outcome?.text ?? shown.end) : null;
  const showResult = shown !== null && playback.atEnd && !running;
  const epicSummary = useEpic && epicRuns ? summarizeEpic(epicRuns) : null;
  const reached = towerProgress.reached;

  return (
    <div className="grid w-full gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-3">
        <FloorView frame={frame} label={floorLabel(tower, level, useEpic)} />
        <p className="font-mono text-xs text-(--muted)" aria-live="polite">
          {frame.status ? `Health ${frame.status.health}, score ${frame.status.score}` : ""}
        </p>
        <Transport
          playback={playback}
          frameCount={frames.length}
          muted={muted}
          onToggleMute={toggleMute}
        />
        <EventLog frames={frames} index={playback.index} thoughts={shown?.thoughts ?? []} />
        {handPad}
      </div>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-(--muted)">
            Tower
            <select
              value={tower}
              onChange={(event) => goTo(event.target.value as TowerId, 1, false)}
              className="rounded-md border border-(--border) bg-transparent px-1.5 py-1 text-xs text-(--foreground)"
            >
              {TOWER_IDS.map((id) => {
                const locked = !isTowerUnlocked(progress, id);
                return (
                  <option key={id} value={id} disabled={locked} className="bg-black">
                    {TOWERS[id].name}
                    {locked ? " (clear The Narrow Path first)" : ""}
                  </option>
                );
              })}
            </select>
          </label>
          <label className="flex items-center gap-1 text-xs text-(--muted)">
            Floor
            <select
              value={level}
              onChange={(event) => goTo(tower, Number(event.target.value), useEpic)}
              className="rounded-md border border-(--border) bg-transparent px-1.5 py-1 text-xs text-(--foreground)"
            >
              {Array.from({ length: FLOORS_PER_TOWER }, (_unused, i) => i + 1).map((floor) => (
                <option key={floor} value={floor} disabled={floor > reached} className="bg-black">
                  {floor}
                </option>
              ))}
            </select>
          </label>
          {epicAvailable ? (
            <label className="flex items-center gap-1 text-xs text-(--muted)">
              <input
                type="checkbox"
                checked={useEpic}
                onChange={(event) => goTo(tower, level, event.target.checked)}
                className="accent-[#4ade80]"
              />
              Epic mode
            </label>
          ) : null}
        </div>
        <LevelPanel
          towerName={TOWERS[tower].name}
          level={level}
          floors={FLOORS_PER_TOWER}
          epic={useEpic}
          description={info.description}
          tip={info.tip}
          clue={failedShown ? info.clue : null}
        />
        <AbilityList abilities={info.warriorAbilities} />
        <Editor value={code} onChange={changeCode} onRun={() => void run()} disabled={running} />
        {code.length > CODE_MAX_CHARS ? null : (
          <p className="text-right font-mono text-[11px] text-(--muted)">
            {code.length} / {CODE_MAX_CHARS}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void run()}
            disabled={running}
            className="rounded-md bg-[#4ade80] px-4 py-1.5 text-sm font-medium text-black disabled:opacity-40"
          >
            {running ? "Running" : useEpic ? "Run epic" : "Run"}
          </button>
          {running ? (
            <button type="button" onClick={stop} className={BUTTON}>
              Stop
            </button>
          ) : null}
          <button type="button" onClick={resetCode} disabled={running} className={BUTTON}>
            Reset to starter
          </button>
        </div>
        {notice ? (
          <p role="alert" className="text-sm text-red-300">
            {notice}
          </p>
        ) : null}
        {showResult && shown ? (
          <ResultCard
            result={shown.result}
            reason={shown.result.passed ? null : reason}
            clue={shown.result.passed ? null : info.clue}
            hasNextFloor={shown.result.passed && !useEpic && level < FLOORS_PER_TOWER}
            onNext={() => goTo(tower, level + 1, useEpic)}
            onRetry={() => setFloorRun(null)}
          />
        ) : null}
        {epicSummary ? (
          <section
            aria-label="Epic result"
            className="rounded-lg border border-(--border) p-3 text-sm"
          >
            <h3 className="font-semibold text-(--foreground)">
              Epic run: average grade {getGradeLetter(epicSummary.average)}
            </h3>
            <ol className="mt-1 grid grid-cols-3 gap-1 font-mono text-xs text-(--muted)">
              {epicSummary.grades.map((grade, i) => (
                <li key={i + 1}>
                  <button
                    type="button"
                    onClick={() => setLevel(i + 1)}
                    className="hover:text-[#4ade80]"
                  >
                    Floor {i + 1}: {getGradeLetter(grade)}
                  </button>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        {boardPanel}
        <p className="text-xs text-(--muted)">
          A port of{" "}
          <a
            href="https://github.com/olistic/warriorjs"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            WarriorJS
          </a>{" "}
          by Matias Olivera, after{" "}
          <a
            href="https://github.com/ryanb/ruby-warrior"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            ruby-warrior
          </a>{" "}
          by Ryan Bates.
        </p>
      </div>
    </div>
  );
}
