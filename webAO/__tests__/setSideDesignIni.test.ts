import fileExists from "../utils/fileExists";
import * as backgroundDesignParser from "../viewport/utils/backgroundDesignParser";

jest.mock("../client/aoHost", () => ({
  AO_HOST: "http://asset.test/base/",
}));

jest.mock("../client", () => ({
  client: {
    viewport: {
      getBackgroundName: () => "testbg",
      getBackgroundFolder: () => "http://asset.test/base/background/testbg/",
    },
    background_extensions: [".png"],
  },
}));

jest.mock("../utils/resolveLocalAsset", () => ({
  getLocalOverrideUrl: (): string | null => null,
}));

jest.mock("../utils/fileExists", () => ({
  __esModule: true,
  default: jest.fn(),
}));

// Imported after the mocks above so set_side picks them up.
import { set_side } from "../viewport/utils/setSide";

const mockFileExists = fileExists as unknown as jest.Mock;
// spyOn -- rather than jest.mock()'s factory combined with either
// jest.requireActual (a Jest-only API Bun's test runner doesn't support)
// or a plain require() inside the factory (which recurses infinitely under
// Jest, since Jest's require is itself mock-aware) -- stubs just this one
// export while leaving listDesignIniPositions as the real implementation,
// and works the same way under both Jest and Bun.
const mockGetDesignIni = jest
  .spyOn(backgroundDesignParser, "getBackgroundDesignIni")
  .mockResolvedValue(null);

function el(id: string, tag = "div"): HTMLElement {
  const e = document.createElement(tag);
  e.id = id;
  document.body.appendChild(e);
  return e;
}

function markImageLoaded(
  img: HTMLImageElement,
  naturalWidth: number,
  clientWidth: number,
) {
  // jsdom has no layout engine, so clientWidth/naturalWidth/complete need
  // to be stubbed directly -- these are plain own-properties, so they stay
  // put across later `.src` reassignments in the code under test.
  Object.defineProperty(img, "complete", { value: true, configurable: true });
  Object.defineProperty(img, "naturalWidth", {
    value: naturalWidth,
    configurable: true,
  });
  Object.defineProperty(img, "clientWidth", {
    value: clientWidth,
    configurable: true,
  });
}

function buildDom() {
  document.body.innerHTML = "";
  el("client_fullview");
  el("client_classicview");
  el("client_def_bench", "img");
  el("client_wit_bench", "img");
  el("client_pro_bench", "img");
  el("client_bench_classic", "img");
  el("client_court_def", "img");
  el("client_court_deft", "img");
  el("client_court_wit", "img");
  el("client_court_prot", "img");
  el("client_court_pro", "img");
  el("client_court_classic", "img");

  // Native 2000px wide, rendered at 800px -> scale factor 0.4
  const court = el("client_court", "img") as HTMLImageElement;
  markImageLoaded(court, 2000, 800);

  const roleSelect = document.createElement("select");
  roleSelect.id = "role_select";
  for (const v of ["", "def", "pro", "jud", "wit", "hld", "hlp", "jur", "sea"]) {
    const opt = document.createElement("option");
    opt.value = v;
    roleSelect.appendChild(opt);
  }
  document.body.appendChild(roleSelect);
}

describe("set_side: design.ini panorama positions", () => {
  beforeEach(() => {
    buildDom();
    mockFileExists.mockReset();
    mockFileExists.mockResolvedValue(true);
    mockGetDesignIni.mockReset();
  });

  it("pans #client_court, scaled by rendered/native width, for a design.ini-only position", async () => {
    mockGetDesignIni.mockResolvedValue({
      "court:lob": { origin: "500" },
    });

    await set_side({ position: "lob", showSpeedLines: false, showDesk: false });

    const view = document.getElementById("client_fullview")!;
    const classicview = document.getElementById("client_classicview")!;
    const court = document.getElementById("client_court") as HTMLImageElement;
    const classicCourt = document.getElementById(
      "client_court_classic",
    ) as HTMLImageElement;

    expect(view.style.display).toBe("");
    expect(classicview.style.display).toBe("none");
    // origin 500 * scale (800/2000 = 0.4) = 200
    expect(view.style.left).toBe("-200px");
    expect(court.src).toContain("/background/testbg/court.png");
    // The background must not have been written to the hidden classic
    // element -- that was the original bug.
    expect(classicCourt.src).toBe("");
  });

  it("never takes the design.ini path for def/pro/wit, even if design.ini defines court:def", async () => {
    mockGetDesignIni.mockResolvedValue({
      "court:def": { origin: "9999" },
    });

    await set_side({ position: "def", showSpeedLines: false, showDesk: false });

    const view = document.getElementById("client_fullview")!;
    const court = document.getElementById("client_court_def") as HTMLImageElement;

    // Standard hardcoded offset, NOT the (wildly different) design.ini origin.
    expect(view.style.left).toBe("0px");
    expect(court.src).toContain("defenseempty");
  });

  it("adds a design.ini-only position to the Role dropdown, and drops it once it no longer applies", async () => {
    const roleSelect = document.getElementById("role_select") as HTMLSelectElement;

    mockGetDesignIni.mockResolvedValue({
      "court:lob": { origin: "500", name: "Lobby" },
    });
    await set_side({ position: "lob", showSpeedLines: false, showDesk: false });

    let opt = Array.from(roleSelect.options).find((o) => o.value === "lob");
    expect(opt?.text).toBe("Lobby");
    expect(opt?.dataset.source).toBe("design-ini");

    // A background with no matching design.ini section should drop the
    // now-stale option, without touching the standard ones.
    mockGetDesignIni.mockResolvedValue(null);
    await set_side({ position: "def", showSpeedLines: false, showDesk: false });

    opt = Array.from(roleSelect.options).find((o) => o.value === "lob");
    expect(opt).toBeUndefined();
    expect(Array.from(roleSelect.options).some((o) => o.value === "def")).toBe(
      true,
    );
  });
});
