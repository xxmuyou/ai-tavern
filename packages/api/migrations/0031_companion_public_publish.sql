-- 0031: companion public publishing.
-- Lets an admin promote their own user-created companion (with portraits) into a
-- shared public area, without changing its `source` or ownership. Default 0 keeps
-- every existing companion private; only an explicit publish flips it to 1.
ALTER TABLE companions ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_companions_public ON companions(is_public);
