export async function renderShareImage(
  canvas: HTMLCanvasElement,
  stats: { score: number; distance: number; kills: number },
): Promise<Blob | null> {
  const w = 1200,
    h = 630;
  const outCanvas = document.createElement("canvas");
  outCanvas.width = w;
  outCanvas.height = h;
  const ctx = outCanvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(canvas, 0, 0, w, h);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 64px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("ORBITAL DODGE", w / 2, 120);
  ctx.font = "36px system-ui";
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText(`Score: ${stats.score.toLocaleString()}`, w / 2, 280);
  ctx.fillText(`Distance: ${stats.distance}m`, w / 2, 340);
  ctx.fillText(`Kills: ${stats.kills}`, w / 2, 400);
  ctx.font = "20px system-ui";
  ctx.fillStyle = "#64748b";
  ctx.fillText("amindhou.com/games/space-shooter", w / 2, 580);
  return new Promise((resolve) => outCanvas.toBlob((b) => resolve(b), "image/png"));
}
