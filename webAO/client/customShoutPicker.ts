import { AO_HOST } from "./aoHost";
import fileExists from "../utils/fileExists";
import { setSelectedCustomShout } from "../client";
import {
  CustomShout,
  buildCustomShoutImageCandidates,
  listCustomShouts,
} from "../viewport/utils/customShouts";

let available: CustomShout[] = [];

const getSelect = () =>
  document.getElementById("custom_shout_select") as HTMLSelectElement | null;

const anyExists = async (urls: string[]): Promise<boolean> => {
  for (const url of urls) {
    if (await fileExists(url)) return true;
  }
  return false;
};

/** Hides the shout chooser (when no custom shout is selected). */
export function hidePickerUI() {
  const select = getSelect();
  if (select) select.style.display = "none";
}

/** Shows the chooser, but only when the character has more than one shout. */
export function showPickerUI() {
  const select = getSelect();
  if (select && available.length > 1) select.style.display = "";
}

/**
 * Reads the character's custom shouts from char.ini [Shouts], keeps those
 * whose image exists, fills the chooser and shows/hides the Custom Shout
 * button. Called whenever the player's character changes.
 */
export async function refreshCustomShouts(
  charName: string,
  shoutsSection?: { [key: string]: string } | null,
) {
  const name = charName.toLowerCase();
  const found: CustomShout[] = [];
  for (const shout of listCustomShouts(shoutsSection)) {
    if (await anyExists(buildCustomShoutImageCandidates(AO_HOST, name, shout.id))) {
      found.push(shout);
    }
  }
  available = found;

  const button = document.getElementById("button_4");
  if (button) button.style.display = found.length > 0 ? "" : "none";

  const select = getSelect();
  if (select) {
    select.innerHTML = "";
    found.forEach((shout) => {
      const opt = document.createElement("option");
      opt.value = shout.id;
      opt.textContent = shout.name; // textContent: ini text is untrusted
      select.appendChild(opt);
    });
    select.style.display = "none";
  }
  setSelectedCustomShout(found.length > 0 ? found[0].id : "custom");
}

/** <select> onchange handler. */
export function onCustomShoutChosen() {
  const select = getSelect();
  if (select && select.value) setSelectedCustomShout(select.value);
}
