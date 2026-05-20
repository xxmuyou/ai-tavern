-- v1 seed (spec-003)
--
-- Inserts the minimum data the API needs to start cleanly on a fresh database.
-- admin_users is intentionally NOT seeded here; admin@aiappsbox.com is granted
-- admin role on first login by application logic (spec-009 / spec-011).

-- ============================================================
-- llm_config defaults
--   Per docs/architecture/llm.md §2.2:
--     - chat / signal / character-assist default to DeepSeek with OpenAI fallback
--     - summary defaults to Cloudflare Workers AI (cheap), DeepSeek fallback
--   updated_by NULL because no user exists yet; spec-011 admin console will
--   overwrite updated_by on subsequent edits.
-- ============================================================
INSERT INTO llm_config (task, provider, model, fallback_provider, fallback_model, updated_at, updated_by)
VALUES
  ('chat',             'deepseek',   'deepseek-chat',                  'openai',   'gpt-4o-mini',  unixepoch() * 1000, NULL),
  ('signal',           'deepseek',   'deepseek-chat',                  'openai',   'gpt-4o-mini',  unixepoch() * 1000, NULL),
  ('summary',          'cloudflare', '@cf/meta/llama-3.1-8b-instruct', 'deepseek', 'deepseek-chat', unixepoch() * 1000, NULL),
  ('character-assist', 'deepseek',   'deepseek-chat',                  'openai',   'gpt-4o-mini',  unixepoch() * 1000, NULL);
