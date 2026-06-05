import { llmCall, type LLMMessage } from "../llm";
import { ALL_DIMENSIONS, ZERO_DIMENSIONS, type DimensionValues } from "../relationships/level";

const SIGNAL_MIN = -3;
const SIGNAL_MAX = 3;

function clampToSchema(value: number): number {
  if (value < SIGNAL_MIN) return SIGNAL_MIN;
  if (value > SIGNAL_MAX) return SIGNAL_MAX;
  return Math.trunc(value);
}

export type Emotion = "warm" | "neutral" | "guarded" | "playful" | "tense" | "annoyed";

export type SignalExtractResult = {
  ok: boolean;
  signals: DimensionValues;
  emotion: Emotion;
  cost_usd: number;
};

const SIGNAL_SCHEMA: Record<string, unknown> = {
  additionalProperties: false,
  properties: {
    emotion: { enum: ["warm", "neutral", "guarded", "playful", "tense", "annoyed"], type: "string" },
    signals: {
      additionalProperties: false,
      properties: {
        closeness: { maximum: 3, minimum: -3, type: "integer" },
        distance: { maximum: 3, minimum: -3, type: "integer" },
        friendship: { maximum: 3, minimum: -3, type: "integer" },
        hostility: { maximum: 3, minimum: -3, type: "integer" },
        romance: { maximum: 3, minimum: -3, type: "integer" },
        tension: { maximum: 3, minimum: -3, type: "integer" },
        trust: { maximum: 3, minimum: -3, type: "integer" },
      },
      required: ["closeness", "trust", "romance", "friendship", "hostility", "tension", "distance"],
      type: "object",
    },
  },
  required: ["signals", "emotion"],
  type: "object",
};

const VALID_EMOTIONS: ReadonlySet<string> = new Set([
  "warm",
  "neutral",
  "guarded",
  "playful",
  "tense",
  "annoyed",
]);

const SIGNAL_SYSTEM_PROMPT =
  "You score a single roleplay exchange. Given the user's message, the companion's reply, and a short narrative summary of the relationship, output a single JSON object — no prose, no markdown — with this exact shape:\n" +
  "{\n" +
  "  \"signals\": {\n" +
  "    \"closeness\": integer -3..3,\n" +
  "    \"trust\": integer -3..3,\n" +
  "    \"romance\": integer -3..3,\n" +
  "    \"friendship\": integer -3..3,\n" +
  "    \"hostility\": integer -3..3,\n" +
  "    \"tension\": integer -3..3,\n" +
  "    \"distance\": integer -3..3\n" +
  "  },\n" +
  "  \"emotion\": one of \"warm\" | \"neutral\" | \"guarded\" | \"playful\" | \"tense\" | \"annoyed\"\n" +
  "}\n" +
  "All seven signal keys are required (use 0 when nothing changed). The emotion MUST be exactly one of the six lowercase enum values above — do not invent new labels (no \"angry\", \"happy\", \"frustrated\", etc.).\n" +
  "Scoring guidance: positive shifts = +1..+3, no shift = 0, negative = -1..-3. Direct insults, degrading language, physical threats, or repeated profanity should produce hostility/tension/distance increases and usually emotion \"annoyed\" unless the companion is clearly afraid, in which case use \"tense\". Hostile or cold reactions feed hostility/tension/distance. Be conservative on normal dimensions — most ordinary exchanges move them by 0 or ±1; reserve ±2/±3 for clearly emotional or abusive turns. Trust specifically: a turn where the user genuinely listens, remembers something about the companion, follows through, is considerate, or opens up should grant trust +1 (do not leave trust at 0 for every friendly turn) — reserve trust +2/+3 for clearly meaningful moments. Pick the emotion that best matches the companion's reply in this turn: warm for affectionate/supportive, playful for teasing/flirtatious, guarded for cautious/withdrawn, tense for anxious/conflicted, annoyed for irritated/hostile, neutral only when none clearly fits.";

export async function extractSignals(
  env: Env,
  args: {
    userText: string;
    companionReply: string;
    narrative: string;
    userId: string;
  },
): Promise<SignalExtractResult> {
  const messages: LLMMessage[] = [
    { content: SIGNAL_SYSTEM_PROMPT, role: "system" },
    { content: `Relationship narrative:\n${args.narrative}`, role: "system" },
    { content: args.userText, role: "user" },
    { content: args.companionReply, role: "assistant" },
  ];

  try {
    const response = await llmCall(
      env,
      {
        json_schema: SIGNAL_SCHEMA,
        max_tokens: 256,
        messages,
        task: "signal",
        temperature: 0,
      },
      { user_id: args.userId },
    );

    const parsed = parseSignalPayload(response.structured ?? response.text);
    if (!parsed) {
      return fallback(response.cost_usd);
    }
    return {
      cost_usd: response.cost_usd,
      emotion: parsed.emotion,
      ok: true,
      signals: parsed.signals,
    };
  } catch {
    return fallback(0);
  }
}

function fallback(costUsd: number): SignalExtractResult {
  return {
    cost_usd: costUsd,
    emotion: "neutral",
    ok: false,
    signals: { ...ZERO_DIMENSIONS },
  };
}

function parseSignalPayload(raw: unknown): { signals: DimensionValues; emotion: Emotion } | null {
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

  const emotionRaw = record.emotion;
  const emotion: Emotion = typeof emotionRaw === "string" && VALID_EMOTIONS.has(emotionRaw)
    ? (emotionRaw as Emotion)
    : "neutral";

  const signalsRaw = record.signals;
  if (!signalsRaw || typeof signalsRaw !== "object") return null;
  const signalsRec = signalsRaw as Record<string, unknown>;

  const signals: DimensionValues = { ...ZERO_DIMENSIONS };
  for (const dim of ALL_DIMENSIONS) {
    const value = signalsRec[dim];
    if (typeof value === "number" && Number.isFinite(value)) {
      signals[dim] = clampToSchema(value);
    }
  }

  return { emotion, signals };
}
