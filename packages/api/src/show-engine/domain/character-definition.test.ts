import { describe, expect, it } from "vitest";

import { characterDefinitionToSnapshot, toCharacterDefinition } from "./character-definition";

describe("character definition mapper", () => {
  it("maps current show character rows into versionable character definitions", () => {
    const definition = toCharacterDefinition({
      avatar_object_key: "avatars/ivy.png",
      blow_up_signals: '["ambition"]',
      boundaries: "No contempt.",
      character_key: "ivy",
      dealbreaker_signals: '["dishonesty"]',
      gender: "female",
      goal: "Test proof.",
      hard_preference_signals: '["tech_career"]',
      hidden_preferences: "Likes reliable people.",
      initial_affinity: 62,
      match_threshold: 75,
      name: "Ivy",
      negative_signals: '["empty_promises"]',
      owner_user_id: null,
      personality: "sharp and warm",
      positive_signals: '["ambition","responsibility"]',
      public_profile: JSON.stringify({
        ageRange: "27",
        galleryObjectKeys: ["gallery/ivy-1.png"],
        occupationTag: "Founder",
        personalityKeywords: ["focused"],
        portraitObjectKey: "portraits/ivy.png",
      }),
      relationship_to_user: "guest",
      role: "guest",
      soft_preference_signals: '["maturity"]',
      source: "official",
      speaking_style: "direct",
    });

    expect(definition.identity.name).toBe("Ivy");
    expect(definition.assets.galleryObjectKeys).toEqual(["gallery/ivy-1.png"]);
    expect(definition.matchRules.hardPreferenceSignals).toEqual(["tech_career"]);
    expect(definition.persona.hiddenPreferences).toBe("Likes reliable people.");

    const snapshot = characterDefinitionToSnapshot(definition);
    expect(snapshot.name).toBe("Ivy");
    expect(snapshot.hiddenPreferences).toBe("Likes reliable people.");
    expect(snapshot.positiveSignals).toEqual(["ambition", "responsibility"]);
  });
});
