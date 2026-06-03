-- Route companion chat through MiniMax-M3 by default.
-- MiniMax uses the OpenAI-compatible `.com` endpoint wired in the provider:
-- https://api.minimaxi.com/v1/chat/completions

INSERT INTO llm_config (task, provider, model, fallback_provider, fallback_model, updated_at, updated_by)
VALUES ('chat', 'minimax', 'MiniMax-M3', 'deepseek', 'deepseek-chat', unixepoch() * 1000, NULL)
ON CONFLICT(task) DO UPDATE SET
  provider = excluded.provider,
  model = excluded.model,
  fallback_provider = excluded.fallback_provider,
  fallback_model = excluded.fallback_model,
  updated_at = excluded.updated_at,
  updated_by = excluded.updated_by;
