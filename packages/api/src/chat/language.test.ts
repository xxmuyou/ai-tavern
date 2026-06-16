import { describe, expect, it } from "vitest";

import {
  assessReplyLanguage,
  classifyLanguageText,
  inferReplyLanguageTarget,
  shouldKeepAssistantHistoryForTarget,
  shouldQuoteExampleDialogueForTarget,
} from "./language";

describe("chat reply language helpers", () => {
  it.each([
    ["你今天怎么样？"],
    ["今日は何をしてる？"],
    ["오늘 뭐 해?"],
  ])("treats non-Latin user text as the same generic target", (text) => {
    const target = inferReplyLanguageTarget(text, []);
    expect(target).toMatchObject({
      scriptClass: "non_latin",
      shouldGuardOutput: true,
      source: "latest_user",
    });
  });

  it("uses recent substantive user language for short ambiguous text", () => {
    const target = inferReplyLanguageTarget("OK", [
      { content: "你好。", role: "user" },
      { content: "<narration>她点头。</narration>好。", role: "companion" },
    ]);
    expect(target).toMatchObject({ scriptClass: "non_latin", source: "history_user" });
  });

  it("defaults ambiguous text to Latin when no user language is clear", () => {
    expect(inferReplyLanguageTarget("OK", [])).toMatchObject({
      scriptClass: "latin",
      shouldGuardOutput: false,
      source: "default",
    });
  });

  it("does not classify by language-specific names", () => {
    expect(classifyLanguageText("你今天怎么样？")).toBe("non_latin");
    expect(classifyLanguageText("今日は何をしてる？")).toBe("non_latin");
    expect(classifyLanguageText("오늘 뭐 해?")).toBe("non_latin");
  });

  it("filters mismatched assistant history and example dialogue for non-Latin targets", () => {
    const target = inferReplyLanguageTarget("你好啊", []);
    expect(shouldKeepAssistantHistoryForTarget("Hello there. You came back.", target)).toBe(false);
    expect(shouldKeepAssistantHistoryForTarget("<narration>她抬头。</narration>你好。", target)).toBe(true);
    expect(shouldQuoteExampleDialogueForTarget("Oh, it's you again.", target)).toBe(false);
  });

  it("detects wrong-language reply openings before they stream", () => {
    const target = inferReplyLanguageTarget("你今天怎么样？", []);
    expect(assessReplyLanguage("<narration>Maya smiled at him.</narration>Hello there.", target, { final: true })).toBe("mismatch");
    expect(assessReplyLanguage("<narration>她抬头看向他。</narration>你好。", target)).toBe("match");
  });
});
