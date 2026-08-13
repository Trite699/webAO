import queryParser from "../../utils/queryParser";
import { prepChat } from "../../encoding";
import { client } from "../../client";
import { setTyping, clearTyping } from "../../client/typingState";
import { TYPING_SIGNAL_MARKER } from "../../client/typingSignalMarker";
const { mode } = queryParser();

/**
 * Handles an out-of-character chat message.
 * @param {Array} args packet arguments
 */
export const handleCT = (args: string[]) => {
  // Typing-indicator signal piggybacked on CT (see typingSignalMarker.ts) —
  // intercept before it reaches the OOC log rather than displaying it.
  if (args[1] === TYPING_SIGNAL_MARKER) {
    const [charidStr, stateStr] = (args[2] || "").split(":");
    const charid = Number(charidStr);
    if (Number.isNaN(charid) || charid === client.charID) return;

    if (stateStr === "0") {
      clearTyping(charid);
      return;
    }

    const name = client.chars[charid]?.showname || client.chars[charid]?.name;
    if (name) setTyping(charid, name);
    return;
  }

  if (mode !== "replay") {
    const oocLog = document.getElementById("client_ooclog")!;
    const username = prepChat(args[1]);
    let message = addLinks(prepChat(args[2]));
    // Replace newlines with br
    message = message.replace(/\n/g, "<br>");

    oocLog.innerHTML += `${username}: ${message}<br>`;
    if (oocLog.scrollTop + oocLog.offsetHeight + 120 > oocLog.scrollHeight)
      oocLog.scrollTo(0, oocLog.scrollHeight);
  }
};

// If the incoming message contains a link, add a href hyperlink to it
function addLinks(message: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return message.replace(
    urlRegex,
    (url) => `<a href="${url}" target="_blank">${url}</a>`,
  );
}
