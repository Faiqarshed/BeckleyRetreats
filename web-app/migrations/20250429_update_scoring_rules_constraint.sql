-- Update the constraint on scoring_rules to allow 'na' as a valid score_value
ALTER TABLE scoring_rules 
DROP CONSTRAINT IF EXISTS scoring_rules_score_value_check;

ALTER TABLE scoring_rules 
ADD CONSTRAINT scoring_rules_score_value_check 
CHECK (score_value IN ('red', 'yellow', 'green', 'na'));
