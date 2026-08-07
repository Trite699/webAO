import { ChatMsg } from "../interfaces/ChatMsg";
import { client } from "../../client";

// Display text for the built-in shouts. Index matches SHOUTS/objection number.
const SHOUT_LOG_TEXT: { [objection: number]: string } = {
  1: "Hold it!",
  2: "Objection!",
  3: "Take that!",
};

/**
 * Returns the "shouts X!" text for the IC log when a message is a shout
 * (Hold It / Objection / Take That / a character's custom shout) with no
 * accompanying text, e.g. "Phoenix Wright" / "shouts Objection!". Returns
 * an empty string when there's no shout to describe.
 */
export const getShoutLogText = (chatmsg: ChatMsg): string => {
  const objection = chatmsg.objection;
  if (!objection) return "";

  if (objection === 4) {
    // Custom shout: character's own shout word, from char.ini [Shouts] Custom_Message
    try {
      const custom =
        client.chars[chatmsg.charid!]?.inifile?.shouts?.custom_message;
      return custom ? `shouts ${custom}` : "";
    } catch (e) {
      return "";
    }
  }

  const text = SHOUT_LOG_TEXT[objection];
  return text ? `shouts ${text}` : "";
};
