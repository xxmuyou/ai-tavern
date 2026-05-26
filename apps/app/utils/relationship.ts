import type { RelationshipGoal, RelationshipSummary } from '@/api/types';

export function relationshipGoalFromSummary(relationship: RelationshipSummary): RelationshipGoal {
  const hostile = relationship.dimensions.hostility > 45 || relationship.dimensions.distance > 55;
  const strained = relationship.dimensions.tension > 45;
  const stage = relationship.stage ?? (hostile ? 'hostile' : strained ? 'strained' : relationship.level.toLowerCase());
  const progress = relationship.stage_progress ?? Math.max(0.1, Math.min(0.95, (relationship.dimensions.closeness + relationship.dimensions.trust) / 200));

  return {
    label: relationship.next_goal ?? (hostile || strained ? 'Repair trust before pushing closer.' : 'Spend time together to deepen the bond.'),
    recommended_activity: relationship.recommended_activity ?? (hostile || strained ? 'repair' : 'hang_out'),
    stage,
    stage_progress: progress,
  };
}
