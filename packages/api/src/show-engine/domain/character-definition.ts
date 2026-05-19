import { readJsonArray, readJsonObject, readStringList } from "./json";
import { guestPackageFromRow } from "./guest-character-package";
import type { CharacterDefinition, CharacterGender, CharacterRole, CharacterSource } from "./types";

export type CharacterRowLike = {
  avatar_object_key: string | null;
  blow_up_signals: string;
  boundaries: string;
  character_key: string;
  dealbreaker_signals: string;
  gender: CharacterGender;
  goal: string;
  hard_preference_signals: string;
  hidden_preferences: string;
  initial_affinity: number;
  match_threshold: number;
  name: string;
  negative_signals: string;
  owner_user_id: string | null;
  personality: string;
  positive_signals: string;
  public_profile: string;
  relationship_to_user: string;
  role: CharacterRole;
  soft_preference_signals: string;
  source: CharacterSource;
  speaking_style: string;
};

export function toCharacterDefinition(row: CharacterRowLike): CharacterDefinition {
  const publicProfile = readJsonObject(row.public_profile);
  const characterPackage = row.role === "guest" ? guestPackageFromRow(row) : null;

  return {
    assets: {
      avatarObjectKey: characterPackage?.assets.avatarObjectKey ?? row.avatar_object_key,
      galleryObjectKeys: characterPackage?.assets.galleryObjectKeys ?? readStringList(publicProfile.galleryObjectKeys),
      portraitObjectKey: characterPackage?.assets.portraitObjectKey ??
        (typeof publicProfile.portraitObjectKey === "string" ? publicProfile.portraitObjectKey : null),
    },
    characterKey: row.character_key,
    identity: {
      ageRange: typeof publicProfile.ageRange === "string" ? publicProfile.ageRange : undefined,
      cityOrLifestyle: typeof publicProfile.cityOrLifestyle === "string" ? publicProfile.cityOrLifestyle : undefined,
      gender: row.gender,
      name: row.name,
      occupation: typeof publicProfile.occupationTag === "string" ? publicProfile.occupationTag : undefined,
    },
    matchRules: {
      blowUpSignals: readJsonArray<string>(row.blow_up_signals),
      dealbreakerSignals: readJsonArray<string>(row.dealbreaker_signals),
      hardPreferenceSignals: readJsonArray<string>(row.hard_preference_signals),
      initialAffinity: row.initial_affinity,
      matchThreshold: row.match_threshold,
      negativeSignals: readJsonArray<string>(row.negative_signals),
      positiveSignals: readJsonArray<string>(row.positive_signals),
      softPreferenceSignals: readJsonArray<string>(row.soft_preference_signals),
    },
    ownerUserId: row.owner_user_id,
    persona: {
      backstory: typeof publicProfile.backstory === "string" ? publicProfile.backstory : undefined,
      boundaries: row.boundaries,
      goal: row.goal,
      hiddenPreferences: row.hidden_preferences,
      personality: row.personality,
      relationshipToUser: row.relationship_to_user,
      speakingStyle: row.speaking_style,
    },
    publicProfile: characterPackage ? { ...publicProfile, characterPackage } : publicProfile,
    role: row.role,
    source: row.source,
  };
}

export function characterDefinitionToSnapshot(character: CharacterDefinition) {
  return {
    ...character.publicProfile,
    avatarObjectKey: character.assets.avatarObjectKey,
    blowUpSignals: character.matchRules.blowUpSignals,
    boundaries: character.persona.boundaries,
    characterKey: character.characterKey,
    dealbreakerSignals: character.matchRules.dealbreakerSignals,
    gender: character.identity.gender,
    goal: character.persona.goal,
    hardPreferenceSignals: character.matchRules.hardPreferenceSignals,
    hiddenPreferences: character.persona.hiddenPreferences,
    id: character.characterKey,
    initialAffinity: character.matchRules.initialAffinity,
    matchThreshold: character.matchRules.matchThreshold,
    name: character.identity.name,
    negativeSignals: character.matchRules.negativeSignals,
    ownerUserId: character.ownerUserId,
    personality: character.persona.personality,
    positiveSignals: character.matchRules.positiveSignals,
    relationshipToUser: character.persona.relationshipToUser,
    role: character.role,
    softPreferenceSignals: character.matchRules.softPreferenceSignals,
    source: character.source,
    speakingStyle: character.persona.speakingStyle,
  };
}
