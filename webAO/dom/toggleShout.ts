import { selectedShout, setSelectedShout } from "../client";
import { hidePickerUI, showPickerUI } from "../client/customShoutPicker";

/**
 * Highlights and selects a shout for in-character chat.
 * If the same shout button is selected, then the shout is canceled.
 * @param {number} shout the new shout to be selected
 */
export function toggleShout(shout: number) {
  if (shout === selectedShout) {
    document.getElementById(`button_${shout}`)!.className = "client_button";
    setSelectedShout(0);
    hidePickerUI();
  } else {
    document.getElementById(`button_${shout}`)!.className =
      "client_button dark";
    if (selectedShout) {
      document.getElementById(`button_${selectedShout}`)!.className =
        "client_button";
    }
    setSelectedShout(shout);
    // Custom Shout with several shouts in char.ini: let the player choose
    if (shout === 4) showPickerUI();
    else hidePickerUI();
  }
}
window.toggleShout = toggleShout;
