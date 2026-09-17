-- Private application tables. Access is through the authenticated Node API only.
CREATE SCHEMA IF NOT EXISTS ahorra;
REVOKE ALL ON SCHEMA ahorra FROM PUBLIC;
CREATE TABLE IF NOT EXISTS ahorra.ahorra_users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name varchar(80) NOT NULL,
  language text NOT NULL DEFAULT 'es' CHECK (language IN ('es','en')),
  avatar text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ahorra.ahorra_wallets (
  user_id uuid PRIMARY KEY REFERENCES ahorra.ahorra_users(id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 0,
  currency text NOT NULL,
  rates jsonb NOT NULL,
  rate_info jsonb NOT NULL,
  goal jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ahorra.ahorra_movements (
  user_id uuid NOT NULL REFERENCES ahorra.ahorra_users(id) ON DELETE CASCADE,
  id varchar(150) NOT NULL,
  type text NOT NULL CHECK (type IN ('income','expense')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 99999999999),
  currency text NOT NULL CHECK (currency IN ('USD','DOP','EUR','MXN','COP')),
  reason varchar(80) NOT NULL,
  date date NOT NULL,
  note varchar(180) NOT NULL DEFAULT '',
  category text NOT NULL,
  position integer NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS ahorra_movements_user_date ON ahorra.ahorra_movements(user_id,date);
CREATE TABLE IF NOT EXISTS ahorra.ahorra_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES ahorra.ahorra_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ahorra_sessions_expiry ON ahorra.ahorra_sessions(expires_at);
CREATE TABLE IF NOT EXISTS ahorra.ahorra_rate_cache (
  id integer PRIMARY KEY CHECK (id = 1),
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ahorra.ahorra_mail_connections (
  user_id uuid PRIMARY KEY REFERENCES ahorra.ahorra_users(id) ON DELETE CASCADE,
  settings jsonb NOT NULL,
  secret text NOT NULL,
  mailbox text NOT NULL,
  uid_validity text NOT NULL,
  last_uid bigint NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  next_check timestamptz NOT NULL DEFAULT now(),
  last_check timestamptz,
  last_error text NOT NULL DEFAULT '',
  lease_token uuid,
  lease_until timestamptz,
  connected_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ahorra.ahorra_mail_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES ahorra.ahorra_users(id) ON DELETE CASCADE,
  message_key text NOT NULL,
  fingerprint text,
  sender text NOT NULL,
  subject varchar(160) NOT NULL,
  received_at timestamptz NOT NULL,
  candidate jsonb,
  issue text NOT NULL DEFAULT '',
  status text NOT NULL CHECK(status IN ('pending','applied','dismissed')),
  movement_id varchar(150),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,message_key)
);
CREATE INDEX IF NOT EXISTS ahorra_mail_events_user ON ahorra.ahorra_mail_events(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ahorra_mail_events_reference ON ahorra.ahorra_mail_events(user_id,fingerprint);

CREATE TABLE IF NOT EXISTS ahorra.ahorra_recurring (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES ahorra.ahorra_users(id) ON DELETE CASCADE,
 name varchar(80) NOT NULL,
 amount_cents bigint NOT NULL CHECK(amount_cents>0 AND amount_cents<=99999999999),
 currency text NOT NULL CHECK(currency IN ('USD','DOP','EUR','MXN','COP')),
 category text NOT NULL,
 frequency text NOT NULL CHECK(frequency IN ('monthly','weekly','yearly')),
 anchor_date date NOT NULL,
 next_due date NOT NULL,
 enabled boolean NOT NULL DEFAULT true,
 archived boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 0,
 last_error text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,id)
);
CREATE INDEX IF NOT EXISTS ahorra_recurring_due ON ahorra.ahorra_recurring(next_due) WHERE enabled AND NOT archived;
CREATE TABLE IF NOT EXISTS ahorra.ahorra_recurring_occurrences (
 user_id uuid NOT NULL,
 recurring_id uuid NOT NULL,
 due_date date NOT NULL,
 status text NOT NULL CHECK(status IN ('applied','skipped')),
 movement_id varchar(150),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,recurring_id,due_date),
 FOREIGN KEY(user_id,recurring_id) REFERENCES ahorra.ahorra_recurring(user_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS ahorra.ahorra_notifications (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES ahorra.ahorra_users(id) ON DELETE CASCADE,
 event_key text NOT NULL,
 kind text NOT NULL,
 payload jsonb NOT NULL,
 active boolean NOT NULL DEFAULT true,
 read_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,event_key)
);
CREATE INDEX IF NOT EXISTS ahorra_notifications_user ON ahorra.ahorra_notifications(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS ahorra.schema_version (
 id integer PRIMARY KEY CHECK(id=1), version integer NOT NULL
);
INSERT INTO ahorra.schema_version(id,version) VALUES(1,1) ON CONFLICT(id) DO NOTHING;
ALTER TABLE ahorra.ahorra_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE ahorra.ahorra_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ahorra.ahorra_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE ahorra.ahorra_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ahorra.ahorra_rate_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE ahorra.ahorra_mail_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE ahorra.ahorra_mail_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ahorra.ahorra_recurring ENABLE ROW LEVEL SECURITY;
ALTER TABLE ahorra.ahorra_recurring_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE ahorra.ahorra_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE ahorra.schema_version ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA ahorra FROM PUBLIC;
-- Supabase roles are absent in an ordinary PostgreSQL test database.
DO $$ DECLARE role_name text; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
   EXECUTE format('REVOKE ALL ON SCHEMA ahorra FROM %I',role_name);
   EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA ahorra FROM %I',role_name);
   EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA ahorra REVOKE ALL ON TABLES FROM %I',role_name);
  END IF;
 END LOOP;
END $$;
