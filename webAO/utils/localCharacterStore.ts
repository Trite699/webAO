/**
 * Storage for "fully local" custom characters imported by the user (via a
 * .zip upload or a link to one) rather than hosted on AO_HOST. Files are
 * persisted in IndexedDB (so they survive reloads) and mirrored into an
 * in-memory cache so asset resolution (see resolveLocalAsset.ts) can look
 * things up synchronously without awaiting IndexedDB on every sprite.
 *
 * IMPORTANT LIMITATION: a fully-local character's assets never leave your
 * browser. Other players will only see it rendered correctly if THEY have
 * also imported the same character locally under the same name -- otherwise
 * they'll just see whatever the server folder resolves to (usually nothing).
 */

const DB_NAME = "webao_local_characters";
const DB_VERSION = 1;
const STORE_NAME = "characters";

export interface LocalCharacterRecord {
  /** Lowercased, used as the lookup key everywhere (matches how server
   *  character names are compared elsewhere in webAO). */
  name: string;
  /** Original-cased name, for display in the UI. */
  displayName: string;
  /** Raw char.ini contents, parsed on demand with the existing iniParse. */
  iniText: string;
  /** All other files in the zip, keyed by their path relative to the
   *  character's root folder (the folder char.ini sits in), lowercased
   *  and using forward slashes (e.g. "(a)happy.gif", "char_icon.png",
   *  "emotions/button1_off.png"). */
  files: Record<string, Blob>;
}

let db: IDBDatabase | null = null;
const memoryCache = new Map<string, LocalCharacterRecord>();
let initPromise: Promise<void> | null = null;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "name" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Loads all locally-stored characters into memory. Call once at startup
 * before relying on the sync lookups in resolveLocalAsset.ts.
 */
export function initLocalCharacterStore(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      db = await openDb();
      const records = await new Promise<LocalCharacterRecord[]>(
        (resolve, reject) => {
          const tx = db!.transaction(STORE_NAME, "readonly");
          const store = tx.objectStore(STORE_NAME);
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result as LocalCharacterRecord[]);
          req.onerror = () => reject(req.error);
        },
      );
      memoryCache.clear();
      for (const record of records) {
        memoryCache.set(record.name, record);
      }
    } catch (err) {
      console.warn("Local character store unavailable:", err);
    }
  })();
  return initPromise;
}

export async function saveLocalCharacter(
  record: LocalCharacterRecord,
): Promise<void> {
  if (!db) await initLocalCharacterStore();
  memoryCache.set(record.name, record);
  if (!db) return; // IndexedDB unavailable -- still usable for this session
  await new Promise<void>((resolve, reject) => {
    const tx = db!.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteLocalCharacter(name: string): Promise<void> {
  const key = name.toLowerCase();
  memoryCache.delete(key);
  if (!db) await initLocalCharacterStore();
  if (!db) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db!.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Synchronous -- relies on initLocalCharacterStore() having already run. */
export function listLocalCharacters(): { name: string; displayName: string }[] {
  return Array.from(memoryCache.values()).map((r) => ({
    name: r.name,
    displayName: r.displayName,
  }));
}

/** Synchronous lookup by name (case-insensitive). */
export function getLocalCharacterSync(
  name: string,
): LocalCharacterRecord | undefined {
  return memoryCache.get(name.toLowerCase());
}
