import {
  getLocalOverrideUrl,
  getRemoteUrl,
  getRemoteUrlVariants,
} from "./resolveLocalAsset";
import { rememberRemotePath } from "./remoteCharacterStore";

type HeadResult = "ok" | "missing" | "unknown";

/** "unknown" = the request itself failed (network error / CORS-blocked). */
function headOk(target: string): Promise<HeadResult> {
  return new Promise<HeadResult>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("HEAD", target);
    xhr.onload = () =>
      resolve(xhr.readyState === 4 && xhr.status === 200 ? "ok" : "missing");
    xhr.onerror = () => resolve("unknown");
    xhr.send(null);
  });
}

const IMAGE_EXT = /\.(png|webp|gif|apng|jpe?g)$/i;
const AUDIO_EXT = /\.(opus|ogg|mp3|wav)$/i;

function isCrossOrigin(target: string): boolean {
  try {
    return new URL(target, window.location.href).origin !== window.location.origin;
  } catch {
    return false;
  }
}

/**
 * CORS-free fallback for CDNs that don't send Access-Control-Allow-Origin:
 * a HEAD to them fails, but an <img>/<audio> can still load the file.
 */
function loadsAsMedia(target: string, timeoutMs = 6000): Promise<boolean> {
  const path = target.split(/[?#]/)[0];
  const isImage = IMAGE_EXT.test(path);
  const isAudio = AUDIO_EXT.test(path);
  if (!isImage && !isAudio) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const el: HTMLImageElement | HTMLAudioElement = isImage
      ? new Image()
      : new Audio();
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      el.removeAttribute("src");
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    el.addEventListener("error", () => done(false), { once: true });
    if (isImage) {
      el.addEventListener("load", () => done(true), { once: true });
    } else {
      (el as HTMLAudioElement).preload = "metadata";
      el.addEventListener("loadedmetadata", () => done(true), { once: true });
      el.addEventListener("canplay", () => done(true), { once: true });
    }
    el.src = target;
  });
}

async function exists(target: string): Promise<boolean> {
  const r = await headOk(target);
  if (r === "ok") return true;
  if (r === "unknown" && isCrossOrigin(target)) return loadsAsMedia(target);
  return false;
}

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

  const promise = (async () => {
    if (await exists(getRemoteUrl(url) ?? url)) return true;
    // Case-sensitive fix
    for (const v of getRemoteUrlVariants(url)) {
      if (await exists(v.url)) {
        rememberRemotePath(v.name, v.path);
        return true;
      }
    }
    return false;
  })();

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
