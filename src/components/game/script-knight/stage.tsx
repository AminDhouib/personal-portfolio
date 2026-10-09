"use client";

import { type ComponentType, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import { AbilityList } from "./ability-list";
import { createKnightAudio, type KnightAudio } from "./audio";
import {
  CODE_MAX_CHARS,
  type CodeStore,
  dailyCodeFor,
  loadCode,
  saveCode,
  setDailyCode,
  setTowerCode,
  TOO_LONG_MESSAGE,
} from "./code-store";
import { DailyBoardPanel, type DailyBoardProps } from "./board-panel";
import { dailyFloor } from "./daily";
import type { LevelRef } from "./engine/level-ref";
import { EventLog } from "./event-log";
import { FloorView } from "./floor-view";
import { ghostFrames, ghostKnightAt } from "./ghost";
import { HandPad } from "./hand-pad";
import { getLevel } from "./engine/core/level";
import { getGradeLetter } from "./engine/scoring";
import { configForRef, createRun } from "./engine/run";
import { TOWER_IDS, type TowerId, TOWERS } from "./engine/towers";
import { LevelPanel } from "./level-panel";
import { botPlayed, type Played } from "./played";
import { loadMode, type PlayMode, saveMode } from "./mode";
import { buildFrames } from "./playback";
import { SheetHud, SHEET_CLASS, sheetStyle, useCoarsePointer, useScrollLock } from "./play-sheet";
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
import {
  type FloorRun,
  type Runner,
  startDailyRun,
  startFloorRun,
  WARRIOR_NAME,
} from "./run-floor";
import { runInSandbox } from "./sandbox/run-client";
import { CUES, cueFor, endCue } from "./sound-cues";
import { resolveStart } from "./start-at";
import { ShareRunButton } from "./share-button";
import { STARTER } from "./starter";
import {
  activeStreak,
  ghostFor,
  type KnightStats,
  loadStats,
  recordDaily,
  saveStats,
  setHandle,
} from "./stats";
import { EditorHost } from "./editor-host";
import { TOUCH } from "./surface";
import { type SyntaxIssue, withSyntaxLine } from "./syntax-line";
import type { EditorProps } from "./textarea-editor";
import { Transport } from "./transport";
import { handFloorRun, useHandRun } from "./use-hand-run";
import { usePlayback } from "./use-playback";
import { utcDayKey } from "@/lib/arcade/boards";

const SAVE_DEBOUNCE_MS = 500;
const MODE_ACTIVE = `rounded-md border border-accent-green bg-accent-green/15 px-3 py-1.5 text-sm text-(--foreground) ${TOUCH}`;
const BUTTON = `rounded-md border border-(--border) px-3 py-1.5 text-sm text-(--foreground) hover:border-accent-green disabled:opacity-40 ${TOUCH}`;
const SELECT = `rounded-md border border-(--border) bg-transparent px-1.5 py-1 text-xs text-(--foreground) ${TOUCH}`;
const LINK = `underline pointer-coarse:inline-flex pointer-coarse:items-center ${TOUCH}`;

export interface StageProps {
  /** The sandbox entry point; a test passes a fake. */
  runner?: Runner;
  /** The code editor; the default shows a textarea and swaps in CodeMirror on a desktop pointer. */
  editor?: ComponentType<EditorProps>;
  /** The daily board and submit panel; a test or a later PR can swap it. */
  boardPanel?: ComponentType<DailyBoardProps>;
  /** Where to open: a floor from a replay link (clamped to what the player has reached). */
  start?: LevelRef;
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

/** One Run press: Stop, navigation and unmount flip it, and a result for a stale one is dropped. */
interface RunToken {
  cancelled: boolean;
  tower: TowerId;
  level: number;
  epic: boolean;
  /** The UTC day key when the run is on Today's floor, else null. */
  daily: string | null;
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
  editor: Editor = EditorHost,
  boardPanel: BoardPanel = DailyBoardPanel,
  start,
}: StageProps) {
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [codes, setCodes] = useState<CodeStore>(() => loadCode());
  const [begin] = useState(() => resolveStart(start, progress));
  const [tower, setTower] = useState<TowerId>(() => begin.at.tower);
  const [level, setLevel] = useState(() => begin.at.level);
  const [epic, setEpic] = useState(() => begin.at.epic);
  const [running, setRunning] = useState(false);
  const [floorRun, setFloorRun] = useState<FloorRun | null>(null);
  const [epicRuns, setEpicRuns] = useState<FloorRun[] | null>(null);
  const [notice, setNotice] = useState<string | null>(begin.notice);
  const [muted, setMuted] = useState(false);
  // Watch the bot: the reference bot's run on the floor in view. Local, never scored or posted.
  const [bot, setBot] = useState<Played | null>(null);
  // Today's floor: the UTC day is fixed when the player opens the tab, so a run that crosses
  // midnight is still judged on the floor it began on (and cannot be posted).
  const [daily, setDaily] = useState(begin.daily);
  const [dayKey, setDayKey] = useState(() => utcDayKey(new Date()));
  const [stats, setStats] = useState<KnightStats>(() => loadStats());
  // By hand or by code. A touch screen plays by hand until the player picks (knight:mode).
  const coarse = useCoarsePointer();
  const [mode, setMode] = useState<PlayMode>(() => loadMode(coarse));
  const handMode = mode === "hand";
  // The phone play sheet: a touch screen opens it from "Play this floor" and Exit closes it.
  const [sheetOn, setSheetOn] = useState(false);
  const sheet = coarse && sheetOn;
  const viewport = useVisualViewport(sheet);
  useScrollLock(sheet);
  // The latest stats for callbacks that must not save from inside a state updater.
  const statsRef = useRef(stats);
  // The day's best log from before this attempt, drawn as a ghost. It is read when a run starts,
  // so a clear that becomes the new best does not race itself.
  const [ghostLog, setGhostLog] = useState<string | null>(() =>
    begin.daily ? ghostFor(stats, dayKey) : null,
  );

  const cancelRef = useRef<(() => void) | null>(null);
  const audioRef = useRef<KnightAudio | null>(null);
  const codesRef = useRef(codes);
  const dirtyRef = useRef(false);
  // The run in flight, if any. The guard against a second Run is a ref so two presses before a
  // render still start one run.
  const tokenRef = useRef<RunToken | null>(null);
  const runningRef = useRef(false);
  const viewRef = useRef<{ tower: TowerId; level: number; epic: boolean; daily: string | null }>({
    tower,
    level,
    epic,
    daily: begin.daily ? dayKey : null,
  });
  const wasPlayingRef = useRef(false);
  // Where the code editor's own parse found a syntax error, so a Run can name the line.
  const syntaxRef = useRef<SyntaxIssue | null>(null);
  const onSyntaxError = useCallback((issue: SyntaxIssue | null) => {
    syntaxRef.current = issue;
  }, []);
  const knownRunner = useCallback<Runner>(
    (req, onTurn) => {
      const handle = runner(req, onTurn);
      return {
        cancel: handle.cancel,
        done: handle.done.then((outcome) => withSyntaxLine(outcome, syntaxRef.current)),
      };
    },
    [runner],
  );

  // Only a tower never edited falls back to the starter, so an emptied editor stays empty.
  const code = daily
    ? dailyCodeFor(codes, dayKey, tower, STARTER)
    : (codes.towers[tower] ?? STARTER);
  const towerProgress = progress.towers[tower];
  const epicAvailable = towerProgress.best[String(FLOORS_PER_TOWER)] !== undefined;
  const useEpic = !daily && epic && epicAvailable && !handMode;

  const dailyInfo = useMemo(() => (daily ? dailyFloor(dayKey) : null), [daily, dayKey]);
  const config = useMemo(
    () =>
      dailyInfo?.config ??
      configForRef({ kind: "tower", tower, level, epic: useEpic }, WARRIOR_NAME),
    [dailyInfo, tower, level, useEpic],
  );
  const info = useMemo(() => getLevel(config), [config]);
  const ghostRun = useMemo(
    () => (daily && ghostLog !== null ? ghostFrames(config, ghostLog) : null),
    [daily, ghostLog, config],
  );
  const idleFrames = useMemo(() => buildFrames(config, createRun(config).initial, []), [config]);
  const hand = useHandRun(config);
  const handRef = useMemo(
    (): LevelRef =>
      daily ? { kind: "daily", day: dayKey } : { kind: "tower", tower, level, epic: false },
    [daily, dayKey, tower, level],
  );
  const handShown = useMemo(
    () => (handMode && hand.turns > 0 ? handFloorRun(handRef, config, hand.replay) : null),
    [handMode, hand.turns, hand.replay, handRef, config],
  );

  // What the replay shows: the last run on this floor, or the bare floor before any run.
  const shown = handMode
    ? handShown
    : useEpic && epicRuns
      ? (epicRuns[level - 1] ?? null)
      : floorRun &&
          (daily
            ? floorRun.ref.kind === "daily" && floorRun.ref.day === dayKey
            : floorRun.ref.kind === "tower" &&
              floorRun.ref.tower === tower &&
              floorRun.ref.level === level &&
              floorRun.ref.epic === useEpic)
        ? floorRun
        : null;
  const floorRef: LevelRef = daily
    ? { kind: "daily", day: dayKey }
    : { kind: "tower", tower, level, epic: useEpic };
  const botShown = bot && JSON.stringify(bot.ref) === JSON.stringify(floorRef) ? bot : null;
  const frames = botShown?.frames ?? shown?.frames ?? idleFrames;
  const playback = usePlayback(frames);

  useEffect(() => {
    viewRef.current = { tower, level, epic: useEpic, daily: daily ? dayKey : null };
  }, [tower, level, useEpic, daily, dayKey]);

  // Ends the run in flight: its loop stops, its worker is cancelled, and a result still on the
  // way is dropped.
  const invalidateRun = useCallback(() => {
    if (tokenRef.current) tokenRef.current.cancelled = true;
    tokenRef.current = null;
    runningRef.current = false;
    cancelRef.current?.();
    cancelRef.current = null;
  }, []);

  useEffect(() => {
    const audio = createKnightAudio();
    audioRef.current = audio;
    setMuted(audio.isMuted());
    return () => {
      audio.close();
      audioRef.current = null;
      invalidateRun();
    };
  }, [invalidateRun]);

  // Sound: a cue for each event as it plays, and the stairs or fail cue when the replay ends.
  const frameIndex = playback.index;
  const playing = playback.playing;
  const shownPassed = shown ? shown.result.passed : null;
  useEffect(() => {
    const wasPlaying = wasPlayingRef.current;
    wasPlayingRef.current = playing;
    const endedNow = wasPlaying && !playing && frames.length > 1 && frameIndex >= frames.length - 1;
    if (!playing && !endedNow) return;
    const cue =
      endedNow && shownPassed !== null
        ? endCue(shownPassed)
        : cueFor(frames[frameIndex]?.event?.action.type ?? "");
    if (cue) audioRef.current?.play(CUES[cue]);
  }, [playing, frameIndex, frames, shownPassed]);

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
  useEffect(() => {
    function flush() {
      if (!dirtyRef.current) return;
      saveCode(codesRef.current);
      dirtyRef.current = false;
    }
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  const commitProgress = useCallback((next: Progress) => {
    setProgress(next);
    saveProgress(next);
  }, []);

  const onTooLong = useCallback(() => setNotice(TOO_LONG_MESSAGE), []);

  const changeCode = useCallback(
    (value: string) => {
      const next = daily ? setDailyCode(codes, dayKey, value) : setTowerCode(codes, tower, value);
      if (!next.ok) {
        setNotice(TOO_LONG_MESSAGE);
        return;
      }
      setNotice(null);
      dirtyRef.current = true;
      setCodes(next.store);
    },
    [codes, daily, dayKey, tower],
  );

  const goTo = useCallback(
    (nextTower: TowerId, nextLevel: number, nextEpic: boolean) => {
      invalidateRun();
      setRunning(false);
      setBot(null);
      setDaily(false);
      setTower(nextTower);
      setLevel(nextLevel);
      setEpic(nextEpic);
      setFloorRun(null);
      setEpicRuns(null);
      setNotice(null);
      commitProgress(setAt(progress, { tower: nextTower, level: nextLevel, epic: nextEpic }));
    },
    [commitProgress, invalidateRun, progress],
  );

  const enterDaily = useCallback(() => {
    invalidateRun();
    setRunning(false);
    setBot(null);
    const today = utcDayKey(new Date());
    setDaily(true);
    setDayKey(today);
    setGhostLog(ghostFor(statsRef.current, today));
    setFloorRun(null);
    setEpicRuns(null);
    setNotice(null);
  }, [invalidateRun]);

  const rememberHandle = useCallback((name: string) => {
    const next = setHandle(statsRef.current, name);
    if (next === statsRef.current) return;
    statsRef.current = next;
    setStats(next);
    saveStats(next);
  }, []);

  const finishFloor = useCallback(
    (done: FloorRun) => {
      setFloorRun(done);
      if (!done.result.passed || !done.result.score) return;
      if (done.ref.kind === "daily") {
        const next = recordDaily(statsRef.current, {
          score: done.result.score.total,
          day: done.ref.day,
          log: done.log,
        });
        statsRef.current = next;
        setStats(next);
        saveStats(next);
        return;
      }
      const clear = {
        score: done.result.score.total,
        grade: done.result.grade ?? 0,
        turns: done.result.turns,
      };
      commitProgress(recordClear(progress, tower, level, clear));
    },
    [commitProgress, level, progress, tower],
  );

  /** True while `token` is the run in flight and the stage still shows the floor it started on. */
  const isLive = useCallback((token: RunToken) => {
    const view = viewRef.current;
    return (
      tokenRef.current === token &&
      view.tower === token.tower &&
      view.level === token.level &&
      view.epic === token.epic &&
      view.daily === token.daily
    );
  }, []);

  const runOne = useCallback(
    async (token: RunToken) => {
      const handle = daily
        ? startDailyRun(dayKey, code, knownRunner)
        : startFloorRun({ kind: "tower", tower, level, epic: useEpic }, code, knownRunner);
      cancelRef.current = handle.cancel;
      const done = await handle.done;
      if (isLive(token)) finishFloor(done);
    },
    [code, daily, dayKey, finishFloor, isLive, knownRunner, level, tower, useEpic],
  );

  const runEpic = useCallback(
    async (token: RunToken) => {
      const runs: FloorRun[] = [];
      for (let floor = 1; floor <= FLOORS_PER_TOWER; floor += 1) {
        if (token.cancelled || !isLive(token)) break;
        const handle = startFloorRun(
          { kind: "tower", tower, level: floor, epic: true },
          code,
          knownRunner,
        );
        cancelRef.current = handle.cancel;
        const done = await handle.done;
        runs.push(done);
        if (token.cancelled || !isLive(token)) break;
        if (done.outcome && done.ranNothing) break;
      }
      // Navigation or unmount ended the run: nothing is left to show or save.
      if (!isLive(token)) return;
      setEpicRuns(runs);
      if (runs.length === FLOORS_PER_TOWER && !token.cancelled) {
        const { grades } = summarizeEpic(runs);
        const score = runs.reduce((sum, run) => sum + (run.result.score?.total ?? 0), 0);
        commitProgress(recordEpic(progress, tower, { score, grades }));
      }
    },
    [code, commitProgress, isLive, knownRunner, progress, tower],
  );

  // A hand run that ends is recorded once, like a code run's result: the pass feeds the progress
  // or the daily stats. Starting over (no turns) lets the same moves record again.
  const recordedHandLog = useRef<string | null>(null);
  useEffect(() => {
    if (!handShown) {
      recordedHandLog.current = null;
      return;
    }
    if (hand.playing || recordedHandLog.current === handShown.log) return;
    recordedHandLog.current = handShown.log;
    finishFloor(handShown);
  }, [finishFloor, hand.playing, handShown]);

  const chooseMode = useCallback(
    (next: PlayMode) => {
      if (next === mode) return;
      invalidateRun();
      setRunning(false);
      setFloorRun(null);
      setEpicRuns(null);
      setNotice(null);
      setMode(next);
      saveMode(next);
    },
    [invalidateRun, mode],
  );

  const run = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    const token: RunToken = {
      cancelled: false,
      tower,
      level,
      epic: useEpic,
      daily: daily ? dayKey : null,
    };
    tokenRef.current = token;
    if (daily) setGhostLog(ghostFor(statsRef.current, dayKey));
    audioRef.current?.unlock();
    setRunning(true);
    setNotice(null);
    setBot(null);
    setFloorRun(null);
    setEpicRuns(null);
    try {
      await (useEpic ? runEpic(token) : runOne(token));
    } catch (error) {
      // silent-ok: shown to the player in the notice line; the page stays usable.
      if (tokenRef.current === token) {
        setNotice(error instanceof Error ? error.message : "The run could not start.");
      }
    } finally {
      // A run that was navigated away from or unmounted already reset all of this.
      if (tokenRef.current === token) {
        tokenRef.current = null;
        runningRef.current = false;
        cancelRef.current = null;
        setRunning(false);
      }
    }
  }, [daily, dayKey, level, runEpic, runOne, tower, useEpic]);

  // Stop ends the run in flight, the rest of an epic run included; the floors played still show.
  const stop = useCallback(() => {
    if (tokenRef.current) tokenRef.current.cancelled = true;
    cancelRef.current?.();
  }, []);

  const resetCode = useCallback(() => {
    const next = daily ? setDailyCode(codes, dayKey, STARTER) : setTowerCode(codes, tower, STARTER);
    if (!next.ok) return;
    dirtyRef.current = true;
    setCodes(next.store);
    setNotice(null);
  }, [codes, daily, dayKey, tower]);

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

  // By hand the floor shows the latest turn straight away (a unit still slides to its new space);
  // the replay clock is for code runs.
  const handLive = handMode && !botShown;
  const frame = handLive ? hand.frames.at(-1) : (playback.frame ?? frames[0]);
  if (!frame) return null;
  const warriorFacing = frame.floor.units.find((unit) => unit.warrior)?.facing ?? "east";
  const failedShown = shown !== null && !shown.result.passed;
  // The clue is for a floor that was lost, not for code that did not run or was stopped.
  const clueShown = failedShown && shown.outcome === null;
  const reason = shown ? (shown.outcome?.text ?? shown.end) : null;
  const showResult = botShown
    ? false
    : handMode
      ? shown !== null && !hand.playing
      : shown !== null && playback.atEnd && !running;
  const epicSummary = useEpic && epicRuns ? summarizeEpic(epicRuns) : null;
  const reached = towerProgress.reached;
  const dailyResult =
    daily && shown?.result.passed && shown.result.score && shown.ref.kind === "daily"
      ? shown
      : null;

  return (
    <div
      className={`grid w-full gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] ${sheet ? SHEET_CLASS : ""}`}
      style={sheet ? sheetStyle(viewport) : undefined}
    >
      {sheet ? (
        <SheetHud
          title={daily ? "Today's floor" : floorLabel(tower, level, false)}
          onExit={() => setSheetOn(false)}
        />
      ) : null}
      <div className={`space-y-3 ${sheet && viewport.keyboardOpen && !handMode ? "hidden" : ""}`}>
        {coarse && !sheet ? (
          <button
            type="button"
            onClick={() => setSheetOn(true)}
            className={`w-full rounded-md bg-[#4ade80] px-4 py-2 text-sm font-medium text-black ${TOUCH}`}
          >
            Play this floor
          </button>
        ) : null}
        <FloorView
          frame={frame}
          label={daily ? "Today's floor" : floorLabel(tower, level, useEpic)}
          ghost={ghostRun && !botShown ? ghostKnightAt(ghostRun, frame.turn) : null}
        />
        <p className="font-mono text-xs text-(--muted)" aria-live="polite">
          {frame.status ? `Health ${frame.status.health}, score ${frame.status.score}` : ""}
        </p>
        {handLive ? (
          <HandPad
            abilities={info.warriorAbilities}
            facing={warriorFacing}
            live={hand.playing}
            canUndo={hand.turns > 0 && hand.status !== "passed"}
            onAct={hand.act}
            onUndo={hand.undo}
            onRestart={hand.restart}
            keyboard={handLive}
          />
        ) : (
          <Transport
            playback={playback}
            frameCount={frames.length}
            muted={muted}
            onToggleMute={toggleMute}
          />
        )}
        <EventLog
          frames={handLive ? hand.frames : frames}
          index={handLive ? hand.frames.length - 1 : playback.index}
          thoughts={botShown ? [] : (shown?.thoughts ?? [])}
        />
      </div>
      <div className="space-y-3">
        <div role="group" aria-label="Play style" className="flex gap-2">
          <button
            type="button"
            aria-pressed={handMode}
            onClick={() => chooseMode("hand")}
            className={handMode ? MODE_ACTIVE : BUTTON}
          >
            Play by hand
          </button>
          <button
            type="button"
            aria-pressed={!handMode}
            onClick={() => chooseMode("code")}
            className={handMode ? BUTTON : MODE_ACTIVE}
          >
            Write code
          </button>
        </div>
        <div role="group" aria-label="Mode" className="flex gap-2">
          <button
            type="button"
            aria-pressed={!daily}
            onClick={() => goTo(tower, level, epic)}
            className={daily ? BUTTON : MODE_ACTIVE}
          >
            Towers
          </button>
          <button
            type="button"
            aria-pressed={daily}
            onClick={enterDaily}
            className={daily ? MODE_ACTIVE : BUTTON}
          >
            Today&apos;s floor
          </button>
        </div>
        {daily ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-(--muted)">
              Tower
              <select
                value={tower}
                onChange={(event) => goTo(event.target.value as TowerId, 1, false)}
                className={SELECT}
              >
                {TOWER_IDS.map((id) => {
                  const locked = !isTowerUnlocked(progress, id);
                  return (
                    <option key={id} value={id} disabled={locked} className="bg-(--background)">
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
                className={SELECT}
              >
                {Array.from({ length: FLOORS_PER_TOWER }, (_unused, i) => i + 1).map((floor) => (
                  <option
                    key={floor}
                    value={floor}
                    disabled={floor > reached}
                    className="bg-(--background)"
                  >
                    {floor}
                  </option>
                ))}
              </select>
            </label>
            {epicAvailable && !handMode ? (
              <label className={`flex items-center gap-1 text-xs text-(--muted) ${TOUCH}`}>
                <input
                  type="checkbox"
                  checked={useEpic}
                  onChange={(event) => goTo(tower, level, event.target.checked)}
                  className="accent-accent-green"
                />
                Epic mode
              </label>
            ) : null}
          </div>
        )}
        {dailyInfo ? (
          <section aria-label="This floor" className="space-y-1.5 text-sm">
            <h2 className="font-semibold text-(--foreground)">Today&apos;s floor, {dayKey}</h2>
            <p className="text-(--muted)">{info.description}</p>
            <p className="text-(--muted)">
              Par {dailyInfo.par}. Everyone gets this floor today; the board ranks the score.
              {activeStreak(stats, dayKey) > 0 ? ` ${activeStreak(stats, dayKey)}-day streak.` : ""}
            </p>
          </section>
        ) : (
          <LevelPanel
            towerName={TOWERS[tower].name}
            level={level}
            floors={FLOORS_PER_TOWER}
            epic={useEpic}
            description={info.description}
            tip={info.tip}
            clue={clueShown ? info.clue : null}
          />
        )}
        <AbilityList abilities={info.warriorAbilities} />
        {handMode ? null : (
          <>
            <Editor
              value={code}
              onChange={changeCode}
              onRun={() => void run()}
              disabled={running}
              onSyntaxError={onSyntaxError}
              maxChars={CODE_MAX_CHARS}
              onTooLong={onTooLong}
            />
            {code.length > CODE_MAX_CHARS ? null : (
              <p className="text-right font-mono text-[11px] text-(--muted)">
                {code.length} / {CODE_MAX_CHARS}
              </p>
            )}
            <div
              className={`flex flex-wrap gap-2 ${sheet ? "sticky bottom-0 z-10 bg-(--background) py-2" : ""}`}
            >
              <button
                type="button"
                onClick={() => void run()}
                disabled={running}
                className={`rounded-md bg-[#4ade80] px-4 py-1.5 text-sm font-medium text-black disabled:opacity-40 ${TOUCH}`}
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
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setBot(botPlayed(floorRef))}
            disabled={running}
            className={BUTTON}
          >
            Watch the bot
          </button>
        </div>
        {botShown ? (
          <p role="status" className="text-sm text-(--muted)">
            Watching the reference bot on this floor. This run is local: it is not scored, saved or
            posted.{" "}
            <button type="button" onClick={() => setBot(null)} className={`underline ${TOUCH}`}>
              Stop watching
            </button>
          </p>
        ) : null}
        {notice ? (
          <p role="alert" className="text-sm text-accent-red">
            {notice}
          </p>
        ) : null}
        {showResult && shown ? (
          <ResultCard
            result={shown.result}
            reason={shown.result.passed ? null : reason}
            clue={clueShown ? info.clue : null}
            hasNextFloor={!daily && shown.result.passed && !useEpic && level < FLOORS_PER_TOWER}
            onNext={() => goTo(tower, level + 1, useEpic)}
            onRetry={handMode ? hand.restart : () => setFloorRun(null)}
          />
        ) : null}
        {showResult && shown?.result.passed && shown.result.score ? (
          <ShareRunButton
            floor={shown.ref}
            log={shown.log}
            title={
              shown.ref.kind === "daily"
                ? shown.ref.day
                : floorLabel(shown.ref.tower, shown.ref.level, shown.ref.epic)
            }
            score={shown.result.score.total}
            turns={shown.result.turns}
            par={shown.ref.kind === "daily" && dailyInfo ? dailyInfo.par : null}
          />
        ) : null}
        {showResult && shown?.outcome?.retry ? (
          <button type="button" onClick={() => void run()} className={BUTTON}>
            Retry
          </button>
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
                    className={`hover:text-accent-green ${TOUCH}`}
                  >
                    Floor {i + 1}: {getGradeLetter(grade)}
                  </button>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        {dailyResult && showResult ? (
          <BoardPanel
            result={{
              dayKey,
              score: dailyResult.result.score?.total ?? 0,
              turns: dailyResult.result.turns,
              log: dailyResult.log,
              hand: handMode,
            }}
            handle={stats.handle}
            streakDays={activeStreak(stats, dayKey)}
            onHandle={rememberHandle}
          />
        ) : null}
        <p className="text-xs text-(--muted)">
          A port of{" "}
          <a
            href="https://github.com/olistic/warriorjs"
            target="_blank"
            rel="noopener noreferrer"
            className={LINK}
          >
            WarriorJS
          </a>{" "}
          by Matias Olivera, after{" "}
          <a
            href="https://github.com/ryanb/ruby-warrior"
            target="_blank"
            rel="noopener noreferrer"
            className={LINK}
          >
            ruby-warrior
          </a>{" "}
          by Ryan Bates.
        </p>
      </div>
    </div>
  );
}
