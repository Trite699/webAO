/** One `<pose:N>` marker found in a message. `at` = visible chars before it. */
export interface PoseTag {
  at: number;
  pose: number;
}

const POSE_TAG = /<pose:\s*(\d+)\s*>/gi;

/**
 * Strips every `<pose:N>` tag out of an (already unescaped) message and
 * records where in the visible text each one sat. Removing the tags before
 * the text is parsed keeps content/parsed indexes aligned, so the tag never
 * shows up in the chatbox, the log or the typing animation.
 */
export function extractPoseTags(text: string): { text: string; tags: PoseTag[] } {
  const tags: PoseTag[] = [];
  let out = "";
  let last = 0;
  POSE_TAG.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = POSE_TAG.exec(text)) !== null) {
    out += text.slice(last, m.index);
    tags.push({ at: out.length, pose: Number(m[1]) });
    last = m.index + m[0].length;
  }
  out += text.slice(last);
  return { text: out, tags };
}

/** One outgoing IC message produced by splitting on `<pose:N>` tags. */
export interface PoseSegment {
  text: string;
  /** Pose to use for this segment, or null for the emote picked with the buttons */
  pose: number | null;
}

/**
 * Splits a message you are about to send at its `<pose:N>` tags, so each part
 * can go out as its own IC message with that pose's emote, preanim, sounds
 * and frame effects. Tags for poses that don't exist (isValid returns false)
 * are removed but don't split anything. A pose with no text after it (empty
 * or whitespace-only) is dropped, and whitespace is kept attached to the
 * neighbouring text.
 */
export function splitByPoseTags(
  text: string,
  isValid: (pose: number) => boolean,
): PoseSegment[] {
  const { text: stripped, tags } = extractPoseTags(text);
  const valid = tags.filter((t) => isValid(t.pose));

  const pieces: PoseSegment[] = [];
  let pos = 0;
  let pose: number | null = null;
  valid.forEach((t) => {
    pieces.push({ text: stripped.slice(pos, t.at), pose });
    pos = t.at;
    pose = t.pose;
  });
  pieces.push({ text: stripped.slice(pos), pose });

  const segments: PoseSegment[] = [];
  let pendingPose: number | null = null;
  let carry = "";
  pieces.forEach((piece) => {
    if (piece.pose !== null) pendingPose = piece.pose;
    if (piece.text.trim() === "") {
      if (segments.length) segments[segments.length - 1].text += piece.text;
      else carry += piece.text;
      return;
    }
    segments.push({ text: carry + piece.text, pose: pendingPose });
    carry = "";
    pendingPose = null;
  });
  return segments;
}
