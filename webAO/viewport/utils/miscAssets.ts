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

import { buildCustomShoutImageCandidates } from "./customShouts";
import { caseVariants } from "../../utils/remoteCharacterStore";

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
 * Misc lookups for a CDN ("remote") character: the misc folder of the CDN
 * the character comes from (".../base/misc/", see getRemoteMiscBase), tried
 * before the player's own server.
 *
 *   chat     -> <cdn>/misc/<chat>/<file>   (plus Title-Case spellings of the
 *               folder, since CDNs are often case-sensitive)
 *   fallback -> <cdn>/misc/default/<file>  (only when <chat> isn't "default")
 *
 * Both are empty for characters that aren't from a CDN.
 */
export function cdnMiscBases(
  cdnMisc: string | null | undefined,
  miscFolder: string,
  fname: string,
): { chat: string[]; fallback: string[] } {
  if (!cdnMisc) return { chat: [], fallback: [] };
  const folders = [miscFolder, ...caseVariants(miscFolder)];
  return {
    chat: folders.map((f) => `${cdnMisc}${encodeURI(f)}/${fname}`),
    fallback:
      miscFolder.toLowerCase() === "default"
        ? []
        : [`${cdnMisc}default/${fname}`],
  };
}

/**
 * Ordered candidate URLs for an interjection bubble image.
 *
 * Override OFF (default): misc/<chat> -> character folder -> theme ->
 *   misc/default.
 * Override ON ("Override Shouts"): the character's own folder wins:
 *   character folder -> misc/<chat> -> theme -> misc/default.
 *
 * For a CDN character, "misc/<chat>" means the CDN's misc folder first and
 * then the player's own server, and the CDN's misc/default sits just before
 * the server's (see cdnMiscBases).
 *
 * @param shout "holdit" | "objection" | "takethat" | "custom"
 * @param cdnMisc the speaker's CDN misc folder (getRemoteMiscBase), if any
 */
export function buildShoutBubbleCandidates(
  AO_HOST: string,
  charName: string,
  miscFolder: string,
  shout: string,
  override: boolean,
  cdnMisc?: string | null,
): string[] {
  const isBuiltin = ["holdit", "objection", "takethat"].includes(shout);
  if (!isBuiltin) {
    // Custom shouts (custom, or any [Shouts] "<id>_name" entry) only exist
    // in the character folder (or its custom_objections subfolder).
    return buildCustomShoutImageCandidates(AO_HOST, charName, shout);
  }
  const fname = `${shout}_bubble`;
  const charBase = `${AO_HOST}characters/${encodeURI(charName)}/${fname}`;
  const miscBase = `${AO_HOST}misc/${encodeURI(miscFolder)}/${fname}`;
  const themeBase = `${AO_HOST}themes/default/${fname}`;
  const defaultBase = `${AO_HOST}misc/default/${fname}`;
  const cdn = cdnMiscBases(cdnMisc, miscFolder, fname);

  const miscTier = [...cdn.chat, miscBase];
  const defaultTier = [...cdn.fallback, defaultBase];
  const ordered = override
    ? [charBase, ...miscTier, themeBase, ...defaultTier]
    : [...miscTier, charBase, themeBase, ...defaultTier];
  return ordered.flatMap((b) => withExts(b, BUBBLE_EXTS));
}

/**
 * Candidate URLs for a speedlines image: misc/<chat> first (the speaker's
 * CDN misc folder before the player's server, for CDN characters), then the
 * theme, then misc/default.
 * @param speedLines file name from positions.ts, e.g. "defense_speedlines.gif"
 */
export function buildSpeedlineCandidates(
  AO_HOST: string,
  miscFolder: string,
  speedLines: string,
  cdnMisc?: string | null,
): string[] {
  const stem = speedLines.replace(/\.[a-z0-9]+$/i, "");
  const cdn = cdnMiscBases(cdnMisc, miscFolder, stem);
  return [
    ...cdn.chat.flatMap((b) => withExts(b, SPEEDLINE_EXTS)),
    ...withExts(`${AO_HOST}misc/${encodeURI(miscFolder)}/${stem}`, SPEEDLINE_EXTS),
    ...withExts(`${AO_HOST}themes/default/${stem}`, SPEEDLINE_EXTS),
    ...cdn.fallback.flatMap((b) => withExts(b, SPEEDLINE_EXTS)),
    ...withExts(`${AO_HOST}misc/default/${stem}`, SPEEDLINE_EXTS),
  ];
}
