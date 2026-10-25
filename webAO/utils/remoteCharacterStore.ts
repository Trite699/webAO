const STORAGE_KEY = "webao_remote_characters";
const ACCEPT_KEY = "webao_accept_remote_characters";
/** Separator between the real character name and the encoded CDN location. */
export const REMOTE_SEP = "~cdn~";

export interface RemoteCharacter {
  /** Lowercased lookup key (matches how webAO builds character URLs). */
  name: string;
  displayName: string;
  /** Always ends with "/". */
  base: string;
}

const remotes = new Map<string, RemoteCharacter>();

function persist(): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Array.from(remotes.values())),
    );
  } catch {
    /* storage unavailable -- still works for this session */
  }
}

function load(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    for (const r of JSON.parse(raw) as RemoteCharacter[]) {
      if (r?.name && r?.base) remotes.set(r.name, r);
    }
  } catch {
    /* ignore corrupt storage */
  }
}
load();

/** Whether incoming CDN tags from other players are honoured (default on). */
export function isAcceptingRemoteCharacters(): boolean {
  try {
    return localStorage.getItem(ACCEPT_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setAcceptRemoteCharacters(accept: boolean): void {
  try {
    localStorage.setItem(ACCEPT_KEY, accept ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Blocks loopback / LAN targets so a hostile tag can't probe your network. */
function isSafeHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) {
    return false;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
  }
  if (h.includes(":")) return false; // raw IPv6 literals
  return h.includes(".");
}

/**
 * Turns a user-supplied link into a normalized character base URL, or
 * throws a human-readable error. Accepts the folder link, or a direct link
 * to its char.ini.
 */
export function normalizeRemoteBase(link: string): string {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    throw new Error("That doesn't look like a valid link.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only http(s) links are supported.");
  }
  if (url.username || url.password) {
    throw new Error("Links with a username/password aren't supported.");
  }
  if (!isSafeHost(url.hostname)) {
    throw new Error("That host isn't allowed (local/private address).");
  }
  if (url.protocol === "http:" && window.location.protocol === "https:") {
    url.protocol = "https:"; // mixed content would be blocked anyway
  }
  let path = url.pathname.replace(/\/char\.ini$/i, "");
  if (!path.endsWith("/")) path += "/";
  if (!/\/characters\/[^/]+\/$/i.test(path) && path === "/") {
    throw new Error(
      "Paste the link to the character's folder, e.g. https://host/base/characters/Name/",
    );
  }
  return `${url.protocol}//${url.host}${path}`;
}

function nameFromBase(base: string): string {
  const seg = new URL(base).pathname.split("/").filter(Boolean).pop() ?? "";
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

export function registerRemoteCharacter(
  link: string,
  nameOverride?: string,
): RemoteCharacter {
  const base = normalizeRemoteBase(link);
  const displayName = (nameOverride || nameFromBase(base)).trim();
  if (!displayName) throw new Error("Couldn't work out a character name.");
  const record: RemoteCharacter = {
    name: displayName.toLowerCase(),
    displayName,
    base,
  };
  remotes.set(record.name, record);
  persist();
  return record;
}

export function removeRemoteCharacter(name: string): void {
  remotes.delete(name.toLowerCase());
  persist();
}

export function listRemoteCharacters(): RemoteCharacter[] {
  return Array.from(remotes.values());
}

export function getRemoteCharacter(name: string): RemoteCharacter | undefined {
  return remotes.get(name.toLowerCase());
}

/**
 * Name to put in outgoing IC packets: the plain name for normal characters,
 * "<name>~cdn~<host/path>" (scheme omitted, "!" prefix means http) for
 * remote ones, so receiving clients with this feature can find the files.
 */
export function encodeRemoteName(name: string): string {
  const rec = remotes.get(name.toLowerCase());
  if (!rec) return name;
  const u = new URL(rec.base);
  const loc = `${u.protocol === "http:" ? "!" : ""}${u.host}${u.pathname}`;
  return `${rec.displayName}${REMOTE_SEP}${loc}`;
}

/**
 * Splits an incoming character name. Returns the clean name, and registers
 * the CDN location when one is attached and incoming tags are accepted.
 */
export function ingestRemoteName(raw: string): string {
  const idx = raw.indexOf(REMOTE_SEP);
  if (idx === -1) return raw;
  const name = raw.slice(0, idx);
  let loc = raw.slice(idx + REMOTE_SEP.length);
  if (!name || !isAcceptingRemoteCharacters()) return name || raw;
  const scheme = loc.startsWith("!") ? "http" : "https";
  if (loc.startsWith("!")) loc = loc.slice(1);
  try {
    const existing = remotes.get(name.toLowerCase());
    const next = normalizeRemoteBase(`${scheme}://${loc}`);
    // Don't churn storage / override a link the user set up themselves.
    if (!existing) registerRemoteCharacter(next, name);
  } catch {
    /* malformed or disallowed tag: just use the plain name */
  }
  return name;
}
