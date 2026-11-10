/**
 * Frame effects (FrameSFX / FrameScreenshake / FrameRealization) for CDN
 * ("remote") characters.
 *
 * Normally the frame data travels inside the IC message, packed by the
 * sender from their own char.ini. When the speaker is a CDN character and the
 * message carries none (the sender's client doesn't pack them, or can't see
 * the character's ini), we read the effects from the character's char.ini on
 * its CDN instead, so the frame SFX / shake / flash still fire.
 */
import iniParse from "../../iniParse";
import request from "../../services/request";
import { AO_HOST } from "../../client/aoHost";
import { packFrameEffects } from "../../client/packFrameEffects";
import { getLocalCharacterSync } from "../../utils/localCharacterStore";
import { getRemoteCharacter } from "../../utils/remoteCharacterStore";
import { probeRemoteSound } from "../../utils/remoteSounds";
import { ChatMsg } from "../interfaces/ChatMsg";

const isEmpty = (v?: string): boolean => !v || v === "-";

// Parsed char.ini per remote character (null = couldn't be fetched).
const iniCache = new Map<string, Promise<any | null>>();

function loadRemoteIni(name: string): Promise<any | null> {
  const key = name.toLowerCase();
  let p = iniCache.get(key);
  if (!p) {
    // request() rewrites characters/<name>/... to the CDN for remote characters
    p = request(`${AO_HOST}characters/${encodeURI(key)}/char.ini`)
      .then((txt: string): any => iniParse(txt))
      .catch((): null => null);
    iniCache.set(key, p);
    // don't remember failures forever fucking shit
    p.then((ini) => {
      if (ini === null) iniCache.delete(key);
    });
  }
  return p;
}

/**
 * Plain "[<anim>_FrameSFX]" sections, one per phase (preanim, talking, idle),
 * packed in the same format posetags use. Talking and idle
 * both read the emote's own section.
 */
function packPlain(
  ini: any,
  preanim: string,
  sprite: string,
  suffix: string,
): string {
  const parts = [preanim, sprite, sprite].map((name) => {
    if (!name || name === "-") return "";
    const sec = ini[`${name}_${suffix}`];
    if (!sec) return "";
    return Object.entries(sec)
      .map(([frame, val]) => `${frame}=${String(val).trim()}`)
      .join("|");
  });
  return parts.every((p) => p === "")
    ? ""
    : `${parts.map((p) => `|${p}`).join("^")}^`;
}

/**
 * If the speaker is a CDN character and the message has no frame effects of
 * its own, fills chatmsg.frame_sfx / frame_screenshake / frame_realization
 * from the character's char.ini on the CDN. No-op otherwise.
 */
export async function deriveRemoteFrameEffects(chatmsg: ChatMsg): Promise<void> {
  const name = chatmsg.name;
  if (!name || !getRemoteCharacter(name) || getLocalCharacterSync(name)) return;
  if (
    !isEmpty(chatmsg.frame_sfx) ||
    !isEmpty(chatmsg.frame_screenshake) ||
    !isEmpty(chatmsg.frame_realization)
  ) {
    return; // the sender already sent frame data
  }

  const ini = await loadRemoteIni(name);
  if (!ini) return;

  const preanim = (chatmsg.preanim || "").toLowerCase();
  const sprite = (chatmsg.sprite || "").toLowerCase();
  const packed = packFrameEffects(ini, { preanim, emote: sprite });

  // "(b)emote_FrameSFX"-style sections first, then the plain "emote_FrameSFX".
  const pick = (packedVal: string, suffix: string): string =>
    packedVal.includes("|")
      ? packedVal
      : packPlain(ini, preanim, sprite, suffix) || "-";

  const sfx = pick(packed.frame_sfx, "framesfx");
  const shake = pick(packed.frame_screenshake, "framescreenshake");
  const real = pick(packed.frame_realization, "framerealization");
  if (isEmpty(sfx) && isEmpty(shake) && isEmpty(real)) return;

  chatmsg.frame_sfx = sfx;
  chatmsg.frame_screenshake = shake;
  chatmsg.frame_realization = real;
}

/**
 * Looks up every frame SFX of a CDN speaker's message on the CDN ahead of
 * time (fire-and-forget), so the first frame that fires doesn't have to wait
 * for the lookup.
 */
export function warmRemoteFrameSfx(chatmsg: ChatMsg): void {
  const name = chatmsg.name;
  if (!name || !getRemoteCharacter(name) || isEmpty(chatmsg.frame_sfx)) return;
  const seen = new Set<string>();
  for (const phase of (chatmsg.frame_sfx as string).split("^")) {
    const parts = phase.split("|");
    for (let i = 1; i < parts.length; i += 1) {
      const eq = parts[i].indexOf("=");
      const sfx = eq < 0 ? "" : parts[i].slice(eq + 1).trim().toLowerCase();
      if (sfx && sfx !== "0" && sfx !== "1" && !seen.has(sfx)) {
        seen.add(sfx);
        void probeRemoteSound(
          name,
          `${AO_HOST}sounds/general/${encodeURI(sfx.replace(/\.(opus|ogg|mp3|wav)$/i, ""))}.opus`,
        );
      }
    }
  }
}
