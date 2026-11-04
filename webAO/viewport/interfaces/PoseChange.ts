/** A mid-message animation change requested with `<pose:N>`, fully resolved. */
export interface PoseChange {
  /** Number of visible characters revealed before this change fires */
  at: number;
  pose: number;
  /** Sprite name from char.ini for this pose (lowercase) */
  sprite: string;
  idleUrl: string;
  talkingUrl: string;
  /** Preanim of the pose (transparent png when it has none) */
  preanimUrl: string;
  /** Preanim length in ms (0 = no preanim) */
  preanimDuration: number;
  /** Packed per-frame effects for this pose, same format as ChatMsg.frame_* */
  frameSfx: string;
  frameScreenshake: string;
  frameRealization: string;
  /** The pose's own emote sound (SoundN) and its delay in ms (SoundT * 40) */
  sound: string;
  soundDelay: number;
}
