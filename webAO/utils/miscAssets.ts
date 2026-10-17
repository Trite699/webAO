/**
 * Helpers for the AO2 "misc" folder (misc/<name>/), which holds per-chat
 * assets such as the interjection bubbles (holdit_bubble, objection_bubble,
 * takethat_bubble), speedlines (defense_speedlines, prosecution_speedlines)
 * and chat box images (chat.png, chatnarrator.png).
 *
 * Example layout: base/misc/AJT/holdit_bubble.webp
 */

/** Image formats accepted for interjection (shout) bubbles. No gif. */
export const BUBBLE_EXTS = [".webp", ".apng", ".png"];

/** Image formats accepted for speedlines (legacy themes ship gifs). */
export const SPEEDLINE_EXTS = [".webp", ".apng", ".png", ".gif"];

const OVERRIDE_KEY = "override_shouts";

let overrideShouts = false;
try {
  overrideShouts = localStorage.getItem(OVERRIDE_KEY) === "true";
} catch (e) {
  /* storage unavailable: default to off */
}

/** True when character-folder shouts should win over the misc folder. */
export const getOverrideShouts = (): boolean => overrideShouts;

export const setOverrideShouts = (val: boolean): void => {
  overrideShouts = val;
  try {
    localStorage.setItem(OVERRIDE_KEY, String(val));
  } catch (e) {
    /* ignore */
  }
};

/**
 * The misc folder a message uses: an explicit miscFolder, otherwise the
 * character's char.ini `chat =` value (AO2 uses it as the misc folder name),
 * otherwise "default".
 */
export function resolveMiscFolder(msg?: {
  miscFolder?: string;
  chatbox?: string;
}): string {
  return (msg && (msg.miscFolder || msg.chatbox)) || "default";
}

const withExts = (base: string, exts: string[]): string[] =>
  exts.map((e) => `${base}${e}`);

/**
 * Ordered candidate URLs for an interjection bubble image.
 *
 * Override OFF (default): misc/<chat> -> character folder -> theme ->
 *   misc/default.
 * Override ON ("Override Shouts"): the character's own folder wins:
 *   character folder -> misc/<chat> -> theme -> misc/default.
 *
 * @param shout "holdit" | "objection" | "takethat" | "custom"
 */
export function buildShoutBubbleCandidates(
  AO_HOST: string,
  charName: string,
  miscFolder: string,
  shout: string,
  override: boolean,
): string[] {
  const fname = shout === "custom" ? "custom" : `${shout}_bubble`;
  const charBase = `${AO_HOST}characters/${encodeURI(charName)}/${fname}`;
  const miscBase = `${AO_HOST}misc/${encodeURI(miscFolder)}/${fname}`;
  const themeBase = `${AO_HOST}themes/default/${fname}`;
  const defaultBase = `${AO_HOST}misc/default/${fname}`;

  // "custom" only ever exists in the character folder.
  if (shout === "custom") return withExts(charBase, BUBBLE_EXTS);

  const ordered = override
    ? [charBase, miscBase, themeBase, defaultBase]
    : [miscBase, charBase, themeBase, defaultBase];
  return ordered.flatMap((b) => withExts(b, BUBBLE_EXTS));
}

/**
 * Candidate URLs for a speedlines image: misc/<chat> first, then the theme.
 * @param speedLines file name from positions.ts, e.g. "defense_speedlines.gif"
 */
export function buildSpeedlineCandidates(
  AO_HOST: string,
  miscFolder: string,
  speedLines: string,
): string[] {
  const stem = speedLines.replace(/\.[a-z0-9]+$/i, "");
  return [
    ...withExts(`${AO_HOST}misc/${encodeURI(miscFolder)}/${stem}`, SPEEDLINE_EXTS),
    ...withExts(`${AO_HOST}themes/default/${stem}`, SPEEDLINE_EXTS),
    ...withExts(`${AO_HOST}misc/default/${stem}`, SPEEDLINE_EXTS),
  ];
}
