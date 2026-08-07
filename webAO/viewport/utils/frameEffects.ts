/**
 * Networked FrameSFX playback (matches AO2). Given a message's packed
 * frame-effect fields and the animation currently playing for a phase
 * (preanim / talking / idle), schedules each effect to fire at that
 * frame's time. Frame numbers may exceed one loop of the animation
 * (e.g. Trucy's hattalk reaches frame 80 on a short looping sprite), so a
 * frame's time is cycle*total + offset[frame % frameCount]; timers that
 * haven't fired by the time the message ends are cleared by
 * stopFrameEffects(). The browser exposes no frame events, hence the
 * timer-based approach driven by getAnimFrameOffsets().
 */
import { AO_HOST } from "../../client/aoHost";
import { getAnimFrameOffsets } from "../../utils/getAnimFrameOffsets";

type FrameMap = Map<number, string>;

interface PhaseEffects {
  sfx: FrameMap;
  shake: Set<number>;
  realization: Set<number>;
}

// Phase indices in the packed data (fixed order from the sender).
export const FRAME_PHASE = { preanim: 0, talking: 1, idle: 2 };

let timers: number[] = [];
let startedPhases = new Set<number>();

// One active looping phase (talking or idle) is driven by requestAnimationFrame
// and wall-clock elapsed time, NOT setTimeout. setTimeout drifts and is
// throttled/paused in background tabs, which desynced the idle frame SFX
// (the symptom: timing drifting as you tab in and out). rAF + wall-clock is
// drift-free in the foreground, and we re-sync when the tab becomes visible.
interface LoopFire {
  next: number; // next wall-clock-elapsed time (ms) at which to fire
  base: number; // the offset within one cycle (for re-sync resets)
  action: () => void;
}
interface ActiveLoop {
  startTime: number;
  total: number;
  fires: LoopFire[];
  phaseIdx: number;
  side: string;
}
let rafId: number | null = null;
let activeLoop: ActiveLoop | null = null;
let restartCounter = 0;

/**
 * Restarts a character sprite's animation (the talking->idle "refresh") and
 * resolves once the sprite has reloaded, so the caller can align its clock
 * to the moment the animation actually begins. Re-assigning the same src
 * does not reliably restart an animated <img>; changing the URL fragment
 * does (the resource stays cached, but the browser restarts the animation).
 */
function restartSprite(side: string): Promise<void> {
  return new Promise((resolve) => {
    const accepted = ["def", "pro", "wit"];
    const pos = accepted.includes(side) ? `${side}_` : "";
    const img = document.getElementById(
      `client_${pos}char_img`,
    ) as HTMLImageElement | null;
    if (!img || !img.src) {
      resolve();
      return;
    }
    const base = img.src.split("#")[0];
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      img.removeEventListener("load", finish);
      resolve();
    };
    img.addEventListener("load", finish);
    img.src = `${base}#r${++restartCounter}`;
    // Fallback in case load doesn't fire (already fully cached/decoded).
    setTimeout(finish, 60);
  });
}

function runLoop(): void {
  if (!activeLoop) return;
  const elapsed = performance.now() - activeLoop.startTime;
  for (const f of activeLoop.fires) {
    if (elapsed >= f.next) {
      f.action();
      if (activeLoop.total > 0) {
        const missed = Math.floor((elapsed - f.next) / activeLoop.total);
        f.next += activeLoop.total * (missed + 1);
      } else {
        f.next = Infinity;
      }
    }
  }
  rafId = requestAnimationFrame(runLoop);
}

// On returning to the tab, re-sync: restart the idle sprite and reset the
// clock (aligned to the reloaded sprite) so the frame SFX line back up.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !activeLoop) return;
    const resync = () => {
      if (!activeLoop) return;
      activeLoop.startTime = performance.now();
      for (const f of activeLoop.fires) f.next = f.base;
    };
    if (activeLoop.phaseIdx === FRAME_PHASE.idle) {
      restartSprite(activeLoop.side).then(resync);
    } else {
      resync();
    }
  });
}

function splitPhases(raw: string): FrameMap[] {
  // "phase0|f=v|f=v^phase1|...^phase2|...^"
  return (raw || "").split("^").map((phase) => {
    const parts = phase.split("|");
    const map: FrameMap = new Map();
    for (let i = 1; i < parts.length; i++) {
      const eq = parts[i].indexOf("=");
      if (eq < 0) continue;
      const frame = Number(parts[i].slice(0, eq));
      const val = parts[i].slice(eq + 1);
      if (!Number.isNaN(frame)) map.set(frame, val);
    }
    return map;
  });
}

function phaseEffects(chatmsg: any, phaseIdx: number): PhaseEffects {
  const sfx = splitPhases(chatmsg.frame_sfx);
  const shake = splitPhases(chatmsg.frame_screenshake);
  const real = splitPhases(chatmsg.frame_realization);
  return {
    sfx: sfx[phaseIdx] || new Map(),
    shake: new Set([...(shake[phaseIdx] || new Map()).keys()]),
    realization: new Set([...(real[phaseIdx] || new Map()).keys()]),
  };
}

function playFrameSfx(name: string): void {
  if (!name || name === "0" || name === "1") return;
  // Don't fire frame SFX while the tab is hidden; otherwise sounds queued up
  // around a visibility change can play on top of each other when the loop
  // resumes, which sounds like doubled effects.
  if (typeof document !== "undefined" && document.hidden) return;
  const base = `${AO_HOST}sounds/general/${encodeURI(name.toLowerCase())}`;
  const a = new Audio(`${base}.opus`);
  // Respect the SFX volume setting (the main SFX audio element holds it).
  const sfxAudio = document.getElementById("client_sfxaudio") as HTMLAudioElement | null;
  a.volume = sfxAudio ? sfxAudio.volume : 1;
  a.addEventListener(
    "error",
    () => {
      a.src = `${base}.wav`;
      a.play().catch(() => {});
    },
    { once: true },
  );
  a.play().catch(() => {});
}

function doShake(): void {
  const gw = document.getElementById("client_gamewindow");
  if (!gw) return;
  gw.style.animation = "none";
  void gw.offsetWidth; // reflow to restart the animation
  gw.style.animation = "shake 0.2s 1";
}

function doFlash(): void {
  const fg = document.getElementById("client_fg") as HTMLElement | null;
  if (!fg) return;
  fg.style.animation = "none";
  void fg.offsetWidth;
  fg.style.animation = "flash 0.4s 1";
}

/** Clears all scheduled frame effects (call on each new message). */
export function stopFrameEffects(): void {
  timers.forEach((t) => clearTimeout(t));
  timers = [];
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  activeLoop = null;
  startedPhases = new Set();
}

/**
 * Warms the per-frame timing cache for an animation ahead of time, so that
 * startFramePhase (especially the idle phase, scheduled at message-end) can
 * schedule synchronously instead of waiting on a byte fetch.
 */
export function primeFrameOffsets(animUrl: string): void {
  if (!animUrl) return;
  const urlNoExt = animUrl.replace(/\.(gif|webp|apng|png)$/i, "");
  getAnimFrameOffsets(urlNoExt).catch(() => {
    /* ignore -- this is only a cache warm-up */
  });
}

/**
 * Schedules the frame effects for one phase against the animation at
 * animUrl. Started at most once per message. Times are relative to now
 * (when the phase's sprite became visible).
 *
 * loop=false (preanim): each frame fires once at its offset within the
 * single play. loop=true (talking/idle): the frame pattern repeats every
 * animation cycle until stopFrameEffects() is called -- so the sounds
 * keep going for long messages instead of stopping when the char.ini's
 * highest frame number is reached. Frame numbers are mapped into the
 * loop (frame % frameCount) and de-duplicated so repeated cumulative
 * frame numbers don't multiply into several sounds per cycle.
 */
export async function startFramePhase(
  phaseIdx: number,
  animUrl: string,
  chatmsg: any,
  loop = false,
): Promise<void> {
  const noSfx = !chatmsg?.frame_sfx || chatmsg.frame_sfx === "-";
  const noShake = !chatmsg?.frame_screenshake || chatmsg.frame_screenshake === "-";
  const noReal = !chatmsg?.frame_realization || chatmsg.frame_realization === "-";
  if (noSfx && noShake && noReal) return;
  // A blankpost (empty message) has no talking, so its talking-sprite frame
  // SFX (e.g. Tonate's typing sounds) must not fire.
  if (
    phaseIdx === FRAME_PHASE.talking &&
    (!chatmsg.content || chatmsg.content.trim() === "")
  ) {
    return;
  }
  if (startedPhases.has(phaseIdx)) return;
  startedPhases.add(phaseIdx);

  const phase = phaseEffects(chatmsg, phaseIdx);
  if (phase.sfx.size === 0 && phase.shake.size === 0 && phase.realization.size === 0) {
    return;
  }

  const urlNoExt = animUrl.replace(/\.(gif|webp|apng|png)$/i, "");
  const { offsets, total } = await getAnimFrameOffsets(urlNoExt);
  const frameCount = offsets.length;
  if (frameCount === 0) return;

  // Idle "refresh": restart the idle sprite's animation and WAIT for it to
  // reload, so the loop clock (set just below when we build activeLoop)
  // starts in sync with frame 0 of the restarted animation. Without the
  // wait, the schedule started slightly before the animation, biasing the
  // SFX early.
  if (phaseIdx === FRAME_PHASE.idle && chatmsg) {
    await restartSprite(chatmsg.side);
  }

  if (!loop || total <= 0) {
    // One-shot (preanim, or animations we couldn't time): fire each frame
    // once at its offset, clamping frames past the end to the last frame.
    const at = (frame: number) =>
      offsets[Math.min(frame, frameCount - 1)] ?? 0;
    for (const [frame, val] of phase.sfx) {
      timers.push(window.setTimeout(() => playFrameSfx(val), at(frame)));
    }
    for (const frame of phase.shake) {
      timers.push(window.setTimeout(doShake, at(frame)));
    }
    for (const frame of phase.realization) {
      timers.push(window.setTimeout(doFlash, at(frame)));
    }
    return;
  }

  // Looping phase (talking/idle): collapse frames into one animation cycle
  // (dedup), then drive them with requestAnimationFrame + wall-clock elapsed
  // (see ActiveLoop above) so they don't drift or get throttled in the
  // background.
  const sfxByIdx = new Map<number, string>();
  for (const [frame, val] of phase.sfx) sfxByIdx.set(frame % frameCount, val);
  const shakeIdx = new Set<number>([...phase.shake].map((f) => f % frameCount));
  const realIdx = new Set<number>([...phase.realization].map((f) => f % frameCount));

  const fires: LoopFire[] = [];
  for (const [idx, val] of sfxByIdx) {
    const base = offsets[idx] ?? 0;
    fires.push({ next: base, base, action: () => playFrameSfx(val) });
  }
  for (const idx of shakeIdx) {
    const base = offsets[idx] ?? 0;
    fires.push({ next: base, base, action: doShake });
  }
  for (const idx of realIdx) {
    const base = offsets[idx] ?? 0;
    fires.push({ next: base, base, action: doFlash });
  }

  activeLoop = {
    startTime: performance.now(),
    total,
    fires,
    phaseIdx,
    side: chatmsg.side,
  };
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(runLoop);
}
