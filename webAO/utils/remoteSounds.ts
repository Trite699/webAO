/**
 * Sounds and blips for CDN ("remote") characters.
 *
 * webAO plays sounds from "<host>sounds/general/<name>.opus" and blips from
 * "<host>sounds/blips/<name>.opus" -- paths that don't mention the speaker.
 * For a character added from a CDN we also look for those files on that CDN
 * (AO2 layout: <cdn base>/characters/<Name>/<sfx> first, then
 * <cdn base>/sounds/general|blips/<name>), trying the usual audio
 * extensions and capitalisations, and fall back to the player's own server
 * when the CDN doesn't have the file.
 */
import { getRemoteCharacter, caseVariants } from "./remoteCharacterStore";

const EXTS = [".opus", ".ogg", ".mp3", ".wav"];

let currentSpeaker = "";
/** The character whose message is currently playing (used by frame/effect SFX). */
export function setRemoteSpeaker(name: string | undefined): void {
  currentSpeaker = (name ?? "").toLowerCase();
}

const resolved = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

function head(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("HEAD", url);
    xhr.onload = () => resolve(xhr.status === 200);
    xhr.onerror = () => resolve(false);
    xhr.send(null);
  });
}

const enc = (path: string) => path.split("/").map(encodeURIComponent).join("/");

/** Parent of ".../characters/<Name>/", i.e. the CDN's "base/" folder. */
function cdnRoot(base: string): string | null {
  const m = /^(.*\/)characters\/[^/]+\/$/i.exec(base);
  return m ? m[1] : null;
}

/** "…/sounds/general/foo.opus" -> { rel: "general/foo" } */
function parseSoundUrl(url: string): { rel: string } | null {
  const m = /\/sounds\/(.+?)(?:\.[a-z0-9]{2,4})?(?:\?.*)?$/i.exec(url);
  if (!m) return null;
  try {
    return { rel: decodeURIComponent(m[1]) };
  } catch {
    return null;
  }
}

function candidateUrls(base: string, rel: string): string[] {
  const root = cdnRoot(base);
  const isBlip = rel.toLowerCase().startsWith("blips/");
  const file = rel.slice(rel.indexOf("/") + 1); // name without general|blips|…
  const names = [file, ...caseVariants(file)];
  const dirs: string[] = [];
  if (!isBlip) dirs.push(base); // characters/<Name>/<sfx>
  if (root) dirs.push(`${root}sounds/${rel.slice(0, rel.indexOf("/") + 1)}`);
  const out: string[] = [];
  for (const dir of dirs) {
    for (const n of names) for (const ext of EXTS) out.push(`${dir}${enc(n)}${ext}`);
  }
  return out;
}

/** Finds this sound on the speaker's CDN. Resolves to a CDN URL or null. */
export function probeRemoteSound(
  charName: string | undefined,
  url: string,
): Promise<string | null> {
  const name = (charName || currentSpeaker).toLowerCase();
  const rec = name ? getRemoteCharacter(name) : undefined;
  const parsed = rec ? parseSoundUrl(url) : null;
  if (!rec || !parsed) return Promise.resolve(null);

  const key = `${name}|${parsed.rel.toLowerCase()}`;
  if (resolved.has(key)) return Promise.resolve(resolved.get(key) ?? null);
  const inflight = pending.get(key);
  if (inflight) return inflight;

  const urls = candidateUrls(rec.base, parsed.rel);
  const p = Promise.all(urls.map(head)).then((oks) => {
    const hit = urls.find((_, i) => oks[i]) ?? null; // earliest = highest priority
    resolved.set(key, hit);
    pending.delete(key);
    return hit;
  });
  pending.set(key, p);
  return p;
}

/**
 * Synchronous version for places that set an audio src directly: returns the
 * CDN URL if already found, otherwise the original URL (and starts looking, so
 * the next play uses the CDN).
 */
export function resolveSoundUrl(url: string, charName?: string): string {
  const name = (charName || currentSpeaker).toLowerCase();
  const parsed = name && getRemoteCharacter(name) ? parseSoundUrl(url) : null;
  if (!parsed) return url;
  const key = `${name}|${parsed.rel.toLowerCase()}`;
  if (resolved.has(key)) return resolved.get(key) ?? url;
  void probeRemoteSound(name, url);
  return url;
}
