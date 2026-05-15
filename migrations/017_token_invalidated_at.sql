-- Migration 017: Add token_invalidated_at to users for DB-backed cross-device logout.
-- Any JWT with iat < token_invalidated_at is rejected, surviving server restarts.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_invalidated_at TIMESTAMPTZ;
