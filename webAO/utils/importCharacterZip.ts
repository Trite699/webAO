import JSZip from "jszip";
import iniParse from "../iniParse";
import { saveLocalCharacter, getLocalCharacterSync } from "./localCharacterStore";

/** Matches "<sounds|background|evidence>/..." at the start or after a "/". */
const BASE_FOLDER_RE = /(?:^|\/)((?:sounds|background|evidence)\/.+)$/;

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

  // --- 2. IMPORT BASE ASSETS (backgrounds / sounds / evidence) ---
  const baseFiles: Record<string, Blob> = {};
  const backgroundNames = new Set<string>();
  const charRoots = iniEntries
    .map((ini) => ini.name.slice(0, -"char.ini".length).toLowerCase())
    .filter((root) => root !== ""); // a char.ini at the zip root owns nothing exclusively

  for (const entry of entries) {
    const lowerName = entry.name.toLowerCase();
    if (lowerName.startsWith("__macosx/")) continue;

    // Anchor to a real path segment so "mybackground/x.png" isn't picked up,
    // and so a wrapper folder ("MyPack/background/lob/court.png") is stripped.
    const match = BASE_FOLDER_RE.exec(lowerName);
    if (!match) continue;
    const relativePath = match[1];
    const parts = relativePath.split("/");
    const folder = parts[0];

    // Files inside a character's own folder belong to that character --
    // except a background/ folder, which is always a global asset.
    const belongsToChar = charRoots.some((root) => lowerName.startsWith(root));
    if (belongsToChar && folder !== "background") continue;

    const rawData = await entry.async("arraybuffer");
    baseFiles[relativePath] = new Blob([rawData], { type: getMimeType(relativePath) });
    importedBaseFiles++;
    if (folder === "background" && parts.length > 2) backgroundNames.add(parts[1]);
  }

  if (importedBaseFiles > 0) {
    // Merge with existing base files so we don't overwrite previous uploads!
    const existingBase = getLocalCharacterSync("__base__");
    const mergedFiles = existingBase ? { ...existingBase.files, ...baseFiles } : baseFiles;

    await saveLocalCharacter({
      name: "__base__",
      displayName: "Local Base Assets",
      iniText: "",
      files: mergedFiles,
    });
    console.log(
      `[local base] Imported ${importedBaseFiles} global assets` +
        (backgroundNames.size ? ` (backgrounds: ${[...backgroundNames].join(", ")})` : "") +
        ".",
    );
  }

  // Create a nice summary message
  if (importedChars === 0 && importedBaseFiles === 0) {
    throw new Error("No characters or base assets (sounds/backgrounds) found in this zip!");
  }
  
  const baseLabel =
    backgroundNames.size > 0
      ? `${backgroundNames.size} background(s) (${importedBaseFiles} base files)`
      : `${importedBaseFiles} base file(s)`;

  if (importedChars > 0 && importedBaseFiles > 0) {
    return `Imported ${importedChars} character(s) and ${baseLabel}!`;
  } else if (importedChars > 0) {
    return `Imported ${importedChars} character(s) successfully!`;
  } else {
    return `Imported ${baseLabel} successfully!`;
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

export type ImportStatusCallback = (message: string) => void;

/**
 * Public CORS proxies to try, in order, whenever a direct fetch is blocked
 * by the browser. Google Drive's own download links always need one of
 * these: Drive never sends an Access-Control-Allow-Origin header, so a
 * plain cross-origin fetch() is rejected before we ever see a response --
 * there's no "fix the headers" option available to a browser-only client.
 * Each entry is tried in turn so one proxy being down/rate-limited doesn't
 * sink the whole import.
 */
const CORS_PROXIES: ((url: string) => string)[] = [
  (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  (url) => `https://proxy.corsfix.com/?url=${encodeURIComponent(url)}`,
];

/** "PK\x03\x04" (normal), "PK\x05\x06" (empty archive), "PK\x07\x08" (spanned). */
function looksLikeZip(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)
  );
}

/**
 * Fetches `url` and returns its bytes, trying a direct request first and
 * falling back through CORS_PROXIES if the browser blocks it (a network-
 * level failure, not an HTTP error status -- those are real link problems
 * a proxy can't fix, so they're surfaced immediately instead).
 */
async function fetchAcrossOrigins(
  url: string,
  onStatus?: ImportStatusCallback,
): Promise<Uint8Array> {
  try {
    const direct = await fetch(url);
    if (!direct.ok) throw new Error(`Link error (HTTP ${direct.status}).`);
    return new Uint8Array(await direct.arrayBuffer());
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Link error")) throw err;

    for (let i = 0; i < CORS_PROXIES.length; i++) {
      try {
        onStatus?.(
          `Direct link blocked by the browser, trying proxy ${i + 1}/${CORS_PROXIES.length}…`,
        );
        const viaProxy = await fetch(CORS_PROXIES[i](url));
        if (viaProxy.ok) return new Uint8Array(await viaProxy.arrayBuffer());
      } catch {
        // try the next proxy
      }
    }
    throw new Error(
      "Couldn't reach that link, even through a proxy. Please download the .zip and use the file picker instead.",
    );
  }
}

/** Extracts a Google Drive file id from any of the common share-link shapes. */
function extractGoogleDriveFileId(parsed: URL): string | null {
  // https://drive.google.com/file/d/<ID>/view?usp=sharing
  // https://drive.google.com/file/d/<ID>/edit
  const pathMatch = parsed.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (pathMatch) return pathMatch[1];

  // https://drive.google.com/open?id=<ID>
  // https://drive.google.com/uc?id=<ID>&export=download  (already a direct link)
  const idParam = parsed.searchParams.get("id");
  if (idParam) return idParam;

  return null;
}

function buildDriveDownloadUrl(
  fileId: string,
  confirmParams?: URLSearchParams | null,
): string {
  const params = new URLSearchParams();
  params.set("id", fileId);
  params.set("export", "download");
  if (confirmParams) {
    const confirm = confirmParams.get("confirm");
    const uuid = confirmParams.get("uuid");
    if (confirm) params.set("confirm", confirm);
    if (uuid) params.set("uuid", uuid);
  }
  return `https://drive.google.com/uc?${params.toString()}`;
}

/**
 * Drive serves an HTML "can't scan this file for viruses" interstitial
 * instead of the file itself for larger files. The page still embeds a
 * working download link/form with a confirm token -- scrape it so we can
 * retry and get the real file instead of telling the user to do it by hand.
 */
function extractDriveConfirmParams(html: string): URLSearchParams | null {
  const hrefMatch = html.match(/href="(\/uc\?export=download[^"]*)"/);
  if (hrefMatch) {
    try {
      const url = new URL(
        hrefMatch[1].replace(/&amp;/g, "&"),
        "https://drive.google.com",
      );
      return url.searchParams;
    } catch {
      // fall through to the hidden-field scrape below
    }
  }

  const confirmMatch = html.match(/name="confirm"\s+value="([^"]+)"/);
  const uuidMatch = html.match(/name="uuid"\s+value="([^"]+)"/);
  if (confirmMatch || uuidMatch) {
    const params = new URLSearchParams();
    if (confirmMatch) params.set("confirm", confirmMatch[1]);
    if (uuidMatch) params.set("uuid", uuidMatch[1]);
    return params;
  }

  return null;
}

async function fetchGoogleDriveZipBytes(
  fileId: string,
  onStatus?: ImportStatusCallback,
): Promise<Uint8Array> {
  onStatus?.("Fetching from Google Drive…");
  let bytes = await fetchAcrossOrigins(buildDriveDownloadUrl(fileId), onStatus);

  if (!looksLikeZip(bytes)) {
    const confirmParams = extractDriveConfirmParams(new TextDecoder().decode(bytes));
    if (confirmParams) {
      onStatus?.("Drive wants virus-scan confirmation for this large file, retrying…");
      bytes = await fetchAcrossOrigins(
        buildDriveDownloadUrl(fileId, confirmParams),
        onStatus,
      );
    }
  }

  if (!looksLikeZip(bytes)) {
    throw new Error(
      "Couldn't get the file straight from Google Drive (it may be too large, private, or not actually a .zip). Open the share link, download it yourself, and use the file picker instead.",
    );
  }
  return bytes;
}

async function fetchDirectZipBytes(
  url: string,
  onStatus?: ImportStatusCallback,
): Promise<Uint8Array> {
  const bytes = await fetchAcrossOrigins(url, onStatus);
  if (!looksLikeZip(bytes)) {
    throw new Error("That link didn't return a .zip file (got something else instead).");
  }
  return bytes;
}

const DISCORD_CDN_HOST = /(^|\.)(cdn\.discordapp\.com|media\.discordapp\.net|cdn\.discordapp\.net)$/;

/**
 * Discord attachment links are signed: `?ex=<hex unix expiry>&is=<hex>&hm=<hmac>`
 * and stop working after roughly a day. Returns the expiry as a Date, or null
 * if the link has no (valid) `ex` parameter.
 */
export function getDiscordLinkExpiry(parsed: URL): Date | null {
  const ex = parsed.searchParams.get("ex");
  if (!ex || !/^[0-9a-f]+$/i.test(ex)) return null;
  const seconds = parseInt(ex, 16);
  return Number.isFinite(seconds) ? new Date(seconds * 1000) : null;
}

/** Trims whitespace, wrapping <...>/quotes and dangling "&"/"?" from pasted links. */
function cleanPastedUrl(raw: string): string {
  return raw
    .trim()
    .replace(/^[<"']+|[>"']+$/g, "")
    .replace(/[&?]+$/, "");
}

export async function importZipFromUrl(
  url: string,
  onStatus?: ImportStatusCallback,
): Promise<string> {
  url = cleanPastedUrl(url);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("That doesn't look like a valid link.");
  }

  const isGoogleDrive = /(^|\.)(drive|docs)\.google\.com$/.test(parsed.hostname);
  const driveFileId = isGoogleDrive ? extractGoogleDriveFileId(parsed) : null;
  const isDiscord = DISCORD_CDN_HOST.test(parsed.hostname);

  if (isGoogleDrive && !driveFileId) {
    throw new Error(
      "Couldn't find a file ID in that Google Drive link. Folder links aren't supported (share a direct link to the .zip file itself).",
    );
  }

  if (isDiscord) {
    const expiry = getDiscordLinkExpiry(parsed);
    if (expiry && expiry.getTime() < Date.now()) {
      throw new Error(
        `That Discord link expired on ${expiry.toLocaleString()}. Discord attachment links only last about a day -- ` +
          "right-click the attachment in Discord, copy a fresh link and paste it here.",
      );
    }
    onStatus?.("Fetching from Discord…");
  }

  let bytes: Uint8Array;
  try {
    bytes = driveFileId
      ? await fetchGoogleDriveZipBytes(driveFileId, onStatus)
      : await fetchDirectZipBytes(url, onStatus);
  } catch (err) {
    if (isDiscord && err instanceof Error && /HTTP (401|403|404)/.test(err.message)) {
      throw new Error(
        "Discord refused that link (it has probably expired or been deleted). " +
          "Copy a fresh link to the attachment and try again.",
      );
    }
    throw err;
  }

  let fallbackName = parsed.pathname.split("/").pop() || "Imported Pack";
  try {
    fallbackName = decodeURIComponent(fallbackName);
  } catch {
    /* keep raw name */
  }
  fallbackName = fallbackName.replace(/\.zip$/i, "") || "Imported Pack";

  onStatus?.("Unpacking…");
  // Blob's typings want a plain ArrayBuffer-backed BlobPart; slicing (rather
  // than passing bytes.buffer directly) is also correct if bytes is ever a
  // view into a larger buffer, not just a 1:1 wrapper around the whole thing.
  const zipBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return importUniversalZipBlob(new Blob([zipBuffer]), fallbackName);
}
