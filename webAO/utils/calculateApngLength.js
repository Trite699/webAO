const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Returns the duration(ms) of an APNG.
 * Returns 0 for non-PNG input or PNGs with no frames just incase IF SOMTHING FUCKS UP.
 *
 * @param {ArrayBuffer | Uint8Array} apngFile
 * @returns {number}
 */
const calculateApngLength = (apngFile) => {
  const bytes =
    apngFile instanceof Uint8Array
      ? apngFile
      : ArrayBuffer.isView(apngFile)
        ? new Uint8Array(apngFile.buffer, apngFile.byteOffset, apngFile.byteLength)
        : new Uint8Array(apngFile);

  if (bytes.length < 8 || !PNG_SIGNATURE.every((b, i) => bytes[i] === b)) {
    return 0;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = PNG_SIGNATURE.length;
  let durationMs = 0;

  // Walk the chunk list: [length:4][type:4][data:length][crc:4]
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7]
    );
    const dataStart = offset + 8;

    if (type === "IEND") break;

    // fcTL data: seq(4) w(4) h(4) x(4) y(4) delay_num(2) delay_den(2) dispose(1) blend(1)
    if (type === "fcTL" && length >= 26 && dataStart + length <= bytes.length) {
      const delayNum = view.getUint16(dataStart + 20);
      const delayDen = view.getUint16(dataStart + 22) || 100; // spec: 0 means 100
      durationMs += (delayNum / delayDen) * 1000;
    }

    offset = dataStart + length + 4; // skip data + CRC
  }

  return durationMs;
};

export default calculateApngLength;
