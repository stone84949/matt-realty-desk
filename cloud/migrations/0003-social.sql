CREATE TABLE IF NOT EXISTS social_accounts (
 id TEXT PRIMARY KEY, platform TEXT NOT NULL, account_id TEXT NOT NULL,
 name TEXT NOT NULL, credential TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS social_snapshots (
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL,
 platform TEXT NOT NULL, captured_at TEXT NOT NULL, data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS social_snapshot_time ON social_snapshots(account_id,captured_at);
CREATE TABLE IF NOT EXISTS social_oauth (
 state TEXT PRIMARY KEY, identity TEXT NOT NULL, nonce TEXT NOT NULL,
 expires_at INTEGER NOT NULL, pending TEXT
);

