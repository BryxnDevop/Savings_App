-- Repair Web Push schema for projects where an older/partial table already existed.
-- CREATE TABLE IF NOT EXISTS does not add missing columns to an existing table.

CREATE TABLE IF NOT EXISTS ahorra.ahorra_push_subscriptions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES ahorra.ahorra_users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent varchar(300) NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ahorra.ahorra_push_subscriptions
  ADD COLUMN IF NOT EXISTS id uuid,
  ADD COLUMN IF NOT EXISTS endpoint text,
  ADD COLUMN IF NOT EXISTS p256dh text,
  ADD COLUMN IF NOT EXISTS auth text,
  ADD COLUMN IF NOT EXISTS user_agent varchar(300) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Existing rows, if any, get an id before future operations use it.
UPDATE ahorra.ahorra_push_subscriptions
SET id = gen_random_uuid()
WHERE id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ahorra_push_subscriptions_endpoint_uq
  ON ahorra.ahorra_push_subscriptions(endpoint);
CREATE INDEX IF NOT EXISTS ahorra_push_subscriptions_user
  ON ahorra.ahorra_push_subscriptions(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ahorra.ahorra_notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES ahorra.ahorra_users(id) ON DELETE CASCADE,
  recurring boolean NOT NULL DEFAULT true,
  budget boolean NOT NULL DEFAULT true,
  movements boolean NOT NULL DEFAULT true,
  goals boolean NOT NULL DEFAULT true,
  bank boolean NOT NULL DEFAULT true,
  sound boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ahorra.ahorra_notification_preferences
  ADD COLUMN IF NOT EXISTS recurring boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS budget boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS movements boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS goals boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bank boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sound boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE ahorra.ahorra_notifications
  ADD COLUMN IF NOT EXISTS push_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS ahorra_notifications_push_pending
  ON ahorra.ahorra_notifications(user_id, created_at)
  WHERE active = true AND push_sent_at IS NULL;

UPDATE ahorra.schema_version
SET version = GREATEST(version, 2)
WHERE id = 1;
