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

  it("canonicalizes malformed narration-like tags", () => {
    expect(normalizeChatReplyText("<n narration>她笑了。</narration>早。")).toBe("<narration>她笑了。</narration>早。");
    expect(normalizeChatReplyText("<x narration>她笑了。</x narration>")).toBe("<narration>她笑了。</narration>");
    expect(normalizeChatReplyText("<y narrative>She pauses.</y narrative>")).toBe("<narration>She pauses.</narration>");
    expect(normalizeChatReplyText("< narrative >她笑了。</ narrative >")).toBe("<narration>她笑了。</narration>");
  });

  it("strips unknown XML-like tags while preserving their body text", () => {
    expect(normalizeChatReplyText("<stage>她笑了。</stage>早。")).toBe("她笑了。早。");
    expect(normalizeChatReplyText("<emotion warm>她笑了。</emotion>")).toBe("她笑了。");
  });

  it("preserves ordinary angle bracket text and oversized tags", () => {
    const longTag = `<${"x".repeat(120)}>`;
    expect(normalizeChatReplyText("2 < 3 and 4 > 1")).toBe("2 < 3 and 4 > 1");
    expect(normalizeChatReplyText(`Keep ${longTag} raw.`)).toBe(`Keep ${longTag} raw.`);
  });

  it("canonicalizes a malformed tag split across streamed chunks", () => {
    const normalizer = createStreamingReplyNormalizer();
    expect(normalizer.push("<n nar")).toBe("");
    expect(normalizer.push("ration>她笑了。</x nar")).toBe("<narration>她笑了。");
    expect(normalizer.push("rative>早。")).toBe("</narration>早。");
    expect(normalizer.flush()).toBe("");
  });

  it("does not hold ordinary comparisons until the whole reply finishes", () => {
    const normalizer = createStreamingReplyNormalizer();
    expect(normalizer.push("2 < ")).toBe("2 ");
    expect(normalizer.push("3")).toBe("< 3");
    expect(normalizer.push(" and 4 > 1")).toBe(" and 4 > 1");
  });
});
