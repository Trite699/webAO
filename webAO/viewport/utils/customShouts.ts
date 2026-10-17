/**
 * Custom shout support. A character can have several custom shouts, listed in
 * char.ini's [Shouts] section as "<id>_name" / "<id>_message" pairs:
 *
 *   [Shouts]
 *   Custom_Name    = Gotcha!      -> id "custom"  (custom.webp/apng/png)
 *   Custom_Message = GOTCHA!
 *   Cross_Name     = Cross!       -> id "cross"   (cross.webp/apng/png)
 *   Cross_Message  = CROSS!
 *
 * Images are looked up in the character folder, then characters/<c>/custom_objections/.
 * On the wire, the plain "custom" shout is objection "4"; any other custom
 * shout is sent as "4&<id>" (the AO2 custom_objections convention).
 */

export interface CustomShout {
  id: string;
  name: string;
  message: string;
}

export const BUILTIN_SHOUT_IDS = ["holdit", "objection", "takethat"];

/** Image formats for custom shouts (gif kept last as a legacy fallback). */
export const CUSTOM_SHOUT_EXTS = [".webp", ".apng", ".png", ".gif"];

const SAFE_ID = /^[a-z0-9_.\- ]{1,64}$/;

/** Normalises a shout id; returns null if it is unsafe to put in a URL. */
export function sanitizeShoutId(raw: string): string | null {
  const id = (raw || "").trim().toLowerCase();
  if (!SAFE_ID.test(id) || id.includes("..")) return null;
  return id;
}

/**
 * Reads the custom shout ids declared in a parsed [Shouts] section.
 * "custom" is always included first, since a bare custom.<ext> works
 * without any ini entry.
 */
export function listCustomShouts(
  shouts?: { [key: string]: string } | null,
): CustomShout[] {
  const ids: string[] = ["custom"];
  for (const key of Object.keys(shouts || {})) {
    const m = /^(.+)_(name|message)$/.exec(key.toLowerCase());
    if (!m) continue;
    const id = sanitizeShoutId(m[1]);
    if (id && !BUILTIN_SHOUT_IDS.includes(id) && !ids.includes(id)) ids.push(id);
  }
  return ids.map((id) => {
    const name = shouts?.[`${id}_name`] || "";
    const message = shouts?.[`${id}_message`] || "";
    return { id, name: name || message || id, message };
  });
}

/** Parses the MS packet objection field: "2", "4", or "4&cross". */
export function parseObjectionField(raw: string): {
  objection: number;
  customShout?: string;
} {
  const [num, extra] = String(raw ?? "").split("&");
  const objection = Number(num);
  if (objection === 4 && extra) {
    const id = sanitizeShoutId(extra);
    if (id && id !== "custom") return { objection, customShout: id };
  }
  return { objection };
}

/** Builds the objection field to send: "4&cross" for non-default customs. */
export function formatObjectionField(
  objection: number,
  customShout?: string,
): string {
  if (objection === 4 && customShout && customShout !== "custom") {
    const id = sanitizeShoutId(customShout);
    if (id) return `4&${id}`;
  }
  return String(objection);
}

/** Candidate image URLs for a custom shout. */
export function buildCustomShoutImageCandidates(
  AO_HOST: string,
  charName: string,
  id: string,
): string[] {
  const base = `${AO_HOST}characters/${encodeURI(charName)}`;
  return [`${base}/${encodeURI(id)}`, `${base}/custom_objections/${encodeURI(id)}`]
    .flatMap((b) => CUSTOM_SHOUT_EXTS.map((e) => `${b}${e}`));
}

/** Candidate audio base URLs (no extension) for a custom shout. */
export function buildCustomShoutAudioBases(
  AO_HOST: string,
  charName: string,
  id: string,
): string[] {
  const base = `${AO_HOST}characters/${encodeURI(charName)}`;
  return [`${base}/${encodeURI(id)}`, `${base}/custom_objections/${encodeURI(id)}`];
}
