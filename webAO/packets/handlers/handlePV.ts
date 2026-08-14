import { client } from "../../client";
import fileExists from "../../utils/fileExists";
import { updateActionCommands } from "../../dom/updateActionCommands";
import { pickEmotion } from "../../dom/pickEmotion";
import { setupEmotePagination } from "../../dom/paginateEmotes";
import { AO_HOST } from "../../client/aoHost";
import { ensureCharIni } from "../../client/handleCharacterInfo";
import { loadSoundList } from "../../client/soundList";
import { safeTags } from "../../encoding";
import { getLocalOverrideUrl } from "../../utils/resolveLocalAsset";

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
  const emotesList = document.getElementById("client_emo")!;
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

        const rawUrl = `${charPath}button${i}_off${emoteExtension}`;
        const url = getLocalOverrideUrl(rawUrl) ?? rawUrl;
        
        const preanimName = emoteinfo[1].toLowerCase();
        const animName = emoteinfo[2].toLowerCase();

        // deskmod parsing, matching the desktop client (courtroom.cpp):
        //   explicit "0".."5" -> that value
        //   BLANK + zoom emote (modifier 5/6) -> 0 (desk hidden)
        //   BLANK + non-zoom  -> 1 (desk shown)
        //   non-numeric       -> 1
        // The zoom-specific blank default is why Apollo's "Zoom#-#/zoom#5#"
        // (blank deskmod) must send 0: the desktop hides the desk, but a
        // flat blank->1 made webCOA send "show desk" and other clients drew
        // the desk during the zoom.
        const zoomVal = Number(emoteinfo[3]) || 0;
        const deskmodStr = (emoteinfo[4] ?? "").trim();
        let deskmodValue;
        if (deskmodStr === "") {
          deskmodValue = zoomVal === 5 || zoomVal === 6 ? 0 : 1;
        } else {
          const n = Number(deskmodStr);
          deskmodValue = Number.isNaN(n) ? 1 : n;
        }

        // [OptionsN] per-emote option overrides (AO2 2.11): an emote can map
        // to an option-set index (e.g. Trucy's "27 = 2"), and [Options<N>]
        // supplies an alternate showname/blips for that emote (e.g. the
        // "Mr. Hat talks" emotes -> showname "Mr. Hat", blips "none").
        let shownameOverride = "";
        let blipsOverride = "";
        const optIdx = ini.optionsn
          ? ini.optionsn[i] ?? ini.optionsn[String(i)]
          : undefined;
        if (optIdx) {
          const optSection = ini[`options${optIdx}`];
          if (optSection) {
            if (optSection.showname) shownameOverride = safeTags(optSection.showname);
            if (optSection.blips) blipsOverride = optSection.blips.toLowerCase();
          }
        }

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
          zoom: zoomVal,
          deskmod: deskmodValue,
          sfx: esfx.toLowerCase(),
          sfxdelay: esfxd,
          frame_screenshake: packPhases("framescreenshake"),
          frame_realization: packPhases("framerealization"),
          frame_sfx: packPhases("framesfx"),
          button: url,
          shownameOverride,
          blipsOverride,
        };

        addEmoteButton(i, url, emotes[i].desc);

        if (i === 1) pickEmotion(1);
      } catch (e) {
        console.error(`missing emote ${i}`);
      }
    }
    // Paginate the grid for characters with many emotes.
    setupEmotePagination();
  }

  // Custom shout button: probe extensions (Apollo's custom is .apng, etc.).
  const customExts = [".apng", ".gif", ".webp", ".png"];
  let hasCustom = false;
  for (const ext of customExts) {
    if (
      await fileExists(
        `${AO_HOST}characters/${encodeURI(me.name.toLowerCase())}/custom${ext}`,
      )
    ) {
      hasCustom = true;
      break;
    }
  }
  document.getElementById("button_4")!.style.display = hasCustom ? "" : "none";

  // Populate the editable SFX override list from this character's
  // soundlist.ini (+ the global one).
  loadSoundList(me.name);
};
