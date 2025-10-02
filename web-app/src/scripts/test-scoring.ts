/**
 * Test script for debugging application scoring issues
 * 
 * This script helps identify problems with how scoring rules are applied to
 * various field responses, particularly for multi-select fields and choices.
 */

const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables from .env.local if it exists
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else {
  dotenv.config(); // Fall back to regular .env
}

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Missing environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Types based on your database schema
interface ScoringRule {
  id: string;
  target_type: 'field' | 'choice';
  target_id: string;
  is_active: boolean;
  score_value: 'red' | 'yellow' | 'green';
  criteria: any; // JSON object with conditions
  created_at: string;
  updated_at: string;
  created_by?: string;
}

interface FieldResponse {
  id: string;
  application_id: string;
  field_version_id: string;
  response_value: any; // Could be string, array, etc.
  score: string;
  created_at: string;
  is_raw: boolean;
  choice_version_id: string | null;
  response_metadata: any;
}

interface Field {
  id: string;
  name: string;
  type: string;
  ref: string;
  version_id: string;
  created_at: string;
  updated_at: string;
}

interface Choice {
  id: string;
  field_id: string;
  label: string;
  ref: string;
  version_id: string;
  created_at: string;
  updated_at: string;
}

interface Application {
  id: string;
  form_id: string;
  participant_id: string;
  application_date: string;
  status: string;
  red_count: number;
  yellow_count: number;
  green_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Fetches all scoring rules for a specific field version
 */
async function getScoringRulesForField(fieldVersionId: string): Promise<ScoringRule[]> {
  const { data, error } = await supabase
    .from('scoring_rules')
    .select('*')
    .eq('target_type', 'field')
    .eq('target_id', fieldVersionId)
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching field scoring rules:', error);
    return [];
  }

  return data || [];
}

/**
 * Fetches all scoring rules for a specific choice version
 */
async function getScoringRulesForChoice(choiceVersionId: string): Promise<ScoringRule[]> {
  const { data, error } = await supabase
    .from('scoring_rules')
    .select('*')
    .eq('target_type', 'choice')
    .eq('target_id', choiceVersionId)
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching choice scoring rules:', error);
    return [];
  }

  return data || [];
}

/**
 * Gets field details including type
 */
async function getFieldDetails(fieldVersionId: string): Promise<Field | null> {
  const { data, error } = await supabase
    .from('typeform_field_versions')
    .select(`
      *
    `)
    .eq('id', fieldVersionId)
    .limit(1)
    .single();

  if (error) {
    console.error('Error fetching field details:', error);
    return null;
  }

  if (!data) {
    return null;
  }

  return {
    id: data.field_id,
    name: data.field_title,
    type: data.field_type,
    ref: data.field_ref,
    version_id: data.id,
    created_at: data.created_at,
    updated_at: data.updated_at
  };
}

/**
 * Gets all choices for a field version
 */
async function getFieldChoices(fieldVersionId: string): Promise<Choice[]> {
  console.log(`Getting choices for field version: ${fieldVersionId}`);
  const { data, error } = await supabase
    .from('typeform_choice_versions')
    .select(`
      *
    `)
    .eq('field_version_id', fieldVersionId);

  if (error) {
    console.error('Error fetching field choices:', error);
    return [];
  }

  // Define an interface for the raw choice data from the query
  interface RawChoiceData {
    id: string;
    field_version_id: string;
    choice_id: string;
    choice_label: string;
    choice_ref: string;
    created_at: string;
    updated_at: string;
  }

  return (data || []).map((choice: RawChoiceData) => ({
    id: choice.choice_id,
    field_id: choice.field_version_id, // Using field_version_id as field_id
    label: choice.choice_label,
    ref: choice.choice_ref,
    version_id: choice.id,
    created_at: choice.created_at,
    updated_at: choice.updated_at
  }));
}

/**
 * Gets all responses for a specific application
 */
async function getApplicationResponses(applicationId: string): Promise<FieldResponse[]> {
  const { data, error } = await supabase
    .from('application_field_responses')
    .select('*')
    .eq('application_id', applicationId);

  if (error) {
    console.error('Error fetching application responses:', error);
    return [];
  }

  return data || [];
}

/**
 * Gets application details
 */
async function getApplication(applicationId: string): Promise<Application | null> {
  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .eq('id', applicationId)
    .limit(1)
    .single();

  if (error) {
    console.error('Error fetching application:', error);
    return null;
  }

  return data;
}

/**
 * Evaluates a field response against scoring rules and returns the score
 */
async function evaluateFieldResponse(response: FieldResponse): Promise<{ 
  red: number; 
  yellow: number; 
  green: number; 
  details: Array<{rule: ScoringRule, matched: boolean}>;
}> {
  const fieldDetails = await getFieldDetails(response.field_version_id);
  if (!fieldDetails) {
    console.error(`Could not find field details for version ${response.field_version_id}`);
    return { red: 0, yellow: 0, green: 0, details: [] };
  }

  console.log(`
Evaluating field: ${fieldDetails.name} (${fieldDetails.type})`);
  console.log(`Field ID: ${fieldDetails.id}, Version ID: ${response.field_version_id}`);
  console.log(`Response: ${JSON.stringify(response.response_value)}`);

  const fieldRules = await getScoringRulesForField(response.field_version_id);
  console.log(`Found ${fieldRules.length} field-level scoring rules for field version ${response.field_version_id}`);
  
  // Log info about searching for rules
  console.log(`Looking up scoring rules with target_type = 'field' and target_id = '${response.field_version_id}'`);

  const results = {
    red: 0,
    yellow: 0,
    green: 0,
    details: [] as Array<{rule: ScoringRule, matched: boolean}>
  };

  // Process field-level rules
  for (const rule of fieldRules) {
    let ruleMatched = false;

    // Parse criteria JSON if it's a string
    let criteria: any = rule.criteria;
    if (typeof criteria === 'string') {
      try {
        criteria = JSON.parse(criteria);
      } catch (e) {
        console.log(`Error parsing rule criteria: ${e}`);
        criteria = {};
      }
    }

    // Get the condition type and value from the criteria
    const conditionType = criteria?.condition_type || criteria?.type;
    const conditionValue = criteria?.condition_value || criteria?.value;

    // More detailed logging for debugging
    console.log(`Rule: ${rule.id}, Target ID: ${rule.target_id}, Type: ${conditionType}, Value: ${conditionValue}`);
    console.log(`Full criteria object: ${JSON.stringify(criteria, null, 2)}`);
    console.log(`Response value: ${JSON.stringify(response.response_value)}`);


    // Handle different field types and condition types
    switch (fieldDetails.type) {
      case 'yes_no':
        // For yes_no fields, check if the response value is included in the criteria JSON
        const responseValue = response.response_value?.toString().toLowerCase();
        
        // Check if the response value exists in the criteria
        if (criteria) {
          // Convert criteria to string for easier checking if it's an object
          const criteriaStr = typeof criteria === 'object' ? JSON.stringify(criteria) : criteria?.toString().toLowerCase();
          ruleMatched = criteriaStr.includes(responseValue);
        }
        break;

      case 'short_text':
      case 'long_text':
        if (conditionType === 'equals') {
          ruleMatched = response.response_value === conditionValue;
        } else if (conditionType === 'contains') {
          ruleMatched = response.response_value?.includes(conditionValue);
        }
        break;

      case 'multiple_choice':
        if (conditionType === 'equals') {
          ruleMatched = response.response_value === conditionValue;
        }
        break;

      case 'multiple_select':
        if (conditionType === 'contains') {
          // For multiple select, response might be an array
          const responseArray = Array.isArray(response.response_value) 
            ? response.response_value 
            : (typeof response.response_value === 'string' ? [response.response_value] : []);
          ruleMatched = responseArray.includes(conditionValue);
        }
        break;
      
      case 'opinion_scale':
        if (conditionType === 'equals') {
          ruleMatched = response.response_value === conditionValue;
        }
        break;

      default:
        console.log(`Unhandled field type: ${fieldDetails.type}`);
    }

    console.log(`Field rule ${rule.id} for target ${rule.target_id} (${rule.score_value}): ${ruleMatched ? 'MATCHED' : 'not matched'}`);
    results.details.push({ rule, matched: ruleMatched });

    if (ruleMatched) {
      switch (rule.score_value) {
        case 'red': results.red++; break;
        case 'yellow': results.yellow++; break;
        case 'green': results.green++; break;
      }
    }
  }

  // Handle choices for multiple choice, multiple select, and opinion scale fields
  if (['multiple_choice', 'multiple_select', 'opinion_scale'].includes(fieldDetails.type)) {
    // Use field_version_id instead of field_id for choices lookup
    const choices = await getFieldChoices(fieldDetails.version_id);
    console.log(`Found ${choices.length} choices for field version ${fieldDetails.version_id}`);

    // Process each choice to see if it was selected in the response
    for (const choice of choices) {
      let choiceSelected = false;
      
      if (fieldDetails.type === 'opinion_scale') {
        // For opinion_scale, the response value is the number selected
        // The choice.label will typically be a number as a string
        choiceSelected = response.response_value?.toString() === choice.label;
      } else if (fieldDetails.type === 'multiple_choice') {
        // For multiple_choice, it's a direct match on the label
        choiceSelected = response.response_value === choice.label;
      } else {
        // For multiple_select, check if the label is in the array of responses
        choiceSelected = Array.isArray(response.response_value) 
          ? response.response_value.includes(choice.label)
          : response.response_value === choice.label;
      }

      if (choiceSelected && choice.version_id) {
        console.log(`Choice selected: "${choice.label}"`);
        console.log(`Choice ID: ${choice.id}, Version ID: ${choice.version_id}`);
        const choiceRules = await getScoringRulesForChoice(choice.version_id);
        console.log(`Looking up scoring rules with target_type = 'choice' and target_id = '${choice.version_id}'`);
        
        for (const rule of choiceRules) {
          // For choice rules, we already know the choice was selected
          // Parse criteria JSON if it's a string
          let criteria: any = rule.criteria;
          if (typeof criteria === 'string') {
            try {
              criteria = JSON.parse(criteria);
            } catch (e) {
              console.log(`Error parsing choice rule criteria: ${e}`);
              criteria = {};
            }
          }
          
          const conditionType = criteria?.condition_type || criteria?.type;
          // Always match the rule if the choice is selected, regardless of condition type
          const ruleMatched = true;
          
          console.log(`Choice rule ${rule.id} for target ${rule.target_id} (${rule.score_value}): ${ruleMatched ? 'MATCHED' : 'not matched'}`);
          results.details.push({ rule, matched: ruleMatched });

          if (ruleMatched) {
            switch (rule.score_value) {
              case 'red': results.red++; break;
              case 'yellow': results.yellow++; break;
              case 'green': results.green++; break;
            }
          }
        }
      }
    }
  }

  return results;
}

/**
 * Tests scoring for a specific application and prints detailed results
 */
async function testApplicationScoring(applicationId: string): Promise<void> {
  console.log(`\n=== Testing scoring for application ${applicationId} ===\n`);
  
  const application = await getApplication(applicationId);
  if (!application) {
    console.error(`Application not found: ${applicationId}`);
    return;
  }

  console.log(`Current scores in DB: Red: ${application.red_count}, Yellow: ${application.yellow_count}, Green: ${application.green_count}`);
  
  const responses = await getApplicationResponses(applicationId);
  console.log(`Found ${responses.length} field responses for application`);

  const finalScore = { red: 0, yellow: 0, green: 0 };
  const allEvaluations = [];

  for (const response of responses) {
    const evaluation = await evaluateFieldResponse(response);
    
    finalScore.red += evaluation.red;
    finalScore.yellow += evaluation.yellow;
    finalScore.green += evaluation.green;
    
    allEvaluations.push({
      field_version_id: response.field_version_id,
      response: response.response_value,
      evaluation
    });
  }

  console.log('\n=== Final Score Summary ===');
  console.log(`Calculated: Red: ${finalScore.red}, Yellow: ${finalScore.yellow}, Green: ${finalScore.green}`);
  console.log(`Database: Red: ${application.red_count}, Yellow: ${application.yellow_count}, Green: ${application.green_count}`);
  
  const scoreDiff = {
    red: finalScore.red - application.red_count,
    yellow: finalScore.yellow - application.yellow_count,
    green: finalScore.green - application.green_count
  };
  
  console.log('\n=== Score Differences (Calculated - Database) ===');
  console.log(`Red: ${scoreDiff.red}, Yellow: ${scoreDiff.yellow}, Green: ${scoreDiff.green}`);
  
  if (scoreDiff.red !== 0 || scoreDiff.yellow !== 0 || scoreDiff.green !== 0) {
    console.log('\n⚠️ DISCREPANCY DETECTED! Scores do not match.');
  } else {
    console.log('\n✅ Scores match the database values.');
  }

  // Output detailed evaluation results to help debug specific field issues
  console.log('\n=== Detailed Evaluation Results ===');
  for (const evalResult of allEvaluations) {
    const fieldDetails = await getFieldDetails(evalResult.field_version_id);
    if (fieldDetails) {
      console.log(`
Field: ${fieldDetails.name} (${fieldDetails.type})`);
      console.log(`Field ID: ${fieldDetails.id}, Version ID: ${evalResult.field_version_id}`);
      console.log(`Response: ${JSON.stringify(evalResult.response)}`);
      console.log(`Scores: Red: ${evalResult.evaluation.red}, Yellow: ${evalResult.evaluation.yellow}, Green: ${evalResult.evaluation.green}`);
      
      if (evalResult.evaluation.details.length > 0) {
        console.log('Rules applied:');
        for (const detail of evalResult.evaluation.details) {
          const ruleType = detail.rule.target_type === 'field' ? 'Field' : 'Choice';
          
          // Parse criteria JSON if it's a string
          let criteria: any = detail.rule.criteria;
          if (typeof criteria === 'string') {
            try {
              criteria = JSON.parse(criteria);
            } catch (e) {
              criteria = {};
            }
          }
          
          console.log(`  - ${ruleType} rule ${detail.rule.id} (target: ${detail.rule.target_id}): => ${detail.rule.score_value} ${detail.matched ? '✓' : '✗'}`);
        }
      } else {
        console.log('No rules applied to this field');
      }
    }
  }
}

/**
 * Main function to run the tests
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: npx ts-node test-scoring.ts <application_id>');
    process.exit(1);
  }

  const applicationId = args[0];
  await testApplicationScoring(applicationId);
}

// Run the main function
main().catch(err => {
  console.error('Error running test script:', err);
  process.exit(1);
});
