/**
 * importZipFromUrl()'s link handling:
 *  - recognizes drive.google.com/file/d/<id> and .../open?id=<id> share
 *    links and converts them to a direct download URL.
 *  - falls back through CORS proxies (using the current ?url= format) when
 *    a direct fetch is blocked by the browser -- the expected outcome for
 *    EVERY Google Drive link, since Drive never sends CORS headers.
 *  - scrapes and retries with the confirm/uuid tokens Drive embeds in its
 *    "can't scan this file for viruses" interstitial for large files.
 *  - still accepts a plain, non-Drive direct .zip link.
 *  - rejects a Drive link with no file id (e.g. a folder link) up front.
 */
import { TextEncoder, TextDecoder } from "node:util";
import JSZip from "jszip";
import { importZipFromUrl } from "../utils/importCharacterZip";

// This jest-environment-jsdom version doesn't expose TextEncoder/TextDecoder
// globally the way every real browser does -- both the test fixtures below
// and the production code under test (which decodes the Drive interstitial
// HTML) need them. Node's util versions are spec-compliant drop-ins.
if (typeof (global as any).TextEncoder === "undefined") {
  (global as any).TextEncoder = TextEncoder;
}
if (typeof (global as any).TextDecoder === "undefined") {
  (global as any).TextDecoder = TextDecoder;
}

let zipBytes: Uint8Array;

beforeAll(async () => {
  const zip = new JSZip();
  zip.file("TestChar/char.ini", "[Options]\nname=TestChar\n");
  zipBytes = await zip.generateAsync({ type: "uint8array" });
});

function okResponse(bytes: Uint8Array): Response {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => bytes.buffer.slice(0),
  } as unknown as Response;
}

function htmlResponse(html: string): Response {
  return okResponse(new TextEncoder().encode(html));
}

describe("importZipFromUrl: Google Drive link formats", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });

  it("imports from a /file/d/<id>/view share link via a direct fetch", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      expect(url).toBe("https://drive.google.com/uc?id=abc123&export=download");
      return okResponse(zipBytes);
    });

    const name = await importZipFromUrl(
      "https://drive.google.com/file/d/abc123/view?usp=sharing",
    );

    expect(name).toMatch(/imported 1 character/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("imports from an /open?id=<id> share link", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      expect(url).toBe("https://drive.google.com/uc?id=xyz789&export=download");
      return okResponse(zipBytes);
    });

    const name = await importZipFromUrl("https://drive.google.com/open?id=xyz789");
    expect(name).toMatch(/imported 1 character/i);
  });

  it("rejects a Google Drive link with no file id (e.g. a folder link)", async () => {
    await expect(
      importZipFromUrl("https://drive.google.com/drive/folders/someFolderId"),
    ).rejects.toThrow(/folder links aren't supported/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("importZipFromUrl: CORS proxy fallback", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });

  it("falls back to the corsproxy.io ?url= format when the direct fetch is blocked", async () => {
    const driveUrl = "https://drive.google.com/uc?id=blocked1&export=download";
    const statusMessages: string[] = [];

    fetchMock.mockImplementation(async (url: string) => {
      if (url === driveUrl) {
        // Simulate what a browser does for a CORS-rejected request: a
        // network-level TypeError, no response object at all.
        throw new TypeError("Failed to fetch");
      }
      if (url === `https://corsproxy.io/?url=${encodeURIComponent(driveUrl)}`) {
        return okResponse(zipBytes);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const name = await importZipFromUrl(
      "https://drive.google.com/file/d/blocked1/view",
      (msg) => statusMessages.push(msg),
    );

    expect(name).toMatch(/imported 1 character/i);
    expect(statusMessages.some((m) => /trying proxy 1\/2/i.test(m))).toBe(true);
  });

  it("tries the second proxy if the first one also fails", async () => {
    const driveUrl = "https://drive.google.com/uc?id=blocked2&export=download";

    fetchMock.mockImplementation(async (url: string) => {
      if (url === driveUrl) throw new TypeError("Failed to fetch");
      if (url.startsWith("https://corsproxy.io/")) {
        return { ok: false, status: 502, arrayBuffer: async () => new ArrayBuffer(0) } as Response;
      }
      if (url === `https://proxy.corsfix.com/?url=${encodeURIComponent(driveUrl)}`) {
        return okResponse(zipBytes);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const name = await importZipFromUrl("https://drive.google.com/open?id=blocked2");
    expect(name).toMatch(/imported 1 character/i);
  });

  it("throws a clear error when every proxy fails", async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError("Failed to fetch");
    });

    await expect(
      importZipFromUrl("https://drive.google.com/open?id=allBlocked"),
    ).rejects.toThrow(/even through a proxy/i);
  });
});

describe("importZipFromUrl: Google Drive virus-scan interstitial", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });

  it("scrapes the confirm/uuid tokens and retries to get the real file", async () => {
    const firstUrl = "https://drive.google.com/uc?id=big1&export=download";
    const retryUrl =
      "https://drive.google.com/uc?id=big1&export=download&confirm=AbCd&uuid=1234-5678";
    const interstitial = `
      <html><body>
        <p>Google Drive can't scan this file for viruses.</p>
        <a id="uc-download-link" href="/uc?export=download&amp;id=big1&amp;confirm=AbCd&amp;uuid=1234-5678">Download anyway</a>
      </body></html>
    `;

    fetchMock.mockImplementation(async (url: string) => {
      if (url === firstUrl) return htmlResponse(interstitial);
      if (url === retryUrl) return okResponse(zipBytes);
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const statusMessages: string[] = [];
    const name = await importZipFromUrl(
      "https://drive.google.com/file/d/big1/view",
      (msg) => statusMessages.push(msg),
    );

    expect(name).toMatch(/imported 1 character/i);
    expect(statusMessages.some((m) => /virus-scan confirmation/i.test(m))).toBe(true);
  });

  it("gives a clear error if the interstitial has no scrapeable confirm link", async () => {
    fetchMock.mockImplementation(async () =>
      htmlResponse("<html><body>Sorry, you can't view this file.</body></html>"),
    );

    await expect(
      importZipFromUrl("https://drive.google.com/open?id=private1"),
    ).rejects.toThrow(/too large, private, or not actually a \.zip/i);
  });
});

describe("importZipFromUrl: plain direct links", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
  });

  it("still imports an ordinary (non-Drive) direct .zip link", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      expect(url).toBe("https://example.com/packs/mychar.zip");
      return okResponse(zipBytes);
    });

    const name = await importZipFromUrl("https://example.com/packs/mychar.zip");
    expect(name).toMatch(/imported 1 character/i);
  });

  it("rejects a non-zip response from a direct link with a clear error", async () => {
    fetchMock.mockImplementation(async () => htmlResponse("<html>not a zip</html>"));

    await expect(
      importZipFromUrl("https://example.com/packs/not-a-zip.html"),
    ).rejects.toThrow(/didn't return a \.zip file/i);
  });
});
