import { expect, test } from "@playwright/test";
import { z } from "zod";
import { blockThirdParties, jsonLdNodes, nodesOf, pathOf, sitemapUrls } from "./helpers";
import { GAMES } from "../src/app/games/games-meta";

// What a crawler or an answer engine sees: the sitemap, robots.txt, llms.txt,
// canonicals and JSON-LD, read off the running production build.

const personSchema = z.object({
  "@type": z.literal("Person"),
  "@id": z.string(),
  image: z.string(),
});
const profilePageSchema = z.object({
  "@type": z.literal("ProfilePage"),
  mainEntity: z.object({ "@id": z.string() }),
});
const faqPageSchema = z.object({
  "@type": z.literal("FAQPage"),
  mainEntity: z.array(
    z.object({ name: z.string(), acceptedAnswer: z.object({ text: z.string() }) }),
  ),
});
const creativeWorkSchema = z.object({
  "@type": z.literal("CreativeWork"),
  "@id": z.string(),
  creator: z.object({ "@id": z.string() }),
});
const breadcrumbSchema = z.object({
  "@type": z.literal("BreadcrumbList"),
  itemListElement: z.array(z.object({ name: z.string(), item: z.string() })),
});
const itemListSchema = z.object({
  "@type": z.literal("ItemList"),
  itemListElement: z.array(z.object({ position: z.number(), name: z.string(), url: z.string() })),
});
const collectionPageSchema = z.object({
  "@type": z.literal("CollectionPage"),
  url: z.string(),
  mainEntity: itemListSchema,
});
const blogPostingSchema = z.object({
  "@type": z.literal("BlogPosting"),
  image: z.string(),
  author: z.object({ "@id": z.string() }),
});
const videoGameSchema = z.object({
  "@type": z.literal("VideoGame"),
  name: z.string(),
  url: z.string(),
  author: z.object({ "@id": z.string() }),
});

const publicGames = GAMES.filter((g) => !g.hidden);
const hiddenGames = GAMES.filter((g) => g.hidden);
const MIN_ABOUT_WORDS = 350;

const withoutTrailingSlash = (url: string) => url.replace(/\/$/, "");
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test.beforeEach(async ({ context, baseURL }) => {
  await blockThirdParties(context, baseURL);
});

test("robots.txt allows crawling and points at the sitemap", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toMatch(/^Allow: \/$/m);
  expect(body).not.toMatch(/^Disallow: \/$/m);
  const sitemap = /^Sitemap: (\S+)$/m.exec(body)?.[1];
  expect(sitemap && pathOf(sitemap)).toBe("/sitemap.xml");
});

test("every sitemap URL serves an indexable page that declares itself canonical", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);
  const urls = await sitemapUrls(request);
  expect(urls.length).toBeGreaterThan(10);

  for (const url of urls) {
    const response = await page.goto(pathOf(url), { waitUntil: "domcontentloaded" });
    expect.soft(response?.status(), url).toBe(200);
    await expect
      .soft(page.locator('link[rel="canonical"]'), `${url} canonical`)
      .toHaveAttribute("href", new RegExp(`^${escapeRegExp(withoutTrailingSlash(url))}/?$`));
    await expect.soft(page.locator('meta[name="robots"][content*="noindex"]'), url).toHaveCount(0);
    await expect.soft(page.locator("h1"), `${url} has one h1`).toHaveCount(1);
  }
});

test("/games and every game page share og:url with the canonical and carry a twitter card", async ({
  page,
  request,
}) => {
  const urls = (await sitemapUrls(request)).filter((url) => pathOf(url).startsWith("/games"));
  expect(urls.length).toBeGreaterThan(1);

  for (const url of urls) {
    await page.goto(pathOf(url), { waitUntil: "domcontentloaded" });
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect.soft(canonical, `${url} canonical`).toBeTruthy();
    await expect
      .soft(page.locator('meta[property="og:url"]'), `${url} og:url`)
      .toHaveAttribute("content", canonical ?? "");
    await expect
      .soft(page.locator('meta[name="twitter:card"]'), `${url} twitter:card`)
      .toHaveCount(1);
  }
});

test("every same-site link in llms.txt resolves", async ({ request }) => {
  const res = await request.get("/llms.txt");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/plain");
  const body = await res.text();
  expect(body.startsWith("# ")).toBe(true);

  const [home] = await sitemapUrls(request);
  const siteOrigin = new URL(home!).origin;
  const links = [...body.matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)]
    .flatMap((match) => (match[1] ? [match[1]] : []))
    .filter((link) => new URL(link).origin === siteOrigin);
  expect(links.length).toBeGreaterThan(10);

  for (const link of new Set(links)) {
    const linked = await request.get(pathOf(link));
    expect.soft(linked.status(), link).toBe(200);
  }
});

test("the home page describes Amin as a Person with a working photo", async ({ page, request }) => {
  await page.goto("/");
  const nodes = await jsonLdNodes(page);

  const people = nodesOf(nodes, personSchema);
  expect(people).toHaveLength(1);
  const person = people[0]!;
  const photo = await request.get(pathOf(person.image));
  expect(photo.status(), person.image).toBe(200);
  expect(photo.headers()["content-type"]).toMatch(/^image\//);

  const [profilePage] = nodesOf(nodes, profilePageSchema);
  expect(profilePage?.mainEntity["@id"]).toBe(person["@id"]);
});

test("the FAQPage markup matches the FAQ a visitor can read", async ({ page }) => {
  await page.goto("/");
  const [faqPage] = nodesOf(await jsonLdNodes(page), faqPageSchema);
  expect(faqPage).toBeDefined();
  const entries = faqPage!.mainEntity;

  await expect(page.locator("#faq summary h3")).toHaveText(entries.map((entry) => entry.name));
  const details = page.locator("#faq details");
  for (const [i, entry] of entries.entries()) {
    await details.nth(i).locator("summary").click();
    await expect(details.nth(i).locator("p")).toBeVisible();
    await expect(details.nth(i).locator("p")).toHaveText(entry.acceptedAnswer.text);
  }
});

test("/work links every project page, and each carries CreativeWork and breadcrumb markup", async ({
  page,
  request,
}) => {
  const projectUrls = (await sitemapUrls(request)).filter((url) =>
    pathOf(url).startsWith("/work/"),
  );
  expect(projectUrls.length).toBeGreaterThan(0);

  await page.goto("/work");
  const hrefs = await page
    .locator('a[href^="/work/"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect([...new Set(hrefs)].sort()).toEqual(projectUrls.map(pathOf).sort());

  for (const url of projectUrls) {
    await page.goto(pathOf(url));
    const nodes = await jsonLdNodes(page);
    const [work] = nodesOf(nodes, creativeWorkSchema);
    expect.soft(work?.["@id"], url).toBe(`${url}#project`);
    const [person] = nodesOf(nodes, personSchema);
    expect.soft(work?.creator["@id"], url).toBe(person?.["@id"]);
    const [breadcrumb] = nodesOf(nodes, breadcrumbSchema);
    expect.soft(breadcrumb?.itemListElement.map((crumb) => crumb.item).at(-1), url).toBe(url);
  }
});

test("blog posts carry BlogPosting markup with a working image and a known author", async ({
  page,
  request,
}) => {
  const postUrls = (await sitemapUrls(request)).filter((url) => pathOf(url).startsWith("/blog/"));
  expect(postUrls.length).toBeGreaterThan(0);

  for (const url of postUrls) {
    await page.goto(pathOf(url));
    const nodes = await jsonLdNodes(page);
    const [posting] = nodesOf(nodes, blogPostingSchema);
    expect.soft(posting, url).toBeDefined();
    if (!posting) continue;
    const [person] = nodesOf(nodes, personSchema);
    expect.soft(posting.author["@id"], url).toBe(person?.["@id"]);
    const image = await request.get(pathOf(posting.image));
    expect.soft(image.status(), posting.image).toBe(200);
    expect.soft(image.headers()["content-type"], posting.image).toMatch(/^image\//);
  }
});

test("/blog carries CollectionPage markup listing every post, in the order a visitor reads them", async ({
  page,
  request,
}) => {
  const urls = await sitemapUrls(request);
  const postUrls = urls.filter((url) => pathOf(url).startsWith("/blog/"));
  const blogUrl = urls.find((url) => pathOf(url) === "/blog");
  expect(postUrls.length).toBeGreaterThan(0);
  expect(blogUrl).toBeDefined();

  await page.goto("/blog");
  const nodes = await jsonLdNodes(page);
  const [collection] = nodesOf(nodes, collectionPageSchema);
  expect(collection?.url).toBe(blogUrl);
  const items = collection!.mainEntity.itemListElement;
  expect(items.map((item) => item.url).sort()).toEqual([...postUrls].sort());
  expect(items.map((item) => item.position)).toEqual(items.map((_, i) => i + 1));
  await expect(page.locator('a[href^="/blog/"] h2')).toHaveText(items.map((item) => item.name));

  const [breadcrumb] = nodesOf(nodes, breadcrumbSchema);
  expect(breadcrumb?.itemListElement.map((crumb) => crumb.item).at(-1)).toBe(blogUrl);
});

test("the footer links every hub page from anywhere on the site", async ({ page, request }) => {
  for (const path of ["/", "/blog", "/reviews", "/work/caramel"]) {
    await page.goto(path);
    const hrefs = await page
      .getByRole("navigation", { name: "Site pages" })
      .getByRole("link")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect.soft(hrefs, path).toEqual(["/work", "/blog", "/reviews", "/games", "/ai", "/feed.xml"]);
  }
  for (const hub of ["/work", "/blog", "/reviews", "/games", "/ai", "/feed.xml"]) {
    expect.soft((await request.get(hub)).status(), hub).toBe(200);
  }
});

test("unknown routes answer with a real 404", async ({ request }) => {
  for (const path of ["/this-page-does-not-exist", "/work/not-a-project", "/blog/not-a-post"]) {
    expect.soft((await request.get(path)).status(), path).toBe(404);
  }
});

test("every public game page server-renders its About copy, game JSON-LD and its own share image", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(120_000);
  // JavaScript off: what a crawler reads before hydration. The games are client-only.
  const context = await browser.newContext({ javaScriptEnabled: false });
  await blockThirdParties(context, baseURL);
  const page = await context.newPage();

  try {
    for (const game of publicGames) {
      const path = `/games/${game.slug}`;
      await page.goto(path, { waitUntil: "domcontentloaded" });

      const aboutBlock = page.locator("[data-game-about]");
      await expect.soft(aboutBlock, `${path} About block`).toHaveCount(1);
      if ((await aboutBlock.count()) === 1) {
        const words = (await aboutBlock.innerText()).split(/\s+/).filter(Boolean).length;
        expect.soft(words, `${path} About words`).toBeGreaterThanOrEqual(MIN_ABOUT_WORDS);
      }

      const nodes = await jsonLdNodes(page);
      const [videoGame] = nodesOf(nodes, videoGameSchema);
      expect.soft(videoGame?.name, `${path} VideoGame name`).toBe(game.title);
      expect.soft(videoGame && pathOf(videoGame.url), `${path} VideoGame url`).toBe(path);
      expect.soft(nodesOf(nodes, faqPageSchema), `${path} FAQPage`).toHaveLength(1);
      const [crumbs] = nodesOf(nodes, breadcrumbSchema);
      expect
        .soft(
          crumbs?.itemListElement.map((c) => c.name),
          `${path} breadcrumb`,
        )
        .toEqual(["Home", "Games", game.title]);

      // Next appends a ?<hash> to file-based image URLs, so match the path by substring.
      const ogImage = await page.locator('meta[property="og:image"]').getAttribute("content");
      const twitterImage = await page.locator('meta[name="twitter:image"]').getAttribute("content");
      expect.soft(ogImage, `${path} og:image`).toContain(`${path}/opengraph-image`);
      expect.soft(twitterImage, `${path} twitter:image`).toContain(`${path}/opengraph-image`);
      if (ogImage) {
        const image = await request.get(pathOf(ogImage));
        expect.soft(image.status(), ogImage).toBe(200);
        expect.soft(image.headers()["content-type"], ogImage).toContain("image/png");
      }
    }
  } finally {
    await context.close();
  }
});

test("/games is a CollectionPage whose ItemList names every public game in order", async ({
  page,
}) => {
  await page.goto("/games", { waitUntil: "domcontentloaded" });
  const [collection] = nodesOf(await jsonLdNodes(page), collectionPageSchema);
  expect(collection?.mainEntity.itemListElement.map((item) => pathOf(item.url))).toEqual(
    publicGames.map((g) => `/games/${g.slug}`),
  );
});

test("the sitemap and llms.txt cover every public game and no hidden one; hidden games are noindex", async ({
  page,
  request,
}) => {
  // Guard the derived lists: a wrong `hidden` flag must not pass silently.
  expect(publicGames.length).toBeGreaterThan(1);
  expect(GAMES.find((g) => g.slug === "tower-stacker")?.hidden).toBe(true);
  const sitemapPaths = (await sitemapUrls(request)).map(pathOf);
  const llms = await (await request.get("/llms.txt")).text();

  for (const game of publicGames) {
    expect.soft(sitemapPaths, `${game.slug} in sitemap`).toContain(`/games/${game.slug}`);
    expect.soft(llms, `${game.slug} in llms.txt`).toContain(`/games/${game.slug})`);
  }
  for (const game of hiddenGames) {
    expect.soft(sitemapPaths, `${game.slug} not in sitemap`).not.toContain(`/games/${game.slug}`);
    expect.soft(llms, `${game.slug} not in llms.txt`).not.toContain(`/games/${game.slug})`);
    await page.goto(`/games/${game.slug}`, { waitUntil: "domcontentloaded" });
    await expect
      .soft(page.locator('meta[name="robots"]'), `${game.slug} noindex`)
      .toHaveAttribute("content", /noindex/);
  }
});
