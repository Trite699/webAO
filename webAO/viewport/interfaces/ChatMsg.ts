import { PreloadedAssets } from "./PreloadedAssets";
import { PoseChange } from "./PoseChange";
import { PoseTag } from "../utils/poseTagParser";

export interface ChatMsg {
  content: string;
  objection: number;
  /** id of the custom shout when objection === 4 ("custom" if unset) */
  customShout?: string;
  sound: string;
  startpreanim?: boolean;
  startspeaking?: boolean;
  side: string;
  color: number;
  snddelay: number;
  preanimdelay?: number;
  speed: number;
  blips: string;
  self_offset?: number[];
  other_offset?: number[];
  showname?: string;
  nameplate?: string;
  flip?: number;
  other_flip?: number;
  effects?: string[];
  deskmod?: number;
  preanim?: string;
  other_name?: string;
  sprite?: string;
  name?: string;
  chatbox?: string;
  other_emote?: string;
  parsed?: HTMLSpanElement[];
  screenshake?: number;
  flash?: number;
  type?: number;
  evidence?: number;
  looping_sfx?: boolean;
  noninterrupting_preanim?: number;
  preloadedAssets?: PreloadedAssets;
  charid?: number;
  /** `<pose:N>` tags pulled out of the text, before they are resolved */
  poseTags?: PoseTag[];
  /** Resolved mid-text animation changes, in text order */
  poseChanges?: PoseChange[];
  /** Index of the next poseChanges entry still to fire */
  poseIndex?: number;
}
