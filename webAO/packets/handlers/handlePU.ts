import { client } from "../../client";
import { ensureCharIni } from "../../client/handleCharacterInfo";
import { renderPlayerList } from "../../dom/renderPlayerList";
import { TYPING_SIGNAL_MARKER } from "../../client/typingSignalMarker";

/**
 * Handles a playerlist update
 * @param {Array} args packet arguments
 */
export const handlePU = (args: string[]) => {
  const playerID = Number(args[1]);
  const player = client.playerlist.get(playerID);
  if (!player) return;

  const type = Number(args[2]);
  const data = args[3];

  switch (type) {
    case 0: {
      // Defensive guard, kept even though client/sender/sendTR.ts no
      // longer sends this: some servers echoed the old typing-signal CT
      // packet back as an OOC name-change event over PU, which would
      // otherwise clobber the player's real OOC name in the list. Older
      // webAO peers still on a build that sends the marker (or any
      // straggler packets) are covered by this too. Some servers/relays
      // strip control characters in transit, so also match on the
      // printable core.
      if (data === TYPING_SIGNAL_MARKER || data?.includes("webao_typing")) {
        break;
      }
      player.name = data;
      break;
    }
    case 1: {
      player.charName = data;
      const charId = client.chars.findIndex(
        (c: any) => c && c.name.toLowerCase() === data.toLowerCase(),
      );
      if (charId >= 0) {
        player.charId = charId;
        ensureCharIni(charId);
      }
      break;
    }
    case 2:
      player.showName = data;
      break;
    case 3:
      player.area = Number(data);
      break;
    default:
      break;
  }

  renderPlayerList();
};
