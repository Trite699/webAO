/* eslint indent: ["error", 2, { "SwitchCase": 1 }] */

import { client, delay } from "../client";
import { UPDATE_INTERVAL } from "../client";
import setEmote from "../client/setEmote";
import setEmoteFromUrl from "../client/setEmoteFromUrl";
import { startFramePhase, FRAME_PHASE, stopFrameEffects } from "./utils/frameEffects";

// AO2 multiplies char.ini time values (e.g. the SoundT sfx delay) by this
// constant to convert them to milliseconds (courtroom.h: time_mod = 40).
const SFX_TIME_MOD = 40;
import { AO_HOST } from "../client/aoHost";
import { Viewport } from "./interfaces/Viewport";
import { createBlipsChannels } from "./utils/createBlipChannels";
import { defaultChatMsg } from "./constants/defaultChatMsg";
import { createMusic } from "./utils/createMusic";
import { createSfxAudio } from "./utils/createSfxAudio";
import { createShoutAudio } from "./utils/createShoutAudio";
import { createTestimonyAudio } from "./utils/createTestimonyAudio";
import { Testimony } from "./interfaces/Testimony";
import { COLORS } from "./constants/colors";
import { set_side } from "./utils/setSide";
import { ChatMsg } from "./interfaces/ChatMsg";
import {
  setStartFirstTickCheck,
  setStartSecondTickCheck,
  startFirstTickCheck,
  startSecondTickCheck,
} from "./utils/handleICSpeaking";

const viewport = (): Viewport => {
  let animating = false;
  const blipChannels = createBlipsChannels();
  let chatmsg = defaultChatMsg;
  let currentBlipChannel = 0;
  let lastChar = "";
  let lastEvi = 0;
  const music = createMusic();
  let sfxAudio = createSfxAudio();
  let sfxplayed = 0;
  let shoutTimer = 0;
  const shoutaudio = createShoutAudio();
  const testimonyAudio = createTestimonyAudio();
  let testimonyTimer = 0;
  let testimonyUpdater: any;
  let textnow = "";
  let theme: string;
  let tickTimer = 0;
  let updater: any;
  // Real wall-clock time (performance.now) when the preanim/message visuals
  // started. Used to time the preanim->talking swap by REAL elapsed time
  // rather than the tick counter, which drifts behind real time when the
  // event loop is busy -- the cause of the inconsistent preanim flash.
  let realStart = 0;
  let backgroundName = "";
  const getSfxAudio = () => sfxAudio;
  const setSfxAudio = (value: HTMLAudioElement) => {
    sfxAudio = value;
  };
  const getBackgroundName = () => backgroundName;
  const setBackgroundName = (value: string) => {
    backgroundName = value;
  };
  const getBackgroundFolder = () =>
    `${AO_HOST}background/${encodeURI(backgroundName.toLowerCase())}/`;
  const getTextNow = () => {
    return textnow;
  };
  const setTextNow = (val: string) => {
    textnow = val;
  };
  const getChatmsg = () => {
    return chatmsg;
  };
  const setChatmsg = (val: ChatMsg) => {
    chatmsg = val;
  };
  const getSfxPlayed = () => sfxplayed;
  const setSfxPlayed = (val: number) => {
    sfxplayed = val;
  };
  const getTickTimer = () => tickTimer;
  const setTickTimer = (val: number) => {
    tickTimer = val;
  };
  const getAnimating = () => animating;
  const setAnimating = (val: boolean) => {
    animating = val;
  };
  const getLastEvidence = () => lastEvi;
  const setLastEvidence = (val: number) => {
    lastEvi = val;
  };
  const setLastCharacter = (val: string) => {
    lastChar = val;
  };
  const getLastCharacter = () => lastChar;
  const getShoutTimer = () => shoutTimer;
  const setShoutTimer = (val: number) => {
    shoutTimer = val;
  };
  const getTheme = () => theme;
  const setTheme = (val: string) => {
    theme = val;
  };
  const getTestimonyTimer = () => testimonyTimer;
  const setTestimonyTimer = (val: number) => {
    testimonyTimer = val;
  };
  const setTestimonyUpdater = (val: any) => {
    testimonyUpdater = val;
  };
  const getTestimonyUpdater = () => testimonyUpdater;
  const playSFX = async (sfxname: string, looping: boolean) => {
    sfxAudio.pause();
    sfxAudio.loop = looping;
    sfxAudio.src = sfxname;
    sfxAudio.play().catch(() => {});
  };
  /**
   * Updates the testimony overaly
   */
  const updateTestimony = () => {
    const testimonyFilenames: Testimony = {
      1: "witnesstestimony",
      2: "crossexamination",
      3: "notguilty",
      4: "guilty",
    };

    // Update timer
    testimonyTimer += UPDATE_INTERVAL;

    const testimony = testimonyFilenames[client.testimonyID];
    const resource = client.resources[testimony];
    if (!resource) {
      disposeTestimony();
      return;
    }

    if (testimonyTimer >= resource.duration) {
      disposeTestimony();
    } else {
      testimonyUpdater = setTimeout(() => updateTestimony(), UPDATE_INTERVAL);
    }
  };
  /**
   * Dispose the testimony overlay
   */
  const disposeTestimony = () => {
    client.testimonyID = 0;
    testimonyTimer = 0;
    document.getElementById("client_testimony").style.opacity = "0";
    clearTimeout(testimonyUpdater);
  };
  // Text-reveal command handlers. These are message-invariant, so they're
  // defined ONCE here instead of being re-allocated on every character tick.
  // The old per-character allocation (a fresh Map + three async closures + a
  // Set for every letter) was invisible on desktop but added real GC/CPU
  // pressure on weaker mobile devices, which -- because blips are emitted
  // one-per-character-tick -- slowed the text AND the blips together.
  const tickFlash = async () => {
    const effectlayer = document.getElementById("client_flash");
    const realizationUrl =
      chatmsg.preloadedAssets?.realizationSfxUrl ??
      `${AO_HOST}sounds/general/sfx-realization.opus`;
    playSFX(realizationUrl, false);
    effectlayer.style.animation = "flash 0.4s 1";
    await delay(400);
    effectlayer.style.removeProperty("animation");
  };
  const tickShake = async () => {
    const gamewindow = document.getElementById("client_gamewindow");
    const stabUrl =
      chatmsg.preloadedAssets?.stabSfxUrl ??
      `${AO_HOST}sounds/general/sfx-stab.opus`;
    playSFX(stabUrl, false);
    gamewindow.style.animation = "shake 0.2s 1";
    await delay(200);
    gamewindow.style.removeProperty("animation");
  };
  const tickPause = async (digits?: string) => {
    const multiplier = !digits || digits === "" ? 1 : parseInt(digits, 10) || 1;
    await delay(multiplier * 100);
  };
  const tickCommands = new Map<string, (digits?: string) => Promise<void>>(
    Object.entries({ s: tickShake, f: tickFlash, p: tickPause }),
  );
  const textSpeedChars = new Set(["{", "}"]);

  const handleTextTick = async (charLayers: HTMLImageElement) => {
    const chatBox = document.getElementById("client_chat");
    const waitingBox = document.getElementById("client_chatwaiting");
    const chatBoxInner = document.getElementById("client_inner_chat");
    const charName = chatmsg.name.toLowerCase();
    const charEmote = chatmsg.sprite.toLowerCase();

    if (chatmsg.content.charAt(textnow.length) !== " ") {
      blipChannels[currentBlipChannel].play().catch(() => {});
      currentBlipChannel++;
      currentBlipChannel %= blipChannels.length;
    }
    textnow = chatmsg.content.substring(0, textnow.length + 1);
    const characterElement = chatmsg.parsed[textnow.length - 1];
    if (characterElement) {
      const COMMAND_IDENTIFIER = "\\";

      const nextCharacterElement = chatmsg.parsed[textnow.length];

      // Changing Text Speed
      if (textSpeedChars.has(characterElement.innerHTML)) {
        // Grab them all in a row
        const MAX_SLOW_CHATSPEED = 120;
        for (let i = textnow.length; i < chatmsg.content.length; i++) {
          const currentCharacter = chatmsg.parsed[i - 1].innerHTML;
          if (currentCharacter === "}") {
            if (chatmsg.speed > 0) {
              chatmsg.speed -= 20;
            }
          } else if (currentCharacter === "{") {
            if (chatmsg.speed < MAX_SLOW_CHATSPEED) {
              chatmsg.speed += 20;
            }
          } else {
            // No longer at a speed character
            textnow = chatmsg.content.substring(0, i);
            break;
          }
        }
      }

      if (
        characterElement.innerHTML === COMMAND_IDENTIFIER &&
        (tickCommands.has(nextCharacterElement?.innerHTML) ||
          nextCharacterElement?.innerHTML === "p")
      ) {
        textnow = chatmsg.content.substring(0, textnow.length + 1);
        const commandChar = nextCharacterElement.innerHTML;

        if (commandChar === "p") {
          // Collect digits after \p for pause duration
          const startPos = textnow.length;
          let digits = "";
          let offset = 1;
          while (
            startPos + offset <= chatmsg.content.length &&
            /\d/.test(chatmsg.parsed[startPos + offset - 1]?.innerHTML || "")
          ) {
            digits += chatmsg.parsed[startPos + offset - 1].innerHTML;
            textnow = chatmsg.content.substring(0, startPos + offset);
            offset++;
          }
          await tickPause(digits);
        } else {
          await tickCommands.get(commandChar)();
        }
      } else {
        chatBoxInner.appendChild(chatmsg.parsed[textnow.length - 1]);
      }
    }
    // scroll to bottom
    chatBox.scrollTop = chatBox.scrollHeight;

    if (textnow === chatmsg.content) {
      animating = false;
      if (chatmsg.preloadedAssets) {
        setEmoteFromUrl(chatmsg.preloadedAssets.idleUrl, false, chatmsg.side);
      } else {
        setEmote(AO_HOST, client, charName, charEmote, "(a)", false, chatmsg.side);
      }
      charLayers.style.opacity = "1";
      waitingBox.style.opacity = "1";
      stopFrameEffects(); // message ended -- cancel any pending frame SFX
      if (chatmsg.preloadedAssets) startFramePhase(FRAME_PHASE.idle, chatmsg.preloadedAssets.idleUrl, chatmsg, true); // idle-sprite frame SFX (loops until next message)
      clearTimeout(updater);
    }
  };
  /**
   * Updates the chatbox based on the given text.
   *
   * OK, here's the documentation on how this works:
   *
   * 1 _animating
   * If we're not done with this characters animation, i.e. his text isn't fully there, set a timeout for the next tick/step to happen
   *
   * 2 startpreanim
   * If the shout timer is over it starts with the preanim
   * The first thing it checks for is the shake effect (TODO on client this is handled by the @ symbol and not a flag )
   * Then is the flash/realization effect
   * After that, the shout image set to be transparent
   * and the main characters preanim gif is loaded
   * If pairing is supported the paired character will just stand around with his idle sprite
   *
   * 3 preanimdelay over
   * this animates the evidence popup and finally shows the character name and message box
   * it sets the text color and the character speaking sprite
   *
   * 4 textnow != content
   * this adds a character to the textbox and stops the animations if the entire message is present in the textbox
   *
   * 5 sfx
   * independent of the stuff above, this will play any sound effects specified by the emote the character sent.
   * happens after the shout delay + an sfx delay that comes with the message packet
   *
   * XXX: This relies on a global variable `chatmsg`!
   */
  const chat_tick = async () => {
    // note: this is called fairly often
    // do not perform heavy operations here
    await delay(chatmsg.speed);

    const gamewindow = document.getElementById("client_gamewindow");
    const waitingBox = document.getElementById("client_chatwaiting");
    const eviBox = <HTMLImageElement>document.getElementById("client_evi");
    const shoutSprite = <HTMLImageElement>(
      document.getElementById("client_shout")
    );
    const effectlayer = <HTMLImageElement>document.getElementById("client_fg");
    const chatBoxInner = document.getElementById("client_inner_chat");
    let charLayers = <HTMLImageElement>document.getElementById("client_char");
    let pairLayers = <HTMLImageElement>(
      document.getElementById("client_pair_char")
    );

    const validSides: string[] = ["def", "pro", "wit"]; // these are for the full view pan, the other positions use 'client_char'
    if (validSides.includes(chatmsg.side)) {
      charLayers = <HTMLImageElement>(
        document.getElementById(`client_${chatmsg.side}_char`)
      );
      pairLayers = <HTMLImageElement>(
        document.getElementById(`client_${chatmsg.side}_pair_char`)
      );
    }

    const charName = chatmsg.name.toLowerCase();
    const charEmote = chatmsg.sprite.toLowerCase();

    const pairName = chatmsg.other_name.toLowerCase();
    const pairEmote = chatmsg.other_emote.toLowerCase();

    // TODO: preanims sometimes play when they're not supposed to
    const isShoutOver = tickTimer >= shoutTimer;
    // Switch to the talking sprite slightly BEFORE the preanim's measured
    // end. AA preanims are usually saved as infinitely-looping animations;
    // the browser honors that and wraps an <img> back to frame 0, so if we
    // waited for the exact end (then up to one ~60ms tick) the preanim's
    // first frame flashed before the talking sprite appeared. The lead must
    // exceed the tick granularity to reliably beat the loop; it's capped so
    // short preanims aren't skipped, and the talking sprite is a seamless
    // continuation of the scene so the trimmed tail isn't noticeable.
    const talkingLead = Math.min(
      UPDATE_INTERVAL * 2,
      chatmsg.preanimdelay * 0.4,
    );
    const isShoutAndPreanimOver =
      !startFirstTickCheck &&
      realStart > 0 &&
      performance.now() - realStart >= chatmsg.preanimdelay - talkingLead;
    if (isShoutOver && startFirstTickCheck) {
      // Mark the real wall-clock start of the visuals so the talking swap is
      // timed against real time (immune to tick drift).
      realStart = performance.now();
      // Effect stuff
      if (chatmsg.screenshake === 1) {
        // Shake screen
        const stabUrl = chatmsg.preloadedAssets?.stabSfxUrl
          ?? `${AO_HOST}sounds/general/sfx-stab.opus`;
        playSFX(stabUrl, false);
        gamewindow.style.animation = "shake 0.2s 1";
      }
      if (chatmsg.flash === 1) {
        // Flash screen
        const realizationUrl = chatmsg.preloadedAssets?.realizationSfxUrl
          ?? `${AO_HOST}sounds/general/sfx-realization.opus`;
        playSFX(realizationUrl, false);
        const flashlayer = document.getElementById("client_flash");
        if (flashlayer) {
          flashlayer.style.animation = "flash 0.4s 1";
          setTimeout(() => flashlayer.style.removeProperty("animation"), 400);
        }
      }

      // Hide the shout splash now that the shout is over -- ALWAYS, not
      // only when there's a preanim. In immediate mode a shout+no-preanim
      // message used to leave the splash stuck on screen because this was
      // gated behind preanimdelay > 0.
      shoutSprite.style.display = "none";
      shoutSprite.style.animation = "";

      // Pre-animation stuff
      if (chatmsg.preanimdelay > 0) {
        if (chatmsg.preloadedAssets) {
          setEmoteFromUrl(chatmsg.preloadedAssets.preanimUrl, false, chatmsg.side);
          startFramePhase(FRAME_PHASE.preanim, chatmsg.preloadedAssets.preanimUrl, chatmsg);
        } else {
          const preanim = chatmsg.preanim.toLowerCase();
          setEmote(AO_HOST, client, charName, preanim, "", false, chatmsg.side);
        }
      }

      if (chatmsg.other_name) {
        pairLayers.style.opacity = "1";
      } else {
        pairLayers.style.opacity = "0";
      }

      // Done with first check, move to second
      setStartFirstTickCheck(false);
      setStartSecondTickCheck(true);

      chatmsg.startpreanim = false;
      chatmsg.startspeaking = true;
    }

    const hasNonInterruptingPreAnim = chatmsg.noninterrupting_preanim === 1;
    if (hasNonInterruptingPreAnim && isShoutOver) {
      const chatContainerBox = document.getElementById("client_chatcontainer");
      const preanimPlaying =
        chatmsg.preanimdelay > 0 &&
        tickTimer < shoutTimer + chatmsg.preanimdelay;
      if (textnow !== chatmsg.content) {
        chatContainerBox.style.opacity = "1";
        if (!preanimPlaying) {
          if (chatmsg.preloadedAssets) {
            setEmoteFromUrl(chatmsg.preloadedAssets.talkingUrl, false, chatmsg.side);
            startFramePhase(FRAME_PHASE.talking, chatmsg.preloadedAssets.talkingUrl, chatmsg, true);
          } else {
            setEmote(AO_HOST, client, charName, charEmote, "(b)", false, chatmsg.side);
          }
        }
        charLayers.style.opacity = "1";
        await handleTextTick(charLayers);
      } else if (preanimPlaying) {
        // Text is fully revealed but the preanim hasn't finished -- keep it
        // on screen and let the loop continue rather than cutting to idle,
        // which made longer preanims look sped up / clipped in immediate.
        charLayers.style.opacity = "1";
      } else {
        // Both text and preanim done: settle to idle and finish.
        if (chatmsg.preloadedAssets) {
          setEmoteFromUrl(chatmsg.preloadedAssets.idleUrl, false, chatmsg.side);
        } else {
          setEmote(AO_HOST, client, charName, charEmote, "(a)", false, chatmsg.side);
        }
        charLayers.style.opacity = "1";
        waitingBox.style.opacity = "1";
        animating = false;
        stopFrameEffects(); // message ended -- cancel any pending frame SFX
        if (chatmsg.preloadedAssets) startFramePhase(FRAME_PHASE.idle, chatmsg.preloadedAssets.idleUrl, chatmsg, true); // idle-sprite frame SFX (loops until next message)
          clearTimeout(updater);
        return;
      }
    } else if (isShoutAndPreanimOver && startSecondTickCheck) {
      if (chatmsg.startspeaking) {
        chatmsg.startspeaking = false;

        // Evidence Bullshit
        if (chatmsg.evidence > 0) {
          // Prepare evidence
          eviBox.src = client.evidences[chatmsg.evidence - 1].icon;

          eviBox.style.width = "auto";
          eviBox.style.height = "36.5%";
          eviBox.style.opacity = "1";

          testimonyAudio.src = `${AO_HOST}sounds/general/sfx-evidenceshoop.opus`;
          testimonyAudio.play().catch(() => {});

          if (chatmsg.side === "def") {
            // Only def show evidence on right
            eviBox.style.right = "1em";
            eviBox.style.left = "initial";
          } else {
            eviBox.style.right = "initial";
            eviBox.style.left = "1em";
          }
        }
        chatBoxInner.className = `text_${COLORS[chatmsg.color]}`;

        if (chatmsg.preanimdelay === 0) {
          shoutSprite.style.display = "none";
          shoutSprite.style.animation = "";
        }

        switch (Number(chatmsg.deskmod)) {
          case 2:
            set_side({
              position: chatmsg.side,
              showSpeedLines: false,
              showDesk: true,
            });
            break;
          case 3:
            set_side({
              position: chatmsg.side,
              showSpeedLines: false,
              showDesk: false,
            });
            break;
          case 4:
            set_side({
              position: chatmsg.side,
              showSpeedLines: false,
              showDesk: true,
            });
            break;
          case 5:
            set_side({
              position: chatmsg.side,
              showSpeedLines: false,
              showDesk: false,
            });
            break;
        }

        if (chatmsg.other_name) {
          if (chatmsg.preloadedAssets) {
            setEmoteFromUrl(chatmsg.preloadedAssets.pairIdleUrl, true, chatmsg.side);
          } else {
            setEmote(AO_HOST, client, pairName, pairEmote, "(a)", true, chatmsg.side);
          }
          pairLayers.style.opacity = "1";
        } else {
          pairLayers.style.opacity = "0";
        }

        if (chatmsg.preloadedAssets) {
          setEmoteFromUrl(chatmsg.preloadedAssets.talkingUrl, false, chatmsg.side);
          startFramePhase(FRAME_PHASE.talking, chatmsg.preloadedAssets.talkingUrl, chatmsg, true);
        } else {
          setEmote(AO_HOST, client, charName, charEmote, "(b)", false, chatmsg.side);
        }
        charLayers.style.opacity = "1";

        if (textnow === chatmsg.content) {
          // Fire the emote SFX if it hasn't already. This covers blankposts
          // and very short messages whose tick ends here before the SFX
          // delay would elapse in the check below (e.g. Narrator's dink).
          // AO2 plays these via an independent timer.
          if (
            !sfxplayed &&
            chatmsg.sound !== "0" &&
            chatmsg.sound !== "1" &&
            chatmsg.sound !== "" &&
            chatmsg.sound !== undefined &&
            (chatmsg.type == 1 ||
              chatmsg.type == 2 ||
              chatmsg.type == 5 ||
              chatmsg.type == 6)
          ) {
            sfxplayed = 1;
            const sfxUrl =
              chatmsg.preloadedAssets?.emoteSfxUrl ??
              `${AO_HOST}sounds/general/${encodeURI(chatmsg.sound.toLowerCase())}.opus`;
            playSFX(sfxUrl, chatmsg.looping_sfx);
          }
          if (chatmsg.preloadedAssets) {
            setEmoteFromUrl(chatmsg.preloadedAssets.idleUrl, false, chatmsg.side);
          } else {
            setEmote(AO_HOST, client, charName, charEmote, "(a)", false, chatmsg.side);
          }
          charLayers.style.opacity = "1";
          waitingBox.style.opacity = "1";
          animating = false;
          stopFrameEffects(); // message ended -- cancel any pending frame SFX
          if (chatmsg.preloadedAssets) startFramePhase(FRAME_PHASE.idle, chatmsg.preloadedAssets.idleUrl, chatmsg, true); // idle-sprite frame SFX (loops until next message)
              clearTimeout(updater);
          return;
        }
      } else if (textnow !== chatmsg.content) {
        const chatContainerBox = document.getElementById(
          "client_chatcontainer",
        );
        chatContainerBox.style.opacity = "1";
        await handleTextTick(charLayers);
      }
    }

    // Emote SFX (SoundN) fires after its delay (SoundT). AO2 multiplies the
    // char.ini time value by time_mod (40) to get milliseconds, and fires
    // when that much time has ELAPSED. The old condition was inverted
    // (snddelay + shoutTimer >= tickTimer fired at tick 0) AND unscaled, so
    // any character with a non-zero SoundT played its SFX immediately
    // instead of after the delay.
    if (!sfxplayed && tickTimer >= shoutTimer + chatmsg.snddelay * SFX_TIME_MOD) {
      sfxplayed = 1;
      if (
        chatmsg.sound !== "0" &&
        chatmsg.sound !== "1" &&
        chatmsg.sound !== "" &&
        chatmsg.sound !== undefined &&
        (chatmsg.type == 1 || chatmsg.type == 2 || chatmsg.type == 5 || chatmsg.type == 6)
      ) {
        const sfxUrl = chatmsg.preloadedAssets?.emoteSfxUrl
          ?? `${AO_HOST}sounds/general/${encodeURI(chatmsg.sound.toLowerCase())}.opus`;
        playSFX(sfxUrl, chatmsg.looping_sfx);
      }
    }
    if (textnow === chatmsg.content && !startFirstTickCheck && !startSecondTickCheck) {
      return;
    }
    if (animating) {
      chat_tick();
    }
    tickTimer += UPDATE_INTERVAL;
  };

  return {
    getTextNow,
    setTextNow,
    getChatmsg,
    setChatmsg,
    getSfxPlayed,
    setSfxPlayed,
    setTickTimer,
    getTickTimer,
    setAnimating,
    getAnimating,
    getLastEvidence,
    setLastEvidence,
    setLastCharacter,
    getLastCharacter,
    getShoutTimer,
    setShoutTimer,
    setTheme,
    getTheme,
    setTestimonyTimer,
    getTestimonyTimer,
    setTestimonyUpdater,
    getTestimonyUpdater,
    testimonyAudio,
    chat_tick,
    playSFX,
    set_side,
    setBackgroundName,
    updateTestimony,
    disposeTestimony,
    handleTextTick,
    getBackgroundFolder,
    getBackgroundName,
    getSfxAudio,
    setSfxAudio,
    blipChannels,
    music,
    shoutaudio,
    updater,
  };
};

export default viewport;
