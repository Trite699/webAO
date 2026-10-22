import { ICLogEntry, icLogHistory } from "./logHistory";

export const AUTO_DOWNLOAD_KEY = "autoDownloadLogs";

/** Is "Auto-download logs on disconnect" enabled? */
export function getAutoDownloadLogs(): boolean {
  try {
    return localStorage.getItem(AUTO_DOWNLOAD_KEY) === "true";
  } catch (e) {
    return false;
  }
}

export function setAutoDownloadLogs(val: boolean) {
  try {
    localStorage.setItem(AUTO_DOWNLOAD_KEY, String(val));
  } catch (e) {
    /* storage unavailable */
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

const formatStamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
  `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/**
 * Turns the log history into plain text. Message text is exported exactly as
 * typed, so markup tags (~ | ` ...) are kept; the text color is added in
 * brackets after the name when it is not the default.
 */
export function buildLogText(
  history: ICLogEntry[],
  now: Date = new Date(),
): string {
  const lines = [`# webAO IC log - saved ${formatStamp(now)}`, ""];
  for (const e of history) {
    const stamp = e.date ? `[${formatStamp(e.date)}] ` : "";
    if (e.notice) {
      lines.push(`${stamp}--- ${e.text} ---`);
      continue;
    }
    const color = e.color && e.color !== "white" ? ` [${e.color}]` : "";
    lines.push(`${stamp}${e.showname}${color}: ${e.text}`);
  }
  return lines.join("\n");
}

let lastDownloadedCount = 0;

/**
 * Downloads the whole IC log as a .txt file.
 * @param auto true when triggered by a disconnect; skipped if there is
 *   nothing new since the last download
 * @returns whether a file was downloaded
 */
export function downloadLogs(auto = false): boolean {
  if (icLogHistory.length === 0) return false;
  if (auto && icLogHistory.length === lastDownloadedCount) return false;

  const now = new Date();
  const filename =
    `chatlog-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.txt`;

  const blob = new Blob([buildLogText(icLogHistory, now)], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);

  lastDownloadedCount = icLogHistory.length;
  return true;
}

/** Called when the connection drops: saves the log if the option is on. */
export function autoDownloadLogsOnDisconnect() {
  if (!getAutoDownloadLogs()) return;
  try {
    downloadLogs(true);
  } catch (e) {
    console.error("Auto log download failed", e);
  }
    }
