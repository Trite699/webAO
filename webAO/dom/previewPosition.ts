import { client } from "../client";

/**
 * Immediately shows `position` in the viewport (background, desk and
 * panning, including design.ini positions) instead of waiting for the next
 * IC message to trigger it. Used by the Role dropdown, "/pos" and the
 * server's forced position (SP).
 */
export function previewPosition(position: string): void {
  try {
    const viewport = client?.viewport;
    if (!viewport || !viewport.getBackgroundName()) return;

    let pos = position;
    if (!pos) {
      // "Default" role: use the character's own side, same as IC does.
      pos = client.chars?.[client.charID]?.side;
    }
    if (!pos) return;

    viewport.set_side({
      position: pos.toLowerCase(),
      showSpeedLines: false,
      showDesk: true,
    });
  } catch (e) {
    console.warn("[previewPosition] couldn't update viewport", e);
  }
}
