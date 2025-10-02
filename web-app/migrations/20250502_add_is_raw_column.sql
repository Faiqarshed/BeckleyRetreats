-- Add is_raw column to application_field_responses table
ALTER TABLE application_field_responses 
ADD COLUMN IF NOT EXISTS is_raw BOOLEAN DEFAULT FALSE;

-- Add comment to the column
COMMENT ON COLUMN application_field_responses.is_raw IS 'Indicates if this is raw storage of a field that has no matching field version';

-- Add index for faster queries on raw responses
CREATE INDEX IF NOT EXISTS idx_app_field_responses_is_raw ON application_field_responses (is_raw);
