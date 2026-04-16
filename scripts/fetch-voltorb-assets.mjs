// scripts/fetch-voltorb-assets.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const BASE = "https://raw.githubusercontent.com/samualtnorman/voltorb-flip/main/src/assets";
const OUT = "public/games/super-voltorb-flip/sprites";

const FILES = [
  // tiles
  "tile/blank.png", "tile/hover.png",
  "tile/flip_0.png", "tile/flip_1.png",
  "tile/1.png", "tile/2.png", "tile/3.png",
  "tile/1_flip.png", "tile/2_flip.png", "tile/3_flip.png",
  "tile/voltorb.png", "tile/voltorb_flip.png",
  "tile/memo_0.png", "tile/memo_1.png", "tile/memo_2.png", "tile/memo_3.png",
  ...Array.from({ length: 9 }, (_, i) => `tile/explode_${i}.png`),
  // buttons
  "button/play.png", "button/quit.png", "button/game_info.png",
  "button/blue/quit.png", "button/blue/quit_hover.png", "button/blue/quit_press.png",
  "button/memo/0_off.png", "button/memo/0_on.png",
  "button/memo/1_off.png", "button/memo/1_on.png",
  "button/memo/2_off.png", "button/memo/2_on.png",
  "button/memo/3_off.png", "button/memo/3_on.png",
  "button/memo/open.png", "button/memo/open_press.png",
  "button/memo/close.png", "button/memo/close_press.png",
  "button/memo/hover.png", "button/memo/s_off.png", "button/memo/s_on.png",
  // numbers
  ...Array.from({ length: 10 }, (_, i) => `number/big_${i}.png`),
  ...Array.from({ length: 10 }, (_, i) => `number/bold_${i}.png`),
  ...Array.from({ length: 8 }, (_, i) => `number/thin_${i + 1}.png`),
  // frame
  "frame/frame.png", "frame/hover_0.png", "frame/hover_1.png", "frame/hover_2.png",
  // dialogue
  "dialogue/play.png",
  "dialogue/clear_0.png", "dialogue/clear_1.png", "dialogue/clear_2.png",
  "dialogue/received.png",
  "dialogue/received_0.png", "dialogue/received_1.png", "dialogue/received_2.png", "dialogue/received_3.png",
  // memo panel
  "memo/0.png", "memo/1.png", "memo/2.png", "memo/3.png",
  "memo/frame.png", "memo/hover.png", "memo/press.png",
  // misc
  "background.png",
  "success_0.png", "success_1.png", "success_2.png", "success_3.png",
];

async function fetchOne(rel) {
  const url = `${BASE}/${rel}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed ${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const dest = join(OUT, rel);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  process.stdout.write(`  ${rel} (${buf.length}B)\n`);
}

console.log(`Fetching ${FILES.length} sprites to ${OUT}...`);
let ok = 0, fail = 0;
for (const f of FILES) {
  try { await fetchOne(f); ok++; } catch (err) { console.error(`FAILED ${f}: ${err.message}`); fail++; }
}

// Fetch the LICENSE file
const licRes = await fetch("https://raw.githubusercontent.com/samualtnorman/voltorb-flip/main/LICENSE");
if (licRes.ok) {
  const licText = await licRes.text();
  await writeFile(join(OUT, "LICENSE"), licText);
  console.log("LICENSE fetched");
} else {
  console.error(`LICENSE fetch failed: ${licRes.status}`);
}
console.log(`Done. ${ok} succeeded, ${fail} failed.`);
