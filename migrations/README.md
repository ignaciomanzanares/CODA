# Migrations

Applied on boot via `db/migrate.ts` (Postgres only). SQLite dev DB uses schema push.

## Numbering

Files are applied in alphabetical sort order. The `_migrations` table tracks each file by its
exact filename, so duplicate prefixes work correctly — both files are applied and tracked
independently.

Known duplicate prefixes (result of parallel development branches being merged):
- `025_accounts_bank_connection_id_index.sql` and `025_transactions_normalization.sql`
- `026_habit_feedback.sql` and `026_score_document_upload_source_link.sql`

These are not renamed to avoid re-applying already-tracked migrations on production.
New migrations should use the next sequential number (currently `033_...`).
