export type NarrationSegment = {
  text: string;
  type: 'dialogue' | 'narration';
};

const ASTERISK_NARRATION_RE = /\*([^*\n][^*]*?)\*/g;
// Tolerate malformed tags (extra spaces, partial) so `< narration>` style output
// never leaks into the bubble as literal text.
const NARRATION_TAG_RE = /<\s*\/?\s*narrat[a-z]*\s*>?/gi;
const NARRATION_TAG_SCAN_RE = /<\s*(\/?)\s*narrat[a-z]*\s*>/gi;
const BLOCKQUOTE_LINE_START_RE = /(^|\n)[ \t]{0,3}>[ \t]?/g;
const COMPLETE_TAG_RE = /<[^>\n]{0,96}>/g;
const NARRATION_TAG_WORD_RE = /\bnarrat[a-z]*\b/i;
const XML_LIKE_TAG_RE = /^<\/?[A-Za-z][A-Za-z0-9_-]*(?:\s+[^>]*)?>$/;

export function normalizeChatDisplayText(content: string): string {
  return content
    .replace(BLOCKQUOTE_LINE_START_RE, '$1')
    .replace(COMPLETE_TAG_RE, (tag) => normalizeChatDisplayTag(tag));
}

export function parseNarration(content: string, options: { tolerateUnclosed?: boolean } = {}): NarrationSegment[] {
  const tolerate = options.tolerateUnclosed ?? false;
  const segments: NarrationSegment[] = [];
  let cursor = 0;
  let narrationStart: number | null = null;
  NARRATION_TAG_SCAN_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = NARRATION_TAG_SCAN_RE.exec(content))) {
    const tagStart = match.index;
    const tagEnd = NARRATION_TAG_SCAN_RE.lastIndex;
    const isClose = match[1] === '/';

    if (isClose) {
      if (narrationStart === null) {
        pushMixed(segments, content.slice(cursor, tagStart));
      } else {
        pushNarration(segments, content.slice(narrationStart, tagStart));
        narrationStart = null;
      }
      cursor = tagEnd;
      continue;
    }

    if (narrationStart === null) {
      pushMixed(segments, content.slice(cursor, tagStart));
    } else {
      pushNarration(segments, content.slice(narrationStart, tagStart));
    }
    narrationStart = tagEnd;
    cursor = tagEnd;
  }

  if (narrationStart !== null) {
    const rest = content.slice(narrationStart);
    if (tolerate || rest.trim().length > 0) {
      pushNarration(segments, rest);
    }
  } else if (cursor < content.length) {
    pushMixed(segments, content.slice(cursor));
  }

  return segments;
}

export function normalizeCompanionNarrationPerspective(text: string, companionName?: string | null) {
  const name = companionName?.trim();
  if (!name) {
    return text;
  }

  return text
    .replace(/(^|[\s"'“‘（(，,。.!！?？；;：:])我们/g, '$1两人')
    .replace(/(^|[\s"'“‘（(，,。.!！?？；;：:])我/g, `$1${name}`)
    .replace(/(^|[\s"'“‘（(，,。.!！?？；;：:])my\b/gi, `$1${name}'s`)
    .replace(/(^|[\s"'“‘（(，,。.!！?？；;：:])I\b/g, `$1${name}`);
}

// Markdown-italic fallback: many LLMs ignore <narration> instructions and use *...* for actions.
function pushMixed(out: NarrationSegment[], raw: string) {
  if (!raw) return;
  ASTERISK_NARRATION_RE.lastIndex = 0;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = ASTERISK_NARRATION_RE.exec(raw))) {
    if (match.index > last) {
      pushDialogue(out, raw.slice(last, match.index));
    }
    pushNarration(out, match[1] ?? '');
    last = match.index + match[0].length;
  }
  if (last < raw.length) {
    pushDialogue(out, raw.slice(last));
  }
}

function pushDialogue(out: NarrationSegment[], raw: string) {
  // Trim *all* leading/trailing whitespace, newlines included. Models often put
  // blank lines between sentences and around <narration> tags; if those stay in
  // the dialogue segment the bubble renders taller than its visible text.
  // Internal newlines (a genuinely multi-line line) are preserved.
  const trimmed = raw
    .replace(NARRATION_TAG_RE, '')
    .replace(/^\s+|\s+$/g, '');
  if (trimmed.length === 0) return;

  for (const part of splitDialogueCandidates(trimmed)) {
    if (looksLikeNarration(part)) {
      out.push({ text: part, type: 'narration' });
    } else {
      out.push({ text: part, type: 'dialogue' });
    }
  }
}

function pushNarration(out: NarrationSegment[], raw: string) {
  const trimmed = raw.replace(NARRATION_TAG_RE, '').trim();
  if (trimmed.length === 0) return;
  out.push({ text: trimmed, type: 'narration' });
}

function splitDialogueCandidates(raw: string): string[] {
  return raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);
}

// Narration is recognised by explicit markers ONLY — `<narration>` tags,
// `*asterisks*` (handled in pushMixed), or a fully parenthesised line. We do NOT
// guess from sentence shape: the old subject+verb heuristic wrongly turned
// ordinary dialogue like "You always make me smile." into centred narration.
function looksLikeNarration(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/<\s*\/?\s*narrat/i.test(trimmed)) return true;
  if (/^[(（].+[)）]$/.test(trimmed)) return true;
  return false;
}

function normalizeChatDisplayTag(tag: string): string {
  if (!tag.startsWith('<') || !tag.endsWith('>')) {
    return tag;
  }

  const inner = tag.slice(1, -1).trim();
  if (!inner) {
    return tag;
  }

  const isClosing = inner.startsWith('/');
  const body = isClosing ? inner.slice(1).trim() : inner;
  if (NARRATION_TAG_WORD_RE.test(body)) {
    return isClosing ? '</narration>' : '<narration>';
  }

  if (XML_LIKE_TAG_RE.test(tag)) {
    return '';
  }

  return tag;
}
