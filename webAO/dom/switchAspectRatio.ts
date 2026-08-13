// padding-bottom percentage for each supported aspect ratio (height / width
// as a percentage, since #client_gamewindow uses the width:100% +
// padding-bottom trick to keep its aspect ratio while scaling responsively).
const ASPECT_RATIOS: { [ratio: string]: string } = {
  "4:3": "75%", // classic AO viewport (3/4)
  "5:3": "60%", // widescreen (3/5)
  "16:9": "56.25%", // HD (9/16)
};
const DEFAULT_RATIO = "4:3";

/**
 * Triggered by the viewport aspect ratio select box.
 */
export async function switchAspectRatio() {
  const background = document.getElementById("client_gamewindow")!;
  const offsetCheck = <HTMLInputElement>(
    document.getElementById("client_hdviewport_offset")
  );
  const select = <HTMLSelectElement>(
    document.getElementById("client_viewport_ratio")
  );
  const ratio = select ? select.value : DEFAULT_RATIO;

  background.style.paddingBottom = ASPECT_RATIOS[ratio] || ASPECT_RATIOS[DEFAULT_RATIO];
  // The chatbox offset option only makes sense for non-classic ratios,
  // where the courtroom no longer fills the full width of the chatbox.
  offsetCheck.disabled = ratio === DEFAULT_RATIO;
  if (offsetCheck.disabled) {
    offsetCheck.checked = false;
    window.switchChatOffset();
  }

  localStorage.setItem("viewportRatio", ratio);
}
window.switchAspectRatio = switchAspectRatio;
