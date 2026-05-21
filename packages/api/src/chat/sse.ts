export type SSEHandle = {
  response: Response;
  writeEvent(name: string, data: unknown): void;
  close(): void;
};

export function createSSEStream(): SSEHandle {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;

  const readable = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      closed = true;
    },
  });

  const response = new Response(readable, {
    headers: {
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
      "x-accel-buffering": "no",
    },
    status: 200,
  });

  function writeEvent(name: string, data: unknown): void {
    if (closed) return;
    const block = `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
    try {
      controller.enqueue(encoder.encode(block));
    } catch {
      closed = true;
    }
  }

  function close(): void {
    if (closed) return;
    closed = true;
    try {
      controller.close();
    } catch {
      // already closed
    }
  }

  return { close, response, writeEvent };
}

export function encodeSSEBlock(name: string, data: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}
