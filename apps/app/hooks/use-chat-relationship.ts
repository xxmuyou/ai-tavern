import { useCallback, useEffect, useMemo, useState } from 'react';

import { getRelationship } from '@/api/companion-client';
import type { RelationshipGoal, RelationshipResponse } from '@/api/types';
import { relationshipGoalFromSummary } from '@/utils/relationship';

export type UseChatRelationshipResult = {
  goal: RelationshipGoal | null;
  refresh: () => Promise<void>;
  relationship: RelationshipResponse | null;
};

/**
 * Loads the relationship summary for the chat HUD and exposes a manual refresh
 * so the screen can re-pull server truth after each completed turn. Failures
 * keep the previous value (the HUD just won't move) rather than tearing down
 * the conversation UI.
 */
export function useChatRelationship(companionId: string): UseChatRelationshipResult {
  const [relationship, setRelationship] = useState<RelationshipResponse | null>(null);

  const refresh = useCallback(async () => {
    if (!companionId) {
      return;
    }
    try {
      const next = await getRelationship(companionId);
      setRelationship(next);
    } catch {
      // Keep the prior summary; the HUD degrades gracefully.
    }
  }, [companionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const goal = useMemo(
    () => (relationship ? relationshipGoalFromSummary(relationship) : null),
    [relationship],
  );

  return { goal, refresh, relationship };
}
