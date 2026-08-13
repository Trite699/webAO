import { client } from "../../client";

/**
 * "Typing" signal piggybacked on the HP packet, instead of CT.
 *
 * READ BEFORE USING — this trades one set of problems for a different,
 * arguably worse set:
 *
 *  - HP only has TWO slots in this protocol: side 1 (defense) and side 2
 *    (prosecution). It is NOT per-character. There is no reliable way to
 *    map an arbitrary charID to "defense" or "prosecution" — this uses
 *    `charid % 2` as a guess, which will frequently be wrong (e.g. co-
 *    counsel, witnesses, narrators, or any case with >2 active chars).
 *  - Every client in the area — webAO AND the AO2 desktop client — will
 *    see that side's health bar visibly move. Unlike the CT/OOC hack,
 *    there is no way to hide this from non-webAO clients; the flicker
 *    IS the packet, there's nothing to intercept-and-drop it.
 *  - If a mod or player changes the real HP value while a flicker is
 *    in-flight (see RESTORE_DELAY_MS below), the restore step can
 *    clobber that real change back to the stale cached value.
 *  - Frequent typing (multiple people, the REFRESH_MS keepalive in
 *    dom/updateTypingIndicator.ts) means the health bar will visibly
 *    twitch on a regular cadence during normal roleplay.
 *
 * This is included because it was explicitly requested, not because it's
 * recommended. The CT-based approach (default in this repo) or a real
 * server-side packet are both cleaner. See client/sender/sendTR.ts git
 * history / conversation notes for the alternatives.
 */
const RESTORE_DELAY_MS = 150;

export const sendTR = (typing: boolean) => {
  // Best-effort, frequently-wrong guess at which HP slot this charID
  // belongs to. 1 = defense, 2 = prosecution.
  const side = (client.charID % 2) + 1;
  const sideIndex = side - 1; // client.hp is 0-indexed: [defense, prosecution]

  const realValue = client.hp[sideIndex];

  if (!typing) {
    // "Stopped typing" — nothing meaningful to blip; just make sure the
    // bar is at the last known-real value.
    client.sender.sendHP(side, realValue);
    return;
  }

  // Blip the bar down by 1 (clamped at 0) to signal "typing", then
  // restore the real value shortly after.
  const blipValue = Math.max(0, realValue - 1);
  client.sender.sendHP(side, blipValue);

  window.setTimeout(() => {
    // NOTE: uses the value captured at blip-time, not a fresh read — if
    // the real HP changed in the meantime (see caveats above), this
    // overwrites that change.
    client.sender.sendHP(side, realValue);
  }, RESTORE_DELAY_MS);
};
