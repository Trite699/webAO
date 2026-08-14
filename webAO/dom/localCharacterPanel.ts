import { safeTags } from "../encoding";
import {
  initLocalCharacterStore,
  listLocalCharacters,
  deleteLocalCharacter,
} from "../utils/localCharacterStore";
import {
  importCharacterZipFile,
  importCharacterZipFromUrl,
} from "../utils/importCharacterZip";

function setStatus(message: string, isError: boolean): void {
  const el = document.getElementById("local_char_import_status");
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? "#f66" : "#8f8";
}

export function renderLocalCharacterList(): void {
  const list = document.getElementById("local_char_list");
  if (!list) return;

  const chars = listLocalCharacters();
  if (chars.length === 0) {
    list.innerHTML = `<p style="opacity:0.7">No local characters imported yet.</p>`;
    return;
  }

  list.innerHTML = chars
    .map(
      (c) => `
      <div class="local_char_entry" style="display:flex;align-items:center;gap:6px;margin:4px 0;">
        <span style="flex:1">${safeTags(c.displayName)}</span>
        <button onclick="useLocalCharacter('${safeTags(c.name)}')">Use</button>
        <button onclick="deleteLocalCharacterUI('${safeTags(c.name)}')">Delete</button>
      </div>`,
    )
    .join("");
}
window.renderLocalCharacterList = renderLocalCharacterList;

export async function importLocalCharacterZip(): Promise<void> {
  const fileInput = <HTMLInputElement>(
    document.getElementById("local_char_zip_input")
  );
  const urlInput = <HTMLInputElement>(
    document.getElementById("local_char_url_input")
  );

  const file = fileInput?.files?.[0];
  const url = urlInput?.value.trim();

  if (!file && !url) {
    setStatus("Pick a .zip file or paste a link first.", true);
    return;
  }

  setStatus("Importing…", false);

  try {
    const name = file
      ? await importCharacterZipFile(file)
      : await importCharacterZipFromUrl(url!);
    setStatus(`Imported "${name}".`, false);
    if (fileInput) fileInput.value = "";
    if (urlInput) urlInput.value = "";
    renderLocalCharacterList();
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), true);
  }
}
window.importLocalCharacterZip = importLocalCharacterZip;

export function useLocalCharacter(name: string): void {
  const iniSelect = <HTMLSelectElement>(
    document.getElementById("client_iniselect")
  );
  const iniName = <HTMLInputElement>document.getElementById("client_ininame");
  if (!iniName) return;

  // Index 0 is the "custom name" option in the iniswap dropdown -- force
  // it so the typed name (rather than the dropdown's own value) is used.
  if (iniSelect) iniSelect.selectedIndex = 0;
  iniName.value = name;
  iniName.dispatchEvent(new Event("change"));

  if (typeof window.updateIniswap === "function") {
    window.updateIniswap();
  }
  if (typeof window.iniedit === "function") {
    window.iniedit();
  } else {
    setStatus(
      "Couldn't find the iniswap button -- open the character/iniedit panel first.",
      true,
    );
  }
}
window.useLocalCharacter = useLocalCharacter;

export async function deleteLocalCharacterUI(name: string): Promise<void> {
  await deleteLocalCharacter(name);
  renderLocalCharacterList();
}
window.deleteLocalCharacterUI = deleteLocalCharacterUI;

initLocalCharacterStore().then(renderLocalCharacterList);
