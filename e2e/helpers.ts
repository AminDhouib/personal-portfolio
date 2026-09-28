import type { APIRequestContext, BrowserContext, Page } from "@playwright/test";
import { z } from "zod";
import { safeJsonParse } from "../src/lib/safe-json";

/** The configured baseURL; every spec needs one, so a missing value is a config bug. */
function requireBaseUrl(baseURL: string | undefined): string {
  if (!baseURL) throw new Error("playwright.config.ts must set use.baseURL");
  return baseURL;
}

/** True when the suite is pointed at a local server rather than a deployed one. */
export function isLocalhost(baseURL: string | undefined): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(requireBaseUrl(baseURL)).hostname);
}

/**
 * Keeps a run inside the app under test: aborts every request to another
 * origin (Google Analytics, PostHog, the booking page, images on CDNs), the
 * Sentry tunnel, and the AI chat proxy (each chat turn costs money). Returns
 * the live list of blocked URLs so a test can assert a navigation was
 * attempted without it ever leaving the machine.
 */
export async function blockThirdParties(
  context: BrowserContext,
  baseURL: string | undefined,
): Promise<string[]> {
  const origin = new URL(requireBaseUrl(baseURL)).origin;
  const blocked: string[] = [];
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    const internal =
      url.origin === origin &&
      !url.pathname.startsWith("/monitoring") &&
      !url.pathname.startsWith("/api/copilotkit");
    if (internal) return route.continue();
    blocked.push(url.href);
    return route.abort("blockedbyclient");
  });
  return blocked;
}

/** Path and query of an absolute URL, so production URLs can be requested from the server under test. */
export function pathOf(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

/** Every <loc> in the served sitemap.xml, as the absolute production URLs it lists. */
export async function sitemapUrls(request: APIRequestContext): Promise<string[]> {
  const res = await request.get("/sitemap.xml");
  if (!res.ok()) throw new Error(`sitemap.xml returned ${res.status()}`);
  const xml = await res.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].flatMap((match) => (match[1] ? [match[1]] : []));
}

const nodeSchema = z.looseObject({ "@type": z.string() });
const graphSchema = z.object({ "@graph": z.array(nodeSchema) });

type JsonLdNode = z.infer<typeof nodeSchema>;

/** Every top-level JSON-LD node on the page, with @graph containers flattened. */
export async function jsonLdNodes(page: Page): Promise<JsonLdNode[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.flatMap((text) => {
    const value = safeJsonParse(text, "e2e:json-ld");
    const graph = graphSchema.safeParse(value);
    return graph.success ? graph.data["@graph"] : [nodeSchema.parse(value)];
  });
}

/** The nodes that match `schema`, parsed into its shape. */
export function nodesOf<T>(nodes: JsonLdNode[], schema: z.ZodType<T>): T[] {
  return nodes.flatMap((node) => {
    const parsed = schema.safeParse(node);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * Resolves once React has hydrated the home page. The hero photo mounts its
 * second image from a post-load effect, so its presence proves effects have
 * run, including the layout's click tracker and the chat launcher's handler.
 */
export async function waitForHomeHydration(page: Page): Promise<void> {
  await page.getByTestId("hero-photo-ouch").waitFor({ state: "attached" });
}

interface GtagEvent {
  name: string;
  params: Record<string, string>;
}

/** The gtag("event", ...) calls queued on window.dataLayer, in order. */
export async function gtagEvents(page: Page): Promise<GtagEvent[]> {
  return page.evaluate(() => {
    const layer = (window as Window & { dataLayer?: IArguments[] }).dataLayer ?? [];
    return layer
      .map((entry) => Array.from(entry))
      .filter((args) => args[0] === "event")
      .map((args) => ({ name: String(args[1]), params: args[2] as Record<string, string> }));
  });
}
