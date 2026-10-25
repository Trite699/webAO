import { encodeRemoteName } from "../utils/remoteCharacterStore";
import { client, selectedShout, selectedCustomShout } from "../client";
import { formatObjectionField } from "../viewport/utils/customShouts";
import { escapeChat } from "../encoding";
import { sanitizeBlipName } from "../client/blipOverride";
import { ensurePositionOption } from "../viewport/utils/positionOptions";

/**
 * Triggered when the Return key is pressed on the in-character chat input box.
 * @param {KeyboardEvent} event
 */
export function onEnter(event: KeyboardEvent) {
  if (event.keyCode === 13) {
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

    let sfxname = "0";
    let sfxdelay = 0;
    let emote_mod = myemo.zoom;
    if ((<HTMLInputElement>document.getElementById("sendsfx")).checked) {
      const customSfx = (<HTMLInputElement>(
        document.getElementById("sfx_override")
      )).value.trim();
      sfxname = customSfx || myemo.sfx;
      // A custom sound has no char.ini-declared delay of its own; only use
      // the pose's default delay when we're also using the pose's default
      // sound, otherwise play it immediately.
      sfxdelay = customSfx ? 0 : myemo.sfxdelay;
    }

    // "Override blips…" box. Blank means the character's own blips.
    const blips = sanitizeBlipName(
      (<HTMLInputElement>document.getElementById("blip_override")).value,
    );

    // not to overwrite a 5 from the ini or anything else
    if ((<HTMLInputElement>document.getElementById("sendpreanim")).checked) {
      if (emote_mod === 0) {
        emote_mod = 1;
      }
    } else if (emote_mod === 1) {
      emote_mod = 0;
    }

    client.sender.sendIC(
      myemo.deskmod,
      myemo.preanim,
      encodeRemoteName(mychar.name),
      myemo.emote,
      text,
      myrole,
      sfxname,
      emote_mod,
      sfxdelay,
      formatObjectionField(selectedShout, selectedCustomShout),
      evi,
      flip,
      flash,
      color,
      showname,
      pairchar,
      pairoffset,
      pairyoffset,
      noninterrupting_preanim,
      looping_sfx,
      screenshake,
      myemo.frame_screenshake || "-",
      myemo.frame_realization || "-",
      myemo.frame_sfx || "-",
      additive,
      effect,
      blips,
    );
  }
  return false;
}
window.onEnter = onEnter;
