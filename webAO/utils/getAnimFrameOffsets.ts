/* eslint no-bitwise: "off" */
import fileExists from "./fileExists";
import { requestBuffer } from "../services/request";

/**
 * Extracts the per-frame timing of an animated image so callers can fire
 * an effect "at frame N" (the browser exposes no frame events). Returns
 * the cumulative start time (ms) of each frame: offsets[0] === 0,
 * offsets[1] === delay of frame 0, etc., plus the total duration.
 *
 * GIF: Graphic Control Extension delay (centiseconds -> ms).
 * APNG: fcTL delay_num/delay_den (seconds -> ms).
 * WebP: ANMF frame duration (already ms).
 * These mirror the existing length calculators, collecting each frame
 * instead of only summing.
 */
export interface FrameTiming {
  offsets: number[]; // cumulative ms at the start of each frame
  total: number; // total duration ms
}

function fromDelays(delaysMs: number[]): FrameTiming {
  const offsets: number[] = [];
  let acc = 0;
  for (const d of delaysMs) {
    offsets.push(acc);
    acc += d;
  }
  return { offsets, total: acc };
}

function gifDelays(d: Uint8Array): number[] {
  const delays: number[] = [];
  for (let i = 0; i < d.length; i++) {
    if (
      d[i] === 0x21 &&
      d[i + 1] === 0xf9 &&
      d[i + 2] === 0x04 &&
      d[i + 7] === 0x00 &&
      d[i + 8] === 0x2c
    ) {
      const cs = (d[i + 5] << 8) | (d[i + 4] & 0xff);
      delays.push((cs < 2 ? 10 : cs) * 10);
    }
  }
  return delays;
}

function webpDelays(d: Uint8Array): number[] {
  const delays: number[] = [];
  // Validate "RIFF"..."WEBP" header, then walk chunks by size (avoids
  // matching the ANMF byte pattern inside frame image data).
  if (
    d.length < 16 ||
    d[0] !== 0x52 || d[1] !== 0x49 || d[2] !== 0x46 || d[3] !== 0x46 ||
    d[8] !== 0x57 || d[9] !== 0x45 || d[10] !== 0x42 || d[11] !== 0x50
  ) {
    return delays;
  }
  let p = 12;
  while (p + 8 <= d.length) {
    const isANMF =
      d[p] === 0x41 && d[p + 1] === 0x4e && d[p + 2] === 0x4d && d[p + 3] === 0x46;
    const size =
      (d[p + 4] | (d[p + 5] << 8) | (d[p + 6] << 16) | (d[p + 7] << 24)) >>> 0;
    const dataStart = p + 8;
    if (isANMF && dataStart + 15 <= d.length) {
      const dur =
        d[dataStart + 12] | (d[dataStart + 13] << 8) | (d[dataStart + 14] << 16);
      delays.push(dur < 2 ? 10 : dur);
    }
    p = dataStart + size + (size % 2);
  }
  return delays;
}

function apngDelays(d: Uint8Array): number[] {
  const delays: number[] = [];
  for (let i = 0; i < d.length - 27; i++) {
    if (d[i] === 0x66 && d[i + 1] === 0x63 && d[i + 2] === 0x54 && d[i + 3] === 0x4c) {
      const num = (d[i + 24] << 8) | (d[i + 25] & 0xff);
      let den = (d[i + 26] << 8) | (d[i + 27] & 0xff);
      if (den === 0) den = 100;
      delays.push((num / den) * 1000);
    }
  }
  return delays;
}

const extractors: { [ext: string]: (d: Uint8Array) => number[] } = {
  ".gif": gifDelays,
  ".webp": webpDelays,
  ".apng": apngDelays,
};

const cache: { [url: string]: FrameTiming } = {};

/**
 * Resolves the frame timing for an asset given WITHOUT extension (probing
 * gif/webp/apng), matching how preanim/sprite URLs are stored. Cached.
 */
export async function getAnimFrameOffsets(urlNoExt: string): Promise<FrameTiming> {
  if (cache[urlNoExt]) return cache[urlNoExt];
  const empty: FrameTiming = { offsets: [0], total: 0 };
  for (const ext of [".webp", ".apng", ".gif"]) {
    const url = urlNoExt + ext;
    try {
      if (await fileExists(url)) {
        const buf = await requestBuffer(url);
        const delays = extractors[ext](new Uint8Array(buf));
        const timing = delays.length ? fromDelays(delays) : empty;
        cache[urlNoExt] = timing;
        return timing;
      }
    } catch {
      /* try next extension */
    }
  }
  cache[urlNoExt] = empty;
  return empty;
}
