import { describe, expect, it } from "vitest";

import { spokenText } from "./voice";

describe("spokenText", () => {
  it("drops narration and keeps spoken dialogue", () => {
    const content = "<narration>She leaned in.</narration>You came back.<narration>A smile.</narration>";
    expect(spokenText(content)).toBe("You came back.");
  });

  it("collapses whitespace across kept fragments", () => {
    expect(spokenText("Hey.<narration>x</narration>  How are you?")).toBe("Hey. How are you?");
  });

  it("falls back to the full stripped text when it is all narration", () => {
    expect(spokenText("<narration>She just watched, silent.</narration>")).toBe("She just watched, silent.");
  });
});
