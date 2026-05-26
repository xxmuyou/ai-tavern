export const API_VERSION = "0.1.0";

export const CLOUD_BOUNDARY = {
  primaryRuntime: "Cloudflare Workers",
  primaryWeb: "Cloudflare Pages",
  primaryObjectStorage: "Cloudflare R2",
  primaryDatabase: "Cloudflare D1",
  primaryRealtimeState: "Cloudflare Durable Objects",
  primaryAsyncQueue: "Cloudflare Queues",
  backupObjectStorage: "AWS S3",
} as const;

export type HealthResponse = {
  ok: true;
  service: "xtbit-apps-api";
  version: string;
  environment: string;
};

export type RoomSnapshot = {
  roomId: string;
  eventCount: number;
  lastEventId: string | null;
  updatedAt: string;
};

export type RoomEventInput = {
  type: string;
  payload?: unknown;
};

// ============================================================
// Life Sim v1 (worktree A: feat/life-core) — shared enums
//
// Mirrored from packages/api/src/life/types.ts so the @xtbit/app frontend
// can import enums and response shapes without reaching into the api
// package. Keep these in sync with the api-side authoritative copy.
// ============================================================

export const TIME_SLOTS = ["morning", "afternoon", "evening", "night"] as const;
export type TimeSlot = (typeof TIME_SLOTS)[number];

export const MOODS = ["calm", "busy", "lonely", "playful", "guarded", "tired"] as const;
export type Mood = (typeof MOODS)[number];

export const AVAILABILITIES = ["available", "busy", "away"] as const;
export type Availability = (typeof AVAILABILITIES)[number];

export const ACTIVITY_TYPES = [
  "check_in",
  "hang_out",
  "invite",
  "date",
  "gift",
  "repair",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_STATUSES = ["active", "completed", "canceled"] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const MEMORY_TYPES = [
  "first_meeting",
  "first_hangout",
  "first_date",
  "gift_received",
  "confession",
  "repair",
  "anniversary",
] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

export const RELATIONSHIP_STAGES = [
  "first_contact",
  "familiar",
  "trusted",
  "close_friend",
  "romantic_tension",
  "dating",
  "committed",
  "strained",
  "hostile",
  "estranged",
] as const;
export type RelationshipStage = (typeof RELATIONSHIP_STAGES)[number];

export type LifeCityConfig = {
  name: string;
  tagline: string;
  description: string;
};

export type LifeRelationshipGoal = {
  description: string;
  target_dim: string;
  target_value: number;
};

export type LifeRecommendedActivity = {
  activity_type: ActivityType;
  reason: string;
};

export type LifeTodayRecommendation = {
  companion: { id: string; name: string; art_url: string | null; gender: string | null };
  scene: { id: string; name: string; mood: string };
  mood: Mood;
  availability: Availability;
  activity_hint: string;
  relationship_stage: RelationshipStage;
  stage_progress: number;
  next_goal: LifeRelationshipGoal | null;
  suggested_activity: LifeRecommendedActivity | null;
};

export type LifeTodayResponse = {
  city: LifeCityConfig;
  date_local: string;
  time_slot: TimeSlot;
  recommendations: LifeTodayRecommendation[];
};
