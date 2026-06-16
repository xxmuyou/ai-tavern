const BLOCKQUOTE_LINE_START_RE = /(^|\n)[ \t]{0,3}>[ \t]?/g;
const COMPLETE_TAG_RE = /<[^>\n]{0,96}>/g;
const NARRATION_TAG_WORD_RE = /\bnarrat[a-z]*\b/i;
const XML_LIKE_TAG_RE = /^<\/?[A-Za-z][A-Za-z0-9_-]*(?:\s+[^>]*)?>$/;
const STREAMING_TAG_LIMIT = 96;

export function normalizeChatReplyText(text: string): string {
  return normalizeChatMarkupText(text.replace(BLOCKQUOTE_LINE_START_RE, "$1"));
}

export type StreamingReplyNormalizer = {
  flush(): string;
  push(chunk: string): string;
};

export function createStreamingReplyNormalizer(): StreamingReplyNormalizer {
  let atLineStart = true;
  let pendingLineStartSpaces = "";
  let skipOneSpaceAfterMarker = false;
  let pendingTag = "";

  const emitPendingSpaces = (): string => {
    const out = pendingLineStartSpaces;
    pendingLineStartSpaces = "";
    return out;
  };

  const pushBlockquoteOne = (char: string): string => {
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

  const releasePendingTag = (normalize: boolean): string => {
    const out = normalize ? normalizeChatMarkupTag(pendingTag) : pendingTag;
    pendingTag = "";
    return out;
  };

  const pushMarkupOne = (char: string): string => {
    if (pendingTag) {
      pendingTag += char;
      if (char === ">") {
        return releasePendingTag(true);
      }
      if (char === "\n" || pendingTag.length > STREAMING_TAG_LIMIT + 2) {
        return releasePendingTag(false);
      }
      if (!canStillBeTagPrefix(pendingTag)) {
        return releasePendingTag(false);
      }
      return "";
    }

    if (char === "<") {
      pendingTag = "<";
      return "";
    }
    return char;
  };

  return {
    flush() {
      const out = emitPendingSpaces() + pendingTag;
      pendingTag = "";
      skipOneSpaceAfterMarker = false;
      return out;
    },
    push(chunk: string) {
      let out = "";
      for (const char of chunk) {
        const blockquoteOut = pushBlockquoteOne(char);
        for (const normalizedChar of blockquoteOut) {
          out += pushMarkupOne(normalizedChar);
        }
      }
      return out;
    },
  };
}

function normalizeChatMarkupText(text: string): string {
  return text.replace(COMPLETE_TAG_RE, (tag) => normalizeChatMarkupTag(tag));
}

function normalizeChatMarkupTag(tag: string): string {
  if (!tag.startsWith("<") || !tag.endsWith(">")) {
    return tag;
  }

  const rawInner = tag.slice(1, -1);
  const trimmedInner = rawInner.trim();
  if (!trimmedInner) {
    return tag;
  }

  const isClosing = trimmedInner.startsWith("/");
  const tagBody = isClosing ? trimmedInner.slice(1).trim() : trimmedInner;
  if (NARRATION_TAG_WORD_RE.test(tagBody)) {
    return isClosing ? "</narration>" : "<narration>";
  }

  if (XML_LIKE_TAG_RE.test(tag)) {
    return "";
  }

  return tag;
}

function canStillBeTagPrefix(value: string): boolean {
  if (value.length <= 1) {
    return true;
  }
  const afterOpen = value.slice(1);
  const trimmed = afterOpen.trimStart();
  if (!trimmed) {
    return true;
  }
  const first = trimmed[0];
  if (!first) {
    return true;
  }
  if (first === "/") {
    const afterSlash = trimmed.slice(1).trimStart();
    if (!afterSlash) {
      return true;
    }
    return isAsciiLetter(afterSlash[0] ?? "");
  }
  return isAsciiLetter(first);
}

function isAsciiLetter(char: string): boolean {
  return /^[A-Za-z]$/.test(char);
}
