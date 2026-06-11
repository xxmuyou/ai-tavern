export type NarrationSegment = {
  text: string;
  type: 'dialogue' | 'narration';
};

const NARRATION_OPEN = '<narration>';
const NARRATION_CLOSE = '</narration>';
const ASTERISK_NARRATION_RE = /\*([^*\n][^*]*?)\*/g;

export function parseNarration(content: string, options: { tolerateUnclosed?: boolean } = {}): NarrationSegment[] {
  const tolerate = options.tolerateUnclosed ?? false;
  const segments: NarrationSegment[] = [];
  let cursor = 0;

  while (cursor < content.length) {
    const openIdx = content.indexOf(NARRATION_OPEN, cursor);
    const closeIdxBeforeOpen = content.indexOf(NARRATION_CLOSE, cursor);

    if (closeIdxBeforeOpen !== -1 && (openIdx === -1 || closeIdxBeforeOpen < openIdx)) {
      pushMixed(segments, content.slice(cursor, closeIdxBeforeOpen));

      const orphanTextStart = closeIdxBeforeOpen + NARRATION_CLOSE.length;
      const nextCloseIdx = content.indexOf(NARRATION_CLOSE, orphanTextStart);
      const nextOpenIdx = content.indexOf(NARRATION_OPEN, orphanTextStart);

      if (nextCloseIdx !== -1 && (nextOpenIdx === -1 || nextCloseIdx < nextOpenIdx)) {
        pushNarration(segments, content.slice(orphanTextStart, nextCloseIdx));
        cursor = nextCloseIdx + NARRATION_CLOSE.length;
      } else {
        cursor = orphanTextStart;
      }
      continue;
    }

    if (openIdx === -1) {
      pushMixed(segments, content.slice(cursor));
      break;
    }

    pushMixed(segments, content.slice(cursor, openIdx));

    const innerStart = openIdx + NARRATION_OPEN.length;
    const closeIdx = content.indexOf(NARRATION_CLOSE, innerStart);
    if (closeIdx === -1) {
      if (tolerate) {
        pushMixed(segments, content.slice(openIdx));
      } else {
        pushNarration(segments, content.slice(innerStart));
      }
      break;
    }

    pushNarration(segments, content.slice(innerStart, closeIdx));
    cursor = closeIdx + NARRATION_CLOSE.length;
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
  const trimmed = raw.replaceAll(NARRATION_CLOSE, '').replace(/^\s+|\s+$/g, '');
  if (trimmed.length === 0) return;
  out.push({ text: trimmed, type: 'dialogue' });
}

function pushNarration(out: NarrationSegment[], raw: string) {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return;
  out.push({ text: trimmed, type: 'narration' });
}
