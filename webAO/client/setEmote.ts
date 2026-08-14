import Client from "../client";
import transparentPng from "../constants/transparentPng";
import fileExists from "../utils/fileExists";
// ADD isLocalCharacterName to your import here:
import { getLocalOverrideUrl, isLocalCharacterName } from "../utils/resolveLocalAsset";

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

    // 1. Check local storage
    const localUrl = getLocalOverrideUrl(url);
    if (localUrl) {
      emoteSelector.src = localUrl;
      break; 
    }

    // 2. NEW CHECK: Is this an uploaded character? 
    // If YES, don't hit the network. 'continue' moves to the next extension (.gif, .webp, etc) 
    // but restricts the search entirely to local storage.
    if (isLocalCharacterName(charactername)) {
      continue;
    }

    // 3. Network fallback (ONLY runs for characters loaded from the server)
    const exists = await fileExists(url);
    if (exists) {
      emoteSelector.src = url;
      break;
    }
  }
};
export default setEmote;
