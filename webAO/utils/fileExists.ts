import { getLocalOverrideUrl } from "./resolveLocalAsset";

const cache = new Map<string, Promise<boolean>>();

export default function fileExists(url: string): Promise<boolean> {
  const cached = cache.get(url);
  if (cached !== undefined) return cached;

  // Every character-asset URL webAO builds follows the same
  // ".../characters/<name>/<filename>" shape. If <name> is a locally
  // imported character and it has that file, skip the network entirely --
  // this is what makes fully-local custom characters work without ever
  // being uploaded anywhere.
  if (getLocalOverrideUrl(url) !== null) {
    const promise = Promise.resolve(true);
    cache.set(url, promise);
    return promise;
  }

  const promise = new Promise<boolean>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("HEAD", url);
    xhr.onload = function checkLoad() {
      if (xhr.readyState === 4) {
        resolve(xhr.status === 200);
      }
    };
    xhr.onerror = function checkError() {
      resolve(false);
    };
    xhr.send(null);
  });

  // Only cache successful lookups permanently. A transient failure (slow
  // response, DNS hiccup, server blip) would otherwise be cached forever
  // for the rest of the session, silently and permanently "hiding" a sprite
  // that actually exists -- with no console error, since resolve(false) is
  // a normal resolution, not a rejection. Failures are cached briefly to
  // avoid hammering a genuinely-missing file with retries every tick, but
  // are allowed to be retried instead of being permanent.
  promise.then((exists) => {
    if (!exists) {
      cache.delete(url);
    }
  });

  cache.set(url, promise);
  return promise;
}
