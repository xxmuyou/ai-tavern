import { readJsonObject, readStringList } from "./json";
import type {
  CharacterGender,
  CharacterMatchRules,
  CharacterPersona,
  GuestCharacterPackage,
  GuestPackageAssets,
  GuestRuntimeDefaults,
  GuestStateModel,
  GuestVisualState,
} from "./types";

export type GuestPackageRowLike = {
  avatar_object_key: string | null;
  blow_up_signals: string;
  boundaries: string;
  dealbreaker_signals: string;
  gender: CharacterGender;
  goal: string;
  hard_preference_signals: string;
  hidden_preferences: string;
  initial_affinity: number;
  match_threshold: number;
  name: string;
  negative_signals: string;
  personality: string;
  positive_signals: string;
  public_profile: string;
  relationship_to_user: string;
  soft_preference_signals: string;
  speaking_style: string;
};

export type GuestPackageFields = {
  avatarObjectKey: string | null;
  boundaries: string;
  blowUpSignals: string[];
  dealbreakerSignals: string[];
  gender: CharacterGender;
  goal: string;
  hardPreferenceSignals: string[];
  hiddenPreferences: string;
  initialAffinity: number;
  matchThreshold: number;
  name: string;
  negativeSignals: string[];
  personality: string;
  positiveSignals: string[];
  publicProfile: Record<string, unknown>;
  relationshipToUser: string;
  softPreferenceSignals: string[];
  speakingStyle: string;
};

export type GuestPackageValidation = {
  errors: string[];
  package: GuestCharacterPackage;
};

const DEFAULT_RUNTIME_DEFAULTS: GuestRuntimeDefaults = {
  action: "idle",
  curiosity: 50,
  energy: 50,
  expression: "neutral",
  intimacy: 0,
  mood: "neutral",
};

const DEFAULT_MATCH_RULES: CharacterMatchRules = {
  blowUpSignals: ["honesty", "kindness"],
  dealbreakerSignals: ["aggression"],
  hardPreferenceSignals: [],
  initialAffinity: 50,
  matchThreshold: 75,
  negativeSignals: ["avoidance"],
  positiveSignals: ["honesty", "kindness"],
  softPreferenceSignals: ["honesty", "kindness"],
};

export function guestPackageFromRow(row: GuestPackageRowLike): GuestCharacterPackage {
  const publicProfile = readJsonObject(row.public_profile);
  const fallback = deriveGuestPackageFromRow(row, publicProfile);
  const existingPackage = publicProfile.characterPackage;
  return validateGuestCharacterPackage(existingPackage, fallback).package;
}

export function validateGuestCharacterPackage(
  value: unknown,
  fallback: GuestCharacterPackage = emptyGuestPackage(),
): GuestPackageValidation {
  const source = isRecord(value) ? value : {};
  const errors: string[] = [];

  const identitySource = recordAt(source, "identity");
  const assetsSource = recordAt(source, "assets");
  const personaSource = recordAt(source, "persona");
  const stateSource = recordAt(source, "stateModel");
  const rulesSource = recordAt(source, "matchRules");
  const publicProfileSource = recordAt(source, "publicProfile");
  const strictValidation = fallback.identity.name === "";

  if (strictValidation && source.assets === undefined) {
    errors.push("assets is required");
  } else if (source.assets !== undefined && !isRecord(source.assets)) {
    errors.push("assets must be an object");
  }

  const name = readRequiredString(identitySource.name, fallback.identity.name, "identity.name", errors);
  const gender = identitySource.gender === "female" || identitySource.gender === "male"
    ? identitySource.gender
    : fallback.identity.gender;
  if (identitySource.gender !== undefined && identitySource.gender !== null && gender !== identitySource.gender) {
    errors.push("identity.gender must be female, male, or null");
  }

  const assets = normalizeAssets(assetsSource, fallback.assets, errors);
  const persona = normalizePersona(personaSource, fallback.persona, errors);
  const stateModel = normalizeStateModel(stateSource, fallback.stateModel, errors);
  const matchRules = normalizeMatchRules(rulesSource, fallback.matchRules, errors);
  const publicProfile = {
    ...fallback.publicProfile,
    ...publicProfileSource,
  };

  const normalized: GuestCharacterPackage = {
    assets,
    identity: {
      ageRange: readOptionalString(identitySource.ageRange, fallback.identity.ageRange),
      cityOrLifestyle: readOptionalString(identitySource.cityOrLifestyle, fallback.identity.cityOrLifestyle),
      gender,
      hobbies: readStringList(identitySource.hobbies, 16).length
        ? readStringList(identitySource.hobbies, 16)
        : fallback.identity.hobbies,
      name,
      occupation: readOptionalString(identitySource.occupation, fallback.identity.occupation),
    },
    matchRules,
    persona,
    publicProfile,
    stateModel,
  };

  return {
    errors,
    package: normalized,
  };
}

export function guestPackageToCharacterFields(characterPackage: GuestCharacterPackage): GuestPackageFields {
  const publicProfile = {
    ...characterPackage.publicProfile,
    ageRange: characterPackage.identity.ageRange,
    characterPackage,
    cityOrLifestyle: characterPackage.identity.cityOrLifestyle,
    galleryObjectKeys: characterPackage.assets.galleryObjectKeys,
    hobbies: characterPackage.identity.hobbies,
    occupationTag: characterPackage.identity.occupation,
    portraitObjectKey: characterPackage.assets.portraitObjectKey,
  };

  return {
    avatarObjectKey: characterPackage.assets.avatarObjectKey,
    boundaries: characterPackage.persona.boundaries,
    blowUpSignals: characterPackage.matchRules.blowUpSignals,
    dealbreakerSignals: characterPackage.matchRules.dealbreakerSignals,
    gender: characterPackage.identity.gender,
    goal: characterPackage.persona.goal,
    hardPreferenceSignals: characterPackage.matchRules.hardPreferenceSignals,
    hiddenPreferences: characterPackage.persona.hiddenPreferences,
    initialAffinity: characterPackage.matchRules.initialAffinity,
    matchThreshold: characterPackage.matchRules.matchThreshold,
    name: characterPackage.identity.name,
    negativeSignals: characterPackage.matchRules.negativeSignals,
    personality: characterPackage.persona.personality,
    positiveSignals: characterPackage.matchRules.positiveSignals,
    publicProfile,
    relationshipToUser: characterPackage.persona.relationshipToUser,
    softPreferenceSignals: characterPackage.matchRules.softPreferenceSignals,
    speakingStyle: characterPackage.persona.speakingStyle,
  };
}

export function selectGuestVisualObjectKey(characterPackage: GuestCharacterPackage, stateKey?: string | null): string | null {
  const defaults = characterPackage.stateModel.runtimeDefaults;
  const candidates = [
    stateKey,
    `${defaults.mood}.${defaults.action}`,
    `${defaults.mood}.${defaults.expression}`,
    `${defaults.mood}.idle`,
    "neutral.idle",
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    const visual = characterPackage.assets.visualStates[candidate];
    if (visual?.objectKey) {
      return visual.objectKey;
    }
  }

  return characterPackage.assets.portraitObjectKey ?? characterPackage.assets.avatarObjectKey;
}

export function bindGuestAsset(
  characterPackage: GuestCharacterPackage,
  input: { objectKey: string; slot?: string | null; visualStateKey?: string | null },
): GuestCharacterPackage {
  const slot = input.slot ?? "visual_state";
  const objectKey = input.objectKey.trim();
  const nextPackage = structuredClone(characterPackage);

  if (slot === "avatar") {
    nextPackage.assets.avatarObjectKey = objectKey;
    return nextPackage;
  }

  if (slot === "portrait") {
    nextPackage.assets.portraitObjectKey = objectKey;
    return nextPackage;
  }

  if (slot === "gallery") {
    nextPackage.assets.galleryObjectKeys = [...new Set([...nextPackage.assets.galleryObjectKeys, objectKey])].slice(0, 24);
    return nextPackage;
  }

  const visualStateKey = input.visualStateKey?.trim() || "neutral.idle";
  nextPackage.assets.visualStates[visualStateKey] = {
    label: visualStateKey,
    objectKey,
  };
  return nextPackage;
}

function deriveGuestPackageFromRow(row: GuestPackageRowLike, publicProfile: Record<string, unknown>): GuestCharacterPackage {
  return {
    assets: {
      avatarObjectKey: row.avatar_object_key,
      galleryObjectKeys: readStringList(publicProfile.galleryObjectKeys, 24),
      portraitObjectKey: typeof publicProfile.portraitObjectKey === "string" ? publicProfile.portraitObjectKey : row.avatar_object_key,
      visualStates: normalizeVisualStates(recordAt(publicProfile, "visualStates")),
    },
    identity: {
      ageRange: typeof publicProfile.ageRange === "string" ? publicProfile.ageRange : undefined,
      cityOrLifestyle: typeof publicProfile.cityOrLifestyle === "string" ? publicProfile.cityOrLifestyle : undefined,
      gender: row.gender,
      hobbies: readStringList(publicProfile.hobbies, 16),
      name: row.name,
      occupation: typeof publicProfile.occupationTag === "string" ? publicProfile.occupationTag : undefined,
    },
    matchRules: {
      blowUpSignals: parseStringArray(row.blow_up_signals),
      dealbreakerSignals: parseStringArray(row.dealbreaker_signals),
      hardPreferenceSignals: parseStringArray(row.hard_preference_signals),
      initialAffinity: row.initial_affinity,
      matchThreshold: row.match_threshold,
      negativeSignals: parseStringArray(row.negative_signals),
      positiveSignals: parseStringArray(row.positive_signals),
      softPreferenceSignals: parseStringArray(row.soft_preference_signals),
    },
    persona: {
      backstory: typeof publicProfile.backstory === "string" ? publicProfile.backstory : undefined,
      boundaries: row.boundaries,
      goal: row.goal,
      hiddenPreferences: row.hidden_preferences,
      personality: row.personality,
      relationshipToUser: row.relationship_to_user,
      speakingStyle: row.speaking_style,
    },
    publicProfile,
    stateModel: {
      coefficients: normalizeCoefficients(recordAt(publicProfile, "stateCoefficients")),
      runtimeDefaults: normalizeRuntimeDefaults(recordAt(publicProfile, "runtimeDefaults"), DEFAULT_RUNTIME_DEFAULTS),
    },
  };
}

function emptyGuestPackage(): GuestCharacterPackage {
  return {
    assets: {
      avatarObjectKey: null,
      galleryObjectKeys: [],
      portraitObjectKey: null,
      visualStates: {},
    },
    identity: {
      gender: null,
      hobbies: [],
      name: "",
    },
    matchRules: DEFAULT_MATCH_RULES,
    persona: {
      boundaries: "Avoid disrespect, aggression, and dishonesty.",
      goal: "Discover whether the user matches this character's stated values.",
      hiddenPreferences: "",
      personality: "open, curious, emotionally present",
      relationshipToUser: "A user-created companion character for the opening story.",
      speakingStyle: "natural, concise, emotionally clear",
    },
    publicProfile: {},
    stateModel: {
      coefficients: {},
      runtimeDefaults: DEFAULT_RUNTIME_DEFAULTS,
    },
  };
}

function normalizeAssets(source: Record<string, unknown>, fallback: GuestPackageAssets, errors: string[]): GuestPackageAssets {
  if (!isRecord(source) && source !== undefined) {
    errors.push("assets must be an object");
  }

  return {
    avatarObjectKey: readNullableString(source.avatarObjectKey, fallback.avatarObjectKey),
    galleryObjectKeys: readStringList(source.galleryObjectKeys, 24).length
      ? readStringList(source.galleryObjectKeys, 24)
      : fallback.galleryObjectKeys,
    portraitObjectKey: readNullableString(source.portraitObjectKey, fallback.portraitObjectKey),
    visualStates: normalizeVisualStates(recordAt(source, "visualStates"), fallback.visualStates),
  };
}

function normalizePersona(source: Record<string, unknown>, fallback: CharacterPersona, errors: string[]): CharacterPersona {
  return {
    backstory: readOptionalString(source.backstory, fallback.backstory),
    boundaries: readRequiredString(source.boundaries, fallback.boundaries, "persona.boundaries", errors),
    goal: readRequiredString(source.goal, fallback.goal, "persona.goal", errors),
    hiddenPreferences: readOptionalString(source.hiddenPreferences, fallback.hiddenPreferences) ?? "",
    personality: readRequiredString(source.personality, fallback.personality, "persona.personality", errors),
    relationshipToUser: readRequiredString(
      source.relationshipToUser,
      fallback.relationshipToUser,
      "persona.relationshipToUser",
      errors,
    ),
    speakingStyle: readRequiredString(source.speakingStyle, fallback.speakingStyle, "persona.speakingStyle", errors),
  };
}

function normalizeStateModel(source: Record<string, unknown>, fallback: GuestStateModel, errors: string[]): GuestStateModel {
  if (!isRecord(source) && source !== undefined) {
    errors.push("stateModel must be an object");
  }

  return {
    coefficients: normalizeCoefficients(recordAt(source, "coefficients"), fallback.coefficients),
    runtimeDefaults: normalizeRuntimeDefaults(recordAt(source, "runtimeDefaults"), fallback.runtimeDefaults),
  };
}

function normalizeMatchRules(source: Record<string, unknown>, fallback: CharacterMatchRules, errors: string[]): CharacterMatchRules {
  const positiveSignals = readRuleList(source.positiveSignals, fallback.positiveSignals, "matchRules.positiveSignals", errors);
  const negativeSignals = readRuleList(source.negativeSignals, fallback.negativeSignals, "matchRules.negativeSignals", errors);
  const dealbreakerSignals = readRuleList(
    source.dealbreakerSignals,
    fallback.dealbreakerSignals,
    "matchRules.dealbreakerSignals",
    errors,
  );

  return {
    blowUpSignals: readRuleList(source.blowUpSignals, fallback.blowUpSignals, "matchRules.blowUpSignals", errors),
    dealbreakerSignals,
    hardPreferenceSignals: readRuleList(
      source.hardPreferenceSignals,
      fallback.hardPreferenceSignals,
      "matchRules.hardPreferenceSignals",
      errors,
    ),
    initialAffinity: readNumber(source.initialAffinity, fallback.initialAffinity, 0, 100),
    matchThreshold: readNumber(source.matchThreshold, fallback.matchThreshold, 0, 100),
    negativeSignals,
    positiveSignals,
    softPreferenceSignals: readRuleList(
      source.softPreferenceSignals,
      fallback.softPreferenceSignals,
      "matchRules.softPreferenceSignals",
      errors,
    ),
  };
}

function normalizeRuntimeDefaults(source: Record<string, unknown>, fallback: GuestRuntimeDefaults): GuestRuntimeDefaults {
  return {
    action: readOptionalString(source.action, fallback.action) ?? "idle",
    curiosity: readNumber(source.curiosity, fallback.curiosity, 0, 100),
    energy: readNumber(source.energy, fallback.energy, 0, 100),
    expression: readOptionalString(source.expression, fallback.expression) ?? "neutral",
    intimacy: readNumber(source.intimacy, fallback.intimacy, 0, 100),
    mood: readOptionalString(source.mood, fallback.mood) ?? "neutral",
  };
}

function normalizeVisualStates(
  source: Record<string, unknown>,
  fallback: Record<string, GuestVisualState> = {},
): Record<string, GuestVisualState> {
  const next: Record<string, GuestVisualState> = { ...fallback };

  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string" && value.trim()) {
      next[key] = { objectKey: value.trim() };
      continue;
    }

    if (isRecord(value) && typeof value.objectKey === "string" && value.objectKey.trim()) {
      next[key] = {
        label: typeof value.label === "string" ? value.label : key,
        objectKey: value.objectKey.trim(),
      };
    }
  }

  return next;
}

function normalizeCoefficients(
  source: Record<string, unknown>,
  fallback: Record<string, number> = {},
): Record<string, number> {
  const next: Record<string, number> = { ...fallback };

  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      next[key] = value;
    }
  }

  return next;
}

function readRuleList(value: unknown, fallback: string[], path: string, errors: string[]): string[] {
  if (value === undefined) {
    return fallback;
  }

  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return fallback;
  }

  return readStringList(value, 24);
}

function readRequiredString(value: unknown, fallback: string, path: string, errors: string[]): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (!fallback) {
    errors.push(`${path} is required`);
  }

  return fallback;
}

function readOptionalString(value: unknown, fallback?: string): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return fallback;
}

function readNullableString(value: unknown, fallback: string | null): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return fallback;
}

function readNumber(value: unknown, fallback: number, min: number, max: number): number {
  const next = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, Math.round(next)));
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return readStringList(parsed, 24);
  } catch {
    return [];
  }
}

function recordAt(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = source[key];
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
