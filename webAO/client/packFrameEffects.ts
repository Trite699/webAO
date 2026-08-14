/**
 * Packs the current emote's per-frame effects (FrameSFX / FrameScreenshake
 * / FrameRealization) from the local character's char.ini into the AO2
 * networked format, so other clients fire them at the right frames:
 *
 *   <preanim>|<frame>=<val>|...^(b)<emote>|...^(a)<emote>|...^
 *
 * one such string per effect type, phases in fixed order (preanim, talking
 * sprite, idle sprite). Mirrors courtroom.cpp's send path.
 *
 * char.ini authors split these per-frame sections in several different but
 * QSettings-equivalent ways, e.g.:
 *   standard : [anim/HD/objecting_FrameSFX]  key "10"
 *   flattened: [anim]      key "Rap_FrameSFX\15"        (Rimes, backslash)
 *   flattened: [(b)/Webp]  key "normal2_FrameSFX/1"     (Tonate, slash)
 *   flattened: [(a)/Webp]  key "NoBomb/thinking_FrameSFX/11"
 * To handle them all, we normalise EVERY section+key into one logical path
 * ("section/key" with backslashes -> slashes) and then match the prefix
 * "<animPath>_framesfx/". iniParse lowercases section names, keys and
 * (non-showname) values, so everything here is lower-case.
 */
const NONE = "-";

type FlatPath = [string, string]; // [fullLogicalPath, value]

function buildFlatPaths(cini: any): FlatPath[] {
  const out: FlatPath[] = [];
  for (const section of Object.keys(cini)) {
    const sec = cini[section];
    if (!sec || typeof sec !== "object") continue;
    for (const key of Object.keys(sec)) {
      const full = `${section}/${key}`.replace(/\\/g, "/");
      out.push([full, sec[key]]);
    }
  }
  return out;
}

function collectFrameEntries(
  flatPaths: FlatPath[],
  animPath: string,
  effectSuffix: string,
): Array<[string, string]> {
  const target = `${animPath}${effectSuffix}/`;
  const entries: Array<[string, string]> = [];
  for (const [full, val] of flatPaths) {
    if (full.startsWith(target)) {
      const frame = full.slice(target.length);
      // the remainder must be just the frame number (no further path)
      if (frame && !frame.includes("/")) entries.push([frame, val]);
    }
  }
  return entries;
}

function packEffect(
  flatPaths: FlatPath[],
  phases: string[],
  effectSuffix: string,
): string {
  let out = "";
  for (const phase of phases) {
    out += phase;
    for (const [frame, val] of collectFrameEntries(flatPaths, phase, effectSuffix)) {
      out += `|${frame}=${val}`;
    }
    out += "^";
  }
  return out;
}

export interface PackedFrameEffects {
  frame_screenshake: string;
  frame_realization: string;
  frame_sfx: string;
}

export function packFrameEffects(cini: any, emote: any): PackedFrameEffects {
  const none: PackedFrameEffects = {
    frame_screenshake: NONE,
    frame_realization: NONE,
    frame_sfx: NONE,
  };
  if (!cini || !emote) return none;

  const preanim = (emote.preanim || "").toLowerCase();
  const sprite = (emote.emote || "").toLowerCase();
  const phases = [preanim, `(b)${sprite}`, `(a)${sprite}`];

  const flatPaths = buildFlatPaths(cini);

  const frame_screenshake = packEffect(flatPaths, phases, "_framescreenshake");
  const frame_realization = packEffect(flatPaths, phases, "_framerealization");
  const frame_sfx = packEffect(flatPaths, phases, "_framesfx");

  const hasData = [frame_screenshake, frame_realization, frame_sfx].some((f) =>
    f.includes("|"),
  );
  if (!hasData) return none;
  return { frame_screenshake, frame_realization, frame_sfx };
}
