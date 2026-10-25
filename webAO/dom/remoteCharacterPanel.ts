import { safeTags } from "../encoding";
import {
  registerRemoteCharacter,
  removeRemoteCharacter,
  listRemoteCharacters,
  isAcceptingRemoteCharacters,
  setAcceptRemoteCharacters,
  isSharingRemoteLinks,
  setShareRemoteLinks,
} from "../utils/remoteCharacterStore";
import { useLocalCharacter } from "./localCharacterPanel";

function setStatus(message: string, isError: boolean): void {
  const el = document.getElementById("remote_char_status");
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? "#f66" : "#8f8";
}

export function renderRemoteCharacterList(): void {
  const list = document.getElementById("remote_char_list");
  if (!list) return;
  const chars = listRemoteCharacters();
  if (chars.length === 0) {
    list.innerHTML = `<p style="opacity:0.7">No CDN characters added yet.</p>`;
    return;
  }
  list.innerHTML = chars
    .map(
      (c) => `
      <div class="remote_char_entry" style="display:flex;align-items:center;gap:6px;margin:4px 0;">
        <span style="flex:1" title="${safeTags(c.base)}">${safeTags(c.displayName)}</span>
        <button onclick="useRemoteCharacter('${safeTags(c.name)}')">Use</button>
        <button onclick="deleteRemoteCharacterUI('${safeTags(c.name)}')">Remove</button>
      </div>`,
    )
    .join("");
}
window.renderRemoteCharacterList = renderRemoteCharacterList;

/** Registers the pasted CDN link and switches to that character. */
export async function addRemoteCharacter(): Promise<void> {
  const input = <HTMLInputElement>(
    document.getElementById("remote_char_url_input")
  );
  const link = input?.value.trim();
  if (!link) {
    setStatus("Paste a link to the character's folder first.", true);
    return;
  }
  try {
    const rec = registerRemoteCharacter(link);
    input.value = "";
    renderRemoteCharacterList();
    setStatus(`Added "${rec.displayName}" from ${new URL(rec.base).host}.`, false);
    useLocalCharacter(rec.name);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), true);
  }
}
window.addRemoteCharacter = addRemoteCharacter;

export function useRemoteCharacter(name: string): void {
  useLocalCharacter(name);
}
window.useRemoteCharacter = useRemoteCharacter;

export function deleteRemoteCharacterUI(name: string): void {
  removeRemoteCharacter(name);
  renderRemoteCharacterList();
}
window.deleteRemoteCharacterUI = deleteRemoteCharacterUI;

export function toggleAcceptRemote(): void {
  const box = <HTMLInputElement>document.getElementById("remote_char_accept");
  setAcceptRemoteCharacters(!!box?.checked);
}
window.toggleAcceptRemote = toggleAcceptRemote;

export function toggleShareRemote(): void {
  const box = <HTMLInputElement>document.getElementById("remote_char_share");
  setShareRemoteLinks(!!box?.checked);
}
window.toggleShareRemote = toggleShareRemote;

const shareBox = <HTMLInputElement | null>(
  document.getElementById("remote_char_share")
);
if (shareBox) shareBox.checked = isSharingRemoteLinks();

const acceptBox = <HTMLInputElement | null>(
  document.getElementById("remote_char_accept")
);
if (acceptBox) acceptBox.checked = isAcceptingRemoteCharacters();
renderRemoteCharacterList();
