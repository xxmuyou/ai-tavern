import { describe, expect, it } from "vitest";

import { createStreamingReplyNormalizer, normalizeChatReplyText } from "./reply-normalize";

describe("chat reply normalizer", () => {
  it("removes markdown blockquote markers at line starts", () => {
    expect(normalizeChatReplyText("<narration>x</narration>\n\n> 嗯。")).toBe("<narration>x</narration>\n\n嗯。");
  });

  it("preserves comparison operators inside a line", () => {
    expect(normalizeChatReplyText("I think 2 > 1, obviously.")).toBe("I think 2 > 1, obviously.");
  });

  it("removes a blockquote marker split across streamed chunks", () => {
    const normalizer = createStreamingReplyNormalizer();
    expect(normalizer.push("<narration>x</narration>\n\n ")).toBe("<narration>x</narration>\n\n");
    expect(normalizer.push("> 嗯。")).toBe("嗯。");
    expect(normalizer.flush()).toBe("");
  });
});
