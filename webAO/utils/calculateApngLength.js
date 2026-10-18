const calculateApngLength = (apngFile) => {
  const d = new Uint8Array(apngFile);
  let durationMs = 0;
  for (let i = 0; i < d.length - 27; i++) {
    // Find an fcTL chunk type marker (66 63 54 4C = "fcTL")
    if (
      d[i] === 0x66 &&
      d[i + 1] === 0x63 &&
      d[i + 2] === 0x54 &&
      d[i + 3] === 0x4c
    ) {
      const delayNum = (d[i + 24] << 8) | (d[i + 25] & 0xff);
      let delayDen = (d[i + 26] << 8) | (d[i + 27] & 0xff);
      if (delayDen === 0) delayDen = 100; // spec: 0 denominator means 100
      durationMs += (delayNum / delayDen) * 1000; // seconds -> ms
    }
  }
  return durationMs;
};
export default calculateApngLength;
