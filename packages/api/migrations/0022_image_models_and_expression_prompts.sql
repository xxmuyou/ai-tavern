-- WF1 selectable model catalog (flat list, each model carries its own style tag)
-- and WF2 expression/pose prompts (gender × emotion, global, admin-editable).
CREATE TABLE IF NOT EXISTS image_models (
  id          TEXT PRIMARY KEY,            -- slug, e.g. 'realistic_juggernaut'
  label       TEXT NOT NULL,               -- display name shown in the create form
  style_tag   TEXT NOT NULL,               -- 'realistic' | 'anime_jp' | 'anime_kr' -> picks env workflow
  ckpt_name   TEXT NOT NULL,               -- checkpoint name written into the WF1 checkpoint node
  is_active   INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL,
  updated_by  TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS expression_prompts (
  gender      TEXT NOT NULL,               -- 'male' | 'female'
  emotion     TEXT NOT NULL,               -- warm | playful | guarded | tense | annoyed
  prompt      TEXT NOT NULL,               -- pose/expression intent fed into the WF2 prompt node
  updated_at  INTEGER NOT NULL,
  updated_by  TEXT REFERENCES users(id),
  PRIMARY KEY (gender, emotion)
);

-- WF1 checkpoint override carried by a base-art job (resolved from the chosen
-- model at enqueue time, replayed into the provider request when processed).
ALTER TABLE image_generation_jobs ADD COLUMN ckpt_name TEXT;
