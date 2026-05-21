import type { DimensionValues } from "../relationships/level";
import { createConflictEvent } from "./create";
import { evaluateConflictTrigger } from "./engine";

export async function maybeCreateConflictEvent(args: {
  env: Env;
  userId: string;
  companionId: string;
  sceneId: string | null;
  signalsDelta: Partial<DimensionValues>;
  narrative: string;
  now: number;
}): Promise<void> {
  try {
    const candidate = await evaluateConflictTrigger(
      args.env,
      args.userId,
      args.companionId,
      args.sceneId,
      args.signalsDelta,
      args.now,
    );
    if (!candidate) return;
    await createConflictEvent(args.env, {
      candidate,
      narrative: args.narrative,
      now: args.now,
      userId: args.userId,
    });
  } catch (error) {
    console.warn(JSON.stringify({ error: String(error), message: "Failed to create conflict event" }));
  }
}
