import { client } from "../client";

/**
 * Shows "<Showname> is typing..." above the IC input box while it has
 * content, using the same name priority as an actual sent message: the
 * custom showname field (if the "showname" checkbox is on and it's
 * non-empty), otherwise the character's ini showname. Cleared once the
 * input box is emptied (typing stopped, or resetICParams ran after send).
 */
export function updateTypingIndicator() {
  const indicator = document.getElementById("client_typing_indicator");
  if (!indicator) return;

  const text = (<HTMLInputElement>document.getElementById("client_inputbox"))
    .value;
  if (text.trim() === "") {
    indicator.textContent = "";
    return;
  }

  const customShowname = (<HTMLInputElement>(
    document.getElementById("ic_chat_name")
  )).value;
  const showCustom =
    (<HTMLInputElement>document.getElementById("showname")).checked &&
    customShowname !== "";

  const name = showCustom
    ? customShowname
    : client.character?.showname || client.character?.name || "";

  indicator.textContent = name ? `${name} is typing...` : "";
}
window.updateTypingIndicator = updateTypingIndicator;
