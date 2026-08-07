/**
 * Smooth music transitions, matching the AO2 desktop client. This is a true
 * crossfade: the new track starts immediately on a fresh element and fades
 * in, while the previous track keeps playing seamlessly and fades out. That
 * means the new track is audible right away (during the old one's fade-out)
 * rather than only after it finishes. Driven by requestAnimationFrame.
 */
import { opusCheck } from "../dom/opusCheck";

const FADE_OUT_MS = 700;
const FADE_IN_MS = 400;

function rampEl(
  audio: HTMLAudioElement,
  from: number,
  to: number,
  ms: number,
  onDone?: () => void,
): void {
  // Instant (fade disabled): set the target volume directly. Going through the
  // rAF loop with ms=0 divides by zero -> NaN volume, which silently kills
  // playback (this is why unchecking "Fade" stopped music from changing).
  if (ms <= 0) {
    audio.volume = Math.max(0, Math.min(1, to));
    if (onDone) onDone();
    return;
  }
  const start = performance.now();
  audio.volume = Math.max(0, Math.min(1, from));
  const step = () => {
    const t = Math.min(1, (performance.now() - start) / ms);
    audio.volume = Math.max(0, Math.min(1, from + (to - from) * t));
    if (t < 1) {
      requestAnimationFrame(step);
    } else if (onDone) {
      onDone();
    }
  };
  step();
}

/**
 * Crossfades a channel to `src`. The channel's current element is faded out
 * and replaced (in the music array) by a fresh element playing the new
 * track. An empty src just fades the current track out.
 */
export function fadeToTrack(
  music: HTMLAudioElement[],
  channel: number,
  src: string,
  looping: boolean,
  targetVol: number,
): void {
  const old = music[channel];
  const wasPlaying = !!old && !!old.src && !old.paused && old.volume > 0.001;

  // Honor the "Fade" toggle: when off, switch instantly (0ms ramps).
  const fadeEnabled =
    (document.getElementById("music_fade_toggle") as HTMLInputElement | null)
      ?.checked ?? true;
  const fadeOut = fadeEnabled ? FADE_OUT_MS : 0;
  const fadeIn = fadeEnabled ? FADE_IN_MS : 0;

  // Stop request: fade the current track out, nothing new.
  if (!src) {
    if (wasPlaying) rampEl(old, old.volume, 0, fadeOut, () => old.pause());
    else if (old) old.pause();
    return;
  }

  // Start the new track immediately on a fresh element and fade it in.
  const fresh = new Audio();
  fresh.onerror = () => opusCheck(fresh);
  fresh.src = src;
  fresh.loop = looping;
  fresh.volume = 0;
  fresh.play().catch(() => {});
  rampEl(fresh, 0, targetVol, fadeIn);

  // Fade the previous track out in parallel (it keeps playing seamlessly),
  // then stop it.
  if (wasPlaying) {
    rampEl(old, old.volume, 0, fadeOut, () => old.pause());
  } else if (old) {
    old.pause();
  }

  // The channel now uses the fresh element so volume changes target it.
  music[channel] = fresh;
}
