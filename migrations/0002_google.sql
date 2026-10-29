-- Sign in with Google: an account may have a Google identity, a username + PIN, or both.
ALTER TABLE users ADD COLUMN google_sub TEXT;
ALTER TABLE users ADD COLUMN email TEXT;
CREATE UNIQUE INDEX users_google ON users(google_sub) WHERE google_sub IS NOT NULL;

-- OAuth round trip: state ties the callback to the request (and to the account when linking);
-- a one-time code hands the result back to the page, which trades it for a session token.
CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY,
  user_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE oauth_codes (
  code TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
