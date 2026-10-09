import type { ServiceType } from "../sim/config";
import { T } from "../strings";

// The build palette: upstream's five categories (src/ui/toolbar.js, front door
// to ops) and each service's short toolbar label. catalog.test.ts holds every
// type to exactly one category, so a new service cannot go missing from it.

export interface Category {
  id: "frontdoor" | "compute" | "data" | "async" | "ops";
  label: string;
  types: readonly ServiceType[];
}

export const CATEGORIES: readonly Category[] = [
  {
    id: "frontdoor",
    label: T.cat_frontdoor,
    types: ["dns", "cdn", "waf", "auth", "apigw", "alb"],
  },
  {
    id: "compute",
    label: T.cat_compute,
    types: ["compute", "serverless", "container", "gpu", "infgw"],
  },
  {
    id: "data",
    label: T.cat_data,
    types: ["db", "nosql", "cache", "s3", "search", "replica", "warehouse"],
  },
  {
    id: "async",
    label: T.cat_async,
    types: ["sqs", "pubsub", "stream", "dlq", "scheduler", "notify"],
  },
  { id: "ops", label: T.cat_ops, types: ["monitor", "power"] },
];

export const SHORT_NAME: Record<ServiceType, string> = {
  waf: T.fw,
  alb: T.lb,
  compute: T.compute_short,
  db: T.db_short,
  s3: T.storage_short,
  cdn: T.cdn_short,
  cache: T.cache_short,
  sqs: T.queue,
  apigw: T.apigw_short,
  nosql: T.nosql_short,
  search: T.search_short,
  replica: T.replica_short,
  serverless: T.serverless_short,
  monitor: T.monitor_short,
  dlq: T.dlq_short,
  pubsub: T.pubsub_short,
  auth: T.auth_short,
  scheduler: T.scheduler_short,
  notify: T.notify_short,
  container: T.container_short,
  stream: T.stream_short,
  dns: T.dns_short,
  warehouse: T.warehouse_short,
  gpu: T.gpu_short,
  infgw: T.infgw_short,
  power: T.power_short,
};

/** The category a service is built from. */
export function categoryOf(type: ServiceType): Category["id"] {
  return (CATEGORIES.find((c) => c.types.includes(type)) ?? CATEGORIES[0]!).id;
}
