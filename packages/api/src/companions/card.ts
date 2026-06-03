// Tavern / Character Card V2 import + export mapping.
// We support the de-facto "chara_card_v2" JSON shape (the same fields SillyTavern
// and chub.ai use), so users can bring existing characters in and take theirs out.
// PNG-embedded cards are out of scope for now; callers pass the JSON directly.

export type CardData = Record<string, unknown>;

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function applyPlaceholders(text: string, charName: string): string {
  return text.replace(/\{\{char\}\}/gi, charName).replace(/\{\{user\}\}/gi, "you");
}

/**
 * Pull the character fields out of a card. V2/V3 cards nest them under `data`;
 * some bare exports put them at the top level.
 */
export function extractCardData(raw: unknown): CardData | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
    return obj.data as CardData;
  }
  if (typeof obj.name === "string") return obj;
  return null;
}

/**
 * Turn a card's `mes_example` block into individual voice-anchor lines. Prefers
 * the {{char}} lines; falls back to every non-marker line.
 */
export function parseCardExamples(mesExample: unknown, charName: string): string[] {
  if (typeof mesExample !== "string" || !mesExample.trim()) return [];
  const lines = mesExample
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.toUpperCase() !== "<START>");
  const charLines = lines
    .filter((line) => /^\{\{char\}\}\s*:/i.test(line))
    .map((line) => line.replace(/^\{\{char\}\}\s*:\s*/i, ""));
  const chosen = charLines.length > 0 ? charLines : lines;
  return chosen.map((line) => applyPlaceholders(line, charName)).slice(0, 16);
}

/**
 * Map card data to the raw companion-create input shape. Returns null when the
 * card has no usable name. Art and gender are not in the card spec, so gender is
 * supplied by the caller and art is left for the user to add afterwards.
 */
export function mapCardToCompanionInput(
  data: CardData,
  gender: "male" | "female",
): Record<string, unknown> | null {
  const name = str(data.name);
  if (!name) return null;

  const personality = str(data.personality);
  const description = str(data.description);
  const scenario = str(data.scenario);
  const background = [description, scenario].filter(Boolean).join("\n\n") || undefined;
  const greeting = str(data.first_mes);
  const tags = Array.isArray(data.tags)
    ? data.tags.filter((t): t is string => typeof t === "string" && t.trim().length > 0).slice(0, 16)
    : undefined;

  return {
    background: background ? applyPlaceholders(background, name) : undefined,
    example_dialogues: parseCardExamples(data.mes_example, name),
    gender,
    greeting: greeting ? applyPlaceholders(greeting, name) : undefined,
    name,
    personality: personality ? applyPlaceholders(personality, name) : undefined,
    tags,
  };
}

export type CompanionCardFields = {
  name: string;
  personality: string | null;
  background: string | null;
  greeting: string | null;
  example_dialogues: string[];
  tags: string[];
};

export function companionToCard(fields: CompanionCardFields): Record<string, unknown> {
  return {
    data: {
      alternate_greetings: [],
      character_version: "1.0",
      creator: "",
      creator_notes: "",
      description: fields.background ?? "",
      extensions: {},
      first_mes: fields.greeting ?? "",
      mes_example: fields.example_dialogues.map((line) => `{{char}}: ${line}`).join("\n"),
      name: fields.name,
      personality: fields.personality ?? "",
      post_history_instructions: "",
      scenario: "",
      system_prompt: "",
      tags: fields.tags,
    },
    spec: "chara_card_v2",
    spec_version: "2.0",
  };
}
