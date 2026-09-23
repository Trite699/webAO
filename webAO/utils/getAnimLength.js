import calculatorHandler from "./calculatorHandler";
import fileExists from "./fileExists";
import { requestBuffer } from "../services/request";
import {
  getLocalOverrideUrl,
  parseCharacterAssetUrl,
  isLocalCharacterName,
} from "./resolveLocalAsset";

// Must match the image resolver's actual candidate order (see
// preloadMessageAssets.ts / setEmote.ts, which default to
// [".gif", ".png", ".apng", ".webp", ".webp.static"]) so the duration is
// measured from the SAME file the viewport actually shows. Only formats
// that carry per-frame timing are relevant here.
const extensions = [".gif", ".apng", ".webp"];

/**
 * Gets animation length. If the animation cannot be found, it will
 * silently fail and return 0 instead.
 * @param {string} url the animation file base URL (no extension)
 */
const getAnimLength = async (url) => {
  const parsed = parseCharacterAssetUrl(url);

  // For a locally-imported character, resolve entirely from local storage,
  // same as setEmote.ts does -- never touch the network. Without this, a
  // local-only character (whose preanim is almost always just a plain
  // .gif) had to wait on two real, sequential, network round-trips (one
  // per extension NOT present locally) to a server that doesn't host it
  // at all, before ever reaching the extension that does exist locally.
  // That easily stalls long enough that the preanim's duration is never
  // known in time, silently skipping the whole preanim step.
  if (parsed && isLocalCharacterName(parsed.charactername)) {
    for (const extension of extensions) {
      const resolvedUrl = getLocalOverrideUrl(`${url}${extension}`);
      if (resolvedUrl) {
        const fileBuffer = await requestBuffer(resolvedUrl);
        return calculatorHandler[extension](fileBuffer);
      }
    }
    return 0;
  }

  // Network character: check every extension in parallel (matching how
  // every other asset lookup in webAO works, e.g. filesExist.ts) rather
  // than one at a time, then use the first that exists in priority order.
  const existsPerExtension = await Promise.all(
    extensions.map((extension) => fileExists(`${url}${extension}`)),
  );
  for (let i = 0; i < extensions.length; i++) {
    if (existsPerExtension[i]) {
      const extension = extensions[i];
      const urlWithExtension = `${url}${extension}`;
      const resolvedUrl = getLocalOverrideUrl(urlWithExtension) || urlWithExtension;
      const fileBuffer = await requestBuffer(resolvedUrl);
      return calculatorHandler[extension](fileBuffer);
    }
  }
  return 0;
};
export default getAnimLength;
