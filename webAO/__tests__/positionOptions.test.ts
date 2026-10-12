/** @jest-environment jsdom */
import { ensurePositionOption } from "../viewport/utils/positionOptions";

const mockSetSide = jest.fn();
jest.mock("../client", () => ({
  client: {
    charID: 0,
    chars: [{ side: "def" }],
    viewport: { getBackgroundName: () => "testbg", set_side: (a: any) => mockSetSide(a) },
  },
}));

import { handleSP } from "../packets/handlers/handleSP";

function buildSelect() {
  document.body.innerHTML = "";
  document.body.insertAdjacentHTML(
    "beforeend",
    `<select id="role_select"><option value="">Default</option><option value="def">Defense</option></select>
     <div id="judge_action"></div><div id="no_action"></div>`,
  );
  return document.getElementById("role_select") as HTMLSelectElement;
}

describe("ensurePositionOption", () => {
  it("adds an unknown position once, tagged custom, and reuses it", () => {
    const sel = buildSelect();
    ensurePositionOption("Lobby");
    ensurePositionOption("lobby");
    const opts = Array.from(sel.options).filter((o) => o.value === "lobby");
    expect(opts).toHaveLength(1);
    expect(opts[0].dataset.source).toBe("custom");
  });

  it("reuses hardcoded options", () => {
    const sel = buildSelect();
    ensurePositionOption("DEF");
    expect(sel.options.length).toBe(2);
  });
});

describe("handleSP (forced position)", () => {
  it("adds, selects and shows a position missing from the dropdown", () => {
    const sel = buildSelect();
    mockSetSide.mockClear();
    handleSP(["SP", "lob"]);
    expect(sel.value).toBe("lob");
    expect(mockSetSide).toHaveBeenCalledWith(
      expect.objectContaining({ position: "lob" }),
    );
  });
});
