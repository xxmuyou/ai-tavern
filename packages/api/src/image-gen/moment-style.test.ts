import { describe, expect, it } from "vitest";

import { parseMomentVisualAction } from "./moment-action";
import {
  classifyMomentPrivacy,
  classifyMomentScene,
  classifyMomentVenue,
  presetMomentStyle,
  stageStyleGuidance,
  stageStyleTier,
  type MomentVenue,
  type StyleTier,
} from "./moment-style";

const ALL_VENUES: MomentVenue[] = [
  "nightlife",
  "bedroom",
  "home_private",
  "dining",
  "beach",
  "active",
  "outdoor_public",
  "indoor_quiet",
];
const ALL_TIERS: StyleTier[] = ["reserved", "warm", "romantic", "intimate"];

describe("classifyMomentPrivacy", () => {
  it("treats intimate/home/bedroom/hotel tagged scenes as private", () => {
    expect(classifyMomentPrivacy({ tags: ["hotel", "bedroom", "intimate", "night"] })).toBe(
      "private",
    );
    expect(classifyMomentPrivacy({ tags: ["home", "laundry", "quiet", "familiar"] })).toBe(
      "private",
    );
    expect(classifyMomentPrivacy({ tags: ["lounge", "rain", "intimate", "night"] })).toBe(
      "private",
    );
  });

  it("treats catalog public scenes as public", () => {
    expect(classifyMomentPrivacy({ tags: ["transit", "city", "public", "day"] })).toBe("public");
    expect(classifyMomentPrivacy({ tags: ["cafe", "waterfront", "warm", "day"] })).toBe("public");
    expect(classifyMomentPrivacy({ tags: ["music", "night", "stage", "active"] })).toBe("public");
  });

  it("treats the sceneless private chat fallback as private", () => {
    expect(classifyMomentPrivacy(null)).toBe("private");
  });
});

describe("classifyMomentVenue", () => {
  // Tag combos below mirror the real scene catalog (migrations 0051/0052).
  it("maps catalog scenes into the expected venue buckets", () => {
    expect(
      classifyMomentVenue("Hotel Suite", ["hotel", "bedroom", "intimate", "night"], "private"),
    ).toBe("bedroom");
    expect(
      classifyMomentVenue("Apartment Bedroom", ["home", "bedroom", "intimate", "night"], "private"),
    ).toBe("bedroom");
    expect(
      classifyMomentVenue("Window Lounge", ["lounge", "rain", "intimate", "night"], "private"),
    ).toBe("home_private");
    expect(classifyMomentVenue("Livehouse", ["music", "night", "stage", "active"], "public")).toBe(
      "nightlife",
    );
    expect(classifyMomentVenue("Gym", ["gym", "active", "indoor", "morning"], "public")).toBe(
      "active",
    );
    expect(
      classifyMomentVenue("Game Arcade", ["arcade", "playful", "night", "active"], "public"),
    ).toBe("active");
    expect(classifyMomentVenue("Cafe", ["cafe", "waterfront", "warm", "day"], "public")).toBe(
      "dining",
    );
    expect(
      classifyMomentVenue("Restaurant", ["restaurant", "date", "dinner", "indoor", "evening"], "public"),
    ).toBe("dining");
    expect(classifyMomentVenue("Plaza", ["transit", "city", "public", "day"], "public")).toBe(
      "outdoor_public",
    );
    expect(classifyMomentVenue("Park", ["park", "outdoor", "familiar", "evening"], "public")).toBe(
      "outdoor_public",
    );
    expect(classifyMomentVenue("Bookshop", ["bookshop", "rain", "quiet", "indoor"], "public")).toBe(
      "indoor_quiet",
    );
    expect(classifyMomentVenue("Cinema", ["cinema", "date", "night", "indoor"], "public")).toBe(
      "indoor_quiet",
    );
  });

  it("recognizes beach venues by name keyword (reserved for future scenes)", () => {
    expect(classifyMomentVenue("Sunset Beach", ["outdoor", "day"], "public")).toBe("beach");
    expect(classifyMomentVenue("Hotel Pool", ["swim"], "public")).toBe("beach");
  });

  it("defaults unmatched private scenes to home_private", () => {
    expect(classifyMomentVenue("Private chat", [], "private")).toBe("home_private");
    expect(classifyMomentScene(null)).toEqual({ privacy: "private", venue: "home_private" });
  });
});

describe("stageStyleTier", () => {
  it("maps positive stages onto increasing tiers", () => {
    expect(stageStyleTier("first_contact")).toBe("reserved");
    expect(stageStyleTier("familiar")).toBe("reserved");
    expect(stageStyleTier("trusted")).toBe("warm");
    expect(stageStyleTier("close_friend")).toBe("warm");
    expect(stageStyleTier("romantic_tension")).toBe("romantic");
    expect(stageStyleTier("dating")).toBe("romantic");
    expect(stageStyleTier("committed")).toBe("intimate");
  });

  it("forces negative stages down to reserved", () => {
    expect(stageStyleTier("strained")).toBe("reserved");
    expect(stageStyleTier("hostile")).toBe("reserved");
    expect(stageStyleTier("estranged")).toBe("reserved");
  });

  it("keeps the hard no-nudity ceiling even at the boldest tier", () => {
    expect(stageStyleGuidance("intimate")).toContain("never nude");
    expect(stageStyleGuidance("reserved")).toContain("no sleepwear");
  });
});

describe("presetMomentStyle", () => {
  it("unlocks towel/slip looks only at the intimate tier in bedroom venues", () => {
    expect(presetMomentStyle("bedroom", "intimate", "female").outfit).toContain("bath towel");
    expect(presetMomentStyle("bedroom", "romantic", "female").outfit).toContain("silk slip");
    expect(presetMomentStyle("bedroom", "reserved", "female").outfit).not.toMatch(/towel|slip/);
    expect(presetMomentStyle("bedroom", "warm", "female").outfit).not.toMatch(/towel/);
  });

  it("styles male companions from the menswear table", () => {
    expect(presetMomentStyle("nightlife", "intimate", "male").outfit).toContain("shirt");
    expect(presetMomentStyle("bedroom", "intimate", "male").outfit).not.toContain("towel");
    expect(presetMomentStyle("nightlife", "reserved", "male").makeup).toBeUndefined();
  });

  it("falls back to the female table when gender is unknown", () => {
    expect(presetMomentStyle("dining", "warm", null)).toEqual(
      presetMomentStyle("dining", "warm", "female"),
    );
  });

  // Defense for the whole table: every preset string must survive
  // parseMomentVisualAction unchanged — i.e. stay <= 120 chars and never trip
  // RISKY_MULTI_SUBJECT_PATTERN (words like "us", "we", "together"...).
  it("keeps every preset short and free of multi-subject risky words", () => {
    for (const venue of ALL_VENUES) {
      for (const tier of ALL_TIERS) {
        for (const gender of ["female", "male"]) {
          const preset = presetMomentStyle(venue, tier, gender);
          const fields = [preset.outfit, preset.hairstyle, preset.makeup].filter(
            (f): f is string => Boolean(f),
          );
          for (const field of fields) {
            expect(field.length).toBeLessThanOrEqual(120);
          }
          const parsed = parseMomentVisualAction({
            body_pose: "standing alone in the scene",
            hairstyle: preset.hairstyle,
            ...(preset.makeup ? { makeup: preset.makeup } : {}),
            outfit: preset.outfit,
          });
          expect(parsed, `${venue}/${tier}/${gender} preset tripped the risky-word guard`).not.toBeNull();
          expect(parsed?.outfit).toBe(preset.outfit);
          expect(parsed?.hairstyle).toBe(preset.hairstyle);
        }
      }
    }
  });
});
