import { getLocalCharacterSync } from "./localCharacterStore";
import { AO_HOST } from "../../client/aoHost";

export async function getBackgroundDesignIni(bgname: string): Promise<Record<string, any> | null> {
  const normalizedBg = bgname.toLowerCase();
  let text = "";

  // 1. Try checking the local imported base pack first
  const baseRecord = getLocalCharacterSync("__base__");
  if (baseRecord) {
    const targetKey = `background/${normalizedBg}/design.ini`;
    const fileBlob = baseRecord.files[targetKey];
    if (fileBlob) {
      try {
        text = await fileBlob.text();
      } catch (e) {
        console.error("Failed to read local design.ini blob", e);
      }
    }
  }

  // 2. Fallback: If not found locally, try fetching it from the live server via HTTP
  if (!text) {
    try {
      const response = await fetch(`${AO_HOST}background/${encodeURI(normalizedBg)}/design.ini`);
      if (response.ok) {
        text = await response.text();
      }
    } catch {
      // Server fetch failed or design.ini doesn't exist remotely -- ignore silently
    }
  }

  if (!text) return null;

  // 3. Parse the INI file content
  return parseDesignIniText(text);
}

export interface DesignIniPosition {
  name: string;
  display: string;
}

/**
 * Every "[court:<name>]" section in a parsed design.ini is a position this
 * background supports, beyond the hardcoded def/pro/hld/hlp/wit/jud/jur/sea
 * set. Used to keep the position dropdown (and /pos validation) in sync
 * with whatever the CURRENT background actually defines.
 */
export function listDesignIniPositions(
  designIni: Record<string, any> | null,
): DesignIniPosition[] {
  if (!designIni) return [];
  const out: DesignIniPosition[] = [];
  for (const section of Object.keys(designIni)) {
    if (!section.startsWith("court:")) continue;
    const name = section.slice("court:".length).trim();
    if (!name) continue;
    const meta = designIni[section] || {};
    const display = meta.name || meta.display || name;
    out.push({ name, display });
  }
  return out;
}

function parseDesignIniText(text: string): Record<string, any> | null {
  try {
    const lines = text.split(/\r?\n/);
    const result: Record<string, any> = {};
    let currentSection = "global";
    result[currentSection] = {};

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(";") || trimmed.startsWith("#")) continue;
      
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        currentSection = trimmed.slice(1, -1).toLowerCase();
        result[currentSection] = {};
      } else {
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim().toLowerCase();
          const val = trimmed.slice(eqIdx + 1).trim();
          result[currentSection][key] = val;
        }
      }
    }
    return result;
  } catch (e) {
    console.error("Failed to parse design.ini", e);
    return null;
  }
}
