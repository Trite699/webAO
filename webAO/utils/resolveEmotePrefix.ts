/**
 * Matches an emote name that already carries an explicit idle/talking
 * marker, e.g. "(a)superslam" or "(b)superslam".
 */
const EXPLICIT_POSE_PREFIX = /^\((a|b)\)/i;

/** True if the char.ini emote/anim name starts with "(a)" or "(b)". */
export function hasExplicitPosePrefix(emotename: string): boolean {
  return EXPLICIT_POSE_PREFIX.test(emotename.trim());
}

/**
 * Returns the filename prefix ("(a)" idle / "(b)" talking) that should be
 * prepended to an emote name when building a sprite URL.
 *
 * If the char.ini entry already begins with (a) or (b), e.g.
 *   1=SuperSlam#superslam#(a)slam#1#1
 * that exact file is used for BOTH idle and talking, so no extra prefix is
 * added: idle -> "(a)slam.webp", talking -> "(a)slam.webp".
 */
export default function resolveEmotePrefix(
  emotename: string,
  prefix: string,
): string {
  return hasExplicitPosePrefix(emotename) ? "" : prefix;
}
