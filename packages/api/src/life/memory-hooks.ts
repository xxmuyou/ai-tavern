import type { ActivityRecord, ActivityType, MemoryType } from "./types";

// Activity completion -> memory hook. Filled out in A6 (memory module).
// Lives in its own file so life/activity.ts can call it without a circular
// import once memory.ts is wired up.

type ActivityCompletedInput = Pick<
  ActivityRecord,
  "id" | "user_id" | "companion_id" | "scene_id" | "activity_type" | "completed_at" | "metadata"
> & {
  daily_state_snapshot: string | ActivityRecord["daily_state_snapshot"];
};

export async function onActivityCompleted(env: Env, activity: ActivityCompletedInput): Promise<void> {
  const { onActivityMemoryHook } = await import("./memory");
  await onActivityMemoryHook(env, activity);
}

// Mapping from activity types to the milestone they can generate the first
// time they happen. Returning null means the activity does not produce a
// first-time memory (e.g. check_in).
export function firstTimeMemoryType(at: ActivityType): MemoryType | null {
  switch (at) {
    case "hang_out": return "first_hangout";
    case "date": return "first_date";
    case "gift": return "gift_received";
    case "repair": return "repair";
    default: return null;
  }
}
