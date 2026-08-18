/**
 * Precise pairing-offset controls. The bare range sliders were hard to
 * position accurately (especially nudging a 4:3 character on a wide 16:9
 * background). Each offset now has a slider, a numeric input you can type
 * an exact value into, and -/+ nudge buttons for single-step adjustment;
 * all three stay in sync. The slider element keeps its original id, so the
 * send path reads the value unchanged.
 */
const PAIRS: Array<[string, string]> = [
  ["pair_offset", "pair_offset_num"],
  ["pair_y_offset", "pair_y_offset_num"],
];

function clamp(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.max(-100, Math.min(100, Math.round(v)));
}

function setBoth(sliderId: string, value: number): void {
  const v = clamp(value);
  const slider = document.getElementById(sliderId) as HTMLInputElement | null;
  const num = document.getElementById(`${sliderId}_num`) as HTMLInputElement | null;
  if (slider) slider.value = String(v);
  if (num) num.value = String(v);
}

export function initPairOffsets(): void {
  for (const [sliderId, numId] of PAIRS) {
    const slider = document.getElementById(sliderId) as HTMLInputElement | null;
    const num = document.getElementById(numId) as HTMLInputElement | null;
    if (!slider || !num) continue;
    slider.addEventListener("input", () => {
      num.value = slider.value;
    });
    num.addEventListener("input", () => {
      slider.value = String(clamp(Number(num.value)));
    });
    num.addEventListener("change", () => setBoth(sliderId, Number(num.value)));
  }

  document
    .querySelectorAll<HTMLButtonElement>(".pair_nudge")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.dataset.target;
        const step = Number(btn.dataset.step) || 0;
        if (!targetId) return;
        const slider = document.getElementById(targetId) as HTMLInputElement | null;
        if (!slider) return;
        setBoth(targetId, (Number(slider.value) || 0) + step);
      });
    });
}

window.initPairOffsets = initPairOffsets;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPairOffsets);
} else {
  initPairOffsets();
}
