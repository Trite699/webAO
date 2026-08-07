import { requestBuffer } from "../services/request";
import fileExists from "./fileExists";

/**
 * How many times an animation file plays on its own.
 *
 * 0 means it loops forever; 1 (or more) means the browser will stop it after
 * that many passes. This matters because effects.ini's `loop` flag is the
 * client's instruction, while an <img> obeys only what is baked into the file.
 * AO2 has no such conflict: it passes the ini flag to its own animation player
 * (loadAndPlayAnimation(effect, looping)) and the file's loop count is ignored.
 *
 * webCOA has to reconcile the two, so it needs to know what the file will do:
 *   - confetti.gif has NO looping extension, so it plays once even though
 *     effects.ini says loop=true. The client has to replay it.
 *   - confettibg.apng loops forever on its own, so the client must NOT restart
 *     it, or the animation would hitch every cycle.
 *
 * Returns PLAY_ONCE when the file cannot be read or parsed: only a positively
 * detected infinite loop count suppresses client-side looping.
 */
export const INFINITE_LOOP = 0;
/**
 * Assumed when the loop count cannot be determined. Erring towards "plays
 * once" means a loop=true effect still gets looped by the client if detection
 * fails; erring the other way silently leaves it playing a single pass, which
 * is the bug this default exists to prevent.
 */
export const PLAY_ONCE = 1;

/** Parse the loop count out of an already-fetched animation buffer. */
export function parseAnimLoopCount(buffer: ArrayBuffer): number {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  const startsWith = (offset: number, ascii: string): boolean => {
    for (let i = 0; i < ascii.length; i++) {
      if (bytes[offset + i] !== ascii.charCodeAt(i)) {
        return false;
      }
    }
    return true;
  };

  // GIF: the loop count lives in a NETSCAPE2.0 application extension. Without
  // that extension the file plays exactly once.
  if (startsWith(0, "GIF8")) {
    for (let i = 0; i + 16 < bytes.length; i++) {
      if (startsWith(i, "NETSCAPE2.0")) {
        // ...appname(11) sub-block size(1) sub-block id(1) count(2, LE)
        const at = i + 11 + 1 + 1;
        if (at + 1 < bytes.length) {
          return view.getUint16(at, true);
        }
      }
    }
    return 1;
  }

  // PNG/APNG: an animated PNG declares num_plays in its acTL chunk (0 =
  // infinite). A plain PNG has no acTL and does not animate at all.
  if (bytes[0] === 0x89 && startsWith(1, "PNG")) {
    for (let i = 8; i + 12 < bytes.length; i++) {
      if (startsWith(i, "acTL")) {
        // acTL data: num_frames(4) num_plays(4), both big-endian.
        return view.getUint32(i + 8, false);
      }
    }
    return 1;
  }

  // WebP: an animated WebP declares loop_count in its ANIM chunk (0 =
  // infinite). Walk the RIFF chunks rather than scanning, so the bytes are not
  // matched inside compressed image data.
  if (startsWith(0, "RIFF") && startsWith(8, "WEBP")) {
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const size = view.getUint32(offset + 4, true);
      if (startsWith(offset, "ANIM")) {
        // ANIM data: background colour(4) then loop_count(2, LE).
        return view.getUint16(offset + 8 + 4, true);
      }
      offset += 8 + size + (size % 2);
    }
    return 1; // still WebP
  }

  return PLAY_ONCE;
}

const cache = new Map<string, Promise<number>>();

/**
 * Fetch an animation and report its intrinsic loop count. Cached per URL: this
 * runs on every send of an effect, and refetching the file each time is both
 * wasteful and a chance to stall. `base` is the URL
 * without an extension, matching getAnimLength/getAnimFrameOffsets.
 */
export default function getAnimLoopCount(base: string): Promise<number> {
  const hit = cache.get(base);
  if (hit !== undefined) {
    return hit;
  }
  const promise = resolveLoopCount(base);
  cache.set(base, promise);
  return promise;
}

async function resolveLoopCount(base: string): Promise<number> {
  for (const ext of [".webp", ".apng", ".gif", ".png"]) {
    const url = `${base}${ext}`;
    // eslint-disable-next-line no-await-in-loop
    if (await fileExists(url)) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const buffer = await requestBuffer(url);
        return parseAnimLoopCount(buffer);
      } catch {
        return PLAY_ONCE;
      }
    }
  }
  return PLAY_ONCE;
}
