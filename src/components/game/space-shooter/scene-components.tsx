import { useFrame, useThree } from "@react-three/fiber";
import { type Environment, type GameRefs } from "./types";
import { runTick } from "./game-tick";
import { Ship, Bullets, DashAfterimages } from "./scene-ship";
import { Obstacles, ZapperBeams } from "./scene-hazards";
import { PowerUps, Coins } from "./scene-pickups";
import { BossMesh, BossProjectiles, BossSubEntities, BossWalls } from "./scene-boss";
import { Explosions, ScorePopups, DebrisField, SpeedLines } from "./scene-effects";
import { Starfield, BiomeBlender } from "./scene-environment";
import { CameraRig, CameraConfigurator } from "./scene-camera";

function GameLoop({
  gameRefs,
  onDeath,
  onUiSync,
}: {
  gameRefs: React.RefObject<GameRefs>;
  onDeath: () => void;
  onUiSync: () => void;
}) {
  const { viewport } = useThree();
  useFrame((_, dt) => {
    const g = gameRefs.current;
    if (!g) return;
    runTick(g, dt, viewport, onDeath, onUiSync);
  });
  return null;
}

export function Scene({
  gameRefs,
  onDeath,
  onUiSync,
  env,
  tick,
  shipId,
}: {
  gameRefs: React.RefObject<GameRefs>;
  onDeath: () => void;
  onUiSync: () => void;
  env: Environment;
  tick: number;
  shipId: string;
}) {
  const bossFighting = gameRefs.current?.boss && gameRefs.current.boss.phase !== "defeated";
  const voidFight = bossFighting && gameRefs.current?.boss?.id === "void-tyrant";
  const ambientI = voidFight ? 0.05 : bossFighting ? 0.18 : 0.5;
  const dirI = voidFight ? 0.15 : bossFighting ? 0.35 : 0.7;
  return (
    <>
      <BiomeBlender gameRefs={gameRefs} />
      <ambientLight intensity={ambientI} color={bossFighting ? "#7f1d1d" : env.ambient} />
      <directionalLight position={[5, 6, 4]} intensity={dirI} />
      <Starfield env={env} />
      <SpeedLines gameRefs={gameRefs} env={env} tick={tick} />
      <Ship gameRefs={gameRefs} env={env} shipId={shipId} />
      <Obstacles gameRefs={gameRefs} env={env} tick={tick} />
      <ZapperBeams gameRefs={gameRefs} tick={tick} />
      <PowerUps gameRefs={gameRefs} tick={tick} />
      <Coins gameRefs={gameRefs} tick={tick} />
      <BossMesh gameRefs={gameRefs} tick={tick} />
      <BossProjectiles gameRefs={gameRefs} tick={tick} />
      <BossSubEntities gameRefs={gameRefs} tick={tick} />
      <BossWalls gameRefs={gameRefs} tick={tick} />
      <DashAfterimages gameRefs={gameRefs} tick={tick} />
      <Bullets gameRefs={gameRefs} tick={tick} />
      <Explosions gameRefs={gameRefs} tick={tick} />
      <ScorePopups gameRefs={gameRefs} tick={tick} />
      <DebrisField gameRefs={gameRefs} tick={tick} />
      <CameraConfigurator />
      <CameraRig gameRefs={gameRefs} />
      <GameLoop gameRefs={gameRefs} onDeath={onDeath} onUiSync={onUiSync} />
    </>
  );
}
