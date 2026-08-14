import JSZip from "jszip";
import iniParse from "../iniParse";
import { saveLocalCharacter } from "./localCharacterStore";

function basename(path: string): string {
  return path.split("/").pop() || path;
}

/**
 * Shared core: given a zip's raw bytes and a fallback name (used only if
 * the character doesn't declare one in char.ini or via its folder name),
 * extracts char.ini + every other file and stores them locally.
 * Returns the resolved (display) character name.
 */
async function importCharacterZipBlob(
  blob: Blob,
  fallbackName: string,
): Promise<string> {
  const zip = await JSZip.loadAsync(blob);

  const entries = Object.values(zip.files).filter((f) => !f.dir);
  const iniEntry = entries.find(
    (f) => basename(f.name).toLowerCase() === "char.ini",
  );
  if (!iniEntry) {
    throw new Error(
      "No char.ini found in this zip -- make sure it's a character folder zipped up directly (not a folder containing the character folder).",
    );
  }

  const iniText = await iniEntry.async("string");

  // Everything is stored relative to the folder char.ini lives in, since
  // URL builders elsewhere address files as "<charactername>/<relative
  // path>" -- e.g. "emotions/button1_off.png", "(a)happy.gif".
  const rootDir = iniEntry.name.slice(
    0,
    iniEntry.name.length - "char.ini".length,
  );

  // Try to name the character after char.ini's own [Options] name, then
  // its containing folder in the zip, then the zip's own filename.
  let resolvedName = fallbackName;
  try {
    const parsed = iniParse(iniText);
    if (parsed?.options?.name) {
      resolvedName = parsed.options.name;
    } else {
      const folder = rootDir.replace(/\/$/, "").split("/").pop();
      if (folder) resolvedName = folder;
    }
  } catch {
    // fall back to fallbackName
  }

  const files: Record<string, Blob> = {};
  for (const entry of entries) {
    if (entry === iniEntry) continue;
    if (!entry.name.startsWith(rootDir)) continue; // ignore stray sibling files
    const relativePath = entry.name.slice(rootDir.length).toLowerCase();
    if (!relativePath) continue;

    // 1. Get raw binary data instead of a "dumb" blob
    // eslint-disable-next-line no-await-in-loop
    const rawData = await entry.async("arraybuffer");

    // 2. Assign the correct MIME type based on the file extension
    let mimeType = "application/octet-stream";
    if (relativePath.endsWith(".gif")) mimeType = "image/gif";
    else if (relativePath.endsWith(".webp")) mimeType = "image/webp";
    else if (relativePath.endsWith(".png")) mimeType = "image/png";
    else if (relativePath.endsWith(".jpg") || relativePath.endsWith(".jpeg")) mimeType = "image/jpeg";
    else if (relativePath.endsWith(".opus") || relativePath.endsWith(".ogg")) mimeType = "audio/ogg";
    else if (relativePath.endsWith(".mp3")) mimeType = "audio/mpeg";
    else if (relativePath.endsWith(".wav")) mimeType = "audio/wav";

    // 3. Create a smart Blob that tells the browser EXACTLY what it is
    files[relativePath] = new Blob([rawData], { type: mimeType });
  }

  await saveLocalCharacter({
    name: resolvedName.toLowerCase(),
    displayName: resolvedName,
    iniText,
    files,
  });

  // eslint-disable-next-line no-console
  console.log(
    `[local character] Imported "${resolvedName}" (stored as "${resolvedName.toLowerCase()}"). ` +
      `Stored files (${Object.keys(files).length}): ${Object.keys(files).join(", ") || "(none)"}`,
  );

  return resolvedName;
}

export async function importCharacterZipFile(file: File): Promise<string> {
  const fallbackName = file.name.replace(/\.zip$/i, "");
  return importCharacterZipBlob(file, fallbackName);
}

export async function importCharacterZipFromUrl(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new Error(
      `Couldn't reach that link. If the host blocks cross-origin requests (CORS), download the .zip and upload it directly instead. (${err})`,
    );
  }
  if (!response.ok) {
    throw new Error(`Link returned an error (HTTP ${response.status}).`);
  }
  const blob = await response.blob();
  const lastSegment = url.split("/").pop()?.split("?")[0] || "character";
  const fallbackName = lastSegment.replace(/\.zip$/i, "");
  return importCharacterZipBlob(blob, fallbackName);
}
