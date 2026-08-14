// Characters with more than this many emotes get a paginated emote grid so the
// IC options below (additive, effects, etc.) stay reachable without a long
// scroll. Characters at or below it show every emote on a single page.
export const EMOTES_PER_PAGE = 51;

let currentPage = 0;

const removeBar = () => {
  document.getElementById("emote_pagination")?.remove();
};

/**
 * Sets up (or tears down) pagination for the emote grid in #client_emo. Call
 * after the emote buttons have been (re)built. When the emote count exceeds
 * EMOTES_PER_PAGE, a prev/next bar is inserted above the grid and only the
 * current page's buttons are shown.
 */
export const setupEmotePagination = () => {
  const emotesList = document.getElementById("client_emo");
  if (!emotesList) return;
  removeBar();

  const buttons = Array.from(
    emotesList.querySelectorAll(".emote_button"),
  ) as HTMLElement[];

  // Small rosters: everything visible, no controls.
  if (buttons.length <= EMOTES_PER_PAGE) {
    buttons.forEach((b) => (b.style.display = ""));
    return;
  }

  const pageCount = Math.ceil(buttons.length / EMOTES_PER_PAGE);
  currentPage = 0;

  const bar = document.createElement("div");
  bar.id = "emote_pagination";

  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "client_button";
  prev.textContent = "\u2039 Prev";

  const label = document.createElement("span");
  label.id = "emote_page_label";

  const next = document.createElement("button");
  next.type = "button";
  next.className = "client_button";
  next.textContent = "Next \u203a";

  const render = () => {
    buttons.forEach((b, idx) => {
      b.style.display =
        Math.floor(idx / EMOTES_PER_PAGE) === currentPage ? "" : "none";
    });
    label.textContent = `Page ${currentPage + 1} / ${pageCount}`;
    prev.disabled = currentPage === 0;
    next.disabled = currentPage === pageCount - 1;
  };

  prev.onclick = () => {
    if (currentPage > 0) {
      currentPage--;
      render();
    }
  };
  next.onclick = () => {
    if (currentPage < pageCount - 1) {
      currentPage++;
      render();
    }
  };

  bar.append(prev, label, next);
  emotesList.parentNode?.insertBefore(bar, emotesList);
  render();
};

/** Remove the pagination bar (e.g. when switching characters). */
export const clearEmotePagination = () => {
  removeBar();
};
