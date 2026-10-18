import calculateApngLength from "../calculateApngLength";
import calculateGifLength from "../calculateGifLength";
import calculateWebpLength from "../calculateWebpLength";

// APNG fixture helpers just because i am stooopid:
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const u32 = (n) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const u16 = (n) => [(n >>> 8) & 0xff, n & 0xff];
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));

// [length][type][data][crc]; the parser doesn't verify CRCs, so zeros are fine
const chunk = (type, data = []) => [...u32(data.length), ...ascii(type), ...data, 0, 0, 0, 0];

// fcTL data: seq(4) w(4) h(4) x(4) y(4) delay_num(2) delay_den(2) dispose(1) blend(1)
const fcTL = (seq, num, den) =>
  chunk("fcTL", [...u32(seq), ...u32(1), ...u32(1), ...u32(0), ...u32(0), ...u16(num), ...u16(den), 0, 0]);

const IHDR = chunk("IHDR", new Array(13).fill(0));

const buildApng = (frames) =>
  new Uint8Array([
    ...PNG_SIGNATURE,
    ...IHDR,
    ...frames.flatMap(([num, den], i) => fcTL(i, num, den)),
    ...chunk("IEND"),
  ]);

describe("animation length calculators", () => {
  it("calculates the APNG length", () => {
    const apng = buildApng([[0x178, 0x64]]); // 376/100 s
    expect(calculateApngLength(apng.buffer)).toBeCloseTo(3760);
  });

  it("sums multiple APNG frames and treats a 0 denominator as 100", () => {
    const apng = buildApng([[50, 100], [25, 0]]); // 500ms + 250ms
    expect(calculateApngLength(apng.buffer)).toBeCloseTo(750);
  });

  it("returns 0 for non-PNG data", () => {
    expect(calculateApngLength(new Uint8Array(64).buffer)).toBe(0);
  });

  it("ignores 'fcTL' bytes that appear inside other chunk data", () => {
    const fake = [...ascii("fcTL"), ...new Array(30).fill(0xff)];
    const apng = new Uint8Array([
      ...PNG_SIGNATURE,
      ...IHDR,
      ...chunk("IDAT", fake),
      ...fcTL(0, 10, 100), // 100ms, the only real frame
      ...chunk("IEND"),
    ]);
    expect(calculateApngLength(apng.buffer)).toBeCloseTo(100);
  });

  it("calculates the GIF length", () => {
    const mockGif = new Uint8Array(10);

    mockGif[0] = 0x21; mockGif[1] = 0xf9; mockGif[2] = 0x04; mockGif[3] = 0x00;
    mockGif[4] = 0xa2; mockGif[5] = 0x01;
    mockGif[6] = 0x00; mockGif[7] = 0x00; mockGif[8] = 0x2c;

    expect(calculateGifLength(mockGif.buffer)).toBe(4180);
  });

  it("calculates the WebP length", () => {
    const mockWebp = new Uint8Array(40);

    mockWebp[0] = 0x52; mockWebp[1] = 0x49; mockWebp[2] = 0x46; mockWebp[3] = 0x46;
    mockWebp[8] = 0x57; mockWebp[9] = 0x45; mockWebp[10] = 0x42; mockWebp[11] = 0x50;
    mockWebp[12] = 0x41; mockWebp[13] = 0x4E; mockWebp[14] = 0x4D; mockWebp[15] = 0x46;

    mockWebp[16] = 0x10;
    mockWebp[17] = 0x00;
    mockWebp[18] = 0x00;
    mockWebp[19] = 0x00;

    mockWebp[32] = 0xca;
    mockWebp[33] = 0x13;
    mockWebp[34] = 0x00;

    expect(calculateWebpLength(mockWebp.buffer)).toBe(5066);
  });
});
