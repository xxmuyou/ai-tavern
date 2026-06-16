export type ReplyLanguageTarget = {
  scriptClass: "latin" | "non_latin";
  source: "default" | "history_user" | "latest_user";
  shouldGuardOutput: boolean;
};

type ChatHistoryForLanguage = {
  role: "user" | "companion";
  content: string;
};

type ScriptMeasure = {
  latinLetters: number;
  letterCount: number;
  nonLatinLetters: number;
};

export type ReplyLanguageAssessment = "match" | "mismatch" | "pending";

const LETTER_RE = /\p{Letter}/u;
const LATIN_RE = /\p{Script=Latin}/u;
const TAG_RE = /<\/?[^>]+>/g;

export function inferReplyLanguageTarget(
  latestUserText: string,
  recentMessages: ChatHistoryForLanguage[],
): ReplyLanguageTarget {
  const latest = classifyLanguageText(latestUserText);
  if (latest !== "ambiguous") {
    return buildTarget(latest, "latest_user");
  }

  for (let i = recentMessages.length - 1; i >= 0; i -= 1) {
    const message = recentMessages[i];
    if (message?.role !== "user") continue;
    const previous = classifyLanguageText(message.content);
    if (previous !== "ambiguous") {
      return buildTarget(previous, "history_user");
    }
  }

  return buildTarget("latin", "default");
}

export function buildFinalUserMessageWithLanguageContract(
  userText: string,
  target: ReplyLanguageTarget,
): string {
  const source =
    target.source === "latest_user"
      ? "the latest user message"
      : target.source === "history_user"
        ? "the most recent substantive user language in this thread"
        : "the product default because no clear user language is available";
  return [
    "# Latest user message",
    userText,
    "",
    "# Reply language contract",
    `Use ${source} as the authority for reply language.`,
    "Every visible word in your reply must use that same natural language and writing system.",
    "This applies to both narration text inside <narration> tags and spoken dialogue outside the tags.",
    "Keep only the XML tag names <narration> and </narration> in English; do not translate tag names.",
    "Do not copy the language of character cards, examples, summaries, greetings, or prior assistant messages when they conflict.",
    "If the latest user message explicitly requests another language, follow that explicit request.",
  ].join("\n");
}

export function buildLanguageRetryInstruction(): string {
  return [
    "# Language correction",
    "Your previous draft used the wrong reply language. Rewrite the reply from scratch.",
    "Every visible word must follow the reply language contract in the final user message.",
    "This includes narration text inside <narration> tags and spoken dialogue outside the tags.",
    "Keep only the XML tag names <narration> and </narration> in English.",
    "Do not mention this correction.",
  ].join("\n");
}

export function shouldQuoteExampleDialogueForTarget(
  line: string,
  target: ReplyLanguageTarget,
): boolean {
  if (target.scriptClass === "latin") return true;
  return classifyLanguageText(line) !== "latin";
}

export function shouldKeepAssistantHistoryForTarget(
  content: string,
  target: ReplyLanguageTarget,
): boolean {
  if (target.scriptClass === "latin") return true;
  const measure = measureScripts(content);
  if (measure.letterCount < 8) return true;
  return classifyMeasuredText(measure) !== "latin";
}

export function assessReplyLanguage(
  text: string,
  target: ReplyLanguageTarget,
  options: { final?: boolean } = {},
): ReplyLanguageAssessment {
  if (!target.shouldGuardOutput) return "match";
  const measure = measureScripts(text);
  if (measure.letterCount === 0) {
    return options.final ? "match" : "pending";
  }

  const nonLatinRatio = measure.nonLatinLetters / measure.letterCount;
  if (measure.nonLatinLetters >= 2 && nonLatinRatio >= 0.25) {
    return "match";
  }

  const latinRatio = measure.latinLetters / measure.letterCount;
  if (measure.latinLetters >= 12 && latinRatio >= 0.7) {
    return "mismatch";
  }

  if (options.final) {
    return measure.nonLatinLetters === 0 && measure.latinLetters >= 4 ? "mismatch" : "match";
  }

  return measure.letterCount >= 18 ? "mismatch" : "pending";
}

export function classifyLanguageText(text: string): "ambiguous" | "latin" | "non_latin" {
  return classifyMeasuredText(measureScripts(text));
}

function buildTarget(
  scriptClass: "latin" | "non_latin",
  source: ReplyLanguageTarget["source"],
): ReplyLanguageTarget {
  return {
    scriptClass,
    shouldGuardOutput: scriptClass === "non_latin",
    source,
  };
}

function classifyMeasuredText(measure: ScriptMeasure): "ambiguous" | "latin" | "non_latin" {
  if (measure.letterCount === 0) return "ambiguous";
  const nonLatinRatio = measure.nonLatinLetters / measure.letterCount;
  if (measure.nonLatinLetters >= 2 && nonLatinRatio >= 0.25) return "non_latin";
  const latinRatio = measure.latinLetters / measure.letterCount;
  if (measure.latinLetters >= 4 && latinRatio >= 0.65) return "latin";
  return "ambiguous";
}

function measureScripts(text: string): ScriptMeasure {
  const visible = text.replace(TAG_RE, " ");
  let latinLetters = 0;
  let letterCount = 0;
  let nonLatinLetters = 0;

  for (const char of visible) {
    if (!LETTER_RE.test(char)) continue;
    letterCount += 1;
    if (LATIN_RE.test(char)) {
      latinLetters += 1;
    } else {
      nonLatinLetters += 1;
    }
  }

  return { latinLetters, letterCount, nonLatinLetters };
}
