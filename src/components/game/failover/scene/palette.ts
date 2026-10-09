import type { ServiceType, TrafficType } from "../sim/config";

// The scene's colours, all from the site's accent tokens (globals.css @theme,
// pinned by a test), so the board reads as the same neon wireframe as the rest
// of the site. The scene is a fixed dark surface whatever the site theme.

export const ACCENT = {
  green: "#22c55e",
  blue: "#6366f1",
  purple: "#a78bfa",
  amber: "#f59e0b",
  cyan: "#06b6d4",
  pink: "#ec4899",
  red: "#ef4444",
} as const;

export const BACKGROUND = "#050505";
export const GRID_MAJOR = "#27272a";
export const GRID_MINOR = "#18181b";
export const LINK_COLOR = "#a1a1aa";
export const INTERNET_COLOR = "#ededed";
export const FAIL_COLOR = ACCENT.red;
/** Out of service (an outage): dimmed to this. */
export const DISABLED_COLOR = "#52525b";

/** One accent per service, grouped by role: edge, routing, compute, data, messaging, ops. */
export const SERVICE_COLORS: Record<ServiceType, string> = {
  // Edge and security
  waf: ACCENT.red,
  apigw: ACCENT.pink,
  auth: ACCENT.pink,
  dns: ACCENT.cyan,
  // Routing and delivery
  alb: ACCENT.blue,
  cdn: ACCENT.cyan,
  infgw: ACCENT.purple,
  // Compute
  compute: ACCENT.green,
  serverless: ACCENT.green,
  container: ACCENT.green,
  scheduler: ACCENT.amber,
  gpu: ACCENT.purple,
  // Data
  db: ACCENT.amber,
  nosql: ACCENT.amber,
  replica: ACCENT.amber,
  warehouse: ACCENT.amber,
  cache: ACCENT.cyan,
  s3: ACCENT.blue,
  search: ACCENT.purple,
  // Messaging
  sqs: ACCENT.pink,
  pubsub: ACCENT.pink,
  stream: ACCENT.pink,
  notify: ACCENT.pink,
  dlq: ACCENT.red,
  // Operations
  monitor: ACCENT.cyan,
  power: ACCENT.amber,
};

export const TRAFFIC_COLORS: Record<TrafficType, string> = {
  STATIC: ACCENT.cyan,
  READ: ACCENT.blue,
  WRITE: ACCENT.amber,
  UPLOAD: ACCENT.purple,
  SEARCH: ACCENT.green,
  MALICIOUS: ACCENT.red,
  INFERENCE: ACCENT.pink,
};
