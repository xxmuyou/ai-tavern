import type { ActivityType, Availability, RelationshipGoal, StoryBeat } from '@/api/types';

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  check_in: 'Check in',
  date: 'Date',
  gift: 'Gift',
  hang_out: 'Hang out',
  invite: 'Invite',
  repair: 'Repair',
};

const ACTIVITY_COPY: Record<ActivityType, string> = {
  check_in: 'Open with a low-pressure check-in.',
  date: 'Ask for a focused date moment.',
  gift: 'Mark the moment with a small gift.',
  hang_out: 'Spend time together and let the bond move.',
  invite: 'Invite them into another shared moment.',
  repair: 'Slow down and repair the tension first.',
};

const DEFAULT_ACTIVITY: ActivityType = 'hang_out';

export type GuidedAction = {
  activityType: ActivityType | null;
  body: string;
  canStartActivity: boolean;
  label: string;
  source: 'story' | 'relationship' | 'daily' | 'unavailable';
  statusLabel: string;
  title: string;
};

export type GuidedActionInput = {
  activityHint?: string | null;
  availability?: Availability | null;
  goal?: RelationshipGoal | null;
  recommended?: ActivityType | null;
  storyBeat?: StoryBeat | null;
};

export function activityLabel(type?: ActivityType | null): string {
  return type ? ACTIVITY_LABELS[type] : 'Activity';
}

export function prettyStage(stage: string): string {
  return stage
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function deriveGuidedAction({
  activityHint,
  availability = 'available',
  goal,
  recommended,
  storyBeat,
}: GuidedActionInput): GuidedAction {
  const fallbackActivity = recommended ?? goal?.recommended_activity ?? DEFAULT_ACTIVITY;
  const unavailable = availability === 'away';

  if (unavailable) {
    return {
      activityType: null,
      body: 'They are away right now. Check their profile or come back through another scene later.',
      canStartActivity: false,
      label: 'View profile',
      source: 'unavailable',
      statusLabel: 'Away',
      title: 'Not available now',
    };
  }

  if (storyBeat?.status === 'active') {
    return {
      activityType: fallbackActivity,
      body: storyBeat.objective || storyBeat.opener || 'Continue the current story moment.',
      canStartActivity: true,
      label: 'Continue story',
      source: 'story',
      statusLabel: `Story beat ${storyBeat.beat_order}`,
      title: storyBeat.title,
    };
  }

  if (storyBeat?.status === 'waiting_stage') {
    const activityType = goal?.recommended_activity ?? fallbackActivity;
    return {
      activityType,
      body:
        goal?.label ||
        `Reach ${prettyStage(storyBeat.stage_gate)} before this story can move forward.`,
      canStartActivity: true,
      label: activityLabel(activityType),
      source: 'relationship',
      statusLabel: `Reach ${prettyStage(storyBeat.stage_gate)}`,
      title: 'Build the relationship first',
    };
  }

  if (goal) {
    const activityType = goal.recommended_activity ?? fallbackActivity;
    return {
      activityType,
      body: goal.label,
      canStartActivity: true,
      label: activityLabel(activityType),
      source: 'relationship',
      statusLabel: prettyStage(goal.stage),
      title: 'Next relationship step',
    };
  }

  return {
    activityType: fallbackActivity,
    body: activityHint || ACTIVITY_COPY[fallbackActivity],
    canStartActivity: true,
    label: activityLabel(fallbackActivity),
    source: 'daily',
    statusLabel: 'Today',
    title: 'Spend time together',
  };
}

