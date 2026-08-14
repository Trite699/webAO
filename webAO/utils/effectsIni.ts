import { AO_HOST } from "../client/aoHost";
import { request } from "../services/request";

/**
 * effects.ini (v2) support, mirroring AO2-Client.
 *
 * AO2 stores the effect manifest at themes/<theme>/effects/effects.ini. The v2
 * format uses numbered sections, each carrying a display name plus the
 * properties that control playback:
 *
 *   [version]
 *   major = 2
 *
 *   [1]
 *   name = realization
 *   sound = sfx-realization
 *   layer = over
 *   loop = false
 *   cull = true
 *   ...
 *
 * Semantics are taken from AO2's Courtroom::do_effect and
 * AOApplication::get_effects:
 *
 *  - Sections are read in ascending numeric order; non-numeric sections (like
 *    [version]) are skipped, as is any section without a name.
 *  - Names are matched case-insensitively.
 *  - Booleans are true only when the value starts with "true".
 *  - layer: "behind", "character" and "over" are recognised; ANY other value
 *    (including a missing one) falls through to "chat" in AO2, so we mirror
 *    that rather than inventing a different default.
 *  - cull maps to setHideWhenStopped: when false the effect holds its final
 *    frame instead of disappearing.
 *  - sticky is NOT a playback property. It is a sender-side flag: AO2 keeps a
 *    sticky effect selected in the dropdown after sending, so it gets re-sent
 *    with every subsequent message. That is what makes such effects look
 *    persistent; the effect layer itself is still cleared per message.
 *  - max_duration maps to setMaximumDurationPerFrame, i.e. a cap on each
 *    individual frame's duration, not on the animation as a whole.
 */

export type EffectLayer = "over" | "chat" | "behind" | "character";

export interface EffectProps {
  name: string;
  /** Sound to play with the effect. Empty means silent. */
  sound: string;
  layer: EffectLayer;
  loop: boolean;
  /** Sender-side: keep this effect selected in the dropdown after sending. */
  sticky: boolean;
  /** Hide the effect once its animation stops (false = hold the last frame). */
  cull: boolean;
  stretch: boolean;
  /** "smooth" or "fast" (fast = nearest-neighbour / pixelated). */
  scaling: string;
  respectFlip: boolean;
  respectOffset: boolean;
  /** Per-frame duration cap in ms. 0 means uncapped. */
  maxDuration: number;
}

/**
 * Used when effects.ini is unavailable or does not list the effect. These are
 * deliberately NOT AO2's empty-string defaults (which would put every unknown
 * effect on the chat layer and never cull it). Instead they reproduce webCOA's
 * previous hard-coded behaviour, so a missing or unreachable effects.ini
 * degrades to what the client did before rather than breaking every effect.
 */
export const FALLBACK_EFFECT: EffectProps = {
  name: "",
  sound: "",
  layer: "over",
  loop: false,
  sticky: false,
  cull: true,
  stretch: true,
  scaling: "smooth",
  respectFlip: false,
  respectOffset: false,
  maxDuration: 0,
};

const truthy = (value: string | undefined): boolean =>
  (value ?? "").trim().toLowerCase().startsWith("true");

const toLayer = (value: string | undefined): EffectLayer => {
  const layer = (value ?? "").trim().toLowerCase();
  if (layer === "behind" || layer === "character" || layer === "over") {
    return layer;
  }
  // AO2: anything else, including an absent value, is the chat layer.
  return "chat";
};

/**
 * Parse the text of an effects.ini into an ordered list of effects.
 */
export function parseEffectsIni(text: string): EffectProps[] {
  const sections = new Map<string, Record<string, string>>();
  let current: Record<string, string> | null = null;

  // Strip a BOM and normalise line endings, then walk line by line.
  const lines = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "" || line.startsWith(";") || line.startsWith("#")) {
      continue;
    }
    const header = /^\[(.+)\]$/.exec(line);
    if (header) {
      current = {};
      sections.set(header[1].trim(), current);
      continue;
    }
    if (!current) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = line.slice(0, eq).trim().toLowerCase();
    current[key] = line.slice(eq + 1).trim();
  }

  // Numeric sections only, in ascending numeric order (AO2 sorts by int).
  const numbered = [...sections.entries()]
    .filter(([id]) => /^\d+$/.test(id))
    .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10));

  const effects: EffectProps[] = [];
  for (const [, props] of numbered) {
    const name = (props.name ?? "").trim();
    if (name === "") {
      continue;
    }
    effects.push({
      name,
      sound: (props.sound ?? "").trim(),
      layer: toLayer(props.layer),
      loop: truthy(props.loop),
      sticky: truthy(props.sticky),
      cull: truthy(props.cull),
      stretch: truthy(props.stretch),
      scaling: (props.scaling ?? "").trim().toLowerCase(),
      respectFlip: truthy(props.respect_flip),
      respectOffset: truthy(props.respect_offset),
      maxDuration: parseInt(props.max_duration ?? "", 10) || 0,
    });
  }
  return effects;
}

let effectsList: EffectProps[] = [];
let effectsByName = new Map<string, EffectProps>();
let loaded = false;

/**
 * Fetch and cache the theme's effects.ini. Resolves to an empty list if the
 * file is missing, so a server without an effects pack still works.
 */
export async function loadEffectsIni(): Promise<EffectProps[]> {
  if (loaded) {
    return effectsList;
  }
  try {
    const text = await request(`${AO_HOST}themes/default/effects/effects.ini`);
    effectsList = parseEffectsIni(text);
  } catch {
    // No effects.ini on this asset host: fall back to built-in behaviour.
    effectsList = [];
  }
  effectsByName = new Map(
    effectsList.map((effect) => [effect.name.toLowerCase(), effect]),
  );
  loaded = true;
  return effectsList;
}

/** The effects listed in effects.ini, in manifest order. */
export function getEffectsList(): EffectProps[] {
  return effectsList;
}

/** Look up an effect by name (case-insensitive), or undefined if unlisted. */
export function getEffect(name: string): EffectProps | undefined {
  return effectsByName.get((name ?? "").trim().toLowerCase());
}

/**
 * Properties for an effect, falling back to previous behaviour when
 * the effect is not listed in effects.ini.
 */
export function getEffectProps(name: string): EffectProps {
  return getEffect(name) ?? { ...FALLBACK_EFFECT, name };
}

/** Test seam: reset the module-level cache. */
export function resetEffectsIniCache(): void {
  effectsList = [];
  effectsByName = new Map();
  loaded = false;
}
