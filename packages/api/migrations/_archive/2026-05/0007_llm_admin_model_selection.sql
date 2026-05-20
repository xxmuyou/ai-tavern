CREATE TABLE IF NOT EXISTS llm_model_routes (
  route_key TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  provider_order TEXT NOT NULL DEFAULT '[]',
  provider_models TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS llm_generation_logs (
  id TEXT PRIMARY KEY,
  route_key TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  app_key TEXT,
  show_key TEXT,
  session_id TEXT,
  user_id TEXT,
  purpose TEXT,
  status TEXT NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  estimated_cost_usd REAL,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_llm_generation_logs_route_created
ON llm_generation_logs (route_key, created_at);

CREATE INDEX IF NOT EXISTS idx_llm_generation_logs_user_created
ON llm_generation_logs (user_id, created_at);

INSERT OR IGNORE INTO llm_model_routes (
  route_key,
  description,
  provider_order,
  provider_models,
  status
) VALUES (
  'cheap-dialogue',
  'Low-cost text route for AI TV show host and guest dialogue.',
  '["deepseek","doubao"]',
  '{"deepseek":"deepseek-v4-flash","doubao":"doubao-seed-1-6-250615","openai":"gpt-5-mini"}',
  'active'
);
