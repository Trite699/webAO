import JSZip from "jszip";
import iniParse from "../iniParse";
import { saveLocalCharacter, getLocalCharacterSync } from "./localCharacterStore";

function basename(path: string): string {
  return path.split("/").pop() || path;
}

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

/**
 * THE UNIVERSAL IMPORTER
 * Scans a ZIP for multiple characters AND base assets simultaneously.
 */
async function importUniversalZipBlob(blob: Blob, fallbackName: string): Promise<string> {
  const zip = await JSZip.loadAsync(blob);
  const entries = Object.values(zip.files).filter((f) => !f.dir);

  let importedChars = 0;
  let importedBaseFiles = 0;

  // --- 1. IMPORT MULTIPLE CHARACTERS ---
  const iniEntries = entries.filter((f) => basename(f.name).toLowerCase() === "char.ini");
  
  for (const iniEntry of iniEntries) {
    const rootDir = iniEntry.name.slice(0, iniEntry.name.length - "char.ini".length);
    const iniText = await iniEntry.async("string");

    let resolvedName = fallbackName;
    try {
      const parsed = iniParse(iniText);
      if (parsed?.options?.name) resolvedName = parsed.options.name;
      else {
        const folder = rootDir.replace(/\/$/, "").split("/").pop();
        if (folder) resolvedName = folder;
      }
    } catch { /* fallback */ }

    const charFiles: Record<string, Blob> = {};
    for (const entry of entries) {
      if (entry === iniEntry) continue;
      if (!entry.name.startsWith(rootDir)) continue;
      const relativePath = entry.name.slice(rootDir.length).toLowerCase();
      if (!relativePath) continue;

      const rawData = await entry.async("arraybuffer");
      charFiles[relativePath] = new Blob([rawData], { type: getMimeType(relativePath) });
    }

    await saveLocalCharacter({
      name: resolvedName.toLowerCase(),
      displayName: resolvedName,
      iniText,
      files: charFiles,
    });
    importedChars++;
    console.log(`[local character] Imported: ${resolvedName}`);
  }

  // --- 2. IMPORT BASE ASSETS ---
  const baseFiles: Record<string, Blob> = {};
  let baseFound = false;

  for (const entry of entries) {
    const lowerName = entry.name.toLowerCase();
    
    // If this file was already imported as part of a character, skip it
    const belongsToChar = iniEntries.some(ini => 
      lowerName.startsWith(ini.name.slice(0, -"char.ini".length).toLowerCase())
    );
    if (belongsToChar) continue;

    // Check if it's a global asset (sounds, backgrounds, evidence)
    const match = lowerName.match(/(sounds|background|evidence)\/.*$/i);
    if (match) {
      const relativePath = match[0];
      const rawData = await entry.async("arraybuffer");
      baseFiles[relativePath] = new Blob([rawData], { type: getMimeType(relativePath) });
      baseFound = true;
      importedBaseFiles++;
    }
  }

  if (baseFound) {
    // Merge with existing base files so we don't overwrite previous uploads!
    const existingBase = getLocalCharacterSync("__base__");
    const mergedFiles = existingBase ? { ...existingBase.files, ...baseFiles } : baseFiles;

    await saveLocalCharacter({
      name: "__base__",
      displayName: "Local Base Assets",
      iniText: "",
      files: mergedFiles,
    });
    console.log(`[local base] Imported ${importedBaseFiles} global assets.`);
  }

  // Create a nice summary message
  if (importedChars === 0 && importedBaseFiles === 0) {
    throw new Error("No characters or base assets (sounds/backgrounds) found in this zip!");
  }
  
  if (importedChars > 0 && importedBaseFiles > 0) {
    return `Imported ${importedChars} character(s) and ${importedBaseFiles} base files!`;
  } else if (importedChars > 0) {
    return `Imported ${importedChars} character(s) successfully!`;
  } else {
    return `Imported ${importedBaseFiles} base asset(s) successfully!`;
  }
}

// ---------------------------------------------------------
// EXPORTS (FILE & URL HANDLERS)
// ---------------------------------------------------------
export async function importCharacterZipFile(file: File): Promise<string> {
  const fallbackName = file.name.replace(/\.zip$/i, "");
  return importUniversalZipBlob(file, fallbackName);
}

export async function importBaseZipFile(file: File): Promise<string> {
  return importUniversalZipBlob(file, "Base Folder");
}

export async function importZipFromUrl(url: string, isBase = false): Promise<string> {
  let fetchUrl = url;

  // Google Drive interceptor
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
    throw new Error("Received a webpage instead of a ZIP (likely a GDrive file size block). Download it manually.");
  }

  const fallbackName = (url.split("/").pop()?.split("?")[0] || "Imported Pack").replace(/\.zip$/i, "");
  return importUniversalZipBlob(blob, fallbackName);
}
