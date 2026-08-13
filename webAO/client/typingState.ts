/**
 * Tracks other players' typing state (received via CT interception — see
 * sendTR.ts / handleCT.ts) and renders it into #client_typing_indicator.
 * Supports multiple simultaneous typers, e.g. "Klavier and Apollo are
 * typing..." Keyed by charid so re-selecting a character or a stray
 * duplicate packet doesn't produce ghost duplicate entries.
 */

// If a "stopped typing" packet never arrives (dropped connection, page
// closed mid-keystroke, etc.), an entry auto-expires after this long so it
// doesn't linger forever.
const TYPING_TIMEOUT_MS = 6000;
const MAX_NAMES_SHOWN = 3;

interface TypingEntry {
  name: string;
  timeoutId: number;
}

const typingUsers = new Map<number, TypingEntry>();

function formatTypingText(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} is typing...`;

  if (names.length <= MAX_NAMES_SHOWN) {
    const last = names[names.length - 1];
    const rest = names.slice(0, -1);
    return `${rest.join(", ")} and ${last} are typing...`;
  }

  const shown = names.slice(0, MAX_NAMES_SHOWN);
  const remaining = names.length - MAX_NAMES_SHOWN;
  return `${shown.join(", ")}, and ${remaining} more are typing...`;
}

function render(): void {
  const indicator = document.getElementById("client_typing_indicator");
  if (!indicator) return;
  const names = [...typingUsers.values()].map((entry) => entry.name);
  indicator.textContent = formatTypingText(names);
}

/** Marks charid as typing (or refreshes their expiry if already typing). */
export function setTyping(charid: number, name: string): void {
  const existing = typingUsers.get(charid);
  if (existing) window.clearTimeout(existing.timeoutId);

  const timeoutId = window.setTimeout(() => clearTyping(charid), TYPING_TIMEOUT_MS);
  typingUsers.set(charid, { name, timeoutId });
  render();
}

/** Clears charid's typing state (they stopped typing, sent, or left). */
export function clearTyping(charid: number): void {
  const existing = typingUsers.get(charid);
  if (!existing) return;
  window.clearTimeout(existing.timeoutId);
  typingUsers.delete(charid);
  render();
}

/** Clears everyone's typing state, e.g. on area change. */
export function clearAllTyping(): void {
  for (const entry of typingUsers.values()) window.clearTimeout(entry.timeoutId);
  typingUsers.clear();
  render();
}
