import { client } from "../../client";
import fileExists from "../../utils/fileExists";
import { updateActionCommands } from "../../dom/updateActionCommands";
import { pickEmotion } from "../../dom/pickEmotion";
import { AO_HOST } from "../../client/aoHost";
import { ensureCharIni } from "../../client/handleCharacterInfo";

function addEmoteButton(i: number, imgurl: string, desc: string) {
  const emotesList = document.getElementById("client_emo");
  const emote_item = new Image();
  emote_item.id = "emo_" + i;
  emote_item.className = "emote_button";
  emote_item.src = imgurl;
  emote_item.alt = desc;
  emote_item.title = desc;
  emote_item.onclick = () => {
    window.pickEmotion(i);
  };
  emotesList.appendChild(emote_item);
}

/**
 * Handles the server's assignment of a character for the player to use.
 * PV # playerID (unused) # CID # character ID
 * @param {Array} args packet arguments
 */
export const handlePV = async (args: string[]) => {
  client.charID = Number(args[3]);
  document.getElementById("client_waiting")!.style.display = "none";
  document.getElementById("client_charselect")!.style.display = "none";

  const me = client.chars[client.charID];
  client.selectedEmote = -1;
  const { emotes } = client;
  const emotesList = document.getElementById("client_emo");
  emotesList.style.display = "";
  emotesList.innerHTML = ""; // Clear emote box
  const ini = await ensureCharIni(client.charID);
  me.side = ini.options.side;
  updateActionCommands(me.side);
  if (ini.emotions.number === 0) {
    emotesList.innerHTML = `<span
					id="emo_0"
					alt="unavailable"
					class="emote_button">No emotes available</span>`;
  } else {
    // Probe extensions once using button1_off, then reuse for all emotes
    const charPath = `${AO_HOST}characters/${encodeURI(me.name.toLowerCase())}/emotions/`;
    let emoteExtension = client.emotions_extensions[0];
    for (const extension of client.emotions_extensions) {
      if (await fileExists(`${charPath}button1_off${extension}`)) {
        emoteExtension = extension;
        break;
      }
    }

    for (let i = 1; i <= ini.emotions.number; i++) {
      try {
        const emoteinfo = ini.emotions[i].split("#");
        let esfx;
        let esfxd;
        try {
          esfx = ini.soundn?.[i] || "0";
          esfxd = ini.soundt?.[i] ? Number(ini.soundt[i]) : 0;
        } catch (e) {
          esfx = "0";
          esfxd = 0;
        }

        const url = `${charPath}button${i}_off${emoteExtension}`;
        const preanimName = emoteinfo[1].toLowerCase();
        const animName = emoteinfo[2].toLowerCase();

        // Per-frame effects live in char.ini as one section per animation,
        // e.g. "[guitarpound_FrameSFX]" with "53 = sfx-deskslam". iniParse
        // lowercases both section and key names, so section lookups here
        // must be lowercase too. There's one section per phase: preanim
        // uses the preanim sprite's section, talking/idle both use the
        // "emote" sprite's section (AO2 char.ini has no separate idle name).
        const packPhases = (suffix: string): string => {
          const sections = [preanimName, animName, animName].map(
            (name) => ini[`${name}_${suffix}`],
          );
          const parts = sections.map((sec) => {
            if (!sec) return "";
            return Object.entries(sec)
              .map(([frame, val]) => `${frame}=${val}`)
              .join("|");
          });
          // Leading "|" before each phase's data: frameEffects.ts's
          // splitPhases() skips index 0 after splitting on "|", so an
          // empty first segment is intentional, not a placeholder to fill.
          return parts.every((p) => p === "")
            ? ""
            : `${parts.map((p) => `|${p}`).join("^")}^`;
        };

        emotes[i] = {
          desc: emoteinfo[0].toLowerCase(),
          preanim: preanimName,
          emote: animName,
          zoom: Number(emoteinfo[3]) || 0,
          deskmod:
            emoteinfo[4] === undefined || emoteinfo[4] === ""
              ? 1
              : Number(emoteinfo[4]),
          sfx: esfx.toLowerCase(),
          sfxdelay: esfxd,
          frame_screenshake: packPhases("framescreenshake"),
          frame_realization: packPhases("framerealization"),
          frame_sfx: packPhases("framesfx"),
          button: url,
        };

        addEmoteButton(i, url, emotes[i].desc);

        if (i === 1) pickEmotion(1);
      } catch (e) {
        console.error(`missing emote ${i}`);
      }
    }
  }

  if (
    await fileExists(
      `${AO_HOST}characters/${encodeURI(me.name.toLowerCase())}/custom.gif`,
    )
  ) {
    document.getElementById("button_4")!.style.display = "";
  } else {
    document.getElementById("button_4")!.style.display = "none";
  }

};
