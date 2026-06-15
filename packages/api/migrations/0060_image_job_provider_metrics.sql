-- Capture provider-side timing/cost diagnostics for generic image jobs.
-- Historical rows remain NULL; new RunningHub webhook/poll completions fill
-- these when the upstream response includes taskCostTime / consumeCoins.
ALTER TABLE image_generation_jobs ADD COLUMN provider_submitted_at INTEGER;
ALTER TABLE image_generation_jobs ADD COLUMN provider_result_received_at INTEGER;
ALTER TABLE image_generation_jobs ADD COLUMN provider_task_cost_time_ms INTEGER;
ALTER TABLE image_generation_jobs ADD COLUMN provider_consume_coins REAL;
