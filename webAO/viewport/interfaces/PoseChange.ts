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
}
