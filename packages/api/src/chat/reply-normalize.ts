const BLOCKQUOTE_LINE_START_RE = /(^|\n)[ \t]{0,3}>[ \t]?/g;

export function normalizeChatReplyText(text: string): string {
  return text.replace(BLOCKQUOTE_LINE_START_RE, "$1");
}

export type StreamingReplyNormalizer = {
  flush(): string;
  push(chunk: string): string;
};

export function createStreamingReplyNormalizer(): StreamingReplyNormalizer {
  let atLineStart = true;
  let pendingLineStartSpaces = "";
  let skipOneSpaceAfterMarker = false;

  const emitPendingSpaces = (): string => {
    const out = pendingLineStartSpaces;
    pendingLineStartSpaces = "";
    return out;
  };

  const pushOne = (char: string): string => {
    if (skipOneSpaceAfterMarker) {
      skipOneSpaceAfterMarker = false;
      if (char === " " || char === "\t") {
        return "";
      }
    }

    if (atLineStart) {
      if ((char === " " || char === "\t") && pendingLineStartSpaces.length < 3) {
        pendingLineStartSpaces += char;
        return "";
      }
      if (char === ">") {
        pendingLineStartSpaces = "";
        atLineStart = false;
        skipOneSpaceAfterMarker = true;
        return "";
      }

      const prefix = emitPendingSpaces();
      atLineStart = char === "\n";
      return prefix + char;
    }

    atLineStart = char === "\n";
    return char;
  };

  return {
    flush() {
      const out = emitPendingSpaces();
      skipOneSpaceAfterMarker = false;
      return out;
    },
    push(chunk: string) {
      let out = "";
      for (const char of chunk) {
        out += pushOne(char);
      }
      return out;
    },
  };
}
