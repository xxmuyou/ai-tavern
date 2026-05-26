// Memory album module — full implementation lives here. Activity completion
// hook (life/activity.ts -> memory-hooks.ts -> onActivityMemoryHook) lands
// here. See contracts.md for GET /memories shape.

import type { ActivityRecord, MemoryType } from "./types";
import { firstTimeMemoryType } from "./memory-hooks";

type ActivityHookInput = Pick<
  ActivityRecord,
  "id" | "user_id" | "companion_id" | "scene_id" | "activity_type" | "completed_at"
> & {
  daily_state_snapshot: string | ActivityRecord["daily_state_snapshot"];
};

// Stub: activity-driven memory creation. Implemented fully in A6 once the
// memories module is in place. Kept as a no-op now so A4 (activity) can
// commit independently — the activity row already records the event.
export async function onActivityMemoryHook(env: Env, activity: ActivityHookInput): Promise<void> {
  void env;
  void activity;
  // Implementation arrives in A6.
}

// Surface the helper so A4-level callers can pre-validate types.
export const memoryTypes: ReadonlyArray<MemoryType> = [
  "first_meeting",
  "first_hangout",
  "first_date",
  "gift_received",
  "confession",
  "repair",
  "anniversary",
];

void firstTimeMemoryType;
