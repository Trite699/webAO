/* eslint no-await-in-loop: "warn" */
/* eslint no-restricted-syntax: "off" */
/* TODO: use promises for this */

import calculatorHandler from "./calculatorHandler";
import fileExists from "./fileExists";
import { requestBuffer } from "../services/request";
/**
 * Gets animation length. If the animation cannot be found, it will
 * silently fail and return 0 instead.
 * @param {string} filename the animation file name
 */

const getAnimLength = async (url) => {
  // Must match the image resolver's order (webp -> apng -> gif) so the
  // duration is measured from the SAME file the viewport actually shows.
  // The old order (gif first) measured a different file when a character
  // shipped multiple formats, mistiming the preanim->talking swap.
  const extensions = [".webp", ".apng", ".gif"];
  for (const extension of extensions) {
    const urlWithExtension = url + extension;
    const exists = await fileExists(urlWithExtension);
    if (exists) {
      const fileBuffer = await requestBuffer(urlWithExtension);
      const length = calculatorHandler[extension](fileBuffer);
      return length;
    }
  }
  return 0;
};
export default getAnimLength;
