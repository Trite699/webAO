import { positions } from "../constants/positions";
import { AO_HOST } from "../../client/aoHost";
import { client } from "../../client";
import transparentPng from "../../constants/transparentPng";
import fileExists from "../../utils/fileExists";
import { getLocalOverrideUrl } from "../../utils/resolveLocalAsset";
import { getBackgroundDesignIni, listDesignIniPositions } from "../utils/backgroundDesignParser";

// A list of ALL extensions to check locally, since webAO defaults often miss webp/jpg
const ALL_EXTS = [".png", ".webp", ".jpg", ".jpeg", ".gif"];

// The 3 positions with their own hand-stitched panorama (client_court_def /
// _deft / _wit / _prot / _pro, panned in fixed 200% steps -- see
// set_side()'s viewport shift logic below). Everything else is either a
// design.ini position (panned via #client_court, below) or a static,
// non-panning position (client_court_classic).
const STITCHED_POSITIONS = ["def", "pro", "wit"];

// The shared single-image panorama a design.ini position pans across (see
// handleBN.ts, which loads "background/<bg>/court.png" into this element
// and turns pan-tilt on automatically when that file exists).
const PANORAMA_COURT_ID = "client_court";

/**
 * Loads background/<bgName>/court.png into the shared panorama image if it
 * isn't already showing it for this background, and returns that element.
 * Cheap to call on every set_side(): once loaded for a given background,
 * repeat calls are a no-op (no flicker from re-assigning the same src).
 */
async function ensurePanoramaBackground(bgName: string): Promise<HTMLImageElement> {
  const img = <HTMLImageElement>document.getElementById(PANORAMA_COURT_ID);
  const cacheKey = bgName.toLowerCase();
  if (img.dataset.panoramaFor !== cacheKey) {
    const success = await setBackgroundImage(PANORAMA_COURT_ID, bgName, "court");
    // Record the attempt either way, so a missing court.png isn't retried
    // on every single message -- only when the background actually changes.
    img.dataset.panoramaFor = success ? cacheKey : `${cacheKey}#missing`;
  }
  return img;
}

/** Resolves once `img`'s natural dimensions are available (or on error/timeout). */
function waitForImageMetrics(img: HTMLImageElement): Promise<void> {
  if (img.complete) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => resolve();
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
    // A stuck/slow image should never block switching position.
    setTimeout(done, 2000);
  });
}

/**
 * Keeps the Role/position dropdown in sync with whatever this background's
 * design.ini defines, so /pos (onEnter.ts) and the dropdown itself offer
 * every position the CURRENT background actually supports -- not just the
 * 8 hardcoded ones. Options this function added for a PREVIOUS background
 * are removed if the new background doesn't define them; the hardcoded
 * options and anything typed manually via /pos (which onEnter.ts tags
 * "custom") are never touched.
 */
function syncPositionDropdown(entries: { name: string; display: string }[]): void {
  const roleSelect = <HTMLSelectElement | null>document.getElementById("role_select");
  if (!roleSelect) return;

  const wanted = new Map(entries.map((e) => [e.name.toLowerCase(), e.display]));

  Array.from(roleSelect.options).forEach((opt) => {
    if (opt.dataset.source === "design-ini" && !wanted.has(opt.value.toLowerCase())) {
      roleSelect.removeChild(opt);
    }
  });

  const existingValues = new Set(
    Array.from(roleSelect.options).map((o) => o.value.toLowerCase()),
  );
  for (const [name, display] of wanted) {
    if (existingValues.has(name)) continue; // already present (standard position, or added earlier)
    const opt = document.createElement("option");
    opt.value = name;
    opt.text = display;
    opt.dataset.source = "design-ini";
    roleSelect.appendChild(opt);
  }
}

export async function setBackgroundImage(elementid: string, bgname: string, bgpart: string) {
  let url;
  let success = false;
  
  for (const extension of ALL_EXTS) {
    url = `${AO_HOST}background/${encodeURI(bgname.toLowerCase())}/${bgpart}${extension}`;
    
    // 1. Check local base folder FIRST
    const localUrl = getLocalOverrideUrl(url);
    if (localUrl) {
      url = localUrl;
      success = true;
      break;
    }

    // 2. Normal server check fallback (Only check server if the extension is supported by standard webAO)
    if (client.background_extensions.includes(extension)) {
      const exists = await fileExists(url);
      if (exists) {
        success = true;
        break;
      }
    }
  }

  // --- CUSTOM POSITION FALLBACK ---
  // If the background failed to load (e.g., you are on "/pos gallery" and "gallery.png" doesn't exist),
  // fallback to the witness stand instead of showing a broken transparent screen!
  if (!success && !["defenseempty", "prosecutorempty", "witnessempty", "helperstand", "judgestand", "jurystand", "seance"].includes(bgpart)) {
    console.log(`[Background] Couldn't find specific background for custom position "${bgpart}". Falling back to witness stand.`);
    return setBackgroundImage(elementid, bgname, "witnessempty");
  }
  // --------------------------------

  if (success)
    (<HTMLImageElement>document.getElementById(elementid)).src = url;
  else
    (<HTMLImageElement>document.getElementById(elementid)).src = transparentPng;
    
  return success;
}

/**
 * Changes the viewport background based on a given position.
 *
 * Valid positions: `def, pro, hld, hlp, wit, jud, jur, sea`
 * @param {string} position the position to change into
 */
export const set_side = async ({
  position,
  showSpeedLines,
  showDesk,
}: {
  position: string;
  showSpeedLines: boolean;
  showDesk: boolean;
}) => {
  const view = document.getElementById("client_fullview")!;
  const bgName = client.viewport.getBackgroundName();

  // --- DESIGN.INI PARSER INTEGRATION ---
  // Read positions and custom origins (like lob) from design.ini if available
  const designIni = await getBackgroundDesignIni(bgName);
  let customOrigin: number | null = null;

  if (designIni) {
    const courtSection = designIni[`court:${position.toLowerCase()}`];
    if (courtSection && courtSection.origin !== undefined) {
      customOrigin = Number(courtSection.origin);
    }
  }
  syncPositionDropdown(listDesignIniPositions(designIni));
  // -------------------------------------

  const isStitchedPosition = STITCHED_POSITIONS.includes(position);

  let bench: HTMLImageElement;

  if (isStitchedPosition) {
    bench = <HTMLImageElement>(
      document.getElementById(`client_${position}_bench`)
    );
  } else {
    bench = <HTMLImageElement>document.getElementById("client_bench_classic");
  }

  // Which image renders the background depends on which panning system
  // this position uses:
  //  - def/pro/wit always use the hand-stitched 5-image panorama.
  //  - anything else with a design.ini origin uses the shared single-image
  //    panorama (#client_court, see ensurePanoramaBackground below).
  //  - anything else with no design.ini entry is a static, non-panning
  //    position rendered in the classic (centered) view.
  let court: HTMLImageElement;
  if (isStitchedPosition) {
    court = <HTMLImageElement>(
      document.getElementById(`client_court_${position}`)
    );
  } else if (customOrigin !== null) {
    court = <HTMLImageElement>document.getElementById(PANORAMA_COURT_ID);
  } else {
    court = <HTMLImageElement>document.getElementById("client_court_classic");
  }

  let bg;
  let desk;
  let speedLines;

  if (positions[position]) {
    bg = positions[position].bg;
    desk = positions[position].desk;
    speedLines = positions[position].speedLines;
  } else {
    // Custom position fallback (e.g., "lob" position from design.ini)
    bg = `${position}`;
    desk = { ao2: `${position}_overlay`, ao1: "_overlay" };
    speedLines = "defense_speedlines.gif";
  }

  if (showSpeedLines === true) {
    court.src = `${AO_HOST}themes/default/${encodeURI(speedLines)}`;
  } else if (customOrigin !== null && !isStitchedPosition) {
    // The design.ini panorama is ONE shared image per background (not a
    // per-position file named after "bg"/position) -- load it once, not
    // through the position-named-file lookup below.
    await ensurePanoramaBackground(bgName);
  } else {
    setBackgroundImage(court.id, bgName, bg);
  }

  if (showDesk === true && desk) {
    const bg_folder = client.viewport.getBackgroundFolder();
    const stems = [desk.ao2, desk.ao1].filter((s): s is string => typeof s === "string");
    let found = false;
    
    outer:
    for (const stem of stems) {
      for (const ext of ALL_EXTS) {
        let url = `${bg_folder}${stem}${ext}`;
        
        // 1. Check local base folder FIRST for the desk overlay
        const localUrl = getLocalOverrideUrl(url);
        if (localUrl) {
          bench.src = localUrl;
          bench.style.opacity = "1";
          found = true;
          break outer;
        }

        // 2. Normal server check fallback
        if (client.background_extensions.includes(ext)) {
          if (await fileExists(url)) {
            bench.src = url;
            bench.style.opacity = "1";
            found = true;
            break outer;
          }
        }
      }
    }
    
    if (!found) {
      bench.src = transparentPng;
    }
  } else {
    bench.style.opacity = "0";
  }

  // --- VIEWPORT SHIFT LOGIC (Supports custom design.ini origins!) ---
  if (customOrigin !== null && !isStitchedPosition) {
    view.style.display = "";
    document.getElementById("client_classicview")!.style.display = "none";

    // design.ini origins are authored in pixels against court.png's native
    // resolution, but the image is displayed at 100% of the (responsive)
    // game window's height, essentially never its native size. Applying
    // the raw pixel value unscaled left it under- or over-panned by
    // whatever that native/rendered ratio happens to be -- the symptom
    // being a small, viewport-size-dependent drift (background not quite
    // aligned, though sprites -- positioned separately -- looked fine).
    const panoramaImg = <HTMLImageElement>document.getElementById(PANORAMA_COURT_ID);
    await waitForImageMetrics(panoramaImg);
    const scale =
      panoramaImg.naturalWidth > 0
        ? panoramaImg.clientWidth / panoramaImg.naturalWidth
        : 1;
    view.style.left = `-${customOrigin * scale}px`;
  } else if (isStitchedPosition) {
    view.style.display = "";
    document.getElementById("client_classicview")!.style.display = "none";
    switch (position) {
      case "def":
        view.style.left = "0";
        break;
      case "wit":
        view.style.left = "-200%";
        break;
      case "pro":
        view.style.left = "-400%";
        break;
    }
  } else {
    view.style.display = "none";
    document.getElementById("client_classicview")!.style.display = "";
  }
};
