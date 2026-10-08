import { SITE_ORIGIN } from "@/data/profile";

export function shareText(score: number): string {
  return `I scored ${score} in Orbital Dodge. Beat it: ${SITE_ORIGIN}/games/space-shooter`;
}

interface ShareNav {
  canShare?: (d: { files: File[] }) => boolean;
  share?: (d: { files: File[]; title?: string; text?: string }) => Promise<void>;
  clipboard?: { writeText: (t: string) => Promise<void> };
}

/**
 * Native file share when available; otherwise (or if the share fails for a
 * reason other than the user dismissing it) copy the text to the clipboard and
 * download the image. A dismissed share sheet does nothing further.
 */
export async function shareRun(input: {
  score: number;
  file: File;
  nav: ShareNav;
  download: () => void;
}): Promise<{ shared: boolean; copied: boolean; downloaded: boolean }> {
  const { score, file, nav, download } = input;
  const text = shareText(score);
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ title: "Orbital Dodge", text, files: [file] });
      return { shared: true, copied: false, downloaded: false };
    } catch (e) {
      // The user dismissed the share sheet: they chose not to share, so no copy and no download.
      if (e instanceof DOMException && e.name === "AbortError") {
        return { shared: false, copied: false, downloaded: false };
      }
      // silent-ok: Web Share API rejected (unsupported or blocked); falls through to copy and download below
    }
  }
  let copied = false;
  try {
    if (nav.clipboard) {
      await nav.clipboard.writeText(text);
      copied = true;
    }
  } catch {
    // silent-ok: clipboard write denied; the image download below still goes ahead
  }
  download();
  return { shared: false, copied, downloaded: true };
}
