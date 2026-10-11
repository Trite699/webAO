/**
 * Cleans a blip name taken from the "Override blips…" box (or from another
 * player's MS packet) so it's safe to drop into
 * `${AO_HOST}sounds/blips/<name>.opus`.
 *
 * Returns "" for "no override", in which case the speaker's char.ini blips
 * apply. "none" is returned as-is and means silent blips.
 */
export function sanitizeBlipName(raw: string | undefined | null): string {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.\.+/g, "") // no walking out of sounds/blips/
    .replace(/^[/\\]+/, "") // no absolute paths
    .replace(/[<>"'`%#&?]/g, ""); // stuff that has no business in a filename
}
