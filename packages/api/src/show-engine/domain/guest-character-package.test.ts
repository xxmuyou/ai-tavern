import { describe, expect, it } from "vitest";

import {
  bindGuestAsset,
  guestPackageFromRow,
  guestPackageToCharacterFields,
  selectGuestVisualObjectKey,
  validateGuestCharacterPackage,
} from "./guest-character-package";

describe("guest character package", () => {
  it("maps legacy rows into a configurable guest package and character fields", () => {
    const characterPackage = guestPackageFromRow({
      avatar_object_key: "avatars/mia.png",
      blow_up_signals: '["humor"]',
      boundaries: "No contempt.",
      dealbreaker_signals: '["aggression"]',
      gender: "female",
      goal: "Find chemistry.",
      hard_preference_signals: '["creative_career"]',
      hidden_preferences: "Likes honest people.",
      initial_affinity: 55,
      match_threshold: 76,
      name: "Mia",
      negative_signals: '["avoidance"]',
      personality: "playful",
      positive_signals: '["honesty","humor"]',
      public_profile: JSON.stringify({
        ageRange: "25-30",
        hobbies: ["music"],
        occupationTag: "musician",
        portraitObjectKey: "portraits/mia.png",
      }),
      relationship_to_user: "guest",
      soft_preference_signals: '["warmth"]',
      speaking_style: "teasing",
    });

    expect(characterPackage.identity.name).toBe("Mia");
    expect(characterPackage.assets.portraitObjectKey).toBe("portraits/mia.png");
    expect(characterPackage.matchRules.hardPreferenceSignals).toEqual(["creative_career"]);

    const fields = guestPackageToCharacterFields(characterPackage);
    expect(fields.publicProfile.characterPackage).toEqual(characterPackage);
    expect(fields.positiveSignals).toEqual(["honesty", "humor"]);
  });

  it("validates required package fields and rule arrays", () => {
    const validation = validateGuestCharacterPackage({
      assets: "broken",
      identity: {},
      matchRules: {
        positiveSignals: "honesty",
      },
    });

    expect(validation.errors).toContain("identity.name is required");
    expect(validation.errors).toContain("assets must be an object");
    expect(validation.errors).toContain("matchRules.positiveSignals must be an array");
  });

  it("selects visual states with fallback to portrait or avatar", () => {
    const validation = validateGuestCharacterPackage({
      assets: {
        avatarObjectKey: "avatars/ivy.png",
        portraitObjectKey: "portraits/ivy.png",
        visualStates: {
          "happy.wave": { objectKey: "states/ivy-wave.png" },
        },
      },
      identity: {
        gender: "female",
        name: "Ivy",
      },
      stateModel: {
        runtimeDefaults: {
          action: "wave",
          expression: "smile",
          mood: "happy",
        },
      },
    });

    expect(validation.errors).toEqual([]);
    expect(selectGuestVisualObjectKey(validation.package)).toBe("states/ivy-wave.png");
    expect(selectGuestVisualObjectKey(validation.package, "missing.state")).toBe("states/ivy-wave.png");
  });

  it("binds uploaded assets without changing unrelated package fields", () => {
    const validation = validateGuestCharacterPackage({
      assets: {
        avatarObjectKey: "avatars/noah.png",
      },
      identity: {
        gender: "male",
        name: "Noah",
      },
    });
    const nextPackage = bindGuestAsset(validation.package, {
      objectKey: "states/noah-shy.png",
      slot: "visual_state",
      visualStateKey: "shy.lookDown",
    });

    expect(nextPackage.identity.name).toBe("Noah");
    expect(nextPackage.assets.visualStates["shy.lookDown"]?.objectKey).toBe("states/noah-shy.png");
    expect(validation.package.assets.visualStates["shy.lookDown"]).toBeUndefined();
  });
});
