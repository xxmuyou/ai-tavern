import { describe, expect, it } from "vitest";

import {
  companionToCard,
  extractCardData,
  mapCardToCompanionInput,
  parseCardExamples,
} from "./card";

describe("extractCardData", () => {
  it("unwraps the V2 `data` envelope", () => {
    expect(extractCardData({ spec: "chara_card_v2", data: { name: "Maya" } })).toEqual({ name: "Maya" });
  });

  it("accepts a bare card object", () => {
    expect(extractCardData({ name: "Maya", personality: "warm" })).toEqual({
      name: "Maya",
      personality: "warm",
    });
  });

  it("rejects non-objects and dataless objects", () => {
    expect(extractCardData(null)).toBeNull();
    expect(extractCardData("nope")).toBeNull();
    expect(extractCardData({ foo: "bar" })).toBeNull();
  });
});

describe("parseCardExamples", () => {
  it("prefers {{char}} lines and substitutes placeholders", () => {
    const block = "<START>\n{{user}}: Hi\n{{char}}: Oh, {{user}}. You came.";
    expect(parseCardExamples(block, "Maya")).toEqual(["Oh, you. You came."]);
  });

  it("falls back to all non-marker lines when no char lines exist", () => {
    expect(parseCardExamples("Line one\nLine two", "Maya")).toEqual(["Line one", "Line two"]);
  });
});

describe("mapCardToCompanionInput", () => {
  it("maps the standard fields and returns a create-shaped object", () => {
    const out = mapCardToCompanionInput(
      {
        name: "Maya",
        personality: "warm, teasing",
        description: "A barista who paints.",
        scenario: "You meet at the pier.",
        first_mes: "Oh — {{user}}, you're here.",
        mes_example: "{{char}}: Don't make it weird.",
        tags: ["artist", 42, "barista"],
      },
      "female",
    );
    expect(out).toMatchObject({
      background: "A barista who paints.\n\nYou meet at the pier.",
      example_dialogues: ["Don't make it weird."],
      gender: "female",
      greeting: "Oh — you, you're here.",
      name: "Maya",
      personality: "warm, teasing",
      tags: ["artist", "barista"],
    });
  });

  it("returns null when the card has no name", () => {
    expect(mapCardToCompanionInput({ personality: "x" }, "male")).toBeNull();
  });
});

describe("companionToCard", () => {
  it("produces a V2 card with example lines re-prefixed", () => {
    const card = companionToCard({
      name: "Maya",
      personality: "warm",
      background: "barista",
      greeting: "Hey you.",
      example_dialogues: ["Don't make it weird."],
      tags: ["artist"],
    }) as { spec: string; data: Record<string, unknown> };

    expect(card.spec).toBe("chara_card_v2");
    expect(card.data.name).toBe("Maya");
    expect(card.data.first_mes).toBe("Hey you.");
    expect(card.data.mes_example).toBe("{{char}}: Don't make it weird.");
    expect(card.data.tags).toEqual(["artist"]);
  });
});
