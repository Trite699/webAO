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
