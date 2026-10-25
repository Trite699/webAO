/**
 * "Remote" characters: characters that live on someone else's CDN / asset
 * server (e.g. https://mastyra.com/base/characters/Means/) and are streamed
 * from there on demand -- nothing is downloaded or stored beyond the link.
 *
 * Unlike the zip-based local characters, a remote character CAN be shared:
 * when you speak as one, your client tags the character name with the CDN
 * location (see encodeRemoteName), and every other client that has this
 * feature registers it automatically and loads the sprites straight from
 * the CDN. Clients WITHOUT this feature only see the plain character name
 * and resolve it against their own asset host as usual -- there is no way
 * for a browser client to change that from the outside.
 *
 * Requirements on the CDN side: it must serve the usual AO layout
 * (<base>/char.ini, <base>/(a)emote.gif, ...) and ideally send
 * "Access-Control-Allow-Origin: *" so char.ini / animation timing can be
 * read. Plain <img> sprite loading works without CORS.
 */

const STORAGE_KEY = "webao_remote_characters";
const ACCEPT_KEY = "webao_accept_remote_characters";
const SHARE_KEY = "webao_share_remote_links";
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

/**
 * Whether outgoing messages carry the CDN link (default OFF). Off means
 * everyone receives the plain character name, so anyone who already has that
 * character (AO2, any webAO) simply sees it. On is only useful when other
 * players run this patched webAO and DON'T have the character, because
 * clients without the patch can't understand the extra tag and will look for
 * a folder with that tagged name and find nothing.
 */
export function isSharingRemoteLinks(): boolean {
  try {
    return localStorage.getItem(SHARE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setShareRemoteLinks(share: boolean): void {
  try {
    localStorage.setItem(SHARE_KEY, share ? "1" : "0");
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
  void loadRemoteIndex(record);
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
 * Name to put in outgoing IC packets: always the plain name, unless the user
 * opted in to sharing links, in which case remote characters are sent as
 * "<name>~cdn~<host/path>" (scheme omitted, "!" prefix means http).
 */
export function encodeRemoteName(name: string): string {
  const rec = remotes.get(name.toLowerCase());
  if (!rec || !isSharingRemoteLinks()) return name;
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

const pathIndex = new Map<string, Map<string, string>>();
const INDEX_PREFIX = "webao_remote_index:";

function indexFor(name: string): Map<string, string> {
  const key = name.toLowerCase();
  let m = pathIndex.get(key);
  if (!m) {
    m = new Map();
    pathIndex.set(key, m);
  }
  return m;
}

/** Real-cased path (relative to the character folder) for a lower-cased one. */
export function lookupRemotePath(name: string, lowerPath: string): string | undefined {
  return pathIndex.get(name.toLowerCase())?.get(lowerPath.toLowerCase());
}

export function rememberRemotePath(name: string, realPath: string): void {
  indexFor(name).set(realPath.toLowerCase(), realPath);
}

/** Case variants worth probing on a CDN with no index: "normala.webp" ->
 *  "Normala.webp", and Title-Case per hyphen/space word of each segment. */
export function caseVariants(path: string): string[] {
  const cap = (w: string) => (w ? w[0].toUpperCase() + w.slice(1) : w);
  const segs = path.split("/");
  const variants = new Set<string>();
  variants.add(segs.map(cap).join("/"));
  variants.add(
    segs.map((sg) => sg.split("-").map(cap).join("-")).join("/"),
  );
  variants.add(
    segs.map((sg, i) => (i === segs.length - 1 ? cap(sg) : sg)).join("/"),
  );
  variants.delete(path);
  return Array.from(variants);
}

/** owner/repo/branch/path of a raw.githubusercontent.com character folder. */
function parseGithubRaw(base: string) {
  const u = new URL(base);
  if (u.hostname !== "raw.githubusercontent.com") return null;
  const parts = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length < 4) return null;
  const [owner, repo, ...rest] = parts;
  if (rest[0] === "refs" && rest[1] === "heads") rest.splice(0, 2);
  const [branch, ...dir] = rest;
  if (!branch || dir.length === 0) return null;
  return { owner, repo, branch, dir: dir.join("/") };
}

/** Fetches the character folder's file list from GitHub (one API call). */
export async function loadRemoteIndex(rec: RemoteCharacter): Promise<void> {
  const gh = parseGithubRaw(rec.base);
  if (!gh) return;
  const cacheKey = INDEX_PREFIX + rec.name;
  const idx = indexFor(rec.name);
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as { base: string; paths: string[] };
      if (parsed.base === rec.base) {
        parsed.paths.forEach((p) => idx.set(p.toLowerCase(), p));
        return;
      }
    }
  } catch {
    /* fall through to network */
  }
  try {
    const ref = encodeURIComponent(`${gh.branch}:${gh.dir}`);
    const res = await fetch(
      `https://api.github.com/repos/${gh.owner}/${gh.repo}/git/trees/${ref}?recursive=1`,
    );
    if (!res.ok) return;
    const data = (await res.json()) as {
      tree?: { path: string; type: string }[];
    };
    const paths = (data.tree ?? [])
      .filter((t) => t.type === "blob")
      .map((t) => t.path);
    paths.forEach((p) => idx.set(p.toLowerCase(), p));
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ base: rec.base, paths }));
    } catch {
      /* cache is optional */
    }
  } catch {
    /* offline / rate limited: probing fallback still works */
  }
}

// Rebuild indexes for characters saved in an earlier session.
remotes.forEach((rec) => {
  void loadRemoteIndex(rec);
});
