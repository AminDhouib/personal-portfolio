import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  EdgesGeometry,
  GridHelper,
  Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  OctahedronGeometry,
  OrthographicCamera,
  Raycaster,
  Scene,
  Vector2,
  WebGLRenderer,
  type Material,
} from "three";
import { CONFIG, TRAFFIC_TYPES, type ServiceType, type TrafficType } from "../sim/config";
import type { Snapshot } from "../sim/snapshot";
import type { SimEvent } from "../sim/types";
import { cameraPose, type CameraState } from "./camera";
import { writeConnectionSegments } from "./connections";
import { diffIds, nodeShape, nodeStyle, type NodeShape } from "./nodes";
import {
  ACCENT,
  BACKGROUND,
  FAIL_COLOR,
  GRID_MAJOR,
  GRID_MINOR,
  INTERNET_COLOR,
  LINK_COLOR,
  SERVICE_COLORS,
  TRAFFIC_COLORS,
} from "./palette";
import { TIER_SETTINGS, type PerfTier } from "./perf-tier";
import { cellAt, groundPoint, nodeAt, type Cell } from "./pick";
import { writeRequestInstances, type Rgb } from "./requests";

// The imperative three.js view of the board, in the site's neon wireframe:
// outlines and flat fills only (line materials and MeshBasicMaterial), no
// lights, no shadows. It READS a snapshot and a list of events each frame and
// never touches the sim. Named imports only, so the bundle carries the parts
// of three this uses.

export interface Overlay {
  /** A placement waiting for confirm, or the hovered tile with a Place tool armed. */
  ghost: { type: ServiceType; x: number; z: number } | null;
  /** A node to pulse: the source of a link in progress. */
  highlight: string | null;
}

export interface PickResult {
  cell: Cell;
  node: string | null;
}

export interface FailoverScene {
  render(snapshot: Snapshot, events: readonly SimEvent[], nowMs: number): void;
  resize(width: number, height: number): void;
  setCamera(state: CameraState): void;
  setOverlay(overlay: Overlay): void;
  setTier(tier: PerfTier): void;
  /** What lies under a point in client (CSS pixel) coordinates, or null off the board. */
  pick(clientX: number, clientY: number): PickResult | null;
  dispose(): void;
}

/** Capacity of the request instance buffers: the high tier's cap. */
const REQUEST_CAPACITY = TIER_SETTINGS.high.maxDrawnRequests;
/** Capacity of the link buffer; the sim's share format caps a board at 240 links. */
const LINK_CAPACITY = 320;
/** Nested outlines drawn smaller and smaller: the wireframe's "thickness" by tier. */
const OUTLINE_SCALES = [1, 0.84, 0.68];

const FLASH = {
  "request-failed": { color: FAIL_COLOR, ms: 260 },
  "request-blocked": { color: ACCENT.green, ms: 200 },
  "cache-hit": { color: "#ffffff", ms: 140 },
  outage: { color: ACCENT.amber, ms: 900 },
} as const;
const PULSE_MS = 320;

/** Unit shapes, 1 tall with the base on the ground; a node scales y to its height. */
function unitGeometry(shape: NodeShape): BufferGeometry {
  const g =
    shape === "box"
      ? new BoxGeometry(2.8, 1, 2.8)
      : shape === "cylinder"
        ? new CylinderGeometry(1.5, 1.5, 1, 12)
        : new OctahedronGeometry(1).scale(1.6, 0.5, 1.6);
  return g.translate(0, 0.5, 0);
}

interface ShapeKit {
  fill: BufferGeometry;
  edges: EdgesGeometry;
}

interface NodeView {
  group: Group;
  outlines: LineSegments[];
  line: LineBasicMaterial;
  fill: MeshBasicMaterial;
}

function makeNodeView(kit: ShapeKit, opacity: number): NodeView {
  const group = new Group();
  const line = new LineBasicMaterial({ transparent: true, opacity });
  const fill = new MeshBasicMaterial({ transparent: true, opacity: 0.08, depthWrite: false });
  group.add(new Mesh(kit.fill, fill));
  const outlines = OUTLINE_SCALES.map((s) => {
    const outline = new LineSegments(kit.edges, line);
    outline.scale.set(s, 1, s);
    group.add(outline);
    return outline;
  });
  return { group, outlines, line, fill };
}

function rgbOf(hex: string): Rgb {
  const c = new Color(hex);
  return [c.r, c.g, c.b];
}

export function createFailoverScene(canvas: HTMLCanvasElement, tier: PerfTier): FailoverScene {
  let settings = TIER_SETTINGS[tier];
  const renderer = new WebGLRenderer({
    canvas,
    antialias: settings.antialias,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.maxPixelRatio));
  renderer.setClearColor(new Color(BACKGROUND), 1);

  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 1, 1000);
  let cam: CameraState | null = null;
  let aspect = 1;

  // The ground: a faint grid whose lines fall between tiles, so services sit in cells.
  const span = CONFIG.gridSize * CONFIG.tileSize + CONFIG.tileSize;
  const grid = new GridHelper(span, CONFIG.gridSize + 1, GRID_MAJOR, GRID_MINOR);
  scene.add(grid);

  // The Internet: a slowly turning wire ball where all traffic starts.
  const internet = new LineSegments(
    new EdgesGeometry(new IcosahedronGeometry(2.2, 0)),
    new LineBasicMaterial({ color: new Color(INTERNET_COLOR) }),
  );
  internet.position.y = 2.2;
  scene.add(internet);

  // Links: one LineSegments rewritten from the snapshot.
  const linkPositions = new Float32Array(LINK_CAPACITY * 2 * 3);
  const linkGeometry = new BufferGeometry();
  const linkAttr = new BufferAttribute(linkPositions, 3);
  linkAttr.setUsage(DynamicDrawUsage);
  linkGeometry.setAttribute("position", linkAttr);
  const links = new LineSegments(
    linkGeometry,
    new LineBasicMaterial({ color: new Color(LINK_COLOR), transparent: true, opacity: 0.55 }),
  );
  links.frustumCulled = false;
  scene.add(links);

  // Requests: one InstancedMesh of small octahedra, coloured by traffic type.
  const matrices = new Float32Array(REQUEST_CAPACITY * 16);
  const colors = new Float32Array(REQUEST_CAPACITY * 3);
  const requests = new InstancedMesh(
    new OctahedronGeometry(0.45),
    new MeshBasicMaterial({ color: 0xffffff }),
    REQUEST_CAPACITY,
  );
  requests.instanceMatrix = new InstancedBufferAttribute(matrices, 16);
  requests.instanceMatrix.setUsage(DynamicDrawUsage);
  requests.instanceColor = new InstancedBufferAttribute(colors, 3);
  requests.instanceColor.setUsage(DynamicDrawUsage);
  requests.count = 0;
  requests.frustumCulled = false;
  scene.add(requests);
  const trafficRgb = new Map<TrafficType, Rgb>(
    (Object.keys(TRAFFIC_TYPES) as TrafficType[]).map((t) => [t, rgbOf(TRAFFIC_COLORS[t])]),
  );
  const failRgb = rgbOf(FAIL_COLOR);
  const colorOf = (t: TrafficType): Rgb => trafficRgb.get(t) ?? failRgb;

  // Services.
  const kits = new Map<NodeShape, ShapeKit>();
  const kitFor = (shape: NodeShape): ShapeKit => {
    let kit = kits.get(shape);
    if (!kit) {
      const fill = unitGeometry(shape);
      kit = { fill, edges: new EdgesGeometry(fill) };
      kits.set(shape, kit);
    }
    return kit;
  };
  const nodes = new Map<string, NodeView>();
  const flashes = new Map<string, { color: string; until: number }>();
  const pulses = new Map<string, number>();

  const ghostViews = new Map<NodeShape, NodeView>();
  const ghostFor = (shape: NodeShape): NodeView => {
    let view = ghostViews.get(shape);
    if (!view) {
      view = makeNodeView(kitFor(shape), 0.6);
      view.group.visible = false;
      scene.add(view.group);
      ghostViews.set(shape, view);
    }
    return view;
  };

  let overlay: Overlay = { ghost: null, highlight: null };
  let last: Snapshot | null = null;
  const raycaster = new Raycaster();
  const ndc = new Vector2();

  function applyCamera(): void {
    if (!cam) return;
    const pose = cameraPose(cam);
    camera.left = -pose.halfHeight * aspect;
    camera.right = pose.halfHeight * aspect;
    camera.top = pose.halfHeight;
    camera.bottom = -pose.halfHeight;
    camera.position.set(...pose.position);
    camera.up.set(...pose.up);
    camera.lookAt(...pose.target);
    camera.updateProjectionMatrix();
  }

  function takeEvents(events: readonly SimEvent[], nowMs: number): void {
    for (const e of events) {
      if (e.kind === "request-failed" && e.serviceId) {
        flashes.set(e.serviceId, { color: FLASH[e.kind].color, until: nowMs + FLASH[e.kind].ms });
      } else if (e.kind === "request-blocked" || e.kind === "cache-hit") {
        flashes.set(e.serviceId, { color: FLASH[e.kind].color, until: nowMs + FLASH[e.kind].ms });
      } else if (e.kind === "event-start" && e.serviceId) {
        flashes.set(e.serviceId, { color: FLASH.outage.color, until: nowMs + FLASH.outage.ms });
      } else if (e.kind === "service-placed" || e.kind === "service-upgraded") {
        pulses.set(e.id, nowMs + PULSE_MS);
      }
    }
  }

  function syncNodes(snapshot: Snapshot, nowMs: number): void {
    const { added, removed } = diffIds(new Set(nodes.keys()), snapshot.services);
    for (const id of removed) {
      const view = nodes.get(id);
      if (view) {
        scene.remove(view.group);
        view.line.dispose();
        view.fill.dispose();
      }
      nodes.delete(id);
      flashes.delete(id);
      pulses.delete(id);
    }
    for (const id of added) {
      const service = snapshot.services.find((s) => s.id === id);
      if (!service) continue;
      const view = makeNodeView(kitFor(nodeShape(service.type)), 1);
      scene.add(view.group);
      nodes.set(id, view);
    }
    for (const service of snapshot.services) {
      const view = nodes.get(service.id);
      if (!view) continue;
      const flash = flashes.get(service.id);
      const flashColor = flash && flash.until > nowMs ? flash.color : null;
      if (flash && !flashColor) flashes.delete(service.id);
      const style = nodeStyle(service, flashColor);
      let scale = 1;
      const pulseUntil = pulses.get(service.id);
      if (pulseUntil !== undefined) {
        if (pulseUntil > nowMs) scale += 0.25 * ((pulseUntil - nowMs) / PULSE_MS);
        else pulses.delete(service.id);
      }
      if (overlay.highlight === service.id) scale += 0.12 * (1 + Math.sin(nowMs / 120));
      view.group.position.set(service.x, 0, service.z);
      view.group.scale.set(scale, style.height * scale, scale);
      view.line.color.set(style.color);
      view.line.opacity = style.opacity;
      view.fill.color.set(style.color);
      view.outlines.forEach((o, i) => {
        o.visible = i < style.outlines;
      });
    }
  }

  function syncGhost(nowMs: number): void {
    for (const view of ghostViews.values()) view.group.visible = false;
    const g = overlay.ghost;
    if (!g) return;
    const view = ghostFor(nodeShape(g.type));
    const color = SERVICE_COLORS[g.type];
    view.group.visible = true;
    view.group.position.set(g.x, 0, g.z);
    view.group.scale.set(1, 1.6, 1);
    view.line.color.set(color);
    view.line.opacity = 0.45 + 0.25 * Math.sin(nowMs / 160);
    view.fill.color.set(color);
    view.outlines.forEach((o, i) => {
      o.visible = i === 0;
    });
  }

  return {
    render(snapshot, events, nowMs) {
      last = snapshot;
      takeEvents(events, nowMs);
      syncNodes(snapshot, nowMs);
      syncGhost(nowMs);

      internet.position.x = snapshot.internet.x;
      internet.position.z = snapshot.internet.z;
      if (settings.idleAnimation) internet.rotation.y = nowMs / 2400;
      if (overlay.highlight === "internet") {
        internet.scale.setScalar(1 + 0.12 * (1 + Math.sin(nowMs / 120)));
      } else {
        internet.scale.setScalar(1);
      }

      const vertices = writeConnectionSegments(snapshot, linkPositions);
      linkGeometry.setDrawRange(0, vertices);
      linkAttr.needsUpdate = true;

      requests.count = writeRequestInstances(
        snapshot.requests,
        settings.maxDrawnRequests,
        matrices,
        colors,
        colorOf,
        failRgb,
      );
      requests.instanceMatrix.needsUpdate = true;
      if (requests.instanceColor) requests.instanceColor.needsUpdate = true;

      renderer.render(scene, camera);
    },
    resize(width, height) {
      if (width <= 0 || height <= 0) return;
      aspect = width / height;
      renderer.setSize(width, height, false);
      applyCamera();
    },
    setCamera(state) {
      cam = state;
      applyCamera();
    },
    setOverlay(next) {
      overlay = next;
    },
    setTier(next) {
      settings = TIER_SETTINGS[next];
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.maxPixelRatio));
    },
    pick(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      ndc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const point = groundPoint(raycaster.ray.origin, raycaster.ray.direction);
      const cell = point ? cellAt(point) : null;
      if (!cell) return null;
      return { cell, node: last ? nodeAt(cell, last) : null };
    },
    dispose() {
      const geometries = new Set<BufferGeometry>();
      const materials = new Set<Material>();
      scene.traverse((object) => {
        if (object instanceof Mesh || object instanceof LineSegments) {
          geometries.add(object.geometry);
          const material: Material | Material[] = object.material;
          for (const m of Array.isArray(material) ? material : [material]) materials.add(m);
        }
      });
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      nodes.clear();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
