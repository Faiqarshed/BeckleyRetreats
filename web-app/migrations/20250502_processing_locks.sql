-- Create a table to manage processing locks for webhooks
-- This prevents duplicate processing when multiple webhooks are sent
CREATE TABLE IF NOT EXISTS processing_locks (
  lock_id TEXT PRIMARY KEY,
  tracking_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Add comment to table
COMMENT ON TABLE processing_locks IS 'Locks used to prevent duplicate webhook processing';

-- Add comments to columns
COMMENT ON COLUMN processing_locks.lock_id IS 'Unique identifier for the lock (e.g., typeform_{response_token})';
COMMENT ON COLUMN processing_locks.tracking_id IS 'Tracking ID for debugging and monitoring';
COMMENT ON COLUMN processing_locks.created_at IS 'Timestamp when the lock was created';
COMMENT ON COLUMN processing_locks.updated_at IS 'Timestamp when the lock was last updated';

-- Add an index on created_at for finding stale locks
CREATE INDEX IF NOT EXISTS idx_processing_locks_created_at ON processing_locks (created_at);

-- Grant appropriate permissions
ALTER TABLE processing_locks ENABLE ROW LEVEL SECURITY;

-- Default policy: service role can do anything
CREATE POLICY "Service role can manage processing locks"
  ON processing_locks
  USING (true)
  WITH CHECK (true);

-- Grant access to authenticated and service roles
GRANT SELECT, INSERT, UPDATE, DELETE ON processing_locks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON processing_locks TO authenticated;
