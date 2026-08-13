import { client } from "../client";

/**
 * Wired to the IC input box's oninput. Tells OTHER players you're typing
 * (piggybacked on CT — see client/sender/sendTR.ts), throttled so it's
 * not a packet per keystroke:
 *  - Leading edge (box goes non-empty): sends "typing" immediately.
 *  - While it stays non-empty: re-sends "typing" every REFRESH_MS as a
 *    keepalive, since the receiver auto-expires a typer after
 *    TYPING_TIMEOUT_MS (typingState.ts) if it hears nothing further —
 *    without this, a long uninterrupted typing burst would silently drop
 *    off other players' screens mid-message.
 *  - Idle for STOP_DELAY_MS, or the box goes empty: sends "stopped".
 *
 * This does NOT touch #client_typing_indicator directly — that element is
 * driven by handleCT.ts / typingState.ts for what OTHER people are typing,
 * not your own state.
 */
const STOP_DELAY_MS = 3000;
const REFRESH_MS = 4000; // must stay under typingState.ts's TYPING_TIMEOUT_MS

let isTyping = false;
let stopTimer: number | null = null;
let refreshTimer: number | null = null;

function clearTimers(): void {
  if (stopTimer !== null) {
    window.clearTimeout(stopTimer);
    stopTimer = null;
  }
  if (refreshTimer !== null) {
    window.clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

function stopTyping(): void {
  clearTimers();
  if (!isTyping) return;
  isTyping = false;
  client.sender.sendTR(false);
}

function startTyping(): void {
  if (!isTyping) {
    isTyping = true;
    client.sender.sendTR(true);
    refreshTimer = window.setInterval(
      () => client.sender.sendTR(true),
      REFRESH_MS,
    );
  }
  if (stopTimer !== null) window.clearTimeout(stopTimer);
  stopTimer = window.setTimeout(stopTyping, STOP_DELAY_MS);
}

export function updateTypingIndicator() {
  const text = (<HTMLInputElement>document.getElementById("client_inputbox"))
    .value;
  if (text.trim() === "") {
    stopTyping();
    return;
  }
  startTyping();
}
window.updateTypingIndicator = updateTypingIndicator;

/** Immediately signals "stopped typing" — call this once a message sends. */
export function stopTypingNow(): void {
  stopTyping();
}
