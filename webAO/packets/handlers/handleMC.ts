import { prepChat } from "../../encoding";
import { client } from "../../client";
import { AO_HOST } from "../../client/aoHost";
import { appendICLog } from "../../client/appendICLog";
import { fadeToTrack } from "../../client/musicFade";

/**
 * Handles a music change to an arbitrary resource.
 * @param {Array} args packet arguments
 */
export const handleMC = (args: string[]) => {
  const track = prepChat(args[1]);
  let charID = Number(args[2]);
  const showname = args[3] || "";
  const looping = Boolean(Number(args[4])) || false;
  const channel = Number(args[5]) || 0;
  // const fading = Number(args[6]) || 0; // server-side fade flag, unused: we always fade unless the client toggle is off

  const src = track.startsWith("http")
    ? track
    : `${AO_HOST}sounds/music/${encodeURI(track.toLowerCase())}`;
  const targetVol = client.viewport.music[channel]?.volume ?? 0.5;
  fadeToTrack(client.viewport.music, channel, src, looping, targetVol);

  let musicname;
  try {
    musicname = client.chars[charID].name;
  } catch (e) {
    charID = -1;
  }

  let looptext = "";

  if (looping)
      looptext = "(looping)";

  if (charID >= 0) {
    musicname = client.chars[charID].name;
    appendICLog(`changed music to ${track} ${looptext}`, showname, musicname);
  } else {
    appendICLog(`The music was changed to ${track} ${looptext}`, showname);
  }

  document.getElementById("client_trackstatustext")!.innerText = track;
};
