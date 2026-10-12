import { updateActionCommands } from "../../dom/updateActionCommands";
import { previewPosition } from "../../dom/previewPosition";
import { ensurePositionOption } from "../../viewport/utils/positionOptions";
/**
 * position change (also what the server sends for a forced position)
 * @param {string} pos new position
 */
export const handleSP = (args: string[]) => {
  const pos = (args[1] || "").toLowerCase();
  // A forced position may not be in the Role dropdown yet (e.g. a
  // design.ini position) -- add it so it can be selected and shown.
  ensurePositionOption(pos);
  updateActionCommands(pos);
  previewPosition(pos);
};
