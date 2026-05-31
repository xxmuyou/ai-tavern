-- Seed defaults for the WF1 model catalog and WF2 expression prompts.
-- These are starting values; admins can edit/extend them in the workspace.

-- WF1 models: one row per confirmed RunningHub checkpoint, tagged by style.
INSERT OR IGNORE INTO image_models (id, label, style_tag, ckpt_name, is_active, sort_order, updated_at, updated_by)
VALUES
  ('realistic_juggernaut', 'Realistic — Juggernaut XL', 'realistic', 'juggernautXL_ragnarokBy.safetensors', 1, 10, 0, NULL),
  ('anime_jp_animagine',   'Anime (JP) — Animagine XL', 'anime_jp',  'animagineXL40_v4Opt.safetensors',     1, 20, 0, NULL),
  ('anime_kr_ghostxl',     'Anime (KR) — Ghost XL',     'anime_kr',  'ghostxl_v10BakedVAE.safetensors',     1, 30, 0, NULL);

-- WF2 expression prompts: gender × emotion. Same text per gender for now
-- (admins can diverge male/female later). Mirrors the prior in-code intents.
INSERT OR IGNORE INTO expression_prompts (gender, emotion, prompt, updated_at, updated_by)
VALUES
  ('female', 'warm',    'soft eyes, gentle smile, approachable open posture, head slightly tilted toward the viewer', 0, NULL),
  ('female', 'playful', 'teasing smile, slight eyebrow raise, light mischievous energy, playful relaxed shoulders', 0, NULL),
  ('female', 'guarded', 'reserved expression, lips pressed, arms drawn in, body slightly turned away', 0, NULL),
  ('female', 'tense',   'worried or conflicted expression, tightened mouth, subtle anxiety, stiff shoulders', 0, NULL),
  ('female', 'annoyed', 'irritated expression, frown, clear displeasure without caricature, chin slightly raised', 0, NULL),
  ('male',   'warm',    'soft eyes, gentle smile, approachable open posture, relaxed steady stance', 0, NULL),
  ('male',   'playful', 'teasing grin, slight eyebrow raise, light mischievous energy, easy confident posture', 0, NULL),
  ('male',   'guarded', 'reserved expression, jaw set, arms crossed, body slightly turned away', 0, NULL),
  ('male',   'tense',   'worried or conflicted expression, tightened mouth, subtle anxiety, tense squared shoulders', 0, NULL),
  ('male',   'annoyed', 'irritated expression, frown, clear displeasure without caricature, chin slightly raised', 0, NULL);
