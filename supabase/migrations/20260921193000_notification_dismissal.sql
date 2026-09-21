-- Allow users to remove internal notifications without making persistent alerts
-- immediately reappear while the underlying condition is unchanged.
ALTER TABLE ahorra.ahorra_notifications
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;

CREATE INDEX IF NOT EXISTS ahorra_notifications_visible_user
  ON ahorra.ahorra_notifications(user_id, created_at DESC)
  WHERE dismissed_at IS NULL;

UPDATE ahorra.schema_version
SET version = 3
WHERE id = 1;
