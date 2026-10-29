-- Getting back in without Google or email:
-- a recovery code shown once at sign-up (only its hash is kept), and short-lived pairing codes that a
-- signed-in device hands to a new device.
ALTER TABLE users ADD COLUMN recovery_hash TEXT;

CREATE TABLE pair_codes (
  code TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
