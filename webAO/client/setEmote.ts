import Client from "../client";
import transparentPng from "../constants/transparentPng";
import fileExists from "../utils/fileExists";
import { getLocalOverrideUrl } from "../utils/resolveLocalAsset";

/**
 * Sets all the img tags to the right sources
 * @param {*} chatmsg
 */

const setEmote = async (
  AO_HOST: string,
  client: Client,
  charactername: string,
  emotename: string,
  prefix: string,
  pair: boolean,
  side: string,
) => {
  const pairID = pair ? "pair" : "char";
  const characterFolder = `${AO_HOST}characters/`;
  const acceptedPositions = ["def", "pro", "wit"];
  const position = acceptedPositions.includes(side) ? `${side}_` : "";
  const emoteSelector = document.getElementById(
    `client_${position}${pairID}_img`,
  ) as HTMLImageElement;

  for (const extension of client.emote_extensions) {
    // Hides all sprites before creating a new sprite

    if (
      client.viewport.getLastCharacter() !== client.viewport.getChatmsg().name
    ) {
      emoteSelector.src = transparentPng;
    }
    let url;
    if (extension === ".png") {
      url = `${characterFolder}${encodeURI(charactername)}/${encodeURI(
        emotename,
      )}${extension}`;
    } else if (extension === ".webp.static") {
      url = `${characterFolder}${encodeURI(charactername)}/${encodeURI(
        emotename,
      )}.webp`;
    } else {
      url = `${characterFolder}${encodeURI(charactername)}/${encodeURI(
        prefix,
      )}${encodeURI(emotename)}${extension}`;
    }

    // 1. Check if the file exists in local storage FIRST
    const localUrl = getLocalOverrideUrl(url);
    if (localUrl) {
      emoteSelector.src = localUrl;
      break; // Stop looking, we found the local sprite!
    }

    // 2. ONLY hit the network asset directory if it wasn't found locally
    const exists = await fileExists(url);
    if (exists) {
      emoteSelector.src = url;
      break;
    }
  }
};
export default setEmote;
