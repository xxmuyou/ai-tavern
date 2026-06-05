import { NON_NEUTRAL_EMOTIONS, type NonNeutralEmotion } from "./types";

/**
 * Retired expression/pose prompts, keyed by gender × emotion (global, shared by all
 * companions). Admin-editable — admins adjust these to change how each emotion's
 * portrait pose looks. See [[immersion_redesign_2026-05]].
 */
export type ExpressionGender = "male" | "female";

export const EXPRESSION_GENDERS: readonly ExpressionGender[] = ["male", "female"];

export type ExpressionPromptRow = {
  gender: string;
  emotion: string;
  prompt: string;
  updated_at: number;
  updated_by: string | null;
};

export function isExpressionGender(value: unknown): value is ExpressionGender {
  return value === "male" || value === "female";
}

export function isNonNeutralEmotion(value: unknown): value is NonNeutralEmotion {
  return (
    typeof value === "string" &&
    (NON_NEUTRAL_EMOTIONS as readonly string[]).includes(value)
  );
}

/** Normalize a companion's nullable gender into an expression gender. */
export function toExpressionGender(gender: string | null | undefined): ExpressionGender {
  return gender === "male" ? "male" : "female";
}

/**
 * Look up the admin-configured pose/expression intent for a gender × emotion.
 * Returns null when no row exists so callers can fall back to a built-in default.
 */
export async function getExpressionPrompt(
  env: Env,
  gender: ExpressionGender,
  emotion: NonNeutralEmotion,
): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT prompt FROM expression_prompts WHERE gender = ? AND emotion = ?`,
  )
    .bind(gender, emotion)
    .first<{ prompt: string }>();
  const prompt = row?.prompt?.trim();
  return prompt ? prompt : null;
}

export async function listExpressionPrompts(env: Env): Promise<ExpressionPromptRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT gender, emotion, prompt, updated_at, updated_by
     FROM expression_prompts ORDER BY gender ASC, emotion ASC`,
  ).all<ExpressionPromptRow>();
  return results ?? [];
}

export async function upsertExpressionPrompt(
  env: Env,
  gender: ExpressionGender,
  emotion: NonNeutralEmotion,
  prompt: string,
  updatedBy: string,
): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO expression_prompts (gender, emotion, prompt, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(gender, emotion) DO UPDATE SET
       prompt = excluded.prompt,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`,
  )
    .bind(gender, emotion, prompt, now, updatedBy)
    .run();
}
