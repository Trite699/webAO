/* eslint no-bitwise: "off" */

/**
 * Sums the per-frame durations of an animated WebP to get its total length
 * in milliseconds.
 *
 * Walks the RIFF chunk structure (RIFF/WEBP header, then FourCC + size +
 * data chunks) rather than scanning for the "ANMF" byte pattern. Scanning
 * could match those bytes inside a frame's compressed image data, counting
 * phantom frames and over-estimating the duration -- which made looping
 * preanims replay their start before switching to the talking sprite.
 *
 * Each ANMF chunk stores its 24-bit little-endian frame duration at data
 * offset 12 (after X/Y/Width/Height, 3 bytes each).
 */
const calculateWebpLength = (webpFile) => {
  const d = new Uint8Array(webpFile);
  // Validate "RIFF" .... "WEBP" header.
  if (
    d.length < 16 ||
    d[0] !== 0x52 || d[1] !== 0x49 || d[2] !== 0x46 || d[3] !== 0x46 ||
    d[8] !== 0x57 || d[9] !== 0x45 || d[10] !== 0x42 || d[11] !== 0x50
  ) {
    return 0;
  }

  let duration = 0;
  let p = 12; // first chunk after the RIFF/WEBP header
  while (p + 8 <= d.length) {
    const isANMF =
      d[p] === 0x41 && d[p + 1] === 0x4e && d[p + 2] === 0x4d && d[p + 3] === 0x46;
    const size =
      (d[p + 4] | (d[p + 5] << 8) | (d[p + 6] << 16) | (d[p + 7] << 24)) >>> 0;
    const dataStart = p + 8;
    if (isANMF && dataStart + 15 <= d.length) {
      const dur =
        d[dataStart + 12] |
        (d[dataStart + 13] << 8) |
        (d[dataStart + 14] << 16);
      duration += dur < 2 ? 10 : dur;
    }
    // Advance to the next chunk; chunk data is padded to an even length.
    p = dataStart + size + (size % 2);
  }
  return duration;
};

export default calculateWebpLength;
