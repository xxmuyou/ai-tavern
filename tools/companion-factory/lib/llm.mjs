/**
 * Batch prompt drafting. Calls an OpenAI-compatible chat completions endpoint
 * (DeepSeek / OpenAI / etc.) directly — the tool's own LLM key, independent of
 * the product. Asks for a strict JSON array and parses it defensively.
 */

const PERSONA_SYSTEM = `You design original AI roleplay companions for a relationship/dating sim. Output ONLY a JSON array, no prose, no markdown fences. Each element:
{
  "name": string,
  "gender": "male" | "female",
  "appearance": string (1-2 sentences, visual),
  "personality": string (1-2 sentences),
  "background": string (1-2 sentences),
  "speech_style": string (short),
  "relationship_role": string (e.g. "love interest", "best friend", "rival", "mentor"),
  "want": string (what they desire),
  "secret": string (a hidden truth),
  "boundary": string (a hard limit),
  "greeting": string (their first line to the user, in-character),
  "tags": string[] (3-6 lowercase discovery tags),
  "preferred_scenes": string[] (0-3 scene tags they fit, e.g. "cafe","gym","pool"),
  "image_prompt": string (English portrait prompt: appearance, outfit, mood, composition; transparent/plain background; no real-person or copyrighted names)
}
Make them diverse and distinct. No NSFW.`;

const SCENE_SYSTEM = `You design background scenes for a relationship sim where cutout character portraits are composited over scene backgrounds. Output ONLY a JSON array, no prose, no markdown fences. Each element:
{
  "id": string (lowercase_snake_case slug, unique),
  "name": string,
  "mood": string (atmosphere, 1 sentence),
  "tags": string[] (2-5 lowercase tags),
  "unlock_tier": "public" | "casual" | "date" | "intimate",
  "default_companions": string[] (companion ids that fit here; [] if unknown),
  "image_prompt": string (English background prompt: empty location, NO people, wide establishing shot, cohesive art style)
}
unlock_tier guidance: public = freely available everyday spots; casual = needs light familiarity; date = romantic outing venues; intimate = private/late-stage (e.g. hotel). No NSFW.`;

async function chat(cfg, system, user, maxTokens) {
  const res = await fetch(`${cfg.llm.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${cfg.llm.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.llm.model,
      temperature: 0.9,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`LLM request failed: ${res.status} ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content ?? '';
  return parseJsonArray(text);
}

function parseJsonArray(text) {
  let cleaned = String(text).trim();
  cleaned = cleaned.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error('LLM did not return a JSON array');
  return parsed;
}

export async function generatePersonas(cfg, { brief, count }) {
  const user = `Generate ${count} companions. Theme / direction: ${brief || 'a varied roster across personalities and looks'}.`;
  return chat(cfg, PERSONA_SYSTEM, user, Math.min(4000, 600 + count * 320));
}

export async function generateScenes(cfg, { brief, count }) {
  const user = `Generate ${count} scenes. Theme / must-include: ${brief || 'varied everyday and date locations'}.`;
  return chat(cfg, SCENE_SYSTEM, user, Math.min(4000, 500 + count * 220));
}
