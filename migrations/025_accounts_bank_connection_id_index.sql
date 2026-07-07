-- accounts.bank_connection_id is a FK queried on every bank-sync pass
-- (account lookups by connection) but had no index — full table scan as
-- the table grows.
CREATE INDEX IF NOT EXISTS idx_accounts_bank_connection_id
  ON accounts(bank_connection_id);
