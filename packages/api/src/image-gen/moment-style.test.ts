import { describe, expect, it } from "vitest";

import { parseMomentVisualAction } from "./moment-action";
import {
  classifyMomentPrivacy,
  classifyMomentScene,
  classifyMomentVenue,
  formatMomentStyleProfile,
  presetMomentStyle,
  resolveMomentStyleProfile,
  suggestMomentCameraOptions,
  suggestMomentExpressionOptions,
  stageStyleGuidance,
  stageStyleTier,
  suggestMomentOutfitOptions,
  suggestMomentPoseOptions,
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
    expect(presetMomentStyle("bedroom", "romantic", "female").outfit).toContain("slip nightdress");
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
            body_pose: "standing three-quarter pose, face toward viewer",
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

describe("moment style profiles and outfit candidates", () => {
  it("selects a stable style profile for the same companion and gender", () => {
    const first = resolveMomentStyleProfile("maya", "female");
    const second = resolveMomentStyleProfile("maya", "female");

    expect(first).toEqual(second);
    expect(formatMomentStyleProfile(first)).toContain(`Style profile: ${first.label}`);
  });

  it("returns three short outfit candidates for every venue/tier/gender", () => {
    for (const venue of ALL_VENUES) {
      for (const tier of ALL_TIERS) {
        for (const gender of ["female", "male"]) {
          const profile = resolveMomentStyleProfile(`${venue}-${tier}-${gender}`, gender);
          const options = suggestMomentOutfitOptions(venue, tier, gender, profile);

          expect(options).toHaveLength(3);
          for (const option of options) {
            expect(option.outfit.length).toBeLessThanOrEqual(120);
            expect(option.outfit).not.toMatch(/random costume|cheap|oversized shapeless/i);
            const parsed = parseMomentVisualAction({
              body_pose: "standing three-quarter pose, face toward viewer",
              hairstyle: option.hairstyle,
              ...(option.makeup ? { makeup: option.makeup } : {}),
              outfit: option.outfit,
            });
            expect(parsed, `${venue}/${tier}/${gender} candidate tripped the risky-word guard`).not.toBeNull();
          }
        }
      }
    }
  });

  it("lets the profile reorder candidates without changing the venue pool", () => {
    const elegant = resolveMomentStyleProfile("profile-elegant", "female");
    const sharp = resolveMomentStyleProfile("maya", "female");
    expect(sharp.key).toBe("sharp_urban");

    const elegantOptions = suggestMomentOutfitOptions("dining", "reserved", "female", elegant);
    const sharpOptions = suggestMomentOutfitOptions("dining", "reserved", "female", sharp);

    expect(new Set(elegantOptions.map((option) => option.outfit))).toEqual(
      new Set(sharpOptions.map((option) => option.outfit)),
    );
    expect(sharpOptions[0]?.outfit).toBe(
      "fitted blouse with a high-waisted short skirt and sheer stockings",
    );
  });
});

describe("moment pose and expression candidates", () => {
  it("returns short fallback pose family entries without scene objects or hand details", () => {
    for (const venue of ALL_VENUES) {
      for (const gender of ["female", "male"]) {
        const options = suggestMomentPoseOptions(venue, gender);
        expect(options).toHaveLength(5);
        for (const option of options) {
          expect(option.bodyPose.length).toBeLessThanOrEqual(100);
          expect(option.bodyPose).toContain("face toward viewer");
          expect(option.bodyPose).not.toMatch(/full-body|feet|shoes|legs-to-feet/i);
          expect(option.bodyPose).not.toMatch(
            /\b(cafe|table|counter|chair|bench|bed|doorway|window|railing|shoreline|bar|sofa|stage|cups?|glasses?|menus?|books?|towels?|coffee|flowers?|hands?|arms?|fingers?|holding|gripping)\b/i,
          );
          expect(
            parseMomentVisualAction({
              body_pose: option.bodyPose,
              hairstyle: "simple styled hair",
              outfit: "fitted outfit",
            }),
            `${venue}/${gender} pose tripped the risky-word guard`,
          ).not.toBeNull();
        }
      }
    }
  });

  it("uses the same generic fallback pose family across venues", () => {
    expect(suggestMomentPoseOptions("beach", "female")).toEqual(
      suggestMomentPoseOptions("dining", "male"),
    );
    expect(suggestMomentPoseOptions("beach", "female")[0]?.bodyPose).toBe(
      "standing three-quarter pose, face toward viewer",
    );
    expect(suggestMomentPoseOptions("beach", "female")[0]?.bodyPose).not.toContain("shoreline");
  });

  it("returns venue-safe camera candidates without prop, outfit, or body-pose pollution", () => {
    for (const venue of ALL_VENUES) {
      const options = suggestMomentCameraOptions(
        venue,
        venue === "bedroom" || venue === "home_private" ? "private" : "public",
      );
      expect(options.length).toBeGreaterThanOrEqual(4);
      for (const option of options) {
        expect(option.cameraView.length).toBeLessThanOrEqual(100);
        expect(option.cameraView).not.toMatch(
          /\b(cups?|glasses?|coffee|flowers?|menus?|books?|towels?|hands?|arms?|fingers?|dress|skirt|shirt|stockings|smile|pout|standing|seated|walking|reclining|leaning|turning)\b/i,
        );
        expect(option.cameraView).not.toMatch(
          /\b(visible camera|camera visible|phone|selfie|viewfinder|dslr|photographic device|under-table|under table)\b/i,
        );
      }
    }
  });

  it("keeps public dining camera views tasteful and reserves intimate angles for private scenes", () => {
    const dining = suggestMomentCameraOptions("dining", "public").map((option) => option.cameraView);
    expect(dining).toContain("side-view table-side composition");
    expect(dining).toContain("high-angle table-side view");
    expect(dining.join(" ")).not.toMatch(/under-table|floor-level|sofa-side|close intimate crop/i);

    const homePrivate = suggestMomentCameraOptions("home_private", "private").map(
      (option) => option.cameraView,
    );
    const bedroom = suggestMomentCameraOptions("bedroom", "private").map(
      (option) => option.cameraView,
    );
    expect(homePrivate).toContain("low-angle sofa-side view from below eye level");
    expect(bedroom).toContain("high-angle view from above, close intimate crop");
    expect(bedroom).toContain("overhead view from above");
  });

  it("returns four emotion-specific expression candidates for every emotion and gender", () => {
    for (const emotion of ["warm", "playful", "guarded", "tense", "annoyed", "neutral"]) {
      for (const gender of ["female", "male"]) {
        const options = suggestMomentExpressionOptions(emotion, gender);
        expect(options).toHaveLength(4);
        for (const option of options) {
          expect(option.expression.length).toBeLessThanOrEqual(120);
          expect(
            parseMomentVisualAction({
              body_pose: "standing three-quarter pose, face toward viewer",
              expression: option.expression,
              hairstyle: "simple styled hair",
              outfit: "fitted outfit",
            }),
            `${emotion}/${gender} expression tripped the risky-word guard`,
          ).not.toBeNull();
        }
      }
    }

    expect(suggestMomentExpressionOptions("playful", "female")[2]?.expression).toContain("wink");
    expect(suggestMomentExpressionOptions("playful", "female")[3]?.expression).toContain("tongue-out");
    expect(suggestMomentExpressionOptions("annoyed", "female")[0]?.expression).toContain("pout");
    expect(suggestMomentExpressionOptions("annoyed", "female")[0]?.expression).toContain("cheeks puffed");
  });
});
