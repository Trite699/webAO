import { getLocalCharacterSync } from "./localCharacterStore";

// Object URLs are cheap to create but should be created once per blob and
// reused, rather than minted fresh (and leaked) on every lookup.
const blobUrlCache = new Map<string, string>();

export function isLocalCharacterName(charactername: string): boolean {
  return !!getLocalCharacterSync(charactername);
}

/**
 * Looks up a single file within a locally-imported character by filename
 * (e.g. "(a)happy.gif", "char_icon.png"), returning a cached blob object
 * URL, or null if that character/file isn't stored locally.
 */
export function resolveLocalFile(
  charactername: string,
  filename: string,
): string | null {
  const record = getLocalCharacterSync(charactername);
  if (!record) return null;

  const key = filename.toLowerCase();
  let blob = record.files[key];

  if (!blob) {
    // webAO's URL builders always construct "(a)"/"(b)" as a filename
    // PREFIX (e.g. "(a)normal.webp"), but some character packs (Case
    // Cafe/KFO-style) instead organize idle/talking sprites into "(a)/"
    // and "(b)/" SUBFOLDERS (e.g. "(a)/normal.webp"). Retry with a folder
    // separator inserted after the prefix before giving up.
    const prefixMatch = /^(\(a\)|\(b\))(.+)$/.exec(key);
    if (prefixMatch) {
      blob = record.files[`${prefixMatch[1]}/${prefixMatch[2]}`];
    }
  }

  // If the file STILL isn't found, check if it's hiding inside an "anim/" subfolder
  if (!blob) {
    blob = record.files[`anim/${key}`];
  }
  
  // Sometimes webAO fucks shit up
  if (!blob) {
    const prefixMatch = /^(\(a\)|\(b\))(.+)$/.exec(key);
    if (prefixMatch) {
      blob = record.files[`anim/${prefixMatch[2]}`];
    }
  }
  // ------------------------

  if (!blob) return null;

  const cacheKey = `${record.name}::${key}`;
  const cached = blobUrlCache.get(cacheKey);
  if (cached) return cached;

  const url = URL.createObjectURL(blob);
  blobUrlCache.set(cacheKey, url);
  return url;
}

/**
 * Every URL builder in webAO follows the same
 * "<host>characters/<name>/<filename>" shape (see setEmote.ts,
 * preloadMessageAssets.ts, handleCharacterInfo.ts). Parsing it back out
 * lets a single interception point (fileExists.ts) cover every caller
 * without each of them needing to know about local characters directly.
 */
export function parseCharacterAssetUrl(
  url: string,
): { charactername: string; filename: string } | null {
  const match = /characters\/([^/]+)\/(.+)$/.exec(url);
  if (!match) return null;
  try {
    return {
      charactername: decodeURIComponent(match[1]),
      filename: decodeURIComponent(match[2]),
    };
  } catch {
    return null;
  }
}

/**
 * Given a URL webAO would normally fetch over the network, returns a local
 * blob URL to use instead if it resolves to a locally-imported character's
 * file, or null if it should fall through to the normal network path.
 */
export function getLocalOverrideUrl(url: string): string | null {
  // --- BASE FOLDER INTERCEPTOR ---
  // Catch requests for global sounds, backgrounds, and evidence
  if (url.includes("/background/") || url.includes("/sounds/") || url.includes("/evidence/")) {
    const baseRecord = getLocalCharacterSync("__base__");
    if (baseRecord) {
      // Extract the path from "sounds/..." or "background/..." onwards
      const match = url.match(/(sounds|background|evidence)\/.*$/i);
      if (match) {
        const relativePath = match[0].toLowerCase();
        const fileBlob = baseRecord.files[relativePath];
        if (fileBlob) {
          const cacheKey = `__base__::${relativePath}`;
          if (blobUrlCache.has(cacheKey)) return blobUrlCache.get(cacheKey)!;
          const blobUrl = URL.createObjectURL(fileBlob);
          blobUrlCache.set(cacheKey, blobUrl);
          return blobUrl;
        }
      }
    }
  }
  // -------------------------------

  const parsed = parseCharacterAssetUrl(url);
  if (!parsed) return null;

  const record = getLocalCharacterSync(parsed.charactername);
  if (!record) return null; // not a locally-imported character -- fall through silently

  // Notice the console.warn() is entirely gone! It will now fail silently 
  // and instantly move on to check the next file extension.
  const resolved = resolveLocalFile(parsed.charactername, parsed.filename);
  
  return resolved;
}

/** Tries each icon extension in order against a local character's files. */
export function getLocalIconUrl(
  charactername: string,
  iconExtensions: string[],
): string | null {
  for (const ext of iconExtensions) {
    const url = resolveLocalFile(charactername, `char_icon${ext}`);
    if (url) return url;
  }
  return null;
}
