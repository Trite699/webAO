import { ChatMsg } from "../interfaces/ChatMsg";
import { client } from "../../client";
import { appendICLog } from "../../client/appendICLog";
import { checkCallword } from "../../client/checkCallword";
import setEmoteFromUrl from "../../client/setEmoteFromUrl";
import { AO_HOST } from "../../client/aoHost";
import { SHOUTS } from "../constants/shouts";
import { buildCustomShoutAudioBases } from "./customShouts";
import {
  buildShoutBubbleCandidates,
  getOverrideShouts,
  resolveMiscFolder,
} from "./miscAssets";
import { setChatbox } from "../../dom/setChatbox";
import { resizeChatbox } from "../../dom/resizeChatbox";
import transparentPng from "../../constants/transparentPng";
import { COLORS } from "../constants/colors";
import mlConfig from "../../utils/aoml";
import request from "../../services/request";
import preloadMessageAssets from "./preloadMessageAssets";
import { resolveAndPreloadImage, resolveAndPreloadAudio } from "../../utils/assetCache";
import { stopFrameEffects, primeFrameOffsets } from "./frameEffects";
import { getAnimFrameOffsets } from "../../utils/getAnimFrameOffsets";
import { ensureCharIni } from "../../client/handleCharacterInfo";
import fileExists from "../../utils/fileExists";
import { getEffectProps, EffectLayer } from "../../utils/effectsIni";
import getAnimLoopCount, {
  INFINITE_LOOP,
} from "../../utils/getAnimLoopCount";





/**
 * Timers/intervals owned by the current effect. Cleared whenever the effect
 * layers are, so a forced loop from one message cannot outlive it.
 */
let fxTimers: number[] = [];
/** Object URLs driving a looping effect; released when the layer is cleared. */
let fxObjectUrls: string[] = [];

function clearFxTimers(): void {
  for (const id of fxTimers) {
    window.clearInterval(id);
    window.clearTimeout(id);
  }
  fxTimers = [];
  for (const url of fxObjectUrls) {
    URL.revokeObjectURL(url);
  }
  fxObjectUrls = [];
}


/**
 * Decode an animation's true final frame to a still PNG data URL.
 *
 * This CANNOT be done by painting the <img> to a canvas. Per the HTML spec,
 * drawing an animated image to a canvas uses its "default image", which is the
 * FIRST frame, not the frame currently on screen. That is why freezing a fade
 * this way produced its opening frame every time: a blackout came out as a
 * faint tint and a whiteout as a barely-there haze, no matter how the capture
 * was timed.
 *
 * WebCodecs' ImageDecoder can address a frame by index, so we ask for the last
 * one. It composites according to each frame's disposal method, which is what
 * makes an effect like dramaobjection end on its genuinely empty final frame
 * rather than a stale bubble.
 *
 * Returns null if the API is missing (older Safari/Firefox) or decoding fails.
 */
/**
 * The disposal method of a GIF's final frame, or null if not a GIF.
 * 2 == "restore to background".
 */
function lastGifFrameDisposal(bytes: Uint8Array): number | null {
  if (!(bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46)) {
    return null; // not a GIF
  }
  let disposal: number | null = null;
  for (let i = 0; i < bytes.length - 9; i++) {
    if (
      bytes[i] === 0x21 &&
      bytes[i + 1] === 0xf9 &&
      bytes[i + 2] === 0x04 &&
      bytes[i + 7] === 0x00 &&
      bytes[i + 8] === 0x2c
    ) {
      disposal = (bytes[i + 3] >> 2) & 0x07;
    }
  }
  return disposal;
}

/** True if every pixel of the canvas is the same colour. */
function isUniform(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): boolean {
  const { data } = ctx.getImageData(0, 0, width, height);
  for (let i = 4; i < data.length; i += 4) {
    if (
      data[i] !== data[0] ||
      data[i + 1] !== data[1] ||
      data[i + 2] !== data[2] ||
      data[i + 3] !== data[3]
    ) {
      return false;
    }
  }
  return true;
}

async function decodeLastFrame(
  url: string,
  expectedFrames: number,
): Promise<string | null> {
  const Decoder = (window as any).ImageDecoder;
  if (typeof Decoder === "undefined") {
    return null;
  }
  try {
    const response = await fetch(url);
    const data = await response.arrayBuffer();
    const type =
      response.headers.get("content-type") ||
      (url.endsWith(".gif")
        ? "image/gif"
        : url.endsWith(".webp")
          ? "image/webp"
          : "image/png");

    const decoder = new Decoder({ data, type });
    await decoder.tracks.ready;
    // tracks.ready resolves as soon as the track exists, which can be BEFORE
    // the image has been fully parsed: frameCount then still reads 1, and
    // asking for "the last frame" would hand back frame 0. That is exactly how
    // dramaobjection froze on its opening white flash. Waiting for `completed`
    // lets the frame count settle.
    if (decoder.completed) {
      await decoder.completed;
    }
    const reported = decoder.tracks.selectedTrack?.frameCount ?? 1;

    // Trust our own parse of the file when the decoder still under-reports;
    // getAnimFrameOffsets already counted every frame to build the timing.
    const frameCount = Math.max(reported, expectedFrames || 1);

    let image;
    try {
      ({ image } = await decoder.decode({
        frameIndex: Math.max(0, frameCount - 1),
        completeFramesOnly: true,
      }));
    } catch {
      // The decoder really does not have that frame: take what it does have.
      ({ image } = await decoder.decode({
        frameIndex: Math.max(0, reported - 1),
        completeFramesOnly: true,
      }));
    }

    const canvas = document.createElement("canvas");
    canvas.width = image.displayWidth || image.codedWidth;
    canvas.height = image.displayHeight || image.codedHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx || !canvas.width || !canvas.height) {
      return null;
    }
    ctx.drawImage(image, 0, 0);

    // Chromium fills a GIF frame disposed with "restore to background" using
    // the file's BACKGROUND COLOUR rather than transparency. dramaobjection and
    // dramaholdit end on an empty frame disposed that way, so the decoder hands
    // back a solid black rectangle and freezing on it blacks out the viewport.
    // A uniform frame from a restore-to-background GIF carries no real content:
    // the animation genuinely ends empty, so report no still and let the caller
    // clear the effect. lightsoff also ends uniformly black, but its frames are
    // "do not dispose", so its black is real content and is preserved.
    const disposal = lastGifFrameDisposal(new Uint8Array(data));
    if (disposal === 2 && isUniform(ctx, canvas.width, canvas.height)) {
      image.close();
      decoder.close();
      return null;
    }

    const still = canvas.toDataURL("image/png");
    image.close();
    decoder.close();
    return still;
  } catch {
    return null;
  }
}

/**
 * Stop a non-looping effect on its final frame.
 *
 * AO2 drives frames itself (loadAndPlayAnimation(effect, looping)), so a
 * loop=false effect halts on its last frame and cull=false leaves that frame on
 * screen. A browser <img> instead obeys the loop count baked into the file, and
 * these effects are authored to loop forever, so the intro replays rather than
 * holding. We decode the real final frame and swap it in.
 */
async function freezeOnLastFrame(
  img: HTMLImageElement,
  layer: HTMLElement,
  url: string,
  timing: { offsets: number[]; total: number },
): Promise<void> {
  const { offsets, total } = timing;

  // Decode in parallel with playback so the still is ready when we need it.
  // offsets.length is our own frame count, used to cross-check the decoder.
  const stillPromise = decodeLastFrame(url, offsets.length);
  const lastFrameStart = offsets.length ? offsets[offsets.length - 1] : 0;
  const lastFrameLength = total - lastFrameStart;
  // Swap just inside the final frame: the displayed frame already IS the final
  // one by then, so the swap is invisible.
  const swapAt =
    lastFrameStart + Math.min(50, Math.max(10, lastFrameLength / 2));

  await new Promise((resolve) => window.setTimeout(resolve, swapAt));
  if (img.parentNode !== layer) {
    return; // a newer message cleared the layer
  }
  const still = await stillPromise;
  if (img.parentNode !== layer) {
    return;
  }

  if (still) {
    img.src = still;
    return;
  }

  // The final frame could not be decoded. Remove the effect rather than
  // leaving it looping or freezing it on the wrong frame: a vanished effect is
  // a far better failure than a blackout stuck at 8% opacity.
  layer.removeChild(img);
}

/**
 * Keep a loop=true effect playing when its file will not loop by itself.
 *
 * Two separate browser behaviours make this necessary, and confetti.gif trips
 * both because it is the only effect in the pack with a FINITE loop count (one
 * play; everything else either loops forever or never completes):
 *
 *  1. The browser obeys the loop count baked into the file, not effects.ini, so
 *     confetti stops after a single pass even though the ini says loop=true.
 *  2. Animation state is tracked PER RESOURCE URL. Once that single pass has
 *     finished, the resource is permanently "ended": pointing a brand new <img>
 *     at the same url shows the finished (empty) final frame instead of
 *     replaying. That is why re-sending confetti rendered nothing at all.
 *
 * Both need the same cure: a genuinely fresh resource. We fetch the bytes once
 * and hand the <img> a new object URL, immediately (so this render starts from
 * frame 0 no matter how many times the effect has been sent before) and again
 * every cycle. Object URLs cost no network traffic, unlike cache-busting query
 * strings, which would re-fetch the file on every loop.
 */
async function forceLoop(
  img: HTMLImageElement,
  layer: HTMLElement,
  url: string,
  periodMs: number,
): Promise<void> {
  let blob: Blob;
  try {
    const response = await fetch(url);
    blob = await response.blob();
  } catch {
    return; // leave it playing its single pass
  }
  if (img.parentNode !== layer) {
    return; // a newer message already cleared the layer
  }

  const restart = () => {
    const next = URL.createObjectURL(blob);
    img.src = next;
    // Release the previous handle now that it has been replaced.
    const stale = fxObjectUrls.splice(0, fxObjectUrls.length);
    fxObjectUrls.push(next);
    for (const old of stale) {
      URL.revokeObjectURL(old);
    }
  };

  restart(); // start this render from frame 0

  const id = window.setInterval(() => {
    if (img.parentNode !== layer) {
      window.clearInterval(id);
      return;
    }
    restart();
  }, periodMs);
  fxTimers.push(id);
}


/**
 * Play an effect's sound.
 *
 * AO2's do_effect plays the effect sound itself (sfx_player->findAndPlaySfx),
 * independently of the emote's own SFX and regardless of emote_mod. webCOA
 * used to route it through the emote-SFX pipeline instead, which meant it was
 * swallowed by that path's emote_mod gate (a message with no preanim is type 0
 * and never fires SFX) and was skipped entirely whenever the emote already had
 * a sound of its own. Playing it on a separate Audio element, as the frame-SFX
 * code does, fixes both and lets the effect sound layer over the emote's.
 */
function playEffectSfx(name: string): void {
  if (!name || name === "0" || name === "1") {
    return;
  }
  const base = `${AO_HOST}sounds/general/${encodeURI(name.toLowerCase())}`;
  const audio = new Audio(`${base}.opus`);
  // The main SFX audio element carries the SFX volume setting.
  const sfxAudio = <HTMLAudioElement>document.getElementById("client_sfxaudio");
  audio.volume = sfxAudio ? sfxAudio.volume : 1;
  audio.addEventListener(
    "error",
    () => {
      audio.src = `${base}.wav`;
      audio.play().catch(() => {});
    },
    { once: true },
  );
  audio.play().catch(() => {});
}

/**
 * The four DOM containers effects can be rendered into. AO2 reparents a single
 * effect widget; the browser equivalent is one container per layer, cleared at
 * the start of each message.
 */
const FX_LAYER_IDS = [
  "client_fg",
  "client_fg_behind_full",
  "client_fg_behind_classic",
  "client_fg_chat",
];

/**
 * Empty every effect layer, optionally leaving one alone (the rain path keeps
 * #client_fg so its raindrops can be reused across messages).
 */
function clearEffectLayers(except?: string): void {
  clearFxTimers();
  for (const id of FX_LAYER_IDS) {
    if (id === except) {
      continue;
    }
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = "";
    }
  }
}

/**
 * Pick the container for an effect's layer.
 *
 * "behind" has two candidates because the courtroom has two viewport modes
 * (the stitched full view and the classic single-background view) and the
 * behind-layer must sit inside whichever one is on screen, between the
 * background and the character. offsetParent is null for a hidden element,
 * which is how we tell which mode is live.
 */
function effectLayerElement(layer: EffectLayer): HTMLElement {
  const fgLayer = document.getElementById("client_fg")!;
  if (layer === "chat") {
    return document.getElementById("client_fg_chat") ?? fgLayer;
  }
  if (layer === "behind") {
    const full = document.getElementById("client_fg_behind_full");
    const classic = document.getElementById("client_fg_behind_classic");
    if (full && full.offsetParent !== null) {
      return full;
    }
    if (classic && classic.offsetParent !== null) {
      return classic;
    }
    return full ?? classic ?? fgLayer;
  }
  // "over", plus "character": AO2 stacks a character-layer effect under the
  // desk, but no effect in the vanilla pack uses it, so it renders as "over".
  return fgLayer;
}

// Whether the CURRENT background has a panorama (court.png) or panorama desk
// overlay (court_overlay.png). AO2 only pans the camera between positions for
// panorama-style backgrounds; classic backgrounds (separate def/pro/wit
// images) hard-cut instead, because there's no continuous image to slide
// across. Cached per background folder so we probe at most once per room.
let _panoramaFolder: string | null = null;
let _panoramaHas = false;
const backgroundHasPanorama = async (): Promise<boolean> => {
  const folder = client.viewport.getBackgroundFolder();
  if (folder === _panoramaFolder) return _panoramaHas;
  _panoramaFolder = folder;
  _panoramaHas = false;
  for (const stem of ["court", "court_overlay"]) {
    for (const ext of client.background_extensions) {
      if (await fileExists(`${folder}${stem}${ext}`)) {
        _panoramaHas = true;
        return true;
      }
    }
  }
  return false;
};


let attorneyMarkdown: ReturnType<typeof mlConfig> | null = null;
export let markdownDisabled = false;
let markdownInitPromise: Promise<ReturnType<typeof mlConfig> | null> | null = null;

const initAttorneyMarkdown = async () => {
  if (markdownDisabled) {
    return null;
  }
  if (attorneyMarkdown !== null) {
    return attorneyMarkdown;
  }
  if (markdownInitPromise) {
    return markdownInitPromise;
  }
  markdownInitPromise = (async () => {
    try {
      const iniContent = await request(`${AO_HOST}themes/default/chat_config.ini`);
      attorneyMarkdown = mlConfig(iniContent);
      return attorneyMarkdown;
    } catch (error) {
      console.warn("Failed to load chat_config.ini, disabling markdown system:", error);
      markdownDisabled = true;
      return null;
    }
  })();
  return markdownInitPromise;
};

export let startFirstTickCheck: boolean;
export const setStartFirstTickCheck = (val: boolean) => {
  startFirstTickCheck = val;
};
export let startSecondTickCheck: boolean;
export const setStartSecondTickCheck = (val: boolean) => {
  startSecondTickCheck = val;
};
export let startThirdTickCheck: boolean;
export const setStartThirdTickCheck = (val: boolean) => {
  startThirdTickCheck = val;
};
/**
 * Sets a new emote.
 * This sets up everything before the tick() loops starts
 * a lot of things can probably be moved here, like starting the shout animation if there is one
 * TODO: the preanim logic, on the other hand, should probably be moved to tick()
 * @param playerChatMsg the new chat message
 */
export const handle_ic_speaking = async (playerChatMsg: ChatMsg) => {
  client.viewport.setChatmsg(playerChatMsg);
  client.viewport.setTextNow("");
  client.viewport.setSfxPlayed(0);
  client.viewport.setTickTimer(0);
  client.viewport.setAnimating(true);
  // Clear any frame effects (FrameSFX/shake/realization timers) still
  // pending from the previous message.
  stopFrameEffects();

  startFirstTickCheck = true;
  startSecondTickCheck = false;
  startThirdTickCheck = false;
  let charLayers = document.getElementById("client_char")!;
  let pairLayers = document.getElementById("client_pair_char")!;
  // stop updater
  clearTimeout(client.viewport.updater);

  // stop last sfx from looping any longer
  client.viewport.getSfxAudio().loop = false;

  const fg = <HTMLImageElement>document.getElementById("client_fg");
  const gamewindow = document.getElementById("client_gamewindow")!;
  const waitingBox = document.getElementById("client_chatwaiting")!;

  // Reset CSS animation
  gamewindow.style.animation = "";
  waitingBox.style.opacity = "0";

  const eviBox = document.getElementById("client_evi")!;

  if (
    client.viewport.getLastEvidence() !== client.viewport.getChatmsg().evidence
  ) {
    eviBox.style.opacity = "0";
    eviBox.style.height = "0%";
  }
  client.viewport.setLastEvidence(client.viewport.getChatmsg().evidence);

  const validSides: string[] = ["def", "pro", "wit"]; // these are for the full view pan, the other positions use 'client_char'
  if (validSides.includes(client.viewport.getChatmsg().side)) {
    charLayers = document.getElementById(
      `client_${client.viewport.getChatmsg().side}_char`,
    );
    pairLayers = document.getElementById(
      `client_${client.viewport.getChatmsg().side}_pair_char`,
    );
  }

  const chatContainerBox = document.getElementById("client_chatcontainer")!;
  const nameBoxInner = document.getElementById("client_inner_name")!;
  const chatBoxInner = document.getElementById("client_inner_chat")!;

  const displayname =
    (<HTMLInputElement>document.getElementById("showname")).checked &&
    client.viewport.getChatmsg().showname !== ""
      ? client.viewport.getChatmsg().showname!
      : client.viewport.getChatmsg().nameplate!;

  // Clear out the last message
  if (!client.viewport.getChatmsg().additive) {
    chatBoxInner.innerText = client.viewport.getTextNow();
  }
  nameBoxInner.innerText = displayname;
  // An intentionally empty-looking showname (e.g. only spaces, as Narrator
  // uses) should hide the nameplate plate entirely, matching how AO2 shows
  // empty shownames with a "nothing" chatbox rather than a blank plate.
  const nameBox = document.getElementById("client_name");
  if (nameBox) {
    nameBox.style.display = displayname.trim() === "" ? "none" : "";
  }

  if (
    client.viewport.getLastCharacter() !== client.viewport.getChatmsg().name
  ) {
    charLayers.style.opacity = "0";
    pairLayers.style.opacity = "0";
  }

  client.viewport.setLastCharacter(client.viewport.getChatmsg().name);

  checkCallword(
    client.viewport.getChatmsg().content,
    client.viewport.getSfxAudio(),
  );

  // Preload all assets before any visual changes - resolves URLs and primes browser cache
  const preloaded = await preloadMessageAssets(
    client.viewport.getChatmsg(),
    AO_HOST,
    client.emote_extensions,
  );
  client.viewport.getChatmsg().preloadedAssets = preloaded;

  // Prime the frame-timing cache for every phase NOW (fire-and-forget), so
  // that when startFramePhase runs -- especially the idle phase at
  // message-end -- the per-frame offsets are already cached and the SFX are
  // scheduled instantly instead of after a byte fetch (which made idle
  // frame SFX fire noticeably late vs the desktop client).
  if (
    preloaded &&
    client.viewport.getChatmsg().frame_sfx &&
    client.viewport.getChatmsg().frame_sfx !== "-"
  ) {
    [preloaded.preanimUrl, preloaded.talkingUrl, preloaded.idleUrl].forEach(
      (u) => {
        if (u) primeFrameOffsets(u);
      },
    );
  }

  // Set initial idle emote using pre-cached URLs (synchronous, images already in cache)
  setEmoteFromUrl(preloaded.idleUrl, false, client.viewport.getChatmsg().side);

  if (client.viewport.getChatmsg().other_name) {
    setEmoteFromUrl(preloaded.pairIdleUrl, true, client.viewport.getChatmsg().side);
  }

  // gets which shout shall played
  const shoutSprite = <HTMLImageElement>document.getElementById("client_shout");

  const shoutMsgData = client.viewport.getChatmsg();
  // objection 4 = custom shout; its id may be a [Shouts] entry like "cross"
  const shout =
    shoutMsgData.objection === 4
      ? shoutMsgData.customShout || "custom"
      : SHOUTS[shoutMsgData.objection];
  if (shout) {
    // Hide message box
    chatContainerBox.style.opacity = "0";
    // Bubble lookup (webp / apng / png). Order depends on "Override Shouts":
    // off -> misc/<chat> first; on -> the character's own folder first.
    const bubbleMsg = client.viewport.getChatmsg();
    const bubbleCandidates = buildShoutBubbleCandidates(
      AO_HOST,
      (bubbleMsg.name || "").toLowerCase(),
      resolveMiscFolder(bubbleMsg),
      shout,
      getOverrideShouts(),
    );
    shoutSprite.src = await resolveAndPreloadImage(bubbleCandidates);
    shoutSprite.style.animation = "bubble 700ms steps(10, jump-both)";
    shoutSprite.style.display = "block";

    // Log the interjection in the IC log like AO2: "<showname> shouts GOTCHA!"
    try {
      const fallback: { [k: string]: string } = {
        holdit: "HOLD IT!",
        objection: "OBJECTION!",
        takethat: "TAKE THAT!",
        custom: "Interjection!",
      };
      let shoutMsg = fallback[shout] || shout.toUpperCase();
      // Prefer the shouting character's own shout text from their [Shouts]
      // section (HoldIt_Message / Objection_Message / TakeThat_Message /
      // Custom_Message), matching AO2.
      try {
        const sIni: any = await ensureCharIni(
          client.viewport.getChatmsg().charid,
        );
        const m = sIni && sIni.shouts && sIni.shouts[`${shout}_message`];
        if (m) shoutMsg = m;
      } catch (e) {
        /* keep fallback */
      }
      const sn =
        client.viewport.getChatmsg().showname ||
        client.viewport.getChatmsg().nameplate;
      appendICLog(
        `shouts ${shoutMsg}`,
        sn,
        client.viewport.getChatmsg().nameplate,
      );
    } catch (e) {
      /* logging must never block the shout */
    }

    // Resolve the shout SFX through a fallback chain, trying both .opus
    // and .wav (misc/<chat> folders like misc/dd ship .wav shout sounds).
    const isCustom = client.viewport.getChatmsg().objection === 4;
    const customSfxBases = isCustom
      ? buildCustomShoutAudioBases(
          AO_HOST,
          client.viewport.getChatmsg().name!.toLowerCase(),
          shout,
        )
      : [];
    const miscChat = resolveMiscFolder(client.viewport.getChatmsg());
    const shoutCharName = (client.viewport.getChatmsg().name || "").toLowerCase();
    const sfxBases = [
      ...customSfxBases,
      `${AO_HOST}characters/${encodeURI(shoutCharName)}/${shout}`,
      `${AO_HOST}misc/${encodeURI(miscChat)}/${shout}`,
      `${AO_HOST}themes/default/${shout}`,
      `${AO_HOST}misc/default/${shout}`,
      `${AO_HOST}sounds/general/sfx-${shout}`,
    ].filter((b): b is string => !!b);
    const audioExts = [".opus", ".wav"];
    const shoutSfxCandidates = [
      preloaded.shoutSfxUrl,
      ...sfxBases.flatMap((b) => audioExts.map((e) => b + e)),
    ].filter((u): u is string => !!u);
    let shoutSfx: string | null = null;
    for (const cand of shoutSfxCandidates) {
      const r = await resolveAndPreloadAudio(cand);
      if (r) {
        shoutSfx = r;
        break;
      }
    }
    if (shoutSfx) {
      client.viewport.shoutaudio.src = shoutSfx;
      client.viewport.shoutaudio.play().catch(() => {});
    }
    client.viewport.setShoutTimer(
      (client.resources[shout] || client.resources.custom).duration,
    );
  } else {
    client.viewport.setShoutTimer(0);
  }

  client.viewport.getChatmsg().startpreanim = true;

  // Use preloaded preanim duration (already computed in parallel by preloader)
  // emote_modifier (type): 1 = preanim, 5 = zoom, 6 = zoom WITH preanim.
  // The desktop client treats both 5 and 6 as a zoom (speed lines, no desk);
  // 6 additionally plays the preanim.
  const emoteType = client.viewport.getChatmsg().type;
  const hasPreanim =
    (emoteType === 1 || emoteType === 6) &&
    client.viewport.getChatmsg().preanim !== "-" &&
    client.viewport.getChatmsg().preanim !== "";

  if (hasPreanim) {
    chatContainerBox.style.opacity = "0";
    client.viewport.getChatmsg().startspeaking = false;
  } else {
    client.viewport.getChatmsg().startspeaking = true;
    // Don't reveal the chatbox while a shout is playing -- it must stay hidden
    // for the whole interjection (the tick loop shows it once the shout is
    // over). Without the !shout guard, a no-preanim shout message flashed the
    // chatbox back on in the middle of the shout animation.
    if (client.viewport.getChatmsg().content.trim() !== "" && !shout)
      chatContainerBox.style.opacity = "1";
  }
  client.viewport.getChatmsg().preanimdelay = preloaded.preanimDuration;

  // Slide (AO 2.11 field): if this message set the slide flag, animate the
  // camera pan to its position; otherwise cut instantly. Driven per-message
  // by the sender's flag (received in handleMS), so a desktop client's
  // slide now shows on webCOA. The transition is set before set_side
  // (below) changes #client_fullview's left.
  const fullviewEl = document.getElementById("client_fullview");
  if (fullviewEl) {
    // Only honor the slide flag when the background can actually be panned
    // across (has court.png / court_overlay.png). Otherwise cut, matching
    // AO2 — sliding a classic background just drifts across empty space.
    const wantsSlide = client.viewport.getChatmsg().slide === 1;
    const canSlide = wantsSlide && (await backgroundHasPanorama());
    fullviewEl.style.transition = canSlide ? "left 0.5s ease-in-out" : "none";
  }

  const setAside = {
    position: client.viewport.getChatmsg().side,
    showSpeedLines: false,
    showDesk: false,
  };
  let skipoffset: boolean = false;
  if (emoteType === 5 || emoteType === 6) {
    // Zoom: speed lines, desk hidden. (Both modifiers; 6 also ran its
    // preanim above. Upstream only handled 5, so type-6 zooms wrongly
    // showed the desk with no speed lines.)
    setAside.showSpeedLines = true;
    setAside.showDesk = false;
  } else {
    switch (Number(client.viewport.getChatmsg().deskmod)) {
      case 0: //desk is hidden
        setAside.showSpeedLines = false;
        setAside.showDesk = false;
        break;
      case 1: //desk is shown
        setAside.showSpeedLines = false;
        setAside.showDesk = true;
        break;
      case 2: //desk is hidden during preanim, but shown during idle/talk
        setAside.showSpeedLines = false;
        setAside.showDesk = false;
        break;
      case 3: //opposite of 2
        setAside.showSpeedLines = false;
        setAside.showDesk = false;
        break;
      case 4: //desk is hidden, character offset is ignored, pair character is hidden during preanim, normal behavior during idle/talk
        setAside.showSpeedLines = false;
        setAside.showDesk = false;
        skipoffset = true;
        break;
      case 5: //opposite of 4
        setAside.showSpeedLines = false;
        setAside.showDesk = true;
        break;
      default:
        setAside.showSpeedLines = false;
        setAside.showDesk = true;
        break;
    }
  }

  // Apply the position/background switch. When there's a shout, defer the
  // switch until the splash has finished, so the interjection plays over
  // the CURRENT position first and then cuts to the speaker's position --
  // matching AO2 (a def shout while you're viewing wit splashes on wit,
  // then switches to def).
  if (shout && client.resources[shout]) {
    setTimeout(
      () => client.viewport.set_side(setAside),
      client.resources[shout].duration,
    );
  } else {
    client.viewport.set_side(setAside);
  }

  setChatbox(client.viewport.getChatmsg().chatbox);
  resizeChatbox();
  if (client.viewport.getChatmsg().chatbox === "") {
    // No chatbox means hide it
    chatContainerBox.style.opacity = "0";
  }

  if (!skipoffset) {
    // Flip the character
    charLayers.style.transform =
      client.viewport.getChatmsg().flip === 1 ? "scaleX(-1)" : "scaleX(1)";
    pairLayers.style.transform =
      client.viewport.getChatmsg().other_flip === 1
        ? "scaleX(-1)"
        : "scaleX(1)";

    // Shift by the horizontal offset
    switch (client.viewport.getChatmsg().side) {
      case "wit":
        pairLayers.style.left = `${200 + Number(client.viewport.getChatmsg().other_offset[0])}%`;
        charLayers.style.left = `${200 + Number(client.viewport.getChatmsg().self_offset[0])}%`;
        break;
      case "pro":
        pairLayers.style.left = `${400 + Number(client.viewport.getChatmsg().other_offset[0])}%`;
        charLayers.style.left = `${400 + Number(client.viewport.getChatmsg().self_offset[0])}%`;
        break;
      default:
        pairLayers.style.left = `${Number(client.viewport.getChatmsg().other_offset[0])}%`;
        charLayers.style.left = `${Number(client.viewport.getChatmsg().self_offset[0]) || 0}%`;
        break;
    }

    // New vertical offsets. The offset fields arrive as "x<and>y", but a
    // client that only sends the horizontal component leaves [1] undefined,
    // and Number(undefined) is NaN -- which produced `top: NaN%`, a value the
    // browser drops on the floor (and logs). Default the missing axis to 0.
    const otherOffsetY = Number(
      client.viewport.getChatmsg().other_offset[1] ?? 0,
    );
    const selfOffsetY = Number(client.viewport.getChatmsg().self_offset[1] ?? 0);
    pairLayers.style.top = `${Number.isFinite(otherOffsetY) ? otherOffsetY : 0}%`;
    charLayers.style.top = `${Number.isFinite(selfOffsetY) ? selfOffsetY : 0}%`;

    // Pair ordering (AO2): 0 = speaker drawn in front of their pair, 1 =
    // speaker behind. Both layers are absolutely-positioned siblings of the
    // benches and chatbox, so we flip their DOM order rather than using
    // z-index -- an explicit z-index lifted the sprites above the textbox.
    if (charLayers.parentNode) {
      if (client.viewport.getChatmsg().pair_order === 1) {
        // speaker behind: draw the pair after (on top of) the speaker
        charLayers.parentNode.insertBefore(pairLayers, charLayers.nextSibling);
      } else {
        // speaker in front: draw the pair before (under) the speaker
        charLayers.parentNode.insertBefore(pairLayers, charLayers);
      }
    }
  }

  const blipName = client.viewport.getChatmsg().blips.toLowerCase();
  client.viewport.blipChannels.forEach((channel: HTMLAudioElement) => {
    // "none" (or empty) blips => no blip sound (e.g. Trucy's Mr. Hat emotes
    // via [Options2]). An empty src makes play() a no-op.
    channel.src =
      blipName === "none" || blipName === ""
        ? ""
        : `${AO_HOST}sounds/blips/${encodeURI(blipName)}.opus`;
  });

  // process markup
  // AO2 lets users insert hard line breaks by typing a literal "\n" in their
  // IC message. Convert those to real newlines so applyMarkdown emits them as
  // their own spans; pre-wrap on the chatbox then renders them as breaks.
  if (client.viewport.getChatmsg().content.includes("\\n")) {
    client.viewport.getChatmsg().content = client.viewport
      .getChatmsg()
      .content.replace(/\\n/g, "\n");
    chatBoxInner.style.whiteSpace = "pre-wrap";
  }
  if (client.viewport.getChatmsg().content.startsWith("~~")) {
    chatBoxInner.style.textAlign = "center";
    let centered = client.viewport
      .getChatmsg()
      .content.substring(2, client.viewport.getChatmsg().content.length);
    // AO2 puts additive centered text on its own new line.
    if (client.viewport.getChatmsg().additive) {
      chatBoxInner.style.whiteSpace = "pre-wrap";
      centered = `\n${centered}`;
    }
    client.viewport.getChatmsg().content = centered;
  } else {
    chatBoxInner.style.textAlign = "inherit";
  }

  // apply effects
  fg.style.animation = "";
  const effectName = client.viewport.getChatmsg().effects[0].toLowerCase();
  const badEffects = ["", "-", "none"];

  // AO2 plays the effect's sound in do_effect, before anything is rendered and
  // independently of the emote's SFX. The sound normally rides on the wire as
  // the third segment of the effects field ("name|folder|sound"); if a sender
  // omits it, fall back to the sound named in effects.ini.
  if (effectName && !badEffects.includes(effectName)) {
    const wireSfx = client.viewport.getChatmsg().effects[2] ?? "";
    playEffectSfx(wireSfx || getEffectProps(effectName).sound);
  }

  if (effectName.startsWith("rain")) {
    // Rain is a webAO CSS effect (a field of <p> raindrops), not an
    // effects.ini entry, so it keeps its own code path. Only the other
    // layers are cleared: the existing drops in #client_fg are reused
    // across consecutive rain messages rather than rebuilt.
    clearEffectLayers("client_fg");
    (<HTMLLinkElement>document.getElementById("effect_css")).href =
      "styles/effects/rain.css";
    let intensity = 200;
    if (effectName.endsWith("weak")) {
      intensity = 100;
    } else if (effectName.endsWith("strong")) {
      intensity = 400;
    }
    if (intensity < fg.childElementCount) fg.innerHTML = "";
    else intensity = intensity - fg.childElementCount;

    for (let i = 0; i < intensity; i++) {
      const drop = document.createElement("p");
      drop.style.left = Math.random() * 100 + "%";
      drop.style.animationDelay = String(Math.random()) + "s";
      fg.appendChild(drop);
    }
  } else if (
    client.viewport.getChatmsg().effects[0] &&
    !badEffects.includes(effectName)
  ) {
    // AO2 clears the effect widget at the start of every IC message
    // (Courtroom::display_character) and then plays the new effect.
    clearEffectLayers();
    (<HTMLLinkElement>document.getElementById("effect_css")).href = "";

    const props = getEffectProps(effectName);
    const layer = effectLayerElement(props.layer);

    // #client_fg is a DIV (it carries the rain drops), so setting .src does
    // nothing -- realization/confetti never appeared. Render the effect as a
    // child <img> instead, probing extensions (effects are often gif/apng,
    // not just webp).
    const effectExts = [".webp", ".apng", ".gif", ".png"];
    const effectCandidates = effectExts.map(
      (e) => `${AO_HOST}themes/default/effects/${encodeURI(effectName)}${e}`,
    );
    const effUrl = await resolveAndPreloadImage(effectCandidates);
    if (effUrl) {
      const effImg = document.createElement("img");
      effImg.className = "client_fx_img";
      effImg.src = effUrl;
      // "stretch" fills the viewport ignoring aspect (AO2 setStretchToFit);
      // without it the effect is letterboxed into the viewport instead.
      effImg.style.objectFit = props.stretch ? "fill" : "contain";
      // AO2 maps "fast" scaling to nearest-neighbour.
      effImg.style.imageRendering =
        props.scaling === "fast" ? "pixelated" : "auto";

      const fxMsg = client.viewport.getChatmsg();
      if (props.respectFlip && Number(fxMsg.flip) === 1) {
        effImg.style.transform = "scaleX(-1)";
      }
      if (props.respectOffset && fxMsg.self_offset) {
        const offsetX = Number(fxMsg.self_offset[0]) || 0;
        const offsetY = Number(fxMsg.self_offset[1]) || 0;
        effImg.style.position = "relative";
        effImg.style.left = `${offsetX}%`;
        effImg.style.top = `${offsetY}%`;
      }

      // Show the effect NOW. Everything below is lifetime bookkeeping that
      // needs to read the file's frame data, and those lookups must never gate
      // rendering: an earlier version awaited them first, so a slow or failed
      // lookup left repeat sends of an effect audible but invisible.
      layer.appendChild(effImg);

      const base = effUrl.replace(/\.(gif|webp|apng|png)$/i, "");
      const timing = await getAnimFrameOffsets(base);

      // Lifetime, following AO2. Skipped for a still image (total 0) and if a
      // newer message already replaced the layer. NOTE: this must not `return`
      // out of handleICSpeaking -- everything after the effect block (blips,
      // markup, chat ticking) still has to run.
      if (effImg.parentNode === layer && timing.total > 0) {
        //  - loop=true keeps playing. The browser obeys the file's own loop
        //    count, so a file that stops early has to be restarted by us.
        //  - loop=false must STOP after one pass: cull=true removes it,
        //    cull=false freezes it on its final frame.
        if (props.loop) {
          const fileLoopCount = await getAnimLoopCount(base);
          if (effImg.parentNode === layer && fileLoopCount !== INFINITE_LOOP) {
            forceLoop(
              effImg,
              layer,
              effUrl,
              Math.max(1, fileLoopCount) * timing.total,
            );
          }
        } else if (props.cull) {
          const id = window.setTimeout(() => {
            if (effImg.parentNode === layer) layer.removeChild(effImg);
          }, timing.total + 100);
          fxTimers.push(id);
        } else {
          freezeOnLastFrame(effImg, layer, effUrl, timing);
        }
      }
    }
  } else {
    clearEffectLayers();
  }

  charLayers.style.opacity = "1";

  // NOTE: webCOA used to copy the effect's sound (effects[2]) into
  // chatmsg.sound here so it would play via the emote-SFX pipeline. That is
  // gone: the emote-SFX path only fires for preanim/zoom emote_mods, so a
  // plain message never played its effect sound, and an emote with its own
  // sound suppressed it entirely. The effect sound is now played directly by
  // playEffectSfx above, matching AO2's do_effect.

  const processTextOnly = () => {
    const output: HTMLSpanElement[] = [];
    for (const letter of client.viewport.getChatmsg().content) {
      const currentSelector = document.createElement("span");
      currentSelector.innerHTML = letter;
      currentSelector.className = `text_${COLORS[client.viewport.getChatmsg().color]}`;
      output.push(currentSelector);
    }
    client.viewport.getChatmsg().parsed = output;
  };

  if (!markdownDisabled) {
    try {
      const markdown = await initAttorneyMarkdown();
      if (markdown) {
        client.viewport.getChatmsg().parsed = markdown.applyMarkdown(
          client.viewport.getChatmsg().content,
          COLORS[client.viewport.getChatmsg().color],
        );
      } else {
        processTextOnly();
      }
    } catch (error) {
      console.warn("markdown failed");
      processTextOnly();
    }
  } else {
    processTextOnly();
  }

  // Render the message first, THEN log it -- so a logging error can never
  // block the viewport from rendering (which previously looked like
  // "can't send"). Logging is wrapped defensively too.
  client.viewport.chat_tick();

  try {
    appendICLog(
      client.viewport.getChatmsg().content,
      client.viewport.getChatmsg().showname,
      client.viewport.getChatmsg().nameplate,
      new Date(),
      client.viewport.getChatmsg().color > 0
        ? COLORS[client.viewport.getChatmsg().color]
        : "",
      client.viewport.getChatmsg().parsed,
    );
  } catch (e) {
    console.error("appendICLog failed", e);
  }
};
