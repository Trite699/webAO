import { getLocalCharacterSync } from "./localCharacterStore";

export async function getBackgroundDesignIni(bgname: string): Promise<Record<string, any> | null> {
  const baseRecord = getLocalCharacterSync("__base__");
  if (!baseRecord) return null;

  const targetKey = `background/${bgname.toLowerCase()}/design.ini`;
  const fileBlob = baseRecord.files[targetKey];
  if (!fileBlob) return null;

  try {
    const text = await fileBlob.text();
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
