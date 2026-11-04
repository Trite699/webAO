import { ChatMsg } from "../interfaces/ChatMsg";
import { PoseChange } from "../interfaces/PoseChange";
import { ensureCharIni } from "../../client/handleCharacterInfo";
import { resolveAndPreloadImage, getAnimDuration } from "../../utils/assetCache";
import transparentPng from "../../constants/transparentPng";
import { buildEmoteUrls } from "./preloadMessageAssets";
import { PoseTag } from "./poseTagParser";
import { primeFrameOffsets } from "./frameEffects";

/**
 * Looks each tag's pose up in the speaker's char.ini ([Emotions] N =
 * desc#preanim#sprite#mod#deskmod) and preloads its sprites, so the swap
 * mid-text is instant. Tags pointing at a pose that doesn't exist are dropped.
 */
export async function resolvePoseChanges(
  chatmsg: ChatMsg,
  tags: PoseTag[],
  AO_HOST: string,
  emoteExtensions: string[],
): Promise<PoseChange[]> {
  if (!tags.length || chatmsg.charid === undefined) return [];

  let ini: any;
  try {
    ini = await ensureCharIni(chatmsg.charid);
  } catch (e) {
    return [];
  }
  const emotions = ini?.emotions;
  if (!emotions) return [];

  const charName = chatmsg.name!.toLowerCase();
  const cache = new Map<number, Promise<Omit<PoseChange, "at">>>();

  const load = (pose: number) => {
    if (!cache.has(pose)) {
      cache.set(
        pose,
        (async () => {
          const info = String(emotions[pose]).split("#").map((s) => s.trim());
          const preanim = (info[1] ?? "").toLowerCase();
          const sprite = (info[2] ?? "").toLowerCase();
          const hasPreanim = preanim !== "" && preanim !== "-";
          const [idleUrl, talkingUrl, preanimUrl, preanimDuration] =
            await Promise.all([
              resolveAndPreloadImage(buildEmoteUrls(AO_HOST, emoteExtensions, charName, sprite, "(a)")),
              resolveAndPreloadImage(buildEmoteUrls(AO_HOST, emoteExtensions, charName, sprite, "(b)")),
              hasPreanim
                ? resolveAndPreloadImage(buildEmoteUrls(AO_HOST, emoteExtensions, charName, preanim, ""))
                : Promise.resolve(transparentPng),
              hasPreanim
                ? getAnimDuration(`${AO_HOST}characters/${encodeURI(charName)}/${encodeURI(preanim)}`)
                : Promise.resolve(0),
            ]);
          // Per-frame effects (FrameSFX / FrameScreenshake / FrameRealization)
          // live in char.ini as one section per animation, e.g.
          // "[name_FrameSFX]". Pack them the same way handlePV does for the
          // emote buttons: one segment per phase (preanim ^ talking ^ idle).
          const pack = (suffix: string): string => {
            const parts = [preanim, sprite, sprite].map((name) => {
              const sec = ini[`${name}_${suffix}`];
              if (!hasPreanim && name === preanim) return "";
              if (!sec) return "";
              return Object.entries(sec)
                .map(([frame, val]) => `${frame}=${String(val).trim()}`)
                .join("|");
            });
            return parts.every((p) => p === "")
              ? ""
              : `${parts.map((p) => `|${p}`).join("^")}^`;
          };
          const sound = String(ini.soundn?.[pose] ?? "0").trim().toLowerCase();
          const soundDelay = (Number(String(ini.soundt?.[pose] ?? "0").trim()) || 0) * 40;

          [preanimUrl, talkingUrl, idleUrl].forEach((u) => u && primeFrameOffsets(u));
          return {
            pose, sprite, idleUrl, talkingUrl, preanimUrl, preanimDuration,
            frameSfx: pack("framesfx"),
            frameScreenshake: pack("framescreenshake"),
            frameRealization: pack("framerealization"),
            sound, soundDelay,
          };
        })(),
      );
    }
    return cache.get(pose)!;
  };

  const out: PoseChange[] = [];
  for (const tag of tags) {
    if (emotions[tag.pose] === undefined) continue; // unknown pose: ignore
    try {
      out.push({ at: tag.at, ...(await load(tag.pose)) });
    } catch (e) {
      console.warn(`pose ${tag.pose} could not be loaded`, e);
    }
  }
  return out;
}
