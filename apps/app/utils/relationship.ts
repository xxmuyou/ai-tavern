import type { ActivityType, RecommendedActivityWire, RelationshipGoal, RelationshipNextGoalWire, RelationshipSummary } from '@/api/types';

const ACTIVITY_TYPES: ReadonlySet<ActivityType> = new Set([
  'check_in',
  'date',
  'gift',
  'hang_out',
  'invite',
  'repair',
]);

function normalizeGoalLabel(value: RelationshipNextGoalWire | null | undefined, fallback: string): string {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  if (value && typeof value === 'object' && typeof value.description === 'string' && value.description.trim()) {
    return value.description;
  }
  return fallback;
}

function normalizeRecommendedActivity(
  value: RecommendedActivityWire | null | undefined,
  fallback: ActivityType,
): ActivityType {
  if (typeof value === 'string' && ACTIVITY_TYPES.has(value as ActivityType)) {
    return value as ActivityType;
  }
  const activityType = value && typeof value === 'object' ? value.activity_type : null;
  if (typeof activityType === 'string' && ACTIVITY_TYPES.has(activityType as ActivityType)) {
    return activityType as ActivityType;
  }
  return fallback;
}

export function relationshipGoalFromSummary(relationship: RelationshipSummary): RelationshipGoal {
  const hostile = relationship.dimensions.hostility > 45 || relationship.dimensions.distance > 55;
  const strained = relationship.dimensions.tension > 45;
  const stage = relationship.stage ?? (hostile ? 'hostile' : strained ? 'strained' : relationship.level.toLowerCase());
  const progress = relationship.stage_progress ?? Math.max(0.1, Math.min(0.95, (relationship.dimensions.closeness + relationship.dimensions.trust) / 200));
  const fallbackLabel = hostile || strained ? 'Repair trust before pushing closer.' : 'Spend time together to deepen the bond.';
  const fallbackActivity = hostile || strained ? 'repair' : 'hang_out';

  return {
    label: normalizeGoalLabel(relationship.next_goal, fallbackLabel),
    recommended_activity: normalizeRecommendedActivity(relationship.recommended_activity, fallbackActivity),
    stage,
    stage_progress: progress,
  };
}
