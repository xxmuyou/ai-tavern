-- Dev login allowlist managed from the admin workspace.
-- Built-in admin emails from ADMIN_EMAILS are allowed by application logic.
CREATE TABLE IF NOT EXISTS dev_login_allowlist (
  email       TEXT PRIMARY KEY,
  note        TEXT,
  created_at  INTEGER NOT NULL,
  created_by  TEXT REFERENCES users(id)
);
