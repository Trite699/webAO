import calculateApngLength from "../calculateApngLength";
import calculateGifLength from "../calculateGifLength";
import calculateWebpLength from "../calculateWebpLength";

describe("animation length calculators", () => {
  it("calculates the APNG length", () => {
    const mockApng = new Uint8Array(40);
    mockApng[0] = 0x66; mockApng[1] = 0x63; mockApng[2] = 0x54; mockApng[3] = 0x4c;
    mockApng[24] = 0x01; mockApng[25] = 0x78; 
    mockApng[26] = 0x00; mockApng[27] = 0x64; 
    
    expect(calculateApngLength(mockApng.buffer)).toBeCloseTo(3760);
  });

  it("calculates the GIF length", () => {
    const mockGif = new Uint8Array(10);
    mockGif[0] = 0x21; mockGif[1] = 0xf9; mockGif[2] = 0x04; mockGif[3] = 0x00;
    mockGif[4] = 0xa2; mockGif[5] = 0x01; 
    mockGif[6] = 0x00; mockGif[7] = 0x00; mockGif[8] = 0x2c;
    
    expect(calculateGifLength(mockGif.buffer)).toBe(4180);
  });

  it("calculates the WebP length", () => {
    const mockWebp = new Uint8Array(30);
    mockWebp[0] = 0x41; mockWebp[1] = 0x4E; mockWebp[2] = 0x4D; mockWebp[3] = 0x46; 
    mockWebp[20] = 0xca; mockWebp[21] = 0x13; mockWebp[22] = 0x00; 
    
    expect(calculateWebpLength(mockWebp.buffer)).toBe(5066);
  });
});
