import request from "../services/request";
import { AO_HOST } from "./aoHost";
/**
 * Loads the SFX override list for a character, mirroring the AO2 client:
 * the character's own base/characters/<char>/soundlist.ini (fallback
 * sounds.ini for DRO-format folders), PLUS the global base/soundlist.ini,
 * appended. Each line is "name" or "name = Display Name". The parsed
 * names populate the editable SFX combobox (<datalist>), so users can
 * pick a listed sound or type any sound name; the chosen name plays from
 * base/sounds/general/<name>.opus on send.
 */
interface SoundEntry {
  name: string;
  display: string;
}
function parseSoundList(text: string): SoundEntry[] {
  const out: SoundEntry[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(";") || line.startsWith("#") || line.startsWith("[")) {
      continue;
    }
    const eq = line.indexOf("=");
    const name = (eq >= 0 ? line.slice(0, eq) : line).trim();
    const display = (eq >= 0 ? line.slice(eq + 1) : line).trim();
    if (name) out.push({ name, display: display || name });
  }
  return out;
}
async function fetchList(url: string): Promise<SoundEntry[]> {
  try {
    const text = await request(url);
    return parseSoundList(text);
  } catch {
    return [];
  }
}
export async function loadSoundList(charName: string): Promise<void> {
  const datalist = document.getElementById("sfx_datalist");
  if (!datalist) return;
  const base = `${AO_HOST}characters/${encodeURI(charName.toLowerCase())}/`;
  let sounds = await fetchList(`${base}soundlist.ini`);
  if (sounds.length === 0) {
    sounds = await fetchList(`${base}sounds.ini`);
  }
  sounds = sounds.concat(await fetchList(`${AO_HOST}soundlist.ini`));
  datalist.innerHTML = "";
  const seen = new Set<string>();
  for (const s of sounds) {
    if (seen.has(s.name)) continue;
    seen.add(s.name);
    const opt = document.createElement("option");
    opt.value = s.name; // the name sent + played from sounds/general
    // Show the display name as a hint when it differs from the value.
    if (s.display && s.display !== s.name) opt.textContent = s.display;
    datalist.appendChild(opt);
  }
}
