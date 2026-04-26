-- 001_initial_schema
-- Creates the proxies table and basic indexes.

CREATE TABLE IF NOT EXISTS proxies (
  id           TEXT PRIMARY KEY,
  type         TEXT DEFAULT 'HTTP',
  host_port    TEXT NOT NULL,
  ipv4         TEXT DEFAULT '',
  ipv6         TEXT DEFAULT '',
  country      TEXT DEFAULT '',
  timezone     TEXT DEFAULT '',
  city         TEXT DEFAULT '',
  isp          TEXT DEFAULT '',
  category     TEXT DEFAULT 'unknown',
  latency      INTEGER,
  status       TEXT DEFAULT 'UNKNOWN',
  is_archived  BOOLEAN DEFAULT FALSE,
  last_checked TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_proxies_is_archived ON proxies(is_archived);
CREATE INDEX IF NOT EXISTS idx_proxies_country     ON proxies(country);
CREATE INDEX IF NOT EXISTS idx_proxies_category    ON proxies(category);
