import { describe, expect, it } from "vitest";

import { createSSEStream, encodeSSEBlock } from "./sse";

describe("createSSEStream", () => {
  it("emits properly framed events ending with double newline", async () => {
    const sse = createSSEStream();
    expect(sse.response.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    expect(sse.response.headers.get("cache-control")).toBe("no-cache, no-transform");

    sse.writeEvent("chunk", { text: "Hi" });
    sse.writeEvent("chunk", { text: " there" });
    sse.writeEvent("done", { message_id: "abc" });
    sse.close();

    const body = await sse.response.text();
    expect(body).toContain(`event: chunk\ndata: {"text":"Hi"}\n\n`);
    expect(body).toContain(`event: chunk\ndata: {"text":" there"}\n\n`);
    expect(body).toContain(`event: done\ndata: {"message_id":"abc"}\n\n`);
  });

  it("close is idempotent", async () => {
    const sse = createSSEStream();
    sse.writeEvent("x", {});
    sse.close();
    sse.close();
    const body = await sse.response.text();
    expect(body).toContain(`event: x`);
  });

  it("writes after close are no-ops", async () => {
    const sse = createSSEStream();
    sse.close();
    sse.writeEvent("late", {});
    const body = await sse.response.text();
    expect(body).not.toContain("late");
  });
});

describe("encodeSSEBlock", () => {
  it("formats name + data correctly", () => {
    expect(encodeSSEBlock("ping", { v: 1 })).toBe(`event: ping\ndata: {"v":1}\n\n`);
  });
});
