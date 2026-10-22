import { icLogHistory } from "./logHistory";

/**
 * Appends a notice (hrtext divider) to the IC log.
 * @param {string} msg the notice text
 */
export function appendICNotice(msg: string) {
  const el = document.createElement("div");
  el.className = "hrtext";
  el.textContent = msg;
  document.getElementById("client_log")!.appendChild(el);
  icLogHistory.push({
    showname: "",
    text: msg,
    time: "",
    date: new Date(),
    notice: true,
  });
}
