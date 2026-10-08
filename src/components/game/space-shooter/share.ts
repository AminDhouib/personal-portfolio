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
 * Native file share when available; otherwise (or if the share is cancelled)
 * copy the text to the clipboard and download the image.
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
    } catch {
      // silent-ok: Web Share API rejected (user cancelled or unsupported); falls through to copy and download below
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
