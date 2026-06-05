import devConfig from "../../../../config/minimax-voices.dev.json";
import prodConfig from "../../../../config/minimax-voices.prod.json";

export type VoiceGenderHint = "female" | "male" | "neutral";
export type VoiceSpeedId = "slow" | "medium" | "fast";

export type MiniMaxVoiceOption = {
  id: string;
  label: string;
  language: string;
  language_label: string;
  gender_hint?: VoiceGenderHint;
};

export type MiniMaxVoiceSpeedPreset = {
  id: VoiceSpeedId;
  label: string;
  value: number;
};

export type MiniMaxVoiceConfig = {
  provider: "minimax";
  group_id: string;
  model: string;
  defaults: {
    female_voice_id: string;
    male_voice_id: string;
    speed: VoiceSpeedId;
  };
  speed_presets: MiniMaxVoiceSpeedPreset[];
  voices: MiniMaxVoiceOption[];
};

export type VoiceOptionsResponse = {
  provider: "minimax";
  defaults: MiniMaxVoiceConfig["defaults"];
  speed_presets: MiniMaxVoiceSpeedPreset[];
  voices: MiniMaxVoiceOption[];
};

type VoiceConfigEnv = { APP_ENV?: string };

const CONFIGS = {
  dev: devConfig as MiniMaxVoiceConfig,
  prod: prodConfig as MiniMaxVoiceConfig,
};

export function loadMiniMaxVoiceConfig(env: VoiceConfigEnv): MiniMaxVoiceConfig {
  return env.APP_ENV === "prod" ? CONFIGS.prod : CONFIGS.dev;
}

export function publicVoiceOptions(env: VoiceConfigEnv): VoiceOptionsResponse {
  const config = loadMiniMaxVoiceConfig(env);
  return {
    defaults: config.defaults,
    provider: config.provider,
    speed_presets: config.speed_presets,
    voices: config.voices,
  };
}

export function isValidVoiceId(env: VoiceConfigEnv, voiceId: string): boolean {
  return loadMiniMaxVoiceConfig(env).voices.some((voice) => voice.id === voiceId);
}

export function normalizeVoiceSpeed(raw: string | null | undefined): VoiceSpeedId | null {
  if (raw === "slow" || raw === "medium" || raw === "fast") return raw;
  return null;
}

export function defaultVoiceIdForGender(env: VoiceConfigEnv, gender: string | null): string {
  const defaults = loadMiniMaxVoiceConfig(env).defaults;
  return gender === "male" ? defaults.male_voice_id : defaults.female_voice_id;
}

export function defaultVoiceSpeed(env: VoiceConfigEnv): VoiceSpeedId {
  return loadMiniMaxVoiceConfig(env).defaults.speed;
}

export function speedValueForPreset(env: VoiceConfigEnv, preset: string | null): number {
  const config = loadMiniMaxVoiceConfig(env);
  const speed = normalizeVoiceSpeed(preset) ?? config.defaults.speed;
  return config.speed_presets.find((item) => item.id === speed)?.value ?? 1;
}
