// spec-036: decide whether the companion accepted an in-chat invitation to go
// somewhere. Mirrors `signal-extract.ts`: a small, separate JSON-schema call
// run on the just-streamed reply. On any failure it returns `accepted: false`
// so a flaky classifier can never teleport the user against the character's
// will — the safe default is "stay put".

import { llmCall, type LLMMessage } from "../llm";

export type InviteResolution = {
  ok: boolean;
  accepted: boolean;
  reason: string;
};

const RESOLVE_SCHEMA: Record<string, unknown> = {
  additionalProperties: false,
  properties: {
    accepted: { type: "boolean" },
    reason: { type: "string" },
  },
  required: ["accepted", "reason"],
  type: "object",
};

const RESOLVE_SYSTEM_PROMPT =
  "You judge a single roleplay turn. The user has invited the character to go to a new location. " +
  "Given the invitation, the character's reply, and a short relationship summary, decide whether the character AGREED to go there now. " +
  "Output a single JSON object — no prose, no markdown — of the exact shape:\n" +
  '{ "accepted": boolean, "reason": string }\n' +
  "accepted = true ONLY if the reply clearly agrees to go to that place now (enthusiastically or reluctantly). " +
  "accepted = false if the character declines, deflects, stalls, sets a condition, changes the subject, or is offended by the invitation. " +
  "When in doubt, use false. Keep reason to one short clause.";

export async function resolveInvite(
  env: Env,
  args: {
    targetName: string;
    targetMood: string;
    userText: string;
    companionReply: string;
    narrative: string;
    userId: string;
  },
): Promise<InviteResolution> {
  const messages: LLMMessage[] = [
    { content: RESOLVE_SYSTEM_PROMPT, role: "system" },
    { content: `Relationship narrative:\n${args.narrative}`, role: "system" },
    {
      content: `The user invited the character to go to "${args.targetName}" (${args.targetMood}).\nUser's message: ${args.userText}`,
      role: "user",
    },
    { content: args.companionReply, role: "assistant" },
  ];

  try {
    const response = await llmCall(
      env,
      {
        json_schema: RESOLVE_SCHEMA,
        max_tokens: 128,
        messages,
        task: "signal",
        temperature: 0,
      },
      { user_id: args.userId },
    );

    const parsed = parsePayload(response.structured ?? response.text);
    if (!parsed) {
      return { accepted: false, ok: false, reason: "" };
    }
    return { accepted: parsed.accepted, ok: true, reason: parsed.reason };
  } catch {
    return { accepted: false, ok: false, reason: "" };
  }
}

function parsePayload(raw: unknown): { accepted: boolean; reason: string } | null {
  let payload: unknown = raw;
  if (typeof raw === "string") {
    try {
      payload = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.accepted !== "boolean") return null;
  const reason = typeof record.reason === "string" ? record.reason : "";
  return { accepted: record.accepted, reason };
}
