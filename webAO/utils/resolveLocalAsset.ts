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
  const blob = record.files[key];
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
  const parsed = parseCharacterAssetUrl(url);
  if (!parsed) return null;

  const record = getLocalCharacterSync(parsed.charactername);
  if (!record) return null; // not a locally-imported character -- fall through silently

  const resolved = resolveLocalFile(parsed.charactername, parsed.filename);
  if (!resolved) {
    // The character IS local, but this specific file isn't in its files
    // map -- almost always a filename/casing mismatch between what the
    // char.ini/pose expects and what's actually in the zip. Logging this
    // (rather than just falling through) makes that mismatch visible
    // instead of silently hitting the network and looking like local
    // characters "don't work" for no obvious reason.
    console.warn(
      `[local character] "${record.displayName}" is loaded locally, but "${parsed.filename}" wasn't found in it. ` +
        `Falling back to network. Files actually stored for this character: ${Object.keys(record.files).join(", ") || "(none)"}`,
    );
  }
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
