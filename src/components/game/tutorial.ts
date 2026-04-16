export type TutorialStepId =
  | "welcome"
  | "move"
  | "shoot"
  | "dodge"
  | "dash"
  | "combo"
  | "done";

export interface TutorialStep {
  id: TutorialStepId;
  durationMs: number;
  headline: string;
  subtext: string;
  waitForInput?: "move" | "dodge" | "dash" | null;
  scripted?: {
    forceObstacleSpawn?: { xOffset: number; delayMs: number };
    pauseObstacles: boolean;
  };
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  { id: "welcome", durationMs: 2000, headline: "ORBITAL DODGE", subtext: "Survive as long as you can.", scripted: { pauseObstacles: true } },
  { id: "move", durationMs: 3000, headline: "Move", subtext: "WASD or mouse (or tilt your phone).", waitForInput: "move", scripted: { pauseObstacles: true } },
  { id: "shoot", durationMs: 2500, headline: "Fire Auto-Lock", subtext: "Your ship targets closest asteroids automatically.", scripted: { pauseObstacles: false } },
  { id: "dodge", durationMs: 3000, headline: "Dodge what you can't shoot", subtext: "Some walls are bullet-immune. Move out of the way.", waitForInput: "dodge", scripted: { pauseObstacles: false, forceObstacleSpawn: { xOffset: 0, delayMs: 500 } } },
  { id: "dash", durationMs: 3500, headline: "Dash", subtext: "Double-tap A or D for a quick invulnerable dash.", waitForInput: "dash", scripted: { pauseObstacles: true } },
  { id: "combo", durationMs: 3000, headline: "Chain kills for a combo multiplier", subtext: "Kills in quick succession multiply your score.", scripted: { pauseObstacles: false } },
  { id: "done", durationMs: 1500, headline: "GOOD LUCK, PILOT", subtext: "", scripted: { pauseObstacles: false } },
];

export interface TutorialState {
  active: boolean;
  stepIdx: number;
  stepStartAt: number;
  inputSatisfied: boolean;
}

export function newTutorialState(): TutorialState {
  return { active: false, stepIdx: 0, stepStartAt: 0, inputSatisfied: false };
}
