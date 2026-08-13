import { client } from "../../client";
import { TYPING_SIGNAL_MARKER } from "../typingSignalMarker";

/**
 * Sends a typing-state update to other players in the area, piggybacked
 * on a CT (OOC chat) packet — see typingSignalMarker.ts for why. Every
 * AO2 already relays CT to the area, so this needs zero server
 * changes, unlike a genuinely new packet type.
 *
 * Trade-off: any player NOT using webAO (or an older webAO build without
 * the handleCT.ts interception) will see a stray OOC line each time this
 * fires. Kept low-frequency by the caller (state changes + a slow
 * keepalive, not per keystroke) to minimize that.
 */
export const sendTR = (typing: boolean) => {
  client.sender.sendServer(
    `CT#${TYPING_SIGNAL_MARKER}#${client.charID}:${Number(typing)}#%`,
  );
};
