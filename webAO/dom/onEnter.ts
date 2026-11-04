import { encodeRemoteName } from "../utils/remoteCharacterStore";
import { client, selectedShout, selectedCustomShout } from "../client";
import { formatObjectionField } from "../viewport/utils/customShouts";
import { escapeChat } from "../encoding";
import { sanitizeBlipName } from "../client/blipOverride";
import { ensurePositionOption } from "../viewport/utils/positionOptions";
import { splitByPoseTags } from "../viewport/utils/poseTagParser";
import { getIcMessageCount } from "../viewport/utils/handleICSpeaking";
import {
  beginSegmentedSend,
  endSegmentedSend,
  isSegmentedSendActive,
  setSegmentIndex,
  sleep,
  waitForOwnMessageDone,
} from "../client/segmentedSend";

/**
 * Triggered when the Return key is pressed on the in-character chat input box.
 * @param {KeyboardEvent} event
 */
export function onEnter(event: KeyboardEvent) {
  if (event.keyCode === 13) {
    // still sending the <pose:N> parts of the previous message
    if (isSegmentedSendActive()) return false;
    const mychar = client.character;
    const myemo = client.emote;
    const evi = client.evidence + 1;
    const flip = Boolean(
      document.getElementById("button_flip")!.classList.contains("dark"),
    );
    const flash = Boolean(
      document.getElementById("button_flash")!.classList.contains("dark"),
    );
    const screenshake = Boolean(
      document.getElementById("button_shake")!.classList.contains("dark"),
    );
    const noninterrupting_preanim = Boolean(
      (<HTMLInputElement>document.getElementById("check_nonint")).checked,
    );
    const looping_sfx = Boolean(
      (<HTMLInputElement>document.getElementById("check_loopsfx")).checked,
    );
    const color = Number(
      (<HTMLInputElement>document.getElementById("textcolor")).value,
    );
    const showname = escapeChat(
      (<HTMLInputElement>document.getElementById("ic_chat_name")).value,
    );
    let text = (<HTMLInputElement>document.getElementById("client_inputbox"))
      .value;
    const pairchar = (<HTMLInputElement>document.getElementById("pair_select"))
      .value;
    const pairoffset = Number(
      (<HTMLInputElement>document.getElementById("pair_offset")).value,
    );
    const pairyoffset = Number(
      (<HTMLInputElement>document.getElementById("pair_y_offset")).value,
    );
    let myrole = (<HTMLInputElement>document.getElementById("role_select"))
      .value
      ? (<HTMLInputElement>document.getElementById("role_select")).value
      : mychar.side;

    // "/pos <name>" chat-command shortcut: behaves exactly like picking
    // that entry in the Role dropdown (unknown names get added to it).
    // Anything typed after the position name
    // is still sent as the IC message; if nothing else was typed, no IC
    // message is sent at all -- it's purely a position change.
    const posMatch = /^\/pos\s+(\S+)\s*(.*)$/i.exec(text);
    if (posMatch) {
      myrole = posMatch[1].toLowerCase();
      text = posMatch[2];

      const roleSelect = <HTMLSelectElement | null>(
        document.getElementById("role_select")
      );

      if (roleSelect) {
        // Known position: just select it. Unknown one: add it to the Role
        // dropdown so it can be picked from there from now on too.
        const option = ensurePositionOption(myrole);
        if (option) roleSelect.value = option.value;

        // Fires changeRoleOOC(): sends /pos + SP to the server and
        // updates the viewport straight away.
        roleSelect.dispatchEvent(new Event("change"));
      }

      if (!text) {
        (<HTMLInputElement>document.getElementById("client_inputbox")).value = "";
        return false;
      }
    }
    
    const additive = Boolean(
      (<HTMLInputElement>document.getElementById("check_additive")).checked,
    );
    const effect = (<HTMLInputElement>document.getElementById("effect_select"))
      .value;

    // "Override blips…" box. Blank means the character's own blips.
    const blips = sanitizeBlipName(
      (<HTMLInputElement>document.getElementById("blip_override")).value,
    );

    // Split at <pose:N> tags: every part is sent as its own IC message with
    // that pose's emote / preanim / sounds / frame effects (the later parts
    // as "additive" so the text keeps flowing in the same chatbox). Because
    // these are ordinary IC messages, every client sees them, patched or not.
    let segments = splitByPoseTags(text, (n) => Boolean(client.emotes[n]));
    if (segments.length === 0) segments = [{ text: "", pose: null }];

    const sendSegment = (seg: { text: string; pose: number | null }, i: number) => {
      const emo = seg.pose !== null ? client.emotes[seg.pose] : myemo;
      const first = i === 0;

      let sfxname = "0";
      let sfxdelay = 0;
      let emote_mod = emo.zoom;

      if (seg.pose !== null) {
        // a <pose:N> part always uses the pose's own sound and preanim
        sfxname = emo.sfx || "0";
        sfxdelay = emo.sfxdelay || 0;
        const hasPreanim = Boolean(emo.preanim) && emo.preanim !== "-";
        if (hasPreanim && emote_mod === 0) emote_mod = 1;
        else if (!hasPreanim && emote_mod === 1) emote_mod = 0;
      } else {
        if ((<HTMLInputElement>document.getElementById("sendsfx")).checked) {
          const customSfx = (<HTMLInputElement>(
            document.getElementById("sfx_override")
          )).value.trim();
          sfxname = customSfx || emo.sfx;
          // A custom sound has no char.ini-declared delay of its own; only use
          // the pose's default delay when we're also using the pose's default
          // sound, otherwise play it immediately.
          sfxdelay = customSfx ? 0 : emo.sfxdelay;
        }
        // not to overwrite a 5 from the ini or anything else
        if ((<HTMLInputElement>document.getElementById("sendpreanim")).checked) {
          if (emote_mod === 0) emote_mod = 1;
        } else if (emote_mod === 1) {
          emote_mod = 0;
        }
      }

      client.sender.sendIC(
        emo.deskmod,
        emo.preanim,
        encodeRemoteName(mychar.name),
        emo.emote,
        seg.text,
        myrole,
        sfxname,
        emote_mod,
        sfxdelay,
        first ? formatObjectionField(selectedShout, selectedCustomShout) : 0,
        first ? evi : 0,
        flip,
        first ? flash : false,
        color,
        showname,
        pairchar,
        pairoffset,
        pairyoffset,
        noninterrupting_preanim,
        looping_sfx,
        first ? screenshake : false,
        emo.frame_screenshake || "-",
        emo.frame_realization || "-",
        emo.frame_sfx || "-",
        first ? additive : true,
        first ? effect : "",
        blips,
      );
    };

    if (segments.length === 1) {
      sendSegment(segments[0], 0);
    } else {
      (async () => {
        beginSegmentedSend();
        try {
          for (let i = 0; i < segments.length; i += 1) {
            setSegmentIndex(i);
            const before = getIcMessageCount();
            sendSegment(segments[i], i);
            // let our own copy finish typing so the next part doesn't cut it off
            await waitForOwnMessageDone(before);
            if (i < segments.length - 1) await sleep(100);
          }
        } finally {
          endSegmentedSend();
        }
      })();
    }
  }
  return false;
}
window.onEnter = onEnter;
