-- Rename dev_login_allowlist to admin_user_allowlist.
-- The original table was created to gate the now-removed /auth/dev-session
-- endpoint. It is repurposed as the runtime list of admin users (in addition
-- to the built-in ADMIN_EMAILS env var fallback).
ALTER TABLE dev_login_allowlist RENAME TO admin_user_allowlist;
