/**
 * Full in-memory IC chat history, kept as lightweight text so /save_chatlog can
 * export the entire session even though the rendered DOM log is capped for
 * performance on weaker devices. The DOM holds at most MAX_LOG_NODES entries;
 * this array holds everything.
 */
export interface ICLogEntry {
  showname: string;
  text: string;
  time: string; // formatted time label, or "" when no timestamp is shown
}

export const icLogHistory: ICLogEntry[] = [];

/** Max rendered entries kept in a log's DOM. The history buffer is unbounded. */
export const MAX_LOG_NODES = 500;

/**
 * Trim a log container down to the most recent `max` child nodes, removing the
 * oldest from the top. Bounds DOM size (layout/paint/memory) on long sessions.
 */
export function capLogNodes(container: HTMLElement, max = MAX_LOG_NODES) {
  while (container.childNodes.length > max && container.firstChild) {
    container.removeChild(container.firstChild);
  }
}
