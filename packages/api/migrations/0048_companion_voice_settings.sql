-- 0048: companion voice settings.
--
-- MiniMax TTS non-secret config now lives in config/minimax-voices.<env>.json.
-- Existing companions keep NULL voice_id and fall back to gender defaults.
ALTER TABLE companions ADD COLUMN voice_id TEXT;
ALTER TABLE companions ADD COLUMN voice_speed TEXT NOT NULL DEFAULT 'medium';

