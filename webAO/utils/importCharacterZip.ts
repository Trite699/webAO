import JSZip from "jszip";
import iniParse from "../iniParse";
import { saveLocalCharacter } from "./localCharacterStore";

function basename(path: string): string {
  return path.split("/").pop() || path;
}

// Helper to DRY up MIME type detection for both characters and base folders
function getMimeType(filename: string): string {
  if (filename.endsWith(".gif")) return "image/gif";
  if (filename.endsWith(".webp")) return "image/webp";
  if (filename.endsWith(".png")) return "image/png";
  if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) return "image/jpeg";
  if (filename.endsWith(".opus") || filename.endsWith(".ogg")) return "audio/ogg";
  if (filename.endsWith(".mp3")) return "audio/mpeg";
  if (filename.endsWith(".wav")) return "audio/wav";
  return "application/octet-stream";
}

// ---------------------------------------------------------
// CHARACTER IMPORT LOGIC
// ---------------------------------------------------------
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
    throw new Error("No char.ini found in this zip.");
  }

  const iniText = await iniEntry.async("string");
  const rootDir = iniEntry.name.slice(0, iniEntry.name.length - "char.ini".length);

  let resolvedName = fallbackName;
  try {
    const parsed = iniParse(iniText);
    if (parsed?.options?.name) resolvedName = parsed.options.name;
    else {
      const folder = rootDir.replace(/\/$/, "").split("/").pop();
      if (folder) resolvedName = folder;
    }
  } catch { /* fallback */ }

  const files: Record<string, Blob> = {};
  for (const entry of entries) {
    if (entry === iniEntry) continue;
    if (!entry.name.startsWith(rootDir)) continue;
    const relativePath = entry.name.slice(rootDir.length).toLowerCase();
    if (!relativePath) continue;

    const rawData = await entry.async("arraybuffer");
    files[relativePath] = new Blob([rawData], { type: getMimeType(relativePath) });
  }

  await saveLocalCharacter({
    name: resolvedName.toLowerCase(),
    displayName: resolvedName,
    iniText,
    files,
  });

  return resolvedName;
}

// ---------------------------------------------------------
// BASE FOLDER IMPORT LOGIC
// ---------------------------------------------------------
async function importBaseZipBlob(blob: Blob): Promise<string> {
  const zip = await JSZip.loadAsync(blob);
  const entries = Object.values(zip.files).filter((f) => !f.dir);

  // Try to find the root by looking for the "sounds/" or "background/" folder
  let rootDir = "";
  const sampleEntry = entries.find(e => e.name.toLowerCase().includes("sounds/") || e.name.toLowerCase().includes("background/"));
  if (sampleEntry) {
    // Extract whatever folder structure comes BEFORE "sounds/" or "background/"
    const match = sampleEntry.name.match(/^(.*?)(sounds|background)\//i);
    if (match) rootDir = match[1];
  }

  const files: Record<string, Blob> = {};
  for (const entry of entries) {
    if (!entry.name.startsWith(rootDir)) continue;
    const relativePath = entry.name.slice(rootDir.length).toLowerCase();
    if (!relativePath) continue;

    const rawData = await entry.async("arraybuffer");
    files[relativePath] = new Blob([rawData], { type: getMimeType(relativePath) });
  }

  // Save as a hidden system character named "__base__"
  await saveLocalCharacter({
    name: "__base__",
    displayName: "Local Base Assets",
    iniText: "", // Base doesn't need an ini
    files,
  });

  console.log(`[local base] Imported base folder. Stored files: ${Object.keys(files).length}`);
  return "Base Folder";
}

// ---------------------------------------------------------
// EXPORTS (FILE & URL HANDLERS)
// ---------------------------------------------------------
export async function importCharacterZipFile(file: File): Promise<string> {
  return importCharacterZipBlob(file, file.name.replace(/\.zip$/i, ""));
}
export async function importBaseZipFile(file: File): Promise<string> {
  return importBaseZipBlob(file);
}

export async function importZipFromUrl(url: string, isBase = false): Promise<string> {
  let fetchUrl = url;

  if (url.includes("drive.google.com/file/d/")) {
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      fetchUrl = `https://drive.google.com/uc?export=download&id=${match[1]}`;
    }
  }

  let response: Response;
  try {
    response = await fetch(fetchUrl);
  } catch (err) {
    console.warn("Direct fetch failed. Attempting proxy route...");
    try {
      response = await fetch(`https://corsproxy.io/?${encodeURIComponent(fetchUrl)}`);
    } catch (proxyErr) {
      throw new Error(`Couldn't reach that link. Please download the .zip manually.`);
    }
  }

  if (!response.ok) throw new Error(`Link error (HTTP ${response.status}).`);
  
  const blob = await response.blob();
  if (blob.type.includes("text/html")) {
    throw new Error("Received a webpage instead of a ZIP (likely a GDrive file size block).");
  }

  if (isBase) {
    return importBaseZipBlob(blob);
  } else {
    const fallbackName = (url.split("/").pop()?.split("?")[0] || "character").replace(/\.zip$/i, "");
    return importCharacterZipBlob(blob, fallbackName);
  }
}
