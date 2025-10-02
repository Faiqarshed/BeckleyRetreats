-- Add display_order column to typeform_field_versions table
ALTER TABLE typeform_field_versions
ADD COLUMN display_order INTEGER;

-- Add display_order column to typeform_choice_versions table
ALTER TABLE typeform_choice_versions
ADD COLUMN display_order INTEGER;

-- Create index on form_id and display_order to optimize queries that sort fields by order
CREATE INDEX idx_typeform_field_versions_form_display_order
ON typeform_field_versions (form_id, display_order) 
WHERE is_active = true;

-- Create index on field_version_id and display_order to optimize queries that sort choices by order
CREATE INDEX idx_typeform_choice_versions_field_display_order
ON typeform_choice_versions (field_version_id, display_order)
WHERE is_active = true;

-- Add comment to explain the purpose of these columns
COMMENT ON COLUMN typeform_field_versions.display_order IS 'The order in which this field appears in the Typeform form (0-based)';
COMMENT ON COLUMN typeform_choice_versions.display_order IS 'The order in which this choice appears in its parent field (0-based)';
