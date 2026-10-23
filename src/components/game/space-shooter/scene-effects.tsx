import { useRef, useMemo, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { type Environment, type GameRefs } from "./types";
import { glowTexture } from "./scene-textures";

export function Explosions({
  gameRefs,
  tick,
}: {
  gameRefs: React.RefObject<GameRefs>;
  tick: number;
}) {
  const explosions = gameRefs.current?.explosions ?? [];
  const ringGeo = useMemo(() => new THREE.RingGeometry(0.45, 0.6, 24), []);
  const glowTex = useMemo(() => glowTexture(), []);
  useEffect(() => () => ringGeo.dispose(), [ringGeo]);

  const groupRefs = useRef<Map<number, THREE.Group>>(new Map());
  const coreRefs = useRef<Map<number, THREE.Sprite>>(new Map());
  const ringRefs = useRef<Map<number, THREE.Mesh>>(new Map());
  const flashRefs = useRef<Map<number, THREE.Sprite>>(new Map());
  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    for (const e of g.explosions) {
      const grp = groupRefs.current.get(e.id);
      if (grp) grp.position.set(e.x, e.y, e.z);
      const core = coreRefs.current.get(e.id);
      if (core) {
        core.scale.setScalar(e.scale * 1.5);
        (core.material as THREE.SpriteMaterial).opacity = e.opacity;
      }
      const ring = ringRefs.current.get(e.id);
      if (ring) {
        ring.scale.setScalar(e.scale * 1.6);
        (ring.material as THREE.MeshBasicMaterial).opacity = e.opacity * e.opacity * 0.7;
      }
      const flash = flashRefs.current.get(e.id);
      if (flash) {
        flash.scale.setScalar(e.scale * 2);
        (flash.material as THREE.SpriteMaterial).opacity = Math.max(0, (e.opacity - 0.7) / 0.3);
      }
    }
  });

  return (
    <group>
      {explosions.map((e) => (
        <group
          key={e.id}
          ref={(el) => {
            if (el) groupRefs.current.set(e.id, el);
            else groupRefs.current.delete(e.id);
          }}
        >
          <sprite
            ref={(el) => {
              if (el) coreRefs.current.set(e.id, el);
              else coreRefs.current.delete(e.id);
            }}
          >
            <spriteMaterial
              map={glowTex}
              color={e.color}
              transparent
              opacity={e.opacity}
              toneMapped={false}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </sprite>
          <mesh
            ref={(el) => {
              if (el) ringRefs.current.set(e.id, el);
              else ringRefs.current.delete(e.id);
            }}
            geometry={ringGeo}
          >
            <meshBasicMaterial
              color={e.color}
              transparent
              opacity={e.opacity * e.opacity * 0.7}
              side={THREE.DoubleSide}
              toneMapped={false}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          <sprite
            ref={(el) => {
              if (el) flashRefs.current.set(e.id, el);
              else flashRefs.current.delete(e.id);
            }}
          >
            <spriteMaterial
              map={glowTex}
              color={e.color}
              transparent
              opacity={0}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </sprite>
        </group>
      ))}
      <group visible={false}>
        <mesh>
          <boxGeometry args={[0, 0, tick * 0]} />
          <meshBasicMaterial />
        </mesh>
      </group>
    </group>
  );
}

// Cache for canvas-rendered "+N" textures so each unique amount only creates
// one texture even if popups spawn frequently.
const SCORE_TEXTURE_CACHE = new Map<string, THREE.CanvasTexture>();
function scoreTexture(amount: number, kind: "points" | "coins"): THREE.CanvasTexture {
  const key = `${kind}:${amount}`;
  const cached = SCORE_TEXTURE_CACHE.get(key);
  if (cached) return cached;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 96;
  const ctx = c.getContext("2d")!;
  ctx.font = "bold 64px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  const txt = `+${amount}`;
  if (kind === "coins") {
    // Amber "+N" with a small coin disc to its left.
    ctx.fillStyle = "#f59e0b";
    const textW = ctx.measureText(txt).width;
    const textX = c.width / 2 + 18;
    ctx.strokeText(txt, textX, c.height / 2);
    ctx.fillText(txt, textX, c.height / 2);
    const cx = textX - textW / 2 - 26;
    ctx.beginPath();
    ctx.arc(cx, c.height / 2, 20, 0, Math.PI * 2);
    ctx.fillStyle = "#fbbf24";
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#b45309";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, c.height / 2, 9, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.fillStyle = "#fde047";
    ctx.strokeText(txt, c.width / 2, c.height / 2);
    ctx.fillText(txt, c.width / 2, c.height / 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  SCORE_TEXTURE_CACHE.set(key, tex);
  return tex;
}

export function ScorePopups({
  gameRefs,
  tick,
}: {
  gameRefs: React.RefObject<GameRefs>;
  tick: number;
}) {
  const popups = gameRefs.current?.scorePopups ?? [];
  const refs = useRef<Map<number, THREE.Sprite>>(new Map());

  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    const now = performance.now();
    for (const p of g.scorePopups) {
      const s = refs.current.get(p.id);
      if (s) {
        s.position.set(p.x, p.y, p.z);
        const age = (now - p.spawnedAt) / p.ttl;
        const mat = s.material as THREE.SpriteMaterial;
        mat.opacity = Math.max(0, 1 - age);
        const scale = 0.9 + age * 0.7;
        s.scale.set(scale * 1.6, scale * 0.6, 1);
      }
    }
  });

  return (
    <group>
      {popups.map((p) => {
        const tex = scoreTexture(p.amount, p.kind);
        return (
          <sprite
            key={p.id}
            ref={(el) => {
              if (el) refs.current.set(p.id, el);
              else refs.current.delete(p.id);
            }}
            scale={[1.4, 0.55, 1]}
          >
            <spriteMaterial map={tex} transparent depthWrite={false} />
          </sprite>
        );
      })}
      <group visible={false}>
        <mesh>
          <boxGeometry args={[0, 0, tick * 0]} />
          <meshBasicMaterial />
        </mesh>
      </group>
    </group>
  );
}

export function DebrisField({
  gameRefs,
  tick,
}: {
  gameRefs: React.RefObject<GameRefs>;
  tick: number;
}) {
  const list = gameRefs.current?.debris ?? [];
  const refs = useRef<Map<number, THREE.Mesh>>(new Map());
  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    const now = performance.now();
    for (const d of g.debris) {
      const m = refs.current.get(d.id);
      if (m) {
        m.position.set(d.x, d.y, d.z);
        m.rotation.set(d.rx, d.ry, d.rz);
        const age = (now - d.spawnedAt) / d.ttl;
        const fade = Math.max(0, 1 - Math.max(0, age - 0.6) / 0.4);
        const mat = m.material as THREE.MeshToonMaterial;
        mat.opacity = fade;
        mat.transparent = true;
      }
    }
  });
  return (
    <group>
      {list.map((d) => (
        <mesh
          key={d.id}
          ref={(el) => {
            if (el) refs.current.set(d.id, el);
            else refs.current.delete(d.id);
          }}
        >
          <boxGeometry args={d.size} />
          <meshToonMaterial
            color={d.color}
            emissive={d.color}
            emissiveIntensity={0.4}
            transparent
          />
        </mesh>
      ))}
      <group visible={false}>
        <mesh>
          <boxGeometry args={[0, 0, tick * 0]} />
          <meshBasicMaterial />
        </mesh>
      </group>
    </group>
  );
}

export function SpeedLines({
  gameRefs,
  env,
  tick,
}: {
  gameRefs: React.RefObject<GameRefs>;
  env: Environment;
  tick: number;
}) {
  const lines = gameRefs.current?.speedLines ?? [];
  const geo = useMemo(() => new THREE.CylinderGeometry(0.014, 0.014, 1, 4), []);
  useEffect(() => () => geo.dispose(), [geo]);

  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    const opacityScale = 0.7;
    for (let i = 0; i < g.speedLines.length; i++) {
      const m = refs.current[i];
      const l = g.speedLines[i];
      if (m && l) {
        m.position.set(l.x, l.y, l.z);
        m.scale.set(1, l.length, 1);
        const mat = m.material as THREE.MeshBasicMaterial;
        mat.opacity = l.life * opacityScale;
        // Follow the lerped star color so speed lines stay visible against
        // the current background — dark lines in light mode, light lines
        // in dark mode.
        mat.color.copy(g.starColor);
      }
    }
  });

  return (
    <group>
      {lines.map((_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          rotation={[Math.PI / 2, 0, 0]}
          geometry={geo}
        >
          <meshBasicMaterial color={env.starColor} transparent opacity={0} />
        </mesh>
      ))}
      <group visible={false}>
        <mesh>
          <boxGeometry args={[0, 0, tick * 0]} />
          <meshBasicMaterial />
        </mesh>
      </group>
    </group>
  );
}
