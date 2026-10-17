/**
 * Custom shout support (AO2 "custom_objections").
 *
 * A custom shout's NAME is its identity: it is the key prefix in char.ini's
 * [Shouts] section and the file name inside the character's
 * custom_objections folder (image = bubble, audio = sound):
 * example:
 *   [Shouts]
 *   custom_name                = Yes!
 *   custom_message             = YES!
 *   'Scuse me!_message         = 'SCUSE ME!
 *   Yes! (Voice Crack)_message = YES!
 *
 *   characters/<char>/custom_objections/'Scuse me!.png      (or webp/apng/gif)
 *   characters/<char>/custom_objections/'Scuse me!.wav      (or opus)
 *
 * The plain "custom" shout is also found as characters/<char>/custom.<ext>.
 * On the wire, "custom" is objection "4"; any other shout is "4&<name>".
 */
import { escapeChat, unescapeChat } from "../../encoding";

export interface CustomShout {
  id: string;
  name: string;
  message: string;
}

export const BUILTIN_SHOUT_IDS = ["holdit", "objection", "takethat"];

/** Image formats for custom shouts (gif kept last as a legacy fallback). */
export const CUSTOM_SHOUT_EXTS = [".webp", ".apng", ".png", ".gif"];

// Shout names are used as file names and sent over the wire, so reject path
// separators, packet delimiters and control characters. Spaces and
// punctuation such as ! ' ( ) are fine.
// eslint-disable-next-line no-control-regex
const SAFE_ID = /^[^\\/#%$<>?:*"|&\u0000-\u001f]{1,64}$/;

/** Validates a shout name (case is preserved); null if unsafe in a URL/packet. */
export function sanitizeShoutId(raw: string): string | null {
  const id = (raw || "").trim();
  if (!SAFE_ID.test(id) || id.includes("..")) return null;
  return id;
}

/**
 * Reads the custom shouts declared in a parsed [Shouts] section. "custom" is
 * always first, since a bare custom.<ext> works without any ini entry.
 * Shouts can be declared by "<name>_name" and/or "<name>_message".
 */
export function listCustomShouts(
  shouts?: { [key: string]: string } | null,
): CustomShout[] {
  const entries: { id: string; lower: string }[] = [
    { id: "custom", lower: "custom" },
  ];
  for (const key of Object.keys(shouts || {})) {
    if (key.startsWith("@orig:")) continue;
    const m = /^(.+)_(name|message)$/i.exec(key);
    if (!m) continue;
    // The parser stores the author's original casing under "@orig:<key>".
    const original = shouts?.[`@orig:${key}`] ?? key;
    const id = sanitizeShoutId(original.slice(0, original.length - m[2].length - 1));
    if (!id) continue;
    const lower = id.toLowerCase();
    if (BUILTIN_SHOUT_IDS.includes(lower) || entries.some((e) => e.lower === lower)) {
      continue;
    }
    entries.push({ id, lower });
  }
  return entries.map(({ id, lower }) => {
    const name = shouts?.[`${lower}_name`] || "";
    const message = shouts?.[`${lower}_message`] || "";
    return { id, name: name || id, message };
  });
}

/** Parses the MS objection field: "2", "4", "4&Yes! (Voice Crack)". */
export function parseObjectionField(raw: string): {
  objection: number;
  customShout?: string;
} {
  const m = /^\s*(\d+)(?:&|<and>)(.+)$/.exec(String(raw ?? ""));
  if (m && Number(m[1]) === 4) {
    const id = sanitizeShoutId(unescapeChat(m[2]));
    if (id && id.toLowerCase() !== "custom") return { objection: 4, customShout: id };
  }
  return { objection: Number(String(raw ?? "").split(/&|<and>/)[0]) };
}

/** Builds the objection field to send: "4&<name>" for non-default customs. */
export function formatObjectionField(
  objection: number,
  customShout?: string,
): string {
  if (objection === 4 && customShout && customShout.toLowerCase() !== "custom") {
    const id = sanitizeShoutId(customShout);
    if (id) return `4&${escapeChat(id)}`;
  }
  return String(objection);
}

/** Folder + name variants to try (AO2 custom_objections first, then root). */
function shoutBases(AO_HOST: string, charName: string, id: string): string[] {
  const base = `${AO_HOST}characters/${encodeURI(charName)}`;
  const names = Array.from(new Set([id, id.toLowerCase()])).map(encodeURIComponent);
  return [
    ...names.map((n) => `${base}/custom_objections/${n}`),
    ...names.map((n) => `${base}/${n}`),
  ];
}

/** Candidate image URLs (the bubble) for a custom shout. */
export function buildCustomShoutImageCandidates(
  AO_HOST: string,
  charName: string,
  id: string,
): string[] {
  return shoutBases(AO_HOST, charName, id).flatMap((b) =>
    CUSTOM_SHOUT_EXTS.map((e) => `${b}${e}`),
  );
}

/** Candidate audio base URLs (no extension) for a custom shout. */
export function buildCustomShoutAudioBases(
  AO_HOST: string,
  charName: string,
  id: string,
): string[] {
  return shoutBases(AO_HOST, charName, id);
}
