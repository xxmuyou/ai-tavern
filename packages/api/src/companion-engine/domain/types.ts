export type DimensionValueType = "json" | "number" | "string" | "string_list";

export type DimensionDefinition = {
  appliesTo: "both" | "character" | "relationship";
  defaultValue: unknown;
  dimensionKey: string;
  label: string;
  maxValue: number | null;
  minValue: number | null;
  valueType: DimensionValueType;
};

export type CharacterCard = {
  assets: Record<string, unknown>;
  characterKey: string;
  dimensions: Record<string, unknown>;
  displayName: string;
  id: string;
  identity: Record<string, unknown>;
  persona: Record<string, unknown>;
  publicProfile: Record<string, unknown>;
  style: Record<string, unknown>;
  version: number;
};

export type RelationshipState = {
  dimensions: Record<string, number>;
  id: string;
};

export type SceneOption = {
  id: string;
  label: string;
  preview: string;
  relationshipEffects?: Record<string, number>;
  signals?: string[];
};

export type SceneStep = {
  isTerminal: boolean;
  options: SceneOption[];
  promptTemplate: string;
  sceneKey: string;
  stepKey: string;
  stepOrder: number;
};

export type RelationshipComputation = {
  deltas: Record<string, number>;
  memoryText: string;
  nextDimensions: Record<string, number>;
  signals: string[];
};
