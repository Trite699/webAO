import { getOverrideShouts, setOverrideShouts } from "../viewport/utils/miscAssets";

const refreshButton = () => {
  const btn = document.getElementById("button_override_shouts");
  if (!btn) return;
  const on = getOverrideShouts();
  btn.className = on ? "client_button dark" : "client_button";
  btn.setAttribute("aria-pressed", String(on));
  btn.title = on
    ? "Using shouts from the character folder (overrides misc folder)"
    : "Using shouts from the misc folder when available";
};

/**
 * Toggles "Override Shouts": when on, interjection bubbles are loaded from
 * the character's own folder instead of the misc folder.
 */
export function toggleOverrideShouts() {
  setOverrideShouts(!getOverrideShouts());
  refreshButton();
}
window.toggleOverrideShouts = toggleOverrideShouts;
window.addEventListener("DOMContentLoaded", refreshButton);
if (document.readyState !== "loading") refreshButton();
