import { client } from "../client";
import { getIcMessageCount } from "../viewport/utils/handleICSpeaking";

/**
 * State for sending one typed message as several IC messages (one per
 * `<pose:N>` segment). While a follow-up segment is in flight, the acks and
 * echoes of that segment must not wipe whatever the player has started typing
 * next, so resetICParams() asks isFollowUpInFlight().
 */
let active = false;
let index = 0;

export const isSegmentedSendActive = () => active;
export const isFollowUpInFlight = () => active && index > 0;
export const beginSegmentedSend = () => {
  active = true;
  index = 0;
};
export const setSegmentIndex = (i: number) => {
  index = i;
};
export const endSegmentedSend = () => {
  active = false;
  index = 0;
};

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Resolves once our own copy of the message just sent (echoed back by the
 * server) has finished typing out, so the next segment doesn't cut it off.
 * Gives up waiting for the echo after 3 s and for playback after maxMs.
 */
export async function waitForOwnMessageDone(
  countBefore: number,
  maxMs = 60000,
) {
  const start = performance.now();
  while (getIcMessageCount() <= countBefore) {
    if (performance.now() - start > 3000) return;
    await sleep(50);
  }
  while (client.viewport.getAnimating()) {
    if (performance.now() - start > maxMs) return;
    await sleep(50);
  }
}
