import { lastICMessageTime, setLastICMessageTime } from "../client";
import { icLogHistory } from "./logHistory";

/**
 * Merges runs of neighbouring single-character spans that share the same
 * color/class into one span each, so a long message is a handful of DOM
 * nodes instead of one per letter.
 */
export function mergeLogNodes(nodes: HTMLElement[]): HTMLSpanElement[] {
  const out: HTMLSpanElement[] = [];
  let current: HTMLSpanElement | null = null;
  for (const node of nodes) {
    const cls = node.className || "";
    const style = node.getAttribute("style") || "";
    if (
      current &&
      current.className === cls &&
      (current.getAttribute("style") || "") === style
    ) {
      current.textContent += node.textContent || "";
    } else {
      current = document.createElement("span");
      if (cls) current.className = cls;
      if (style) current.setAttribute("style", style);
      current.textContent = node.textContent || "";
      out.push(current);
    }
  }
  return out;
}

/**
 * Makes the IC log use the same font as the chat box text, whichever chat
 * box style is active.
 */
export function syncLogFont() {
  const log = document.getElementById("client_log");
  const chat = document.getElementById("client_chat");
  if (!log || !chat) return;
  const family = window.getComputedStyle(chat).fontFamily;
  if (family) log.style.fontFamily = family;
}

/**
 * Appends a message to the in-character chat log.
 * @param msg the raw message text, including markup tags (~ | ` ...)
 * @param showname the shown name of the sender
 * @param nameplate the nameplate of the sender
 * @param time when the message arrived
 * @param color the message's text color name ("red", "blue", ...) or ""
 * @param nodes pre-colored per-character spans for the message (tags kept).
 *   Without them the whole message is colored with `color`.
 */
export function appendICLog(
  msg: string,
  showname = "",
  nameplate = "",
  time = new Date(),
  color = "",
  nodes?: HTMLElement[],
) {
  const entry = document.createElement("p");
  const shownameField = document.createElement("span");
  const nameplateField = document.createElement("span");
  const textField = document.createElement("span");
  nameplateField.className = "iclog_name iclog_nameplate";
  nameplateField.appendChild(document.createTextNode(nameplate));

  shownameField.className = "iclog_name iclog_showname";
  if (showname === "" || !showname) {
    shownameField.appendChild(document.createTextNode(nameplate));
  } else {
    shownameField.appendChild(document.createTextNode(showname));
  }

  textField.className = "iclog_text";
  if (nodes && nodes.length > 0) {
    mergeLogNodes(nodes).forEach((n) => textField.appendChild(n));
  } else {
    const span = document.createElement("span");
    if (color) span.className = `text_${color}`;
    span.textContent = msg;
    textField.appendChild(span);
  }

  entry.appendChild(shownameField);
  entry.appendChild(nameplateField);
  entry.appendChild(textField);

  // Only put a timestamp if the minute has changed.
  let timeLabel = "";
  if (lastICMessageTime.getMinutes() !== time.getMinutes()) {
    const timeStamp = document.createElement("span");
    timeStamp.className = "iclog_time";
    timeLabel = time.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
    timeStamp.innerText = timeLabel;
    entry.appendChild(timeStamp);
  }

  const clientLog = document.getElementById("client_log")!;
  syncLogFont();
  clientLog.appendChild(entry);

  // Keep the full history for the Download Log feature.
  icLogHistory.push({
    showname: showname || nameplate,
    text: msg,
    time: timeLabel,
    date: time,
    color,
  });

  if (
    clientLog.scrollTop + clientLog.offsetHeight + 120 >
    clientLog.scrollHeight
  )
    clientLog.scrollTo(0, clientLog.scrollHeight);

  setLastICMessageTime(new Date());
}
