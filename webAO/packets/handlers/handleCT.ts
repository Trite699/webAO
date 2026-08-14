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
    let message = embedImages(prepChat(args[2]));
    // Replace newlines with br
    message = message.replace(/\n/g, "<br>");

    oocLog.innerHTML += `${username}: ${message}<br>`;
    if (oocLog.scrollTop + oocLog.offsetHeight + 120 > oocLog.scrollHeight)
      oocLog.scrollTo(0, oocLog.scrollHeight);
  }
};

const IMAGE_EXTENSION_REGEX = /\.(png|jpe?g|gif|webp|bmp|svg)(\?\S*)?$/i;

// If the incoming message contains a link, add a href hyperlink to it.
// Links that point straight at an image get rendered as an inline
// thumbnail instead of plain text -- click it to open the full image in
// a new tab. Runs on already-escaped text (see prepChat/safeTags), so
// the only real markup introduced here is the <a>/<img> tags we build.
function embedImages(message: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return message.replace(urlRegex, (url) => {
    if (IMAGE_EXTENSION_REGEX.test(url)) {
      return (
        `<a href="${url}" target="_blank" rel="noopener noreferrer">` +
        `<img src="${url}" class="ooc_embed_img" loading="lazy" ` +
        `referrerpolicy="no-referrer" ` +
        `onerror="this.style.display='none';this.nextSibling.style.display='inline';">` +
        `<span class="ooc_embed_fallback" style="display:none;">${url}</span>` +
        `</a>`
      );
    }
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
}
