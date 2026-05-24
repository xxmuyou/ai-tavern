import type { DimensionValues } from "../relationships/level";
import type { Emotion, SignalExtractResult } from "./signal-extract";

type HostilitySeverity = "none" | "medium" | "severe";

export type HostilityAssessment = {
  emotion: Emotion | null;
  severity: HostilitySeverity;
  signals: Partial<DimensionValues>;
  triggerConflict: boolean;
};

const SEVERE_PATTERNS: RegExp[] = [
  /操你妈|草泥马|肏你妈|艹你妈|妈逼|傻逼|煞笔|sb\b/i,
  /弄死你|杀了你|打死你|干死你|去死|死全家/i,
  /\b(kill|murder|beat|punch|fight|fuck you|motherfucker|bitch|asshole)\b/i,
];

const MEDIUM_PATTERNS: RegExp[] = [
  /垃圾|废物|滚|闭嘴|单挑|打架|出拳|左拳|右拳|口水/i,
  /\b(idiot|stupid|trash|shut up|loser|moron|dumb)\b/i,
];

export function assessHostileInput(text: string): HostilityAssessment {
  const normalized = text.trim();
  if (!normalized) {
    return none();
  }

  const severeHits = countMatches(normalized, SEVERE_PATTERNS);
  const mediumHits = countMatches(normalized, MEDIUM_PATTERNS);

  if (severeHits > 0 || mediumHits >= 2) {
    return {
      emotion: "annoyed",
      severity: "severe",
      signals: {
        closeness: -2,
        distance: 2,
        friendship: -2,
        hostility: 3,
        romance: -2,
        tension: 2,
        trust: -2,
      },
      triggerConflict: true,
    };
  }

  if (mediumHits > 0) {
    return {
      emotion: "annoyed",
      severity: "medium",
      signals: {
        closeness: -1,
        distance: 1,
        friendship: -1,
        hostility: 2,
        romance: -1,
        tension: 1,
        trust: -1,
      },
      triggerConflict: true,
    };
  }

  return none();
}

export function applyHostilityOverride(
  result: SignalExtractResult,
  assessment: HostilityAssessment,
): SignalExtractResult {
  if (assessment.severity === "none") {
    return result;
  }

  return {
    ...result,
    emotion: assessment.emotion ?? result.emotion,
    ok: true,
    signals: mergeSignals(result.signals, assessment.signals),
  };
}

function mergeSignals(base: DimensionValues, override: Partial<DimensionValues>): DimensionValues {
  return {
    closeness: Math.min(base.closeness, override.closeness ?? base.closeness),
    distance: Math.max(base.distance, override.distance ?? base.distance),
    friendship: Math.min(base.friendship, override.friendship ?? base.friendship),
    hostility: Math.max(base.hostility, override.hostility ?? base.hostility),
    romance: Math.min(base.romance, override.romance ?? base.romance),
    tension: Math.max(base.tension, override.tension ?? base.tension),
    trust: Math.min(base.trust, override.trust ?? base.trust),
  };
}

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function none(): HostilityAssessment {
  return {
    emotion: null,
    severity: "none",
    signals: {},
    triggerConflict: false,
  };
}
