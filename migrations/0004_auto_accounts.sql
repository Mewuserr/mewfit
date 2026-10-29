-- Accounts are created automatically on first use (no name, no PIN); the recovery code alone finds the account.
CREATE INDEX users_recovery ON users(recovery_hash) WHERE recovery_hash IS NOT NULL;
