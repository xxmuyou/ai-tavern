export type CharacterGender = "female" | "male" | null;
export type CharacterRole = "guest" | "host" | "support";
export type CharacterSource = "official" | "user";
export type LightState = "blow_up" | "off" | "on";

export type CharacterIdentity = {
  ageRange?: string;
  cityOrLifestyle?: string;
  gender: CharacterGender;
  name: string;
  occupation?: string;
};

export type CharacterAssets = {
  avatarObjectKey: string | null;
  galleryObjectKeys: string[];
  portraitObjectKey: string | null;
};

export type GuestVisualState = {
  label?: string;
  objectKey: string;
};

export type GuestPackageAssets = CharacterAssets & {
  visualStates: Record<string, GuestVisualState>;
};

export type CharacterPersona = {
  backstory?: string;
  boundaries: string;
  goal: string;
  hiddenPreferences: string;
  personality: string;
  relationshipToUser: string;
  speakingStyle: string;
};

export type CharacterMatchRules = {
  blowUpSignals: string[];
  dealbreakerSignals: string[];
  hardPreferenceSignals: string[];
  initialAffinity: number;
  matchThreshold: number;
  negativeSignals: string[];
  positiveSignals: string[];
  softPreferenceSignals: string[];
};

export type GuestRuntimeDefaults = {
  action: string;
  curiosity: number;
  energy: number;
  expression: string;
  intimacy: number;
  mood: string;
};

export type GuestStateModel = {
  coefficients: Record<string, number>;
  runtimeDefaults: GuestRuntimeDefaults;
};

export type GuestCharacterPackage = {
  assets: GuestPackageAssets;
  identity: CharacterIdentity & {
    hobbies: string[];
  };
  matchRules: CharacterMatchRules;
  persona: CharacterPersona;
  publicProfile: Record<string, unknown>;
  stateModel: GuestStateModel;
};

export type CharacterDefinition = {
  assets: CharacterAssets;
  characterKey: string;
  identity: CharacterIdentity;
  matchRules: CharacterMatchRules;
  ownerUserId: string | null;
  persona: CharacterPersona;
  publicProfile: Record<string, unknown>;
  role: CharacterRole;
  source: CharacterSource;
};

export type UserHardProfile = {
  ageRange: string;
  avatarObjectKey: string | null;
  hobbies: string[];
  occupation: string;
};

export type SignalExtraction = {
  dealbreakerSignals: string[];
  negativeSignals: string[];
  positiveSignals: string[];
};

export type SignalApplication = {
  characterKey: string;
  dealbreakerHits: number;
  dealbreakerTriggered: boolean;
  delta: number;
  name: string;
  negativeHits: number;
  nextAffinity: number;
  nextLightState: LightState;
  nextStrongSignalCount: number;
  positiveHits: number;
  previousLightState: LightState;
};

export type RuleGuestState = {
  affinityScore: number;
  blowUpSignals: string[];
  characterKey: string;
  dealbreakerSignals: string[];
  dealbreakerTriggered: boolean;
  lightState: LightState;
  name: string;
  negativeSignals: string[];
  positiveSignals: string[];
  strongSignalCount: number;
};

export type TurnOption = {
  id: string;
  label: string;
  preview: string;
  signalText: string;
};

export type TurnDraft = {
  options: TurnOption[];
  question: string;
  speakerKey: string;
  speakerName: string;
  stageKey: string;
};

export type StageDefinition = {
  allowedActions: string[];
  nextStageRuleKey: string;
  resolverKey: string;
  stageKey: string;
  turnBuilderKey: string;
};

export type ShowFlowDefinition = {
  initialStageKey: string;
  showKey: string;
  stages: StageDefinition[];
};

export type StageGuest = {
  affinityScore: number;
  characterKey: string;
  isAvailable: boolean;
  lightState: LightState;
  name: string;
};

export type StageSession = {
  initialPickCharacterKey: string | null;
  messageCount: number;
  userProfile: string;
};

export type CompanionStoryOption = {
  id: string;
  label: string;
  preview: string;
};

export type CompanionStoryScene = {
  options: CompanionStoryOption[];
  prompt: string;
  sceneTitle: string;
};

export type CompanionStoryDefinition = {
  scenes: CompanionStoryScene[];
};
