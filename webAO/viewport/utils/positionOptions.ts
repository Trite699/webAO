/**
 * Single place that knows how to add / find options in the Role dropdown
 * (#role_select). Used by:
 *  - the design.ini sync in set_side()
 *  - the "/pos <name>" chat command (onEnter.ts)
 *  - the server's forced position change (SP packet, handleSP.ts)
 * so every route ends up with the same, de-duplicated list.
 */

export type PositionOptionSource = "design-ini" | "custom";

export function findPositionOption(
  roleSelect: HTMLSelectElement,
  value: string,
): HTMLOptionElement | undefined {
  const wanted = value.toLowerCase();
  return Array.from(roleSelect.options).find(
    (opt) => opt.value.toLowerCase() === wanted,
  );
}

/**
 * Makes sure `value` exists in the Role dropdown and returns its option.
 * Existing options (hardcoded, design.ini or custom) are reused as-is, so
 * calling this repeatedly never creates duplicates.
 */
export function ensurePositionOption(
  value: string,
  display?: string,
  source: PositionOptionSource = "custom",
): HTMLOptionElement | null {
  const roleSelect = <HTMLSelectElement | null>(
    document.getElementById("role_select")
  );
  const name = value.trim().toLowerCase();
  if (!roleSelect || !name) return null;

  const existing = findPositionOption(roleSelect, name);
  if (existing) return existing;

  const opt = document.createElement("option");
  opt.value = name;
  opt.text = display || name;
  opt.dataset.source = source;
  roleSelect.appendChild(opt);
  return opt;
}
