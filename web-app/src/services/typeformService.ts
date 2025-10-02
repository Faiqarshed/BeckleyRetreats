import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

// Types for Typeform API responses
export interface TypeformForm {
  id: string;
  title: string;
  workspace: {
    id: string;
  };
  _links: {
    display: string;
  };
}

export interface TypeformField {
  id: string;
  title: string;
  type: string;
  ref?: string;
  properties?: any;
}

export interface TypeformChoice {
  id: string;
  label: string;
  ref?: string;
}

export interface TypeformFormDetails {
  id: string;
  title: string;
  workspace: {
    id: string;
  };
  fields: TypeformField[];
}

// Types for database models
export interface DbTypeformForm {
  id: string;
  form_id: string;
  form_title: string;
  workspace_id: string | null;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export interface DbTypeformFieldVersion {
  id: string;
  form_id: string;
  field_id: string;
  field_title: string;
  field_type: string;
  field_ref: string | null;
  properties: any;
  is_scored: boolean;
  parent_field_version_id: string | null;
  hierarchy_level: number;
  display_order: number;
  version_date: string;
  is_active: boolean;
}

export interface DbTypeformChoiceVersion {
  id: string;
  field_version_id: string;
  choice_id: string;
  choice_label: string;
  choice_ref: string | null;
  display_order: number;
  version_date: string;
  is_active: boolean;
}

export interface DbScoringRule {
  id: string;
  target_type: 'field' | 'choice';
  target_id: string;
  score_value: 'red' | 'yellow' | 'green' | 'na';
  criteria: any;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

// Initialize Supabase client with service role for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export class TypeformService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.TYPEFORM_API_KEY || '';
    this.baseUrl = 'https://api.typeform.com';
  }

  /**
   * Get a list of all forms from Typeform API
   */
  async getFormsFromTypeform(): Promise<TypeformForm[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/forms`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });
      
      return response.data.items;
    } catch (error) {
      console.error('Error fetching forms from Typeform:', error);
      throw error;
    }
  }
  
  /**
   * Get a list of all forms from our database
   * @param includeInactive Whether to include inactive (deleted) forms in the results
   */
  async getFormsFromDatabase(includeInactive: boolean = false): Promise<DbTypeformForm[]> {
    try {
      let query = supabaseAdmin
        .from('typeform_forms')
        .select('*')
        
      // Only include active forms unless specifically requested to include inactive ones
      if (!includeInactive) {
        query = query.eq('is_active', true);
      }
      
      const { data, error } = await query.order('updated_at', { ascending: false });
      
      if (error) {
        throw new Error(`Failed to get forms from database: ${error.message}`);
      }
      
      return data || [];
    } catch (error) {
      console.error('Error fetching forms from database:', error);
      throw error;
    }
  }
  
  /**
   * Get a list of all forms (for backward compatibility)
   */
  async getForms(): Promise<TypeformForm[]> {
    // This is kept for backward compatibility
    return this.getFormsFromTypeform();
  }
  
  /**
   * Check if a form exists in our database
   * @param formId The Typeform ID to check
   * @param includeInactive Whether to consider inactive (deleted) forms as existing
   * @returns Object containing whether the form exists and the form data if it does
   */
  async checkFormExists(formId: string, includeInactive: boolean = false): Promise<{ exists: boolean; form: DbTypeformForm | null }> {
    try {
      // Look up the form by form_id - this is the Typeform ID from webhooks
      console.log(`Looking up form by Typeform ID (form_id): ${formId}`);
      let query = supabaseAdmin
        .from('typeform_forms')
        .select('*')
        .eq('form_id', formId);
      
      // Only consider active forms unless specifically requested to include inactive ones
      if (!includeInactive) {
        query = query.eq('is_active', true);
      }
      
      const { data, error } = await query.maybeSingle();
      
      if (data) {
        console.log(`Form found in database: ${formId}, internal ID: ${data.id}`);
        return { exists: true, form: data };
      }
      
      console.log(`Form not found in database: ${formId}`);
      return { exists: false, form: null };
    } catch (error) {
      console.error(`Error checking if form ${formId} exists:`, error);
      throw error;
    }
  }

  /**
   * Get detailed information about a specific form
   */
  async getFormDetails(formId: string): Promise<TypeformFormDetails> {
    try {
      const response = await axios.get(`${this.baseUrl}/forms/${formId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });
      
      return response.data;
    } catch (error) {
      console.error(`Error fetching form details for form ${formId}:`, error);
      throw error;
    }
  }

  /**
   * Sync a form from Typeform to our database
   * Will create a new form record if it doesn't exist,
   * update an existing one if it does, or reactivate a previously deleted form.
   * Also creates or reactivates field and choice versions as needed.
   */
  async syncForm(formId: string): Promise<string> {
    try {
      // Get form details from Typeform
      const formDetails = await this.getFormDetails(formId);
      
      // First check for the form - including inactive (deleted) forms
      const { data: formData, error: formError } = await supabaseAdmin
        .from('typeform_forms')
        .select('*')
        .eq('form_id', formId)
        .single();
      
      let dbFormId: string;
      
      // Form doesn't exist at all in our database
      if (formError || !formData) {
        console.log(`Form ${formId} does not exist in the database. Creating new record.`);
        const { data: newForm, error: insertError } = await supabaseAdmin
          .from('typeform_forms')
          .insert({
            form_id: formDetails.id,
            form_title: formDetails.title,
            workspace_id: formDetails.workspace?.id || null,
            is_active: true
          })
          .select('id')
          .single();
        
        if (insertError || !newForm) {
          throw new Error(`Failed to insert form: ${insertError?.message}`);
        }
        
        dbFormId = newForm.id;
      } else if (!formData.is_active) {
        // Form exists but is inactive (was deleted) - reactivate it
        console.log(`Found inactive form ${formId}. Reactivating...`);
        const { error: reactivateError } = await supabaseAdmin
          .from('typeform_forms')
          .update({
            form_title: formDetails.title, // Update with latest title
            workspace_id: formDetails.workspace?.id || null,
            is_active: true, // Reactivate the form
            updated_at: new Date().toISOString()
          })
          .eq('id', formData.id);
        
        if (reactivateError) {
          throw new Error(`Failed to reactivate form: ${reactivateError.message}`);
        }
        
        dbFormId = formData.id;
        
        // Check if we should reactivate existing field versions
        const { data: existingFields, error: fieldsError } = await supabaseAdmin
          .from('typeform_field_versions')
          .select('id, field_id, field_title')
          .eq('form_id', dbFormId)
          .eq('is_active', false);
          
        if (!fieldsError && existingFields && existingFields.length > 0) {
          console.log(`Found ${existingFields.length} inactive field versions. Will check for reactivation during sync.`);
        }
      } else {
        // Form exists and is active - just update it
        const { error: updateError } = await supabaseAdmin
          .from('typeform_forms')
          .update({
            form_title: formDetails.title,
            workspace_id: formDetails.workspace?.id || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', formData.id);
        
        if (updateError) {
          throw new Error(`Failed to update form: ${updateError.message}`);
        }
        
        dbFormId = formData.id;
      }
      
      // Set the version date for all fields and choices updated in this sync
      const versionDate = new Date().toISOString();
      
      // Track all field IDs that exist in the current Typeform response
      const allTypeformFieldIds: string[] = [];
      
      // Helper function to collect all field IDs recursively
      const collectFieldIds = (fields: any[]) => {
        for (const field of fields) {
          allTypeformFieldIds.push(field.id);
          
          // Recursively process nested fields (e.g., in groups)
          if (field.properties?.fields && Array.isArray(field.properties.fields)) {
            collectFieldIds(field.properties.fields);
          }
        }
      };
      
      // Collect all field IDs from the current Typeform response
      collectFieldIds(formDetails.fields);
      
      console.log(`Found ${allTypeformFieldIds.length} fields in Typeform response`);
      
      // Process each field recursively with its index as the display order
      for (let fieldIndex = 0; fieldIndex < formDetails.fields.length; fieldIndex++) {
        const field = formDetails.fields[fieldIndex];
        await this.processField(field, dbFormId, null, 0, versionDate, fieldIndex);
      }
      
      // After processing all fields, find any fields in our database that aren't in the Typeform response
      // and mark them as inactive
      const { data: activeDbFields, error: activeFieldsError } = await supabaseAdmin
        .from('typeform_field_versions')
        .select('id, field_id, field_title')
        .eq('form_id', dbFormId)
        .eq('is_active', true);
      
      if (!activeFieldsError && activeDbFields && activeDbFields.length > 0) {
        // Find fields that exist in our database but not in the current Typeform response
        const fieldsToDeactivate = activeDbFields.filter(dbField => 
          !allTypeformFieldIds.includes(dbField.field_id));
        
        if (fieldsToDeactivate.length > 0) {
          console.log(`Deactivating ${fieldsToDeactivate.length} fields that were deleted in Typeform:`);
          
          // Deactivate each missing field
          for (const fieldToDeactivate of fieldsToDeactivate) {
            console.log(`- Deactivating field ${fieldToDeactivate.field_id} (${fieldToDeactivate.field_title})`);
            
            const { error: deactivateError } = await supabaseAdmin
              .from('typeform_field_versions')
              .update({ is_active: false })
              .eq('id', fieldToDeactivate.id);
              
            if (deactivateError) {
              console.error(`Failed to deactivate field ${fieldToDeactivate.field_id}: ${deactivateError.message}`);
            }
          }
        } else {
          console.log('No fields to deactivate - all database fields exist in current Typeform response');
        }
      }
      
      return dbFormId;
    } catch (error) {
      console.error(`Error syncing form ${formId}:`, error);
      throw error;
    }
  }

  /**
   * Process a field and its children recursively
   * @param field The field to process
   * @param formId The database form ID
   * @param parentFieldVersionId The parent field version ID (for nested fields)
   * @param level The hierarchical level
   * @param versionDate The version date for this sync batch
   * @param displayOrder The order in which this field appears (within its parent or at the top level)
   */
  private async processField(
    field: any, 
    formId: string, 
    parentFieldVersionId: string | null, 
    level: number,
    versionDate: string,
    displayOrder: number
  ): Promise<string | null> {
    try {
      // First check if this field already exists and is active
      const { data: activeField, error: activeFieldError } = await supabaseAdmin
        .from('typeform_field_versions')
        .select('*') // Select all columns to check for changes
        .eq('form_id', formId)
        .eq('field_id', field.id)
        .eq('is_active', true)
        .order('version_date', { ascending: false })
        .limit(1);
        
      // Then check if there's an inactive version we can reactivate
      const { data: inactiveField, error: inactiveFieldError } = await supabaseAdmin
        .from('typeform_field_versions')
        .select('id')
        .eq('form_id', formId)
        .eq('field_id', field.id)
        .eq('is_active', false)
        .order('version_date', { ascending: false })
        .limit(1);
        
      let fieldVersionId: string;
      let isNewVersion = false;
      
      // Helper function to check if the field has actually changed in a meaningful way
      const hasFieldChanged = (existingField: any) => {
        // Check critical properties that would require a new version if changed
        const criticalChanges = (
          existingField.field_title !== field.title ||
          existingField.field_type !== field.type ||
          existingField.field_ref !== (field.ref || null) ||
          existingField.parent_field_version_id !== parentFieldVersionId ||
          existingField.hierarchy_level !== level
        );
        
        // If critical properties haven't changed, do a deeper check on properties
        if (!criticalChanges) {
          // Only check properties that would affect the form structure or function
          const existingProps = existingField.properties || {};
          const newProps = field.properties || {};
          
          // Compare specific property values that matter for form structure/behavior
          const compareSpecificProps = (props1: any, props2: any, propNames: string[]) => {
            for (const prop of propNames) {
              // Skip if both are undefined/null
              if (props1[prop] == null && props2[prop] == null) continue;
              
              // If one has the property and the other doesn't, it's a change
              if ((props1[prop] == null) !== (props2[prop] == null)) return true;
              
              // Arrays need special handling
              if (Array.isArray(props1[prop]) && Array.isArray(props2[prop])) {
                // Different length means changed
                if (props1[prop].length !== props2[prop].length) return true;
                
                // For fields array, we NEVER want to mark a parent as changed just because its children changed
                // Child fields are processed separately in their own processField calls
                if (prop === 'fields') {
                  // Always return false to indicate no change based on child fields
                  // This prevents unnecessary versioning of parent groups when only child fields change
                  return false;
                }
                
                // For choices, check if the IDs match
                if (prop === 'choices') {
                  const oldChoiceIds = props1[prop].map((c: any) => c.id).sort();
                  const newChoiceIds = props2[prop].map((c: any) => c.id).sort();
                  return !oldChoiceIds.every((id: string, i: number) => id === newChoiceIds[i]);
                }
              } else if (typeof props1[prop] !== typeof props2[prop]) {
                // Different types
                return true;
              } else if (typeof props1[prop] === 'object') {
                // Both are objects but not arrays - compare by keys
                const keys1 = Object.keys(props1[prop] || {}).sort();
                const keys2 = Object.keys(props2[prop] || {}).sort();
                if (keys1.length !== keys2.length) return true;
                if (!keys1.every((k, i) => k === keys2[i])) return true;
              } else if (props1[prop] !== props2[prop]) {
                // Simple value comparison
                return true;
              }
            }
            return false;
          };
          
          // List of property names that should trigger a new version if changed
          // IMPORTANT: We're removing 'fields' from this list to avoid marking a parent field as changed
          // when only its children fields change. This prevents unnecessary versioning of all fields in a group.
          const significantProps = [
            // 'fields' is intentionally excluded - we handle child fields separately in processField
            'choices',         // Choice options for multiple choice
            'steps',           // For opinion scales
            'start_at_one',    // For opinion scales
            'allow_multiple_selection', // For multiple choice
            'allow_other_choice',      // For multiple choice
            'randomize',              // For multiple choice
            'required'                // Whether the field is required
          ];
          
          return compareSpecificProps(existingProps, newProps, significantProps);
        }
        
        return criticalChanges;
      };
      
      // Case 1: Field exists and is active
      if (!activeFieldError && activeField && activeField.length > 0) {
        const currentField = activeField[0];
        
        // Only update if something has actually changed
        if (hasFieldChanged(currentField)) {
          console.log(`Field ${field.id} (${field.title}) has changed, creating new version`);
          
          // Mark the previous version as inactive
          const { error: deactivateError } = await supabaseAdmin
            .from('typeform_field_versions')
            .update({ is_active: false })
            .eq('id', currentField.id);
          
          if (deactivateError) {
            console.error(`Failed to deactivate previous field version: ${deactivateError.message}`);
          }
          
          // Insert a new version
          const { data: newFieldVersion, error: newFieldError } = await supabaseAdmin
            .from('typeform_field_versions')
            .insert({
              form_id: formId,
              field_id: field.id,
              field_title: field.title,
              field_type: field.type,
              field_ref: field.ref || null,
              properties: field.properties || {},
              parent_field_version_id: parentFieldVersionId,
              hierarchy_level: level,
              display_order: displayOrder,
              version_date: versionDate,
              is_active: true,
              is_scored: currentField.is_scored // Preserve scoring status
            })
            .select('id')
            .single();
          
          if (newFieldError || !newFieldVersion) {
            console.error(`Failed to insert new field version: ${newFieldError?.message}`);
            return currentField.id; // Return current ID if update fails
          }
          
          fieldVersionId = newFieldVersion.id;
          isNewVersion = true;
        } else {
          console.log(`Field ${field.id} (${field.title}) has not changed, keeping current version`);
          fieldVersionId = currentField.id;
        }
      }
      // Case 2: Field exists but is inactive (was deleted)
      else if (!inactiveFieldError && inactiveField && inactiveField.length > 0) {
        console.log(`Reactivating previously deleted field ${field.id} (${field.title})`);
        const { error: reactivateError } = await supabaseAdmin
          .from('typeform_field_versions')
          .update({
            field_title: field.title, // Update with latest title
            field_type: field.type,
            field_ref: field.ref || null,
            properties: field.properties || {},
            parent_field_version_id: parentFieldVersionId,
            hierarchy_level: level,
            display_order: displayOrder, // Set display order
            version_date: versionDate,
            is_active: true
          })
          .eq('id', inactiveField[0].id);
          
        if (reactivateError) {
          console.error(`Failed to reactivate field version: ${reactivateError.message}`);
          return null;
        }
        
        fieldVersionId = inactiveField[0].id;
        isNewVersion = true;
      }
      // Case 3: Field doesn't exist at all (new field)
      else {
        console.log(`Creating new field ${field.id} (${field.title})`);
        // Insert new field version
        const { data: fieldVersion, error: fieldError } = await supabaseAdmin
          .from('typeform_field_versions')
          .insert({
            form_id: formId,
            field_id: field.id,
            field_title: field.title,
            field_type: field.type,
            field_ref: field.ref || null,
            properties: field.properties || {},
            parent_field_version_id: parentFieldVersionId,
            hierarchy_level: level,
            display_order: displayOrder, // Set display order
            version_date: versionDate,
            is_active: true,
            is_scored: false // New fields are not scored by default
          })
          .select('id')
          .single();
        
        if (fieldError || !fieldVersion) {
          console.error(`Failed to insert field version: ${fieldError?.message}`);
          return null;
        }
        
        fieldVersionId = fieldVersion.id;
        isNewVersion = true;
      }
      
      // --- Start: Handle Opinion Scale Synthetic Choices --- 
      if (field.type === 'opinion_scale' && isNewVersion) {
        // Only process choices if the field is new or changed
        const steps = field.properties?.steps;
        const startAtOne = field.properties?.start_at_one;

        // Get existing choices for this field to check for changes
        // and to retrieve scoring data if it exists
        const { data: existingChoices, error: existingChoicesError } = await supabaseAdmin
          .from('typeform_choice_versions')
          .select('*')
          .eq('field_version_id', fieldVersionId);

        // Get scoring rules for existing choices
        let choicesWithScoring: Record<string, string> = {};
        
        if (!existingChoicesError && existingChoices && existingChoices.length > 0) {
          // Create a lookup for faster access
          const choiceIds = existingChoices.map(c => c.id);
          
          if (choiceIds.length > 0) {
            const { data: scoringRules, error: scoringError } = await supabaseAdmin
              .from('scoring_rules')
              .select('*')
              .eq('target_type', 'choice')
              .in('target_id', choiceIds)
              .eq('is_active', true);

            if (!scoringError && scoringRules && scoringRules.length > 0) {
              for (const rule of scoringRules) {
                choicesWithScoring[rule.target_id] = rule.score_value;
              }
            }
          }
        }

        if (typeof steps === 'number' && steps > 0) {
          const startNumber = startAtOne ? 1 : 0;
          const endNumber = startNumber + steps - 1;
          
          // List of expected choice IDs for this opinion scale
          const expectedChoiceIds = [];
          for (let number = startNumber; number <= endNumber; number++) {
            expectedChoiceIds.push(`${field.id}-${number}`);
          }
          
          // Identify choices that should be deactivated (no longer part of the scale)
          if (!existingChoicesError && existingChoices && existingChoices.length > 0) {
            for (const choice of existingChoices) {
              if (!expectedChoiceIds.includes(choice.choice_id) && choice.is_active) {
                // This choice no longer exists in the scale, deactivate it
                await supabaseAdmin
                  .from('typeform_choice_versions')
                  .update({ is_active: false })
                  .eq('id', choice.id);
              }
            }
          }

          // Create or update choices that should be active
          for (let number = startNumber; number <= endNumber; number++) {
            const choiceLabel = String(number);
            // Create a synthetic but stable choice ID based on field ID and number
            const syntheticChoiceId = `${field.id}-${number}`;
            const displayOrder = number - startNumber; // 0-based index for order

            // Check for existing active choice
            const existingChoice = existingChoices?.find(c => 
              c.choice_id === syntheticChoiceId && c.is_active);

            if (existingChoice) {
              // Check if anything changed
              if (existingChoice.choice_label !== choiceLabel || 
                  existingChoice.choice_ref !== choiceLabel || 
                  existingChoice.display_order !== displayOrder) {
                
                // Update with new properties
                const { error: updateError } = await supabaseAdmin
                  .from('typeform_choice_versions')
                  .update({
                    choice_label: choiceLabel,
                    choice_ref: choiceLabel,
                    display_order: displayOrder,
                    version_date: versionDate
                  })
                  .eq('id', existingChoice.id);
                  
                if (updateError) {
                  console.error(`Failed to update choice ${syntheticChoiceId}: ${updateError.message}`);
                }
              }
            } else {
              // Check for inactive version to reactivate
              const { data: inactiveChoice, error: inactiveChoiceError } = await supabaseAdmin
                .from('typeform_choice_versions')
                .select('id')
                .eq('field_version_id', fieldVersionId)
                .eq('choice_id', syntheticChoiceId)
                .eq('is_active', false)
                .limit(1);

              if (!inactiveChoiceError && inactiveChoice && inactiveChoice.length > 0) {
                // Reactivate existing choice
                await supabaseAdmin
                  .from('typeform_choice_versions')
                  .update({
                    choice_label: choiceLabel,
                    choice_ref: choiceLabel,
                    display_order: displayOrder,
                    version_date: versionDate,
                    is_active: true
                  })
                  .eq('id', inactiveChoice[0].id);
              } else {
                // Create new choice
                await supabaseAdmin
                  .from('typeform_choice_versions')
                  .insert({
                    field_version_id: fieldVersionId,
                    choice_id: syntheticChoiceId,
                    choice_label: choiceLabel,
                    choice_ref: choiceLabel,
                    display_order: displayOrder,
                    version_date: versionDate,
                    is_active: true
                  });
              }
            }
          }
        } else {
          console.warn(`Opinion scale field ${field.id} has invalid 'steps' property. Cannot generate choices.`);
        }
      }
      // --- End: Handle Opinion Scale Synthetic Choices ---
      
      // Process nested fields if this is a group question
      if (field.properties?.fields && Array.isArray(field.properties.fields)) {
        // Process each child field with its index as the display order within the group
        for (let groupFieldIndex = 0; groupFieldIndex < field.properties.fields.length; groupFieldIndex++) {
          const childField = field.properties.fields[groupFieldIndex];
          await this.processField(
            childField, 
            formId, 
            fieldVersionId, 
            level + 1, 
            versionDate, 
            groupFieldIndex // Pass the index as display order for the child field
          );
        }
      }
      
      // Process choices if field has them (and is NOT an opinion scale)
      else if (field.properties?.choices && Array.isArray(field.properties.choices) && isNewVersion) {
        // Only process choices if the field is new or has changed
        // Get existing choices for this field to check for changes and retrieve scoring data
        const { data: existingChoices, error: existingChoicesError } = await supabaseAdmin
          .from('typeform_choice_versions')
          .select('*')
          .eq('field_version_id', fieldVersionId);

        // Get existing scoring rules for choices to preserve them
        let choicesWithScoring: Record<string, string> = {};
        let choiceIdMap: Record<string, string> = {}; // Map choice_id to choice version id

        if (!existingChoicesError && existingChoices && existingChoices.length > 0) {
          for (const choice of existingChoices) {
            choiceIdMap[choice.choice_id] = choice.id;
          }

          // Get scoring rules if we have any choices
          const choiceIds = existingChoices.map(c => c.id);
          if (choiceIds.length > 0) {
            const { data: scoringRules, error: scoringError } = await supabaseAdmin
              .from('scoring_rules')
              .select('*')
              .eq('target_type', 'choice')
              .in('target_id', choiceIds)
              .eq('is_active', true);

            if (!scoringError && scoringRules && scoringRules.length > 0) {
              for (const rule of scoringRules) {
                // Store score value by choice version id
                choicesWithScoring[rule.target_id] = rule.score_value;
              }
            }
          }
        }

        // List of new choice IDs in the current form
        const currentChoiceIds = field.properties.choices.map((c: any) => c.id);

        // Deactivate choices that no longer exist in the form
        if (!existingChoicesError && existingChoices && existingChoices.length > 0) {
          for (const choice of existingChoices) {
            if (!currentChoiceIds.includes(choice.choice_id) && choice.is_active) {
              console.log(`Deactivating choice ${choice.choice_id} as it no longer exists`);
              await supabaseAdmin
                .from('typeform_choice_versions')
                .update({ is_active: false })
                .eq('id', choice.id);
            }
          }
        }

        // Process each choice with its index as the display order
        for (let choiceIndex = 0; choiceIndex < field.properties.choices.length; choiceIndex++) {
          const choice = field.properties.choices[choiceIndex];

          // Check if this choice already exists and is active
          const existingChoice = existingChoices?.find(c => 
            c.choice_id === choice.id && c.is_active);

          if (existingChoice) {
            // Check if the choice has changed
            if (existingChoice.choice_label !== choice.label || 
                existingChoice.choice_ref !== (choice.ref || null) || 
                existingChoice.display_order !== choiceIndex) {
              
              console.log(`Updating modified choice ${choice.id} (${choice.label})`);
              // Update the choice with new properties
              const { error: updateError } = await supabaseAdmin
                .from('typeform_choice_versions')
                .update({
                  choice_label: choice.label,
                  choice_ref: choice.ref || null,
                  display_order: choiceIndex,
                  version_date: versionDate
                })
                .eq('id', existingChoice.id);
                
              if (updateError) {
                console.error(`Failed to update choice ${choice.id}: ${updateError.message}`);
              }
            }
          } else {
            // Check if this choice exists but is inactive
            const { data: inactiveChoice, error: inactiveChoiceError } = await supabaseAdmin
              .from('typeform_choice_versions')
              .select('id')
              .eq('field_version_id', fieldVersionId)
              .eq('choice_id', choice.id)
              .eq('is_active', false)
              .order('version_date', { ascending: false })
              .limit(1);
            
            // If choice exists but is inactive, reactivate it
            if (!inactiveChoiceError && inactiveChoice && inactiveChoice.length > 0) {
              console.log(`Reactivating choice ${choice.id} (${choice.label})`);
              const { error: reactivateError } = await supabaseAdmin
                .from('typeform_choice_versions')
                .update({
                  choice_label: choice.label,
                  choice_ref: choice.ref || null,
                  display_order: choiceIndex, // Set choice display order
                  version_date: versionDate,
                  is_active: true
                })
                .eq('id', inactiveChoice[0].id);
                
              if (reactivateError) {
                console.error(`Failed to reactivate choice version: ${reactivateError.message}`);
              }
            } else {
              // Insert new choice version if no inactive version exists
              console.log(`Creating new choice ${choice.id} (${choice.label})`);
              const { data: newChoice, error: choiceError } = await supabaseAdmin
                .from('typeform_choice_versions')
                .insert({
                  field_version_id: fieldVersionId,
                  choice_id: choice.id,
                  choice_label: choice.label,
                  choice_ref: choice.ref || null,
                  display_order: choiceIndex, // Set choice display order
                  version_date: versionDate,
                  is_active: true
                })
                .select('id')
                .single();
              
              if (choiceError || !newChoice) {
                console.error(`Failed to insert choice version: ${choiceError?.message}`);
              }
            }
          }
        }
      }
      
      return fieldVersionId;
    } catch (error) {
      console.error(`Error processing field: ${field.id}`, error);
      return null;
    }
  }

  /**
   * Get all field versions for a form
   * @param formId The Typeform form ID (e.g., "cY2L1JML") or internal database UUID
   * @param activeOnly Whether to only return active field versions
   */
  async getFormFieldVersions(formId: string, activeOnly: boolean = true): Promise<DbTypeformFieldVersion[]> {
    try {
      // First determine if we need to look up the internal ID (for non-UUID formIds)
      let dbFormId: string;
      
      // Check if formId is a UUID or a Typeform ID
      // Valid UUID format check (simplified)
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      
      if (!uuidPattern.test(formId)) {
        // Not a UUID, so it's likely a Typeform ID - look up the internal UUID
        const { data: formData, error: formError } = await supabaseAdmin
          .from('typeform_forms')
          .select('id')
          .eq('form_id', formId)
          .single();
        
        if (formError || !formData) {
          throw new Error(`Form with ID ${formId} not found: ${formError?.message || 'Not found'}`);
        }
        
        dbFormId = formData.id;
      } else {
        // It's already a UUID
        dbFormId = formId;
      }
      
      // Now query field versions using the internal UUID
      let query = supabaseAdmin
        .from('typeform_field_versions')
        .select('*')
        .eq('form_id', dbFormId);
      
      if (activeOnly) {
        query = query.eq('is_active', true);
      }
      
      // Order by hierarchy level and then by display order for a natural hierarchy display
      query = query.order('hierarchy_level', { ascending: true }).order('display_order', { ascending: true });
      
      const { data, error } = await query;
      
      if (error) {
        throw new Error(`Failed to get field versions: ${error.message}`);
      }
      
      return data || [];
    } catch (error) {
      console.error(`Error getting field versions for form ${formId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get all field versions for a specific parent field
   */
  async getChildFieldVersions(parentFieldVersionId: string, activeOnly: boolean = true): Promise<DbTypeformFieldVersion[]> {
    try {
      let query = supabaseAdmin
        .from('typeform_field_versions')
        .select('*')
        .eq('parent_field_version_id', parentFieldVersionId);
      
      if (activeOnly) {
        query = query.eq('is_active', true);
      }
      
      // Order by display order for a natural display
      query = query.order('display_order', { ascending: true });
      
      const { data, error } = await query;
      
      if (error) {
        throw new Error(`Failed to get child field versions: ${error.message}`);
      }
      
      return data || [];
    } catch (error) {
      console.error(`Error getting child field versions for parent ${parentFieldVersionId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get all choice versions for a field version
   */
  async getFieldChoiceVersions(fieldVersionId: string, activeOnly: boolean = true): Promise<DbTypeformChoiceVersion[]> {
    try {
      let query = supabaseAdmin
        .from('typeform_choice_versions')
        .select('*')
        .eq('field_version_id', fieldVersionId);
      
      if (activeOnly) {
        query = query.eq('is_active', true);
      }
      
      // Order by display order for a natural display
      query = query.order('display_order', { ascending: true });
      
      const { data, error } = await query;
      
      if (error) {
        throw new Error(`Failed to get choice versions: ${error.message}`);
      }
      
      return data || [];
    } catch (error) {
      console.error(`Error getting choice versions for field ${fieldVersionId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get scoring rules for fields and choices
   */
  async getScoringRules(targetType: 'field' | 'choice', targetIds: string[]): Promise<DbScoringRule[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('scoring_rules')
        .select('*')
        .eq('target_type', targetType)
        .in('target_id', targetIds)
        .eq('is_active', true);
      
      if (error) {
        throw new Error(`Failed to get scoring rules: ${error.message}`);
      }
      
      return data || [];
    } catch (error) {
      console.error(`Error getting ${targetType} scoring rules:`, error);
      throw error;
    }
  }
  
  /**
   * Create or update a scoring rule
   */
  async setScoringRule(
    targetType: 'field' | 'choice',
    targetId: string,
    scoreValue: 'red' | 'yellow' | 'green' | 'na',
    userId: string,
    criteria: any = {}
  ): Promise<string> {
    try {
      // Check if rule already exists
      let query = supabaseAdmin
        .from('scoring_rules')
        .select('id')
        .eq('target_type', targetType)
        .eq('target_id', targetId)
        .eq('is_active', true);

      // Add criteria matching for field types
      if (targetType === 'field') {
        if (criteria && Object.keys(criteria).length > 0) {
          // Stringify the criteria object for JSONB comparison
          query = query.eq('criteria', JSON.stringify(criteria)); 
        } else {
          query = query.is('criteria', null); // Match NULL criteria if none provided
        }
      }

      const { data: existingRule, error: findError } = await query.single();
      
      if (findError && findError.code !== 'PGRST116') { // PGRST116 is "no rows returned" which is fine
        throw new Error(`Failed to check for existing rule: ${findError.message}`);
      }
      
      if (existingRule) {
        // Update existing rule
        const { error: updateError } = await supabaseAdmin
          .from('scoring_rules')
          .update({
            score_value: scoreValue,
            criteria,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingRule.id);
        
        if (updateError) {
          throw new Error(`Failed to update scoring rule: ${updateError.message}`);
        }
        
        return existingRule.id;
      } else {
        // Create new rule
        const { data: newRule, error: insertError } = await supabaseAdmin
          .from('scoring_rules')
          .insert({
            target_type: targetType,
            target_id: targetId,
            score_value: scoreValue,
            criteria,
            created_by: userId
          })
          .select('id')
          .single();
        
        if (insertError || !newRule) {
          throw new Error(`Failed to insert scoring rule: ${insertError?.message}`);
        }
        
        return newRule.id;
      }
    } catch (error) {
      console.error(`Error setting scoring rule:`, error);
      throw error;
    }
  }
  
  /**
   * Check if a scoring rule exists
   */
  async checkScoringRuleExists(ruleId: string): Promise<{ exists: boolean }> {
    try {
      const { data, error } = await supabaseAdmin
        .from('scoring_rules')
        .select('id')
        .eq('id', ruleId)
        .eq('is_active', true)
        .maybeSingle();
      
      if (error) {
        throw new Error(`Failed to check if scoring rule exists: ${error.message}`);
      }
      
      return { exists: !!data };
    } catch (error) {
      console.error(`Error checking if scoring rule ${ruleId} exists:`, error);
      throw error;
    }
  }

  /**
   * Delete a scoring rule
   */
  async deleteScoringRule(ruleId: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('scoring_rules')
        .update({ is_active: false })
        .eq('id', ruleId);
      
      if (error) {
        throw new Error(`Failed to delete scoring rule: ${error.message}`);
      }
    } catch (error) {
      console.error(`Error deleting scoring rule ${ruleId}:`, error);
      throw error;
    }
  }
  
  /**
   * Delete a form from the database
   * This is a soft delete that marks the form and its fields/choices as inactive
   * @param formId The Typeform form ID (e.g., "cY2L1JML") or internal database UUID
   */
  async deleteForm(formId: string): Promise<void> {
    try {
      // First determine if we're dealing with a Typeform ID or a database UUID
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let dbFormId: string;
      
      if (!uuidPattern.test(formId)) {
        // Not a UUID, so it's likely a Typeform ID - look up the internal UUID
        const { data: formData, error: formError } = await supabaseAdmin
          .from('typeform_forms')
          .select('id')
          .eq('form_id', formId)
          .single();
        
        if (formError || !formData) {
          throw new Error(`Form with ID ${formId} not found`);
        }
        
        dbFormId = formData.id;
      } else {
        dbFormId = formId;
      }
      
      // Start a transaction
      console.log(`Starting deletion transaction for form ${dbFormId}`);
      
      // 1. Mark all scoring rules for form fields as inactive
      console.log(`Marking related scoring rules as inactive...`);
      const { data: fieldVersions, error: fieldVersionsError } = await supabaseAdmin
        .from('typeform_field_versions')
        .select('id')
        .eq('form_id', dbFormId);
      
      if (fieldVersionsError) {
        throw new Error(`Failed to get field versions: ${fieldVersionsError.message}`);
      }
      
      if (fieldVersions && fieldVersions.length > 0) {
        const fieldIds = fieldVersions.map(field => field.id);
        
        // Mark field scoring rules as inactive
        const { error: fieldRuleError } = await supabaseAdmin
          .from('scoring_rules')
          .update({ is_active: false })
          .eq('target_type', 'field')
          .in('target_id', fieldIds);
        
        if (fieldRuleError) {
          throw new Error(`Failed to mark field scoring rules as inactive: ${fieldRuleError.message}`);
        }
        
        // Get all choice versions for these fields to mark their scoring rules inactive too
        console.log(`Marking related choice scoring rules as inactive...`);
        const { data: choiceVersions, error: choiceVersionsError } = await supabaseAdmin
          .from('typeform_choice_versions')
          .select('id')
          .in('field_version_id', fieldIds);
        
        if (choiceVersionsError) {
          throw new Error(`Failed to get choice versions: ${choiceVersionsError.message}`);
        }
        
        if (choiceVersions && choiceVersions.length > 0) {
          const choiceIds = choiceVersions.map(choice => choice.id);
          
          // Mark choice scoring rules as inactive
          const { error: choiceRuleError } = await supabaseAdmin
            .from('scoring_rules')
            .update({ is_active: false })
            .eq('target_type', 'choice')
            .in('target_id', choiceIds);
          
          if (choiceRuleError) {
            throw new Error(`Failed to mark choice scoring rules as inactive: ${choiceRuleError.message}`);
          }
          
          // Mark all choice versions as inactive
          console.log(`Marking choice versions as inactive...`);
          const { error: choiceVersionError } = await supabaseAdmin
            .from('typeform_choice_versions')
            .update({ is_active: false })
            .in('field_version_id', fieldIds);
          
          if (choiceVersionError) {
            throw new Error(`Failed to mark choice versions as inactive: ${choiceVersionError.message}`);
          }
        }
        
        // Mark all field versions as inactive
        console.log(`Marking field versions as inactive...`);
        const { error: fieldVersionError } = await supabaseAdmin
          .from('typeform_field_versions')
          .update({ is_active: false })
          .eq('form_id', dbFormId);
        
        if (fieldVersionError) {
          throw new Error(`Failed to mark field versions as inactive: ${fieldVersionError.message}`);
        }
      }
      
      // Finally, mark the form as inactive
      console.log(`Marking form as inactive...`);
      const { error: formError } = await supabaseAdmin
        .from('typeform_forms')
        .update({ is_active: false })
        .eq('id', dbFormId);
      
      if (formError) {
        throw new Error(`Failed to mark form as inactive: ${formError.message}`);
      }
      
      console.log(`Successfully marked form ${dbFormId} and related data as inactive`);
    } catch (error) {
      console.error(`Error deleting form ${formId}:`, error);
      throw error;
    }
  }
}

// Export a singleton instance
export const typeformService = new TypeformService();
