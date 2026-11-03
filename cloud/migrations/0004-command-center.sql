CREATE TABLE IF NOT EXISTS command_research (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS command_jobs (
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE, kind TEXT NOT NULL CHECK(kind IN ('content_plan','social_draft','engagement_report')),
 prompt TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','running','succeeded','failed')),
 result TEXT, error TEXT, created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT
);
