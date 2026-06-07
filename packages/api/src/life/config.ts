// Runtime knobs for life-sim gameplay. Everything tunable that the rest of
// the worktree-A code reads goes here so we can change behaviour without
// chasing constants across files.

// Gift cooldown: a user can give the same companion at most one gift per
// this window. Defaults to 24 hours.
export const GIFT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// Chat quick gifts (coffee / flowers) are smaller than a full gift activity,
// but still need a cooldown so they cannot be spammed for relationship points.
export const QUICK_GIFT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

// Activity stage thresholds. Used by life/activity.ts when validating that a
// player has earned the right to attempt a given activity type.
export const ACTIVITY_THRESHOLDS = {
  // hang_out is open from familiar onwards.
  hang_out_min_closeness: 10,
  // invite requires some warmth.
  invite_min_closeness: 20,
  invite_min_trust: 20,
  // date is a romantic step and requires the romantic-tension stage entry.
  date_min_romance: 30,
  date_max_tension: 50,
  date_max_hostility: 50,
  date_max_distance: 60,
  // repair: only meaningful if something actually needs repair.
  repair_min_negative: 30,
} as const;

// Committed-stage decay parameters. Decay only fires when the relationship is
// in the `committed` stage AND the user has been silent for longer than the
// threshold. Speed numbers are per-day.
export const COMMITTED_DECAY = {
  threshold_ms: 7 * 24 * 60 * 60 * 1000, // 7 days of silence triggers decay
  romance_per_day: 0.5,
  trust_per_day: 0.25,
  closeness_per_day: 0.25,
} as const;

// Anniversary milestones, in days since first_met_at.
export const ANNIVERSARY_MILESTONES = [30, 100, 365] as const;
export type AnniversaryDays = (typeof ANNIVERSARY_MILESTONES)[number];

// Memory free-tier capacity. Pro is unlimited.
export const FREE_MEMORY_CAP = 20;

// Push: one notification per user per local day.
export const PUSH_DAILY_LIMIT = 1;
