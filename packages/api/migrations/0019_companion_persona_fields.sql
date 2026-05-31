-- spec-025 Part A (S-δ): persona depth fields.
--
-- Adds three structured "driver" fields to every companion. All nullable so
-- existing rows (official seed + user-created) stay valid; seed backfill for
-- the 10 official companions lands in the next migration.
--
--   want     — what the character wants right now (their agenda / motivation)
--   secret   — a secret / soft spot, only injected into the prompt once the
--              relationship has unlocked it (see spec-025 §A3 / §B4.1)
--   boundary — a line / trigger; crossing it pushes them guarded/annoyed/away

ALTER TABLE companions ADD COLUMN want     TEXT;
ALTER TABLE companions ADD COLUMN secret   TEXT;
ALTER TABLE companions ADD COLUMN boundary TEXT;
