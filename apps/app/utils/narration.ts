export type NarrationSegment = {
  text: string;
  type: 'dialogue' | 'narration';
};

const NARRATION_OPEN = '<narration>';
const NARRATION_CLOSE = '</narration>';
const ASTERISK_NARRATION_RE = /\*([^*\n][^*]*?)\*/g;
const ACTION_VERB_RE =
  /(lean|smil|look|glanc|blink|breath|laugh|pause|nod|shrug|turn|walk|step|sit|stand|reach|touch|hold|tilt|lower|raise|watch|stare|freeze|frown|grin|whisper|sigh|push|pull|set|place|rest|press|thread|grip|trembl|hesitat|停|走|站|坐|看|望|笑|眨|皱|抬|低|转|推|拉|伸|靠|贴|握|抓|放|拿|递|碰|摸|抱|躲|顿|沉默|呼吸|喘|咬|眯|垂|挑|点头|摇头|回头|侧身|靠近|退后)/i;
const ACTION_SUBJECT_RE =
  /^((?:[A-Z][A-Za-z0-9_-]{1,30})|he|she|they|his|her|their|我|她|他|TA|ta|两人|对方|这个人|那个人)\b|^(我|她|他|两人|对方|这个人|那个人)/i;

export function normalizeChatDisplayText(content: string): string {
  return content.replace(/(^|\n)[ \t]{0,3}>[ \t]?/g, '$1');
}

export function parseNarration(content: string, options: { tolerateUnclosed?: boolean } = {}): NarrationSegment[] {
  const tolerate = options.tolerateUnclosed ?? false;
  const segments: NarrationSegment[] = [];
  let cursor = 0;
  const normalized = content.toLowerCase();

  while (cursor < content.length) {
    const openIdx = normalized.indexOf(NARRATION_OPEN, cursor);
    const closeIdxBeforeOpen = normalized.indexOf(NARRATION_CLOSE, cursor);

    if (closeIdxBeforeOpen !== -1 && (openIdx === -1 || closeIdxBeforeOpen < openIdx)) {
      pushMixed(segments, content.slice(cursor, closeIdxBeforeOpen));

      const orphanTextStart = closeIdxBeforeOpen + NARRATION_CLOSE.length;
      const nextCloseIdx = normalized.indexOf(NARRATION_CLOSE, orphanTextStart);
      const nextOpenIdx = normalized.indexOf(NARRATION_OPEN, orphanTextStart);

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
    const closeIdx = normalized.indexOf(NARRATION_CLOSE, innerStart);
    if (closeIdx === -1) {
      if (tolerate) {
        pushNarration(segments, content.slice(innerStart));
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
  const trimmed = raw
    .replace(/<\/?narration>/gi, '')
    .replace(/<\/?narrat[a-z]*>?/gi, '')
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
  const trimmed = raw.replace(/<\/?narrat[a-z]*>?/gi, '').trim();
  if (trimmed.length === 0) return;
  out.push({ text: trimmed, type: 'narration' });
}

function splitDialogueCandidates(raw: string): string[] {
  const lines = raw.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const out: string[] = [];
  for (const line of lines) {
    if (!ACTION_SUBJECT_RE.test(line)) {
      out.push(line);
      continue;
    }
    const pieces = line.match(/[^.!?。！？；;]+[.!?。！？；;]?/g) ?? [line];
    for (const piece of pieces) {
      const trimmed = piece.trim();
      if (trimmed) out.push(trimmed);
    }
  }
  return out;
}

function looksLikeNarration(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/<\/?narrat/i.test(trimmed)) return true;
  if (/^[(（].+[)）]$/.test(trimmed)) return true;
  if (!ACTION_SUBJECT_RE.test(trimmed)) return false;
  if (!ACTION_VERB_RE.test(trimmed)) return false;
  if (/^(我|i)\s*(think|feel|want|like|love|hate|know|remember|guess|mean|need|miss)\b/i.test(trimmed)) {
    return false;
  }
  if (/^我(觉得|想|要|喜欢|爱|讨厌|知道|记得|猜|是|不是|可以|不能|会|不会)/.test(trimmed)) {
    return false;
  }
  return true;
}
