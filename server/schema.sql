CREATE TABLE IF NOT EXISTS ahorra_users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name varchar(80) NOT NULL,
  language text NOT NULL DEFAULT 'es' CHECK (language IN ('es','en')),
  avatar text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ahorra_wallets (
  user_id uuid PRIMARY KEY REFERENCES ahorra_users(id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 0,
  currency text NOT NULL,
  rates jsonb NOT NULL,
  rate_info jsonb NOT NULL,
  goal jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ahorra_movements (
  user_id uuid NOT NULL REFERENCES ahorra_users(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS ahorra_movements_user_date ON ahorra_movements(user_id,date);
CREATE TABLE IF NOT EXISTS ahorra_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES ahorra_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ahorra_sessions_expiry ON ahorra_sessions(expires_at);
CREATE TABLE IF NOT EXISTS ahorra_rate_cache (
  id integer PRIMARY KEY CHECK (id = 1),
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ahorra_mail_connections (
  user_id uuid PRIMARY KEY REFERENCES ahorra_users(id) ON DELETE CASCADE,
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
CREATE TABLE IF NOT EXISTS ahorra_mail_events (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES ahorra_users(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS ahorra_mail_events_user ON ahorra_mail_events(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ahorra_mail_events_reference ON ahorra_mail_events(user_id,fingerprint);
