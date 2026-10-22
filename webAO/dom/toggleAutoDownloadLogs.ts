import { setAutoDownloadLogs } from "../client/downloadLogs";

/** Triggered by the "Auto-download logs on disconnect" checkbox. */
export function toggleAutoDownloadLogs() {
  const box = <HTMLInputElement>document.getElementById("check_autolog");
  setAutoDownloadLogs(box.checked);
}
window.toggleAutoDownloadLogs = toggleAutoDownloadLogs;
