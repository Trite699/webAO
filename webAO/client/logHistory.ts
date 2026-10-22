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
  /** when the message was logged (used for downloaded logs) */
  date?: Date;
  /** text color name ("red", "blue"...), "" for the default color */
  color?: string;
  /** true for divider notices such as "Connected" / "Disconnected" */
  notice?: boolean;
}

export const icLogHistory: ICLogEntry[] = [];

/** Max rendered entries kept in a log's DOM. The history buffer is unbounded. */
export const MAX_LOG_NODES = 500;

/**
 * Trim a log container down to the most recent `max` child nodes, removing the
 * oldest from the top. Bounds DOM size (layout/paint/memory) on long sessions.
 */
export function capLogNodes(container: HTMLElement, max = MAX_LOG_NODES) {
  let node = container.firstChild;
  while (container.childNodes.length > max && node) {
    const next = node.nextSibling;
    // Nodes marked data-keep (e.g. the Download Log toolbar) are never trimmed.
    if (!(node instanceof HTMLElement && node.dataset.keep)) {
      container.removeChild(node);
    }
    node = next;
  }
}
