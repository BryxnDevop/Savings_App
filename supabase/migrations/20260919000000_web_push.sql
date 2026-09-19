-- Web Push subscriptions and notification delivery state.
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
CREATE INDEX IF NOT EXISTS ahorra_push_subscriptions_user ON ahorra.ahorra_push_subscriptions(user_id,updated_at DESC);

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

ALTER TABLE ahorra.ahorra_notifications ADD COLUMN IF NOT EXISTS push_sent_at timestamptz;
CREATE INDEX IF NOT EXISTS ahorra_notifications_push_pending
  ON ahorra.ahorra_notifications(user_id,created_at)
  WHERE active=true AND push_sent_at IS NULL;

ALTER TABLE ahorra.ahorra_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ahorra.ahorra_notification_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ahorra.ahorra_push_subscriptions FROM PUBLIC;
REVOKE ALL ON ahorra.ahorra_notification_preferences FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
   EXECUTE format('REVOKE ALL ON ahorra.ahorra_push_subscriptions FROM %I',role_name);
   EXECUTE format('REVOKE ALL ON ahorra.ahorra_notification_preferences FROM %I',role_name);
  END IF;
 END LOOP;
END $$;

UPDATE ahorra.schema_version SET version=2 WHERE id=1;
