import { downloadLogs } from "../client/downloadLogs";

/** Triggered by the "Download Log" buttons. */
export function downloadLog() {
  if (!downloadLogs()) {
    // eslint-disable-next-line no-alert
    alert("There is nothing in the log to download yet.");
  }
}
window.downloadLog = downloadLog;
