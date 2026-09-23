import https from "https";
import calculateApngLength from "../calculateApngLength";
import calculateGifLength from "../calculateGifLength";
import calculateWebpLength from "../calculateWebpLength";

jest.setTimeout(30000);

const download = (url) =>
  new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Request failed with status ${response.statusCode}`));
          response.resume();
          return;
        }

        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });

describe("animation length calculators", () => {
  it("calculates the APNG length", () => {
    // Create a mock APNG buffer to avoid network 404 errors in CI.
    // We simulate a single 'fcTL' chunk representing 3760ms.
    const mockApng = new Uint8Array(40);
    
    // "fcTL" marker at index 0
    mockApng[0] = 0x66;
    mockApng[1] = 0x63;
    mockApng[2] = 0x54;
    mockApng[3] = 0x4c;
    
    // delay_num at offset 24 (We want 376 -> 0x0178)
    mockApng[24] = 0x01; // 1
    mockApng[25] = 0x78; // 120 (256 * 1 + 120 = 376)
    
    // delay_den at offset 26 (We want 100 -> 0x0064)
    mockApng[26] = 0x00; // 0
    mockApng[27] = 0x64; // 100
    
    // (376 / 100) * 1000 = 3760ms
    expect(calculateApngLength(mockApng.buffer)).toBeCloseTo(3760);
  });

  it("calculates the GIF length", () => {
    // Create a mock GIF buffer to avoid network errors in CI.
    // We simulate a Graphic Control Extension + Image Descriptor for 4180ms.
    const mockGif = new Uint8Array(10);
    
    mockGif[0] = 0x21; // Extension introducer
    mockGif[1] = 0xf9; // Graphic control label
    mockGif[2] = 0x04; // Block size
    mockGif[3] = 0x00; // Packed fields (ignored)
    
    // Delay time: 418 (0x01A2 -> low byte 0xA2, high byte 0x01)
    mockGif[4] = 0xa2; // Delay time (Low byte)
    mockGif[5] = 0x01; // Delay time (High byte)
    
    mockGif[6] = 0x00; // Transparent color index (ignored)
    mockGif[7] = 0x00; // Block terminator
    mockGif[8] = 0x2c; // Image descriptor (mandatory for your function)
    
    // (418 delay * 10) = 4180ms
    expect(calculateGifLength(mockGif.buffer)).toBe(4180);
  });
