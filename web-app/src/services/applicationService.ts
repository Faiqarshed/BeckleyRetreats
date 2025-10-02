import {scoringService} from '@/services/scoringService';
import {typeformService} from '@/services/typeformService';
import {
  Application,
  ApplicationStatus,
  Participant,
  ParticipantData,
  SavedTypeFormApplication,
  TypeformAnswer,
  TypeformFieldDefinition,
  TypeformWebhook
} from '@/types/application';
import {createClient, SupabaseClient} from '@supabase/supabase-js';

// Initialize Supabase client with service role for admin operations
const supabaseAdmin: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export class ApplicationService {
  /**
   * Process incoming Typeform webhook data
   * @param webhookData Data from Typeform webhook
   * @returns Application details
   */
  async createApplicationFromWebhookData(webhookData: TypeformWebhook): Promise<{
    application: Application;
    score?: number;
    isDuplicate?: boolean
  }> {
    if (!webhookData.form_response) {
      throw new Error('Invalid webhook data: form_response is missing');
    }

    const {
      form_id: typeformId,
      token,
      submitted_at,
      answers,
      definition
    } = webhookData.form_response;

    try {
      console.log(`Processing webhook submission for form ${typeformId}`);

      // Check if this application already exists
      const existingApplication = await this.findApplicationByToken(token);
      if (existingApplication) {
        console.log(`Application with typeform_response_id ${token} already exists`);

        // Create notification for admins about duplicate submission
        await this.createDuplicateSubmissionNotification(existingApplication.id, token);

        // Return existing application info with a duplicate flag
        return {
          application: existingApplication,
          score: existingApplication.calculated_score,
          isDuplicate: true
        };
      }

      // 1. Make sure the form exists in our system
      const {exists, form} = await typeformService.checkFormExists(typeformId);
      if (!exists || !form) {
        throw new Error(`Form with ID ${typeformId} not found in our system`);
      }

      // 2. Extract participant data from answers
      const participantData = this.extractParticipantData(answers, definition.fields);

      // 3. Check if participant already exists, create if not
      const participant = await this.findOrCreateParticipant(participantData);

      // 4. Create application record
      const application = await this.createApplication({
        participantId: participant.id,
        formId: form.id,
        typeformResponseId: token,
        submissionDate: submitted_at,
        rawData: webhookData.form_response // Store only the form response, not the entire webhook
      });

      // Note: 12-08-2025, we have shifted the logic to separate call at /re-process endpoint
      // // 5. Process each answer and store field responses
      // // Pass the internal form UUID needed for relational lookups as well as field definitions
      // await this.processAnswers(application.id, form.id, answers, definition.fields);
      //
      // // 6. Calculate and update application score
      // const score = await this.calculateApplicationScore(application.id);
      const score = 0; // Placeholder for score calculation, to be implemented in separate thread

      // The application score and counts are already updated in calculateApplicationScore
      // No need to update again here

      console.log(`Application processed successfully. ID: ${application.id}, Score: ${score}`);
      return {application: application, score};
    } catch (error) {
      console.error(`Error processing application for form ${typeformId}:`, error);
      throw error;
    }
  }

  async processAnswersForApplication(application: Application) {
    return this.processAnswers(
      application.id,
      application.form_id,
      application.raw_data.answers || [],
      application.raw_data.definition?.fields || []
    );
  }

  /**
   * Create a notification for admin users about duplicate submission
   * @param applicationId Application ID that was duplicated
   * @param token Typeform response token
   */
  private async createDuplicateSubmissionNotification(applicationId: string, token: string): Promise<void> {
    try {
      console.log(`Creating notification for duplicate submission of application ${applicationId}`);

      // TODO: Implement proper notification system
      // This is a stub for future implementation of the notifications feature

      // 1. Get admin and program operations manager users
      const {data: adminUsers, error} = await supabaseAdmin
        .from('users')
        .select('id, email')
        .in('role', ['program_operations_admin', 'program_operations_manager']);

      if (error) {
        console.error('Error fetching admin users for notification:', error);
        return;
      }

      // 2. Create notification record for each admin user
      // Note: This is just logging for now since the notifications table/feature is not yet implemented
      console.log(`Would notify ${adminUsers?.length || 0} admin users about duplicate submission`);

      // When notifications table is implemented, we would do something like:
      // for (const user of adminUsers || []) {
      //   await supabaseAdmin.from('notifications').insert({
      //     user_id: user.id,
      //     type: 'duplicate_submission',
      //     content: `Duplicate application submission detected (ID: ${applicationId}, Token: ${token})`,
      //     is_read: false,
      //     created_at: new Date().toISOString()
      //   });
      // }
    } catch (error) {
      // Log but don't throw - this is a non-critical operation
      console.error('Error creating duplicate submission notification:', error);
    }
  }

  /**
   * Extract participant information from Typeform answers
   * @param answers Array of Typeform answers
   * @param fields Array of field definitions
   * @returns Structured participant data
   */
  private extractParticipantData(answers: TypeformAnswer[], fields: TypeformFieldDefinition[]): ParticipantData {
    // Debug log incoming data
    console.log(`Extracting participant data from ${answers.length} answers and ${fields.length} fields`);
    console.log('Field definitions:', JSON.stringify(fields.map(f => ({
      id: f.id,
      title: f.title,
      ref: f.ref,
      type: f.type
    })), null, 2));
    console.log('Answer data:', JSON.stringify(answers.map(a => ({
      type: a.type,
      field: a.field,
      text: a.text,
      email: a.email
    })), null, 2));

    // Create maps for fields by id, ref, and title to make matching more flexible
    const fieldRefMap = new Map();
    const fieldIdMap = new Map();
    const fieldTitleMap = new Map();

    fields.forEach(field => {
      fieldIdMap.set(field.id, field);
      if (field.ref) fieldRefMap.set(field.ref.toLowerCase(), field);
      if (field.title) fieldTitleMap.set(field.title.toLowerCase(), field);
    });

    // Initialize with empty values
    const participantData: ParticipantData = {
      email: '',
      firstName: '',
      lastName: ''
    };

    // Track if we've already found specific participant information to avoid overwriting with emergency contact info
    const found = {
      email: false,
      firstName: false,
      lastName: false,
      phone: false,
      dateOfBirth: false
    };

    // Process each answer to extract participant data
    answers.forEach(answer => {
      // Extract field information
      const fieldId = answer.field.id;
      const fieldRef = answer.field.ref?.toLowerCase() || '';
      const fieldType = answer.type;

      // Try to identify the field by looking at field ids, refs, and titles
      const field = fieldIdMap.get(fieldId);
      const fieldTitle = field?.title?.toLowerCase() || '';

      console.log(`Processing answer for field: ${fieldId}, ref: ${fieldRef}, title: ${fieldTitle}, type: ${fieldType}`);

      // Check for emergency contact fields - skip these as they should not be used for participant data
      if (fieldRef.includes('emergency') ||
        fieldTitle.includes('emergency') ||
        fieldRef.includes('contact_') ||
        fieldTitle.includes('emergency contact')) {
        console.log('Skipping emergency contact field');
        return; // Skip to next answer
      }

      // Identify field by type and content - first check for email fields
      if (fieldType === 'email' && !found.email) {
        participantData.email = answer.email || '';
        found.email = true;
        console.log(`Found participant email: ${participantData.email}`);
      }
      // Then look for name fields (first name, last name)
      else if ((fieldType === 'text' || fieldType === 'short_text')) {
        // Look at field ref and title to guess what this field is
        const text = answer.text || '';

        // First name variations
        if ((fieldRef.includes('first') || fieldRef.includes('firstname') ||
            fieldTitle.includes('first name') || fieldTitle.includes('first_name')) &&
          !found.firstName) {
          participantData.firstName = text;
          found.firstName = true;
          console.log(`Found participant first name: ${participantData.firstName}`);
        }
        // Last name variations
        else if ((fieldRef.includes('last') || fieldRef.includes('lastname') ||
            fieldTitle.includes('last name') || fieldTitle.includes('last_name')) &&
          !found.lastName) {
          participantData.lastName = text;
          found.lastName = true;
          console.log(`Found participant last name: ${participantData.lastName}`);
        }
        // Full name field - try to split it
        else if ((fieldRef.includes('name') || fieldTitle.includes('name')) &&
          (!found.firstName || !found.lastName)) {
          if (text.includes(' ')) {
            const nameParts = text.split(' ');
            if (nameParts.length >= 2) {
              // If we don't already have a first name, use the first part
              if (!found.firstName) {
                participantData.firstName = nameParts[0];
                found.firstName = true;
                console.log(`Extracted participant first name from full name: ${participantData.firstName}`);
              }
              // If we don't already have a last name, use the last part
              if (!found.lastName) {
                participantData.lastName = nameParts[nameParts.length - 1];
                found.lastName = true;
                console.log(`Extracted participant last name from full name: ${participantData.lastName}`);
              }
            }
          }
        }
      }
      // Phone number field
      else if (fieldType === 'phone_number' && !found.phone) {
        participantData.phone = answer.phone_number || '';
        found.phone = true;
        console.log(`Found participant phone: ${participantData.phone}`);
      }
      // Date of birth field
      else if (fieldType === 'date' &&
        (fieldRef.includes('birth') || fieldRef.includes('dob') ||
          fieldTitle.includes('birth') || fieldTitle.includes('dob')) &&
        !found.dateOfBirth) {
        participantData.dateOfBirth = answer.date || '';
        found.dateOfBirth = true;
        console.log(`Found participant date of birth: ${participantData.dateOfBirth}`);
      }
    });

    // For testing/development - create default values if missing
    if (!participantData.email) {
      console.warn('Email not found in form data, using a default value');
      participantData.email = `applicant_${Date.now()}@example.com`;
    }

    if (!participantData.firstName) {
      console.warn('First name not found in form data, using a default value');
      participantData.firstName = 'Anonymous';
    }

    if (!participantData.lastName) {
      console.warn('Last name not found in form data, using a default value');
      participantData.lastName = 'Applicant';
    }

    console.log('Extracted participant data:', JSON.stringify(participantData, null, 2));
    return participantData;
  }

  /**
   * Find existing participant or create a new one
   * @param participantData Participant information
   * @returns Participant record
   */
  private async findOrCreateParticipant(participantData: ParticipantData): Promise<Participant> {
    try {
      // Check if participant exists by email
      const {data: existingParticipants, error: queryError} = await supabaseAdmin
        .from('participants')
        .select('*')
        .eq('email', participantData.email)
        .limit(1);

      if (queryError) throw queryError;

      if (existingParticipants && existingParticipants.length > 0) {
        console.log(`Found existing participant with email ${participantData.email}`);
        return existingParticipants[0];
      }

      // Create new participant
      const now = new Date().toISOString();
      const {data: newParticipant, error: insertError} = await supabaseAdmin
        .from('participants')
        .insert({
          email: participantData.email,
          first_name: participantData.firstName,
          last_name: participantData.lastName,
          phone: participantData.phone || null,
          date_of_birth: participantData.dateOfBirth || null,
          created_at: now,
          updated_at: now
        })
        .select()
        .single();

      if (insertError) throw insertError;

      if (!newParticipant) {
        throw new Error(`Failed to create new participant: ${participantData.email}`);
      }

      console.log(`Created new participant with ID: ${newParticipant.id}`);
      return newParticipant;
    } catch (error) {
      console.error('Error in findOrCreateParticipant:', error);
      throw error;
    }
  }

  /**
   * Create a new application record
   * @param applicationData Application data
   * @returns Created application
   */
  private async createApplication(applicationData: {
    participantId: string;
    formId: string;
    typeformResponseId: string;
    submissionDate: string;
    rawData: any;
  }): Promise<Application> {
    try {
      const now = new Date().toISOString();

      // Check if an application with this typeform response ID already exists
      if (applicationData.typeformResponseId) {
        const {data: existingApplications} = await supabaseAdmin
          .from('applications')
          .select('*')
          .eq('typeform_response_id', applicationData.typeformResponseId)
          .limit(1);

        if (existingApplications && existingApplications.length > 0) {
          console.log(`Application with typeform_response_id ${applicationData.typeformResponseId} already exists`);
          return existingApplications[0];
        }
      }

      // Create new application
      const {data, error} = await supabaseAdmin
        .from('applications')
        .insert({
          participant_id: applicationData.participantId,
          form_id: applicationData.formId,
          typeform_response_id: applicationData.typeformResponseId,
          submission_date: applicationData.submissionDate,
          raw_data: applicationData.rawData,
          status: 'pending' as ApplicationStatus,
          application_data: {
            form_id: applicationData.formId,
            submission_date: applicationData.submissionDate,
            status: 'pending'
          },
          created_at: now,
          updated_at: now
        })
        .select()
        .single();

      if (error) throw error;

      if (!data) {
        throw new Error('Failed to create application');
      }

      console.log(`Created new application with ID: ${data.id}`);
      return data;
    } catch (error) {
      console.error('Error in createApplication:', error);
      throw error;
    }
  }

  /**
   * Process individual answers from Typeform submission
   * @param applicationId Application ID
   * @param formId Form ID
   * @param answers Array of Typeform answers
   * @param fieldDefinitions Array of Typeform field definitions
   */
  private async processAnswers(applicationId: string, formId: string, answers: TypeformAnswer[], fieldDefinitions: any[] = []): Promise<void> {
    try {
      console.log(`Processing ${answers.length} answers for form ${formId}`);
      let processedCount = 0;
      let skippedCount = 0;

      // The formId parameter here is the internal form UUID from the database (not the Typeform ID)
      // It's already been found in processTypeformWebhook, so we don't need to look it up again
      console.log(`Processing answers for internal form ID: ${formId}`);

      // Use the internal form UUID directly - no need to look it up again
      const dbFormId = formId;

      // First phase: Collect all field IDs from the answers to batch process
      const fieldIds = answers.map(answer => answer.field.id);

      // Second phase: Fetch all field versions in a single query
      const {data: allFieldVersions, error: fieldVersionsError} = await supabaseAdmin
        .from('typeform_field_versions')
        .select('*')
        .in('field_id', fieldIds)
        .order('version_date', {ascending: false});

      if (fieldVersionsError) {
        console.error(`Error fetching field versions:`, fieldVersionsError);
        await this.storeAnswersAsRawData(applicationId, formId, answers);
        return;
      }
      console.log(`all Field Versions: ${allFieldVersions?.length || 0}`);


      // Create a map of field_id to field version for quick lookups
      // Taking the most recent version of each field
      const fieldVersionMap = new Map();
      allFieldVersions?.forEach(version => {
        // Only add if this field_id isn't in the map or has a newer date
        if (!fieldVersionMap.has(version.field_id) ||
          new Date(version.version_date) > new Date(fieldVersionMap.get(version.field_id).version_date)) {
          fieldVersionMap.set(version.field_id, version);
        }
      });
      console.log(`Field Version Map: ${fieldVersionMap}`);

      // Third phase: Prepare batch insert data for all field responses
      const responsesToInsert = [];
      const now = new Date().toISOString();

      // Field definitions are passed in from the webhook data

      // Process all answers and prepare insert data
      for (const answer of answers) {
        try {
          const fieldId = answer.field.id;
          const fieldVersion = fieldVersionMap.get(fieldId);

          if (!fieldVersion) {
            console.warn(`No field version found for field ${fieldId}, skipping`);
            skippedCount++;
            continue;
          }

          // Check if this is a multi-select multiple choice field
          const isMultiSelect = this.isMultiSelectField(answer, fieldDefinitions);

          if (isMultiSelect) {
            // For multi-select fields, create individual records for each selected choice
            const choiceValues = this.extractChoiceValues(answer);
            console.log(`MULTI-SELECT: Processing field ${fieldId} with ${choiceValues.length} selections`);

            if (choiceValues.length === 0) {
              console.warn(`MULTI-SELECT: Field ${fieldId} identified as multi-select but no choices extracted, skipping`);
              skippedCount++;
              continue;
            }

            // First fetch the choice versions for all selected choices
            console.log(`MULTI-SELECT: Fetching choice versions for field ${fieldId} with choices: ${choiceValues.map((c: any) => c.id).join(', ')}`);

            const {data: choiceVersions, error: choiceVersionsError} = await supabaseAdmin
              .from('typeform_choice_versions')
              .select('*')
              .eq('field_version_id', fieldVersion.id)
              .in('choice_id', choiceValues.map((c: any) => c.id));

            if (choiceVersionsError) {
              console.error(`MULTI-SELECT: Error fetching choice versions for field ${fieldId}:`, choiceVersionsError);
            }

            console.log(`MULTI-SELECT: Found ${choiceVersions?.length || 0} choice versions in database for field ${fieldId}`);

            // Create a map of choice_id to choice_version for quick lookups
            const choiceVersionMap = new Map<string, any>();
            const choiceLabelMap = new Map<string, string>();

            if (choiceVersions && choiceVersions.length > 0) {
              choiceVersions.forEach((version: any) => {
                // Store the most recent version for each choice
                if (!choiceVersionMap.has(version.choice_id) ||
                  new Date(version.version_date) > new Date(choiceVersionMap.get(version.choice_id).version_date)) {
                  choiceVersionMap.set(version.choice_id, version);
                  choiceLabelMap.set(version.choice_id, version.choice_label);
                  console.log(`MULTI-SELECT: Mapped choice ID ${version.choice_id} to version ID ${version.id} and label "${version.choice_label}"`);
                }
              });
            }

            // Create an individual record for each choice (no parent record)
            choiceValues.forEach((choice: any, index: number) => {
              const choiceVersion = choiceVersionMap.get(choice.id);
              const choiceVersionId = choiceVersion?.id || null;

              // Use the choice label from DB when available, otherwise from response
              const choiceLabel = choiceLabelMap.get(choice.id) || choice.label || choice.id;

              // Create an individual record for this choice
              const choiceRecord = {
                application_id: applicationId,
                field_version_id: fieldVersion.id,
                choice_version_id: choiceVersionId, // Important: Set the actual choice_version_id field
                response_value: choiceLabel,
                created_at: now,
                response_metadata: {
                  is_multi_select: true,
                  is_choice: true,
                  choice_index: index,
                  choice_id: choice.id,
                  choice_ref: choice.ref
                }
              };
              
              console.log(`choice Record: ${choiceRecord}`);


              // Add this individual choice record to the insert queue
              responsesToInsert.push(choiceRecord);
              console.log(`MULTI-SELECT: Added individual choice record for "${choiceLabel}" (ID: ${choice.id}, version_id: ${choiceVersionId})`);
            });

            console.log(`MULTI-SELECT: Created ${choiceValues.length} individual choice records for field ${fieldId}`);
            processedCount++;
            continue;
          } else {
            // Regular single-select or other field types
            const responseValue = this.extractResponseValue(answer);

            // For single-choice fields, also store the choice_version_id
            let choiceVersionId = null;
            if (answer.type === 'choice' && answer.choice?.id) {
              const {data: choiceVersions, error: choiceVersionError} = await supabaseAdmin
                .from('typeform_choice_versions')
                .select('*')
                .eq('field_version_id', fieldVersion.id)
                .eq('choice_id', answer.choice.id)
                .order('version_date', {ascending: false})
                .limit(1);

              if (!choiceVersionError && choiceVersions && choiceVersions.length > 0) {
                choiceVersionId = choiceVersions[0].id;
              }
            }

            responsesToInsert.push({
              application_id: applicationId,
              field_version_id: fieldVersion.id,
              choice_version_id: choiceVersionId,
              response_value: responseValue,
              created_at: now,
              response_metadata: {
                is_multi_select: false
              }
            });

            processedCount++;
          }
        } catch (answerError) {
          console.error(`Error processing answer for field ${answer.field.id}:`, answerError);
          skippedCount++;
        }
      }

      // Display multi-select choices for debugging
      const multiSelectResponses = responsesToInsert.filter(r => r.response_metadata?.is_multi_select);
      console.log(`Found ${multiSelectResponses.length} multi-select responses`);

      // Log a sample of the multi-select data before insert
      if (multiSelectResponses.length > 0) {
        console.log('SAMPLE MULTI-SELECT RESPONSES TO INSERT:');
        for (let i = 0; i < Math.min(3, multiSelectResponses.length); i++) {
          console.log(`Choice ${i + 1}:`, {
            field_version_id: multiSelectResponses[i].field_version_id,
            choice_version_id: multiSelectResponses[i].choice_version_id,
            response_value: multiSelectResponses[i].response_value,
            metadata: multiSelectResponses[i].response_metadata
          });
        }
      }

      // Fourth phase: Perform batch inserts in chunks to avoid query size limits
      const CHUNK_SIZE = 50; // Reasonable chunk size for inserts

      if (responsesToInsert.length > 0) {
        console.log(`Inserting ${responsesToInsert.length} responses in chunks of ${CHUNK_SIZE}`);

        // Use a transaction to ensure all or nothing commit
        let insertSuccess = true;

        // Process in chunks
        for (let i = 0; i < responsesToInsert.length; i += CHUNK_SIZE) {
          const chunk = responsesToInsert.slice(i, i + CHUNK_SIZE);

          // Check for choice_version_id fields in this chunk
          const withChoiceVersionId = chunk.filter(r => r.choice_version_id !== undefined && r.choice_version_id !== null);
          if (withChoiceVersionId.length > 0) {
            console.log(`Chunk ${Math.floor(i / CHUNK_SIZE) + 1} has ${withChoiceVersionId.length} records with choice_version_id`);
            console.log('First record with choice_version_id:', {
              field_version_id: withChoiceVersionId[0].field_version_id,
              choice_version_id: withChoiceVersionId[0].choice_version_id,
              response_value: withChoiceVersionId[0].response_value
            });
          } else {
            console.log(`Chunk ${Math.floor(i / CHUNK_SIZE) + 1} has NO records with choice_version_id`);
          }

          // Insert this chunk
          const {error: insertError} = await supabaseAdmin
            .from('application_field_responses')
            .insert(chunk);

          if (insertError) {
            console.error(`Error inserting response chunk ${Math.floor(i / CHUNK_SIZE) + 1}:`, insertError);
            insertSuccess = false;
            // Continue with other chunks even if this one fails
          }
        }

        if (!insertSuccess) {
          // Some part of the batch insert failed, update counts
          skippedCount += processedCount;
          processedCount = 0;
        }
      }

      // Final phase: Update application with the processing summary
      console.log(`Successfully processed ${processedCount} responses, skipped ${skippedCount} out of ${answers.length}`);

      await supabaseAdmin
        .from('applications')
        .update({
          application_data: {
            form_id: formId,
            answers_processed: true,
            processed_count: processedCount,
            skipped_count: skippedCount,
            total_answers: answers.length,
            processed_at: new Date().toISOString()
          }
        })
        .eq('id', applicationId);

      // If we successfully processed any answers, ensure the application is no longer "pending"
      if (processedCount > 0) {
        await supabaseAdmin
          .from('applications')
          .update({ status: 'new' })
          .eq('id', applicationId)
          .eq('status', 'pending');
      }

      // Score calculation is now performed once at the end of processTypeformWebhook
      // No score calculation here to avoid duplicates
      if (processedCount === 0) {
        console.log('No answers were processed, skipping score calculation');
      }
    } catch (error) {
      console.error('Error in processAnswers:', error);
      throw error;
    }
  }

  /**
   * Store answers as raw data when field versions aren't available
   */
  private async storeAnswersAsRawData(applicationId: string, formId: string, answers: TypeformAnswer[]): Promise<void> {
    try {
      console.log(`Storing ${answers.length} raw answers for form ${formId} in application_data`);

      // First, update the application record with summary information
      // Do this first so we have a record even if subsequent processing fails
      await supabaseAdmin
        .from('applications')
        .update({
          application_data: {
            form_id: formId,
            raw_storage: true,
            answers_count: answers.length,
            storage_started_at: new Date().toISOString()
          }
        })
        .eq('id', applicationId);

      // Prepare simplified answer data for storage
      // This extracts only the essential fields to reduce storage size
      const now = new Date().toISOString();

      // Store answers directly in application_data instead of trying to use is_raw
      // column which doesn't exist yet
      const rawAnswerData = answers.map(answer => ({
        field_id: answer.field.id,
        field_type: answer.type,
        field_ref: answer.field.ref,
        value: this.extractResponseValue(answer)
      }));

      // Update the application with the complete raw answer data
      try {
        await supabaseAdmin
          .from('applications')
          .update({
            application_data: {
              form_id: formId,
              raw_storage: true,
              raw_answers: rawAnswerData.slice(0, 100), // Limit to prevent JSON size issues
              answers_count: answers.length,
              stored_count: Math.min(100, rawAnswerData.length),
              processed_at: now
            }
          })
          .eq('id', applicationId);

        console.log(`Stored ${Math.min(100, rawAnswerData.length)} raw answers in application_data JSON field`);
        // Early return - we've stored the data directly in application_data
        return;
      } catch (jsonError) {
        console.error('Error storing raw answers in application_data JSON:', jsonError);
        // Continue with alternative approach
      }

      // Fallback approach without using is_raw column
      const allRawResponses = answers.map(answer => ({
        application_id: applicationId,
        field_version_id: null, // No field version available
        response_value: JSON.stringify({
          field_id: answer.field.id,
          field_type: answer.type,
          field_ref: answer.field.ref,
          value: this.extractResponseValue(answer)
        }),
        created_at: now
        // No is_raw field until migration is applied
      }));

      // Split into manageable chunks for insertion
      const CHUNK_SIZE = 50; // PostgreSQL can handle larger batches than 10
      let successCount = 0;
      let errorCount = 0;

      console.log(`Inserting ${allRawResponses.length} raw responses in chunks of ${CHUNK_SIZE}`);

      // First check if the is_raw column exists to avoid errors
      let isRawColumnExists = false;
      try {
        // Perform a simple query to check column existence
        const {data: columns, error} = await supabaseAdmin
          .from('application_field_responses')
          .select('is_raw')
          .limit(1);

        // If no error, column exists
        isRawColumnExists = !error;
      } catch (_) {
        // If error, column doesn't exist
        isRawColumnExists = false;
      }

      console.log(`is_raw column ${isRawColumnExists ? 'exists' : 'does not exist'}, adjusting insert strategy`);

      // Insert all chunks in sequence
      for (let i = 0; i < allRawResponses.length; i += CHUNK_SIZE) {
        const chunk = allRawResponses.slice(i, i + CHUNK_SIZE);
        const chunkNumber = Math.floor(i / CHUNK_SIZE) + 1;
        const totalChunks = Math.ceil(allRawResponses.length / CHUNK_SIZE);

        try {
          console.log(`Processing raw answers chunk ${chunkNumber}/${totalChunks} (${chunk.length} items)`);

          // Prepare the insert data, conditionally adding is_raw if column exists
          const insertData = chunk.map(item => {
            if (isRawColumnExists) {
              return {...item, is_raw: true};
            }
            return item;
          });

          // Insert this chunk
          const {error: insertError} = await supabaseAdmin
            .from('application_field_responses')
            .insert(insertData);

          if (insertError) {
            console.error(`Error inserting raw answers chunk ${chunkNumber}:`, insertError);
            errorCount += chunk.length;

            // If first chunk fails with column error, stop trying additional chunks
            if (insertError.code === 'PGRST204' && insertError.message?.includes('is_raw')) {
              console.log('Column error detected, canceling remaining chunks');
              errorCount += allRawResponses.length - i - chunk.length; // Count remaining as errors
              break;
            }
          } else {
            successCount += chunk.length;
            console.log(`Successfully inserted chunk ${chunkNumber}/${totalChunks}`);
          }
        } catch (chunkError) {
          console.error(`Exception processing raw answers chunk ${chunkNumber}:`, chunkError);
          errorCount += chunk.length;
          // Continue with next chunk
        }

        // Brief pause between chunks to allow other operations
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Final update with completion status
      await supabaseAdmin
        .from('applications')
        .update({
          application_data: {
            form_id: formId,
            raw_storage: true,
            answers_count: answers.length,
            success_count: successCount,
            error_count: errorCount,
            processed_at: new Date().toISOString(),
            storage_completed: true
          }
        })
        .eq('id', applicationId);

      console.log(`Raw answer storage complete: ${successCount} successful, ${errorCount} failed out of ${answers.length}`);
    } catch (error) {
      console.error('Error in storeAnswersAsRawData:', error);

      // Final attempt to update status even if there was an error
      try {
        await supabaseAdmin
          .from('applications')
          .update({
            application_data: {
              form_id: formId,
              raw_storage: true,
              storage_error: true,
              error_message: error instanceof Error ? error.message : 'Unknown error',
              processed_at: new Date().toISOString()
            }
          })
          .eq('id', applicationId);
      } catch (updateError) {
        console.error('Failed to update application with error status:', updateError);
      }
    }
  }

  /**
   * Calculate application score based on field responses and scoring rules
   * This is now a wrapper that uses the dedicated scoringService
   * @param applicationId Application ID
   * @returns Numeric score
   */
  private async calculateApplicationScore(applicationId: string): Promise<number> {
    try {
      console.log(`ApplicationService: Calculating score for application ${applicationId} using scoringService`);

      // Use the new scoring service to calculate the score
      const result = await scoringService.calculateApplicationScore(applicationId);

      console.log(`ApplicationService: Score calculation completed: ${result.totalScore} (Red: ${result.redCount}, Yellow: ${result.yellowCount}, Green: ${result.greenCount})`);
      return result.totalScore;
    } catch (error) {
      console.error('Error calculating application score:', error);
      throw error;
    }
  }

  /**
   * Get all applications with optional filtering
   * @param filters Optional filters
   * @returns List of applications
   */
  /**
   * Enhanced: Get all applications with screener and screening meeting info
   */
  async getApplications(filters?: {
    status?: ApplicationStatus;
    minScore?: number;
    maxScore?: number;
    assignedTo?: string;
    isScreening?: boolean;
    closedReason?: string;
    page?: number;
    pageSize?: number;
    search?: string;
    screeningFrom?: string;
    screeningTo?: string;
    submissionFrom?: string;
    submissionTo?: string;
    screener?: string;
    participantId?: string;
  }): Promise<{ applications: any[]; total: number; page: number; pageSize: number }> {
    try {
      const page = Math.max(1, filters?.page || 1);
      const pageSize = Math.max(1, Math.min(100, filters?.pageSize || 10));
      const rangeFrom = (page - 1) * pageSize;
      const rangeTo = rangeFrom + pageSize - 1;

      // Precompute constraints from related tables
      let allowedParticipantIds: string[] | null = null;
      if (filters?.search && filters.search.trim().length > 0) {
        const termRaw = filters.search.replace(/\s+/g, ' ').trim();
        let orClause = `first_name.ilike.%${termRaw}%,last_name.ilike.%${termRaw}%,email.ilike.%${termRaw}%`;
        if (termRaw.includes(' ')) {
          const parts = termRaw.split(/\s+/).filter(Boolean);
          const first = parts[0];
          const last = parts.slice(1).join(' ');
          orClause = `and(first_name.ilike.%${first}%,last_name.ilike.%${last}%),and(first_name.ilike.%${last}%,last_name.ilike.%${first}%),first_name.ilike.%${first}%,last_name.ilike.%${first}%,first_name.ilike.%${last}%,last_name.ilike.%${last}%,${orClause}`;
        }
        const { data: matchedParticipants, error: mpErr } = await supabaseAdmin
          .from('participants')
          .select('id')
          .or(orClause);
        if (mpErr) throw mpErr;
        allowedParticipantIds = (matchedParticipants || []).map((p: any) => p.id);
        if (allowedParticipantIds.length === 0) {
          return { applications: [], total: 0, page, pageSize };
        }
      }

      let allowedApplicationIdsFromMeetings: string[] | null = null;
      if (filters?.screeningFrom || filters?.screeningTo || (filters?.screener && filters.screener.trim().length > 0)) {
        let meetingsQuery = supabaseAdmin
          .from('calendly_screening_meetings')
          .select('application_id, event_start, user_email');
        if (filters?.screeningFrom) {
          meetingsQuery = meetingsQuery.gte('event_start', new Date(filters.screeningFrom).toISOString());
        }
        if (filters?.screeningTo) {
          const toEnd = new Date(filters.screeningTo);
          toEnd.setHours(23, 59, 59, 999);
          meetingsQuery = meetingsQuery.lte('event_start', toEnd.toISOString());
        }
        if (filters?.screener && filters.screener.trim().length > 0) {
          const [first, ...rest] = filters.screener.trim().split(' ');
          const last = rest.join(' ');
          const { data: screenerProfiles, error: spErr } = await supabaseAdmin
            .from('user_profiles')
            .select('email, first_name, last_name')
            .ilike('first_name', first || '%')
            .ilike('last_name', last || '%');
          if (spErr) throw spErr;
          const allowedEmails = (screenerProfiles || []).map((u: any) => u.email).filter(Boolean);
          if (allowedEmails.length > 0) {
            meetingsQuery = meetingsQuery.in('user_email', allowedEmails);
          } else {
            return { applications: [], total: 0, page, pageSize };
          }
        }
        const { data: meetingRows, error: mrErr } = await meetingsQuery;
        if (mrErr) throw mrErr;
        allowedApplicationIdsFromMeetings = Array.from(new Set((meetingRows || []).map((m: any) => m.application_id))).filter(Boolean);
        if ((filters?.screeningFrom || filters?.screeningTo || filters?.screener) && allowedApplicationIdsFromMeetings.length === 0) {
          return { applications: [], total: 0, page, pageSize };
        }
      }

      let baseQuery = supabaseAdmin
        .from('applications')
        .select(`
          *,
          participants:participant_id(*)
          `, { count: 'exact' }
        ).order('created_at', {ascending: false});


      // Apply filters if provided
      if (filters) {
        if (filters.status) {
          baseQuery = baseQuery.eq('status', filters.status);
        }
        if (filters.minScore !== undefined) {
          baseQuery = baseQuery.gte('calculated_score', filters.minScore);
        }
        if (filters.maxScore !== undefined) {
          baseQuery = baseQuery.lte('calculated_score', filters.maxScore);
        }
        if (filters.assignedTo) {
          baseQuery = baseQuery.eq('assigned_to', filters.assignedTo);
        }
        if (filters.closedReason) {
          baseQuery = baseQuery.eq('closed_reason', filters.closedReason);
        }
        if (filters.participantId) {
          baseQuery = baseQuery.eq('participant_id', filters.participantId);
        }
        if (filters.submissionFrom) {
          baseQuery = baseQuery.gte('submission_date', new Date(filters.submissionFrom).toISOString());
        }
        if (filters.submissionTo) {
          const toEnd = new Date(filters.submissionTo);
          toEnd.setHours(23, 59, 59, 999);
          baseQuery = baseQuery.lte('submission_date', toEnd.toISOString());
        }
        // Filter for screening-related statuses
        if (filters.isScreening) {
          // If no specific status is provided, filter for all screening-related statuses
          if (!filters.status) {
            baseQuery = baseQuery.in('status', [
              'screening_scheduled',
              'screening_no_show',
              'invited_to_reschedule',
              'secondary_screening',
              'medical_review_required',
              'pending_medical_review',
              'pending_medication_change',
              'pending_ic',
              'conditionally_approved',
              'screening_in_process',
              'screening_completed',
              'closed'
            ]);
          }
        }
        // Apply participant search by IDs gathered above
        if (allowedParticipantIds) {
          baseQuery = baseQuery.in('participant_id', allowedParticipantIds);
        }
        // Apply meeting-derived app ids (screening date and screener filters)
        if (allowedApplicationIdsFromMeetings) {
          baseQuery = baseQuery.in('id', allowedApplicationIdsFromMeetings);
        }
      }

      const query = baseQuery.order('created_at', { ascending: false }).range(rangeFrom, rangeTo);
      const {data: apps, error, count} = await query;
      if (error) throw error;
      const total = count || 0;
      if (!apps || apps.length === 0) return { applications: [], total, page, pageSize };

      // For each application, get most recent screening meeting and screener
      const appIds = apps.map((a: any) => a.id);
      // Get all recent meetings for these applications
      const {data: meetings, error: meetingError} = await supabaseAdmin
        .from('calendly_screening_meetings')
        .select('*')
        .in('application_id', appIds)
        .order('event_start', {ascending: false});
      if (meetingError) throw meetingError;

      // Map: appId -> most recent meeting
      const meetingMap: Record<string, any> = {};
      if (meetings) {
        for (const m of meetings) {
          if (!meetingMap[m.application_id]) {
            meetingMap[m.application_id] = m;
          }
        }
      }

      // Gather all unique screener emails from meetings
      const screenerEmails = Array.from(new Set(meetings?.map(m => m.user_email).filter(Boolean)));
      let screenerMap: Record<string, any> = {};
      if (screenerEmails.length > 0) {
        const {data: screeners, error: screenerError} = await supabaseAdmin
          .from('user_profiles')
          .select('id, first_name, last_name, email, role')
          .in('email', screenerEmails);
        if (screenerError) throw screenerError;
        screenerMap = (screeners || []).reduce((acc: any, u: any) => {
          acc[u.email] = u;
          return acc;
        }, {});
      }

      // Fetch initial screening notes for each application to enable View vs Edit logic in list
      const { data: initialScreenings, error: initialScreeningsError } = await supabaseAdmin
        .from('screenings')
        .select('id, application_id, notes, status, screening_type, updated_at, created_at, participant_id, screener_id')
        .in('application_id', appIds)
        .eq('screening_type', 'initial');

      if (initialScreeningsError) {
        console.warn('Error fetching initial screenings for applications list:', initialScreeningsError);
      }
      const initialScreeningByAppId: Record<string, any> = {};
      for (const s of initialScreenings || []) {
        // If multiple, keep the most recently updated
        const existing = initialScreeningByAppId[s.application_id];
        if (!existing || new Date(s.updated_at || s.created_at || 0) > new Date(existing.updated_at || existing.created_at || 0)) {
          initialScreeningByAppId[s.application_id] = s;
        }
      }

      // Build enhanced application objects
      const enhancedApps = apps.map((app: any) => {
        const meeting = meetingMap[app.id] || null;
        let screener = null;
        if (meeting && meeting.user_email) {
          screener = screenerMap[meeting.user_email] || 'Not a User';
        } else if (!meeting) {
          screener = 'Unassigned';
        }
        // If there is a screening meeting but DB status hasn't flipped yet, present Screening Scheduled for display purposes
        const displayStatus = (() => {
          if (meeting && (app.status === 'pending' || app.status === 'new')) {
            return 'screening_scheduled';
          }
          return app.status;
        })();
        return {
          ...app,
          status: displayStatus,
          screening_meeting: meeting,
          screener,
          initial_screening: initialScreeningByAppId[app.id] || null,
        };
      });
      return { applications: enhancedApps, total, page, pageSize };
    } catch (error) {
      console.error('Error getting applications:', error);
      throw error;
    }
  }

  /**
   * Get a single application by ID with all related data
   * @param applicationId Application ID
   * @returns Application with participant and responses
   */
  async getApplicationById(applicationId: string): Promise<any> {
    try {
      // Get application with participant data
      const {data: application, error: appError} = await supabaseAdmin
        .from('applications')
        .select(`
          *,
          participants:participant_id(*)
        `)
        .eq('id', applicationId)
        .single();

      if (appError) throw appError;

      if (!application) {
        throw new Error(`Application with ID ${applicationId} not found`);
      }

      // Get calendly screening meeting data
      const {data: screeningMeeting, error: screeningError} = await supabaseAdmin
        .from('calendly_screening_meetings')
        .select('*')
        .eq('application_id', applicationId)
        .order('event_start', {ascending: false})
        .limit(1)
        .single();

      if (screeningError && screeningError.code !== 'PGRST116') {
        // PGRST116 is the error code for no rows returned, which is OK
        console.warn(`Error fetching screening meeting for application ${applicationId}:`, screeningError);
      }

      // Add screening meeting data to application
      application.screening_meeting = screeningMeeting || null;

      // Get initial screening data (notes, status, etc.)
      const {data: initialScreeningData, error: initialScreeningError} = await supabaseAdmin
        .from('screenings')
        .select('*') // Select all columns from the screenings table
        .eq('application_id', applicationId)
        .eq('screening_type', 'initial')
        .maybeSingle(); // Use maybeSingle as there might not be an initial screening record yet

      if (initialScreeningError && initialScreeningError.code !== 'PGRST116') {
        // PGRST116 means no rows found, which is acceptable here.
        console.warn(`Error fetching initial screening data for application ${applicationId}:`, initialScreeningError);
      }

      // Add initial screening data to application
      application.initial_screening = initialScreeningData || null;

      // Step 1: Get the basic field responses first
      const {data: responses, error: respError} = await supabaseAdmin
        .from('application_field_responses')
        .select('id, field_version_id, response_value, score, created_at')
        .eq('application_id', applicationId)
        .order('created_at', {ascending: true});

      if (respError) throw respError;

      console.log(`Retrieved ${responses?.length || 0} field responses for application ${applicationId}`);

      // Step 2: Get ALL field versions for this form to ensure we have complete hierarchy
      // We can directly use the form_id from the application without additional validation
      // since some applications might reference forms that aren't in our forms table
      const formId = application.form_id;

      console.log(`Using form ID ${formId} for application ${applicationId}`);

      // Now get all field versions for this form, including those not in the responses
      // This ensures we have the complete structure including parent groups that might not have responses
      // First let's get the response field versions to ensure we have at least those
      const fieldVersionIds = responses?.map(r => r.field_version_id).filter(Boolean) || [];

      let {data: allFieldVersions, error: fieldVersionsError} = await supabaseAdmin
        .from('typeform_field_versions')
        .select('id, field_id, field_title, field_type, field_ref, parent_field_version_id, hierarchy_level, display_order, is_active')
        .in('id', fieldVersionIds)
        .order('display_order', {ascending: true});

      if (fieldVersionsError) throw fieldVersionsError;

      // Then try to get additional fields for the complete form structure if possible
      try {
        const {data: formFields, error} = await supabaseAdmin
          .from('typeform_field_versions')
          .select('id, field_id, field_title, field_type, field_ref, parent_field_version_id, hierarchy_level, display_order, is_active')
          .eq('form_id', formId)
          .eq('is_active', true)
          .order('display_order', {ascending: true});

        if (!error && formFields && formFields.length > 0) {
          // Merge form fields with the ones we already have, avoiding duplicates
          const existingIds = new Set(allFieldVersions?.map(f => f.id) || []);
          const newFields = formFields.filter(f => !existingIds.has(f.id));
          allFieldVersions = [...(allFieldVersions || []), ...newFields];
          console.log(`Added ${newFields.length} additional fields from form structure`);
        }
      } catch (formFieldsError) {
        console.warn(`Could not fetch complete form structure: ${formFieldsError}`);
        // Continue with just the fields from responses
      }

      if (!allFieldVersions || allFieldVersions.length === 0) {
        // Fallback: If we couldn't get any field versions, create basic ones from the responses
        allFieldVersions = responses?.map(r => ({
          id: r.field_version_id,
          field_id: `field-${r.field_version_id.substring(0, 8)}`,
          field_title: 'Unknown Field',
          field_type: 'unknown',
          field_ref: null,
          parent_field_version_id: null,
          hierarchy_level: 0,
          display_order: 0,
          is_active: true
        })) || [];
      }

      console.log(`Retrieved ${allFieldVersions?.length || 0} total field versions for form ${formId}`);

      // Create maps for hierarchy building
      const fieldVersionsMap: Record<string, any> = {};
      const fieldMap: Record<string, any> = {};
      const childrenByParentId: Record<string, any[]> = {};
      const orderedFieldsByLevel: Record<number, any[]> = {};

      // Process all field versions
      (allFieldVersions || []).forEach(field => {
        // Add to lookup map
        fieldVersionsMap[field.id] = field;

        // Create a clean field object with children array
        const fieldCopy = {...field, children: []};
        fieldMap[field.id] = fieldCopy;

        // Organize by hierarchy level
        const level = field.hierarchy_level || 0;
        if (!orderedFieldsByLevel[level]) {
          orderedFieldsByLevel[level] = [];
        }
        orderedFieldsByLevel[level].push(fieldCopy);

        // Build parent-child relationships
        if (field.parent_field_version_id) {
          if (!childrenByParentId[field.parent_field_version_id]) {
            childrenByParentId[field.parent_field_version_id] = [];
          }
          childrenByParentId[field.parent_field_version_id].push(fieldCopy);
        }
      });

      // Connect children to parents
      Object.keys(childrenByParentId).forEach(parentId => {
        if (fieldMap[parentId] && childrenByParentId[parentId].length > 0) {
          // Sort children by display_order
          const sortedChildren = childrenByParentId[parentId].sort(
            (a, b) => (a.display_order || 0) - (b.display_order || 0)
          );
          fieldMap[parentId].children = sortedChildren;
        }
      });

      // Root level fields (ordered by display_order)
      const rootFields = (orderedFieldsByLevel[0] || []).sort(
        (a, b) => (a.display_order || 0) - (b.display_order || 0)
      );

      // Get all response values that might be choice IDs
      const multipleChoiceFields = (allFieldVersions || []).filter(f => f.field_type === 'multiple_choice');
      const multipleChoiceFieldIds = multipleChoiceFields.map(f => f.id);

      // Filter responses for multiple choice fields
      const multipleChoiceResponses = responses?.filter(r =>
        multipleChoiceFieldIds.includes(r.field_version_id)
      ) || [];

      // Get all possible choice values from the responses
      const allResponseValues = multipleChoiceResponses
        .map(r => r.response_value)
        .filter(Boolean);

      // Split multi-select values and flatten the array
      const possibleChoiceIds = allResponseValues.flatMap(value => {
        return typeof value === 'string' && value.includes(',')
          ? value.split(',').map(v => v.trim())
          : value;
      });

      console.log(`Found ${possibleChoiceIds.length} possible choice IDs`);

      // Maps to store choice data
      let choicesMap: Record<string, string> = {}; // choice_id -> choice_label
      let choiceOrderMap: Record<string, number> = {}; // choice_id -> display_order

      if (possibleChoiceIds.length > 0) {
        // Get all choices with their display order
        const {data: choices, error: choicesError} = await supabaseAdmin
          .from('typeform_choice_versions')
          .select('id, field_version_id, choice_id, choice_label, display_order')
          .in('choice_id', possibleChoiceIds);

        if (choicesError) throw choicesError;

        console.log(`Retrieved ${choices?.length || 0} choice labels`);

        // Create maps for choice labels and their display order
        if (choices && choices.length > 0) {
          choices.forEach(choice => {
            choicesMap[choice.choice_id] = choice.choice_label;
            choiceOrderMap[choice.choice_id] = choice.display_order || 0;
          });

          console.log('Choice mapping sample:', Object.entries(choicesMap).slice(0, 3));
        }
      }

      // Create a flattened list in the correct hierarchical order
      const flattenHierarchy = (fields: any[], result: any[] = [], level = 0) => {
        fields.forEach(field => {
          result.push({
            ...field,
            displayLevel: level
          });

          if (field.children && field.children.length > 0) {
            flattenHierarchy(field.children, result, level + 1);
          }
        });
        return result;
      };

      // Get a complete flattened field hierarchy
      const flattenedFieldHierarchy = flattenHierarchy(rootFields);

      // Process responses to normalize the structure for frontend consumption
      const processedResponses = responses?.map(response => {
        // Get the field data from our map
        const fieldData = fieldVersionsMap[response.field_version_id];

        // Create a field object with the essential data plus hierarchy information
        const fieldObject = fieldData ? {
          id: fieldData.id,
          field_title: fieldData.field_title || 'Unknown Field',
          field_type: fieldData.field_type || 'unknown',
          field_id: fieldData.field_id || null,
          parent_field_version_id: fieldData.parent_field_version_id || null,
          hierarchy_level: fieldData.hierarchy_level || 0,
          display_order: fieldData.display_order || 0
        } : {
          id: null,
          field_title: 'Unknown Field',
          field_type: 'unknown',
          field_id: null,
          parent_field_version_id: null,
          hierarchy_level: 0,
          display_order: 0
        };

        let displayValue = response.response_value;
        let choiceLabels: string[] = [];

        // For multiple choice responses, use the choice label instead of the ID
        if (fieldData?.field_type === 'multiple_choice' && response.response_value) {
          if (typeof response.response_value === 'string' && response.response_value.includes(',')) {
            // Handle multi-select responses
            const choiceIds = response.response_value.split(',').map(c => c.trim());
            // Sort choices by their display order if available
            choiceLabels = choiceIds
              .map(id => ({id, label: choicesMap[id] || id, order: choiceOrderMap[id] || 999}))
              .sort((a, b) => a.order - b.order)
              .map(item => item.label);
            displayValue = choiceLabels.join(', ');
          } else {
            // Single selection
            displayValue = choicesMap[response.response_value] || response.response_value;
          }
        }

        // For yes/no responses, capitalize the value for better readability
        if (fieldData?.field_type === 'yes_no' && typeof response.response_value === 'string') {
          displayValue = response.response_value.charAt(0).toUpperCase() + response.response_value.slice(1);
        }

        // Prepare response object
        const responseObj = {
          id: response.id,
          field_version_id: response.field_version_id,
          response_value: response.response_value,
          display_value: displayValue,
          score: response.score,
          created_at: response.created_at,
          field: fieldObject,
          choice_labels: choiceLabels,
          // Find the position in the flattened hierarchy
          position: flattenedFieldHierarchy.findIndex(f => f.id === response.field_version_id)
        };

        return responseObj;
      }) || [];

      // Find all field IDs that have responses
      const responseFieldIds = new Set(processedResponses.map(r => r.field_version_id));

      // Create placeholder responses for fields in the hierarchy that don't have actual responses
      // This ensures we maintain the complete form structure even if some fields have no responses
      const placeholderResponses = flattenedFieldHierarchy
        .filter(field =>
          // Only include fields that don't already have responses
          !responseFieldIds.has(field.id) &&
          // Only include group or statement fields that would be important for structure
          (field.field_type === 'group' || field.field_type === 'statement')
        )
        .map(field => ({
          id: `placeholder-${field.id}`,
          field_version_id: field.id,
          response_value: null,
          display_value: '-',
          score: 'na',
          created_at: new Date().toISOString(),
          field: {
            id: field.id,
            field_title: field.field_title || 'Unknown Field',
            field_type: field.field_type || 'unknown',
            field_id: field.field_id || null,
            parent_field_version_id: field.parent_field_version_id || null,
            hierarchy_level: field.hierarchy_level || 0,
            display_order: field.display_order || 0
          },
          choice_labels: [],
          position: flattenedFieldHierarchy.findIndex(f => f.id === field.id),
          isPlaceholder: true
        }));

      // Combine actual responses with placeholders
      const combinedResponses = [...processedResponses, ...placeholderResponses];

      // Sort all responses according to the flattened hierarchy position
      const orderedResponses = combinedResponses.sort((a, b) => {
        // First use the position in the flattened hierarchy
        if (a.position !== undefined && b.position !== undefined) {
          return a.position - b.position;
        }

        // If position isn't available, fall back to hierarchy level and display order
        const levelA = a.field.hierarchy_level || 0;
        const levelB = b.field.hierarchy_level || 0;

        if (levelA !== levelB) return levelA - levelB;

        return (a.field.display_order || 0) - (b.field.display_order || 0);
      });

      // Return complete application data with properly ordered responses
      return {
        ...application,
        field_responses: orderedResponses
      };
    } catch (error) {
      console.error(`Error getting application ${applicationId}:`, error);
      throw error;
    }
  }

  /**
   * Update application status
   * @param applicationId Application ID
   * @param status New status
   * @param assignedTo Optional user ID to assign to
   * @returns Updated application
   */
  async updateApplicationStatus(
    applicationId: string,
    status: ApplicationStatus,
    assignedTo?: string,
    closedReason?: string,
    rejectedType?: string
  ): Promise<void> {
    console.log(`ApplicationService.updateApplicationStatus called with:`);
    console.log(`  - applicationId: ${applicationId}`);
    console.log(`  - status: ${status}`);
    console.log(`  - assignedTo: ${assignedTo || 'undefined'}`);

    try {
      const now = new Date().toISOString();
      const updateData: any = {
        status,
        updated_at: now
      };
      // If status is changing from closed to another, clear closed_reason and rejected_type
      const isReopening = status !== 'closed';
      if (isReopening) {
        updateData.closed_reason = null;
        updateData.rejected_type = null;
      } else {
        if (closedReason) {
          updateData.closed_reason = closedReason;
        }
        if (rejectedType) {
          updateData.rejected_type = rejectedType;
        }
      }

      console.log('Fetching current application data from database...');
      // Get current application_data to update
      const {data: currentApp, error: fetchError} = await supabaseAdmin
        .from('applications')
        .select('application_data')
        .eq('id', applicationId)
        .single();

      if (fetchError) {
        console.error('Error fetching current application data:', fetchError);
        throw fetchError;
      }

      console.log('Current application data:', currentApp);

      // Update application_data with new status
      const appData = currentApp?.application_data || {};
      updateData.application_data = {
        ...appData,
        status,
        updated_at: now,
        ...(status !== 'closed' ? {closed_reason: null, rejected_type: null} : {}),
        ...(closedReason && status === 'closed' ? {closed_reason: closedReason} : {}),
        ...(rejectedType && status === 'closed' ? {rejected_type: rejectedType} : {})
      };

      if (assignedTo !== undefined) {
        updateData.assigned_to = assignedTo;
        updateData.application_data.assigned_to = assignedTo;
      }

      console.log('Preparing to update application with data:', updateData);

      const {data: updateResult, error} = await supabaseAdmin
        .from('applications')
        .update(updateData)
        .eq('id', applicationId)
        .select('id, status');

      if (error) {
        console.error('Database error during update:', error);
        throw error;
      }

      console.log('Update successful. Updated record:', updateResult);
    } catch (error) {
      console.error(`Error updating application ${applicationId}:`, error);
      throw error;
    }
  }

  /**
   * Find an application by its Typeform response token
   * @param token Typeform response token
   * @returns Application or null if not found
   */
  async findApplicationByToken(token: string): Promise<Application | null> {
    try {
      const {data, error} = await supabaseAdmin
        .from('applications')
        .select(`
          *,
          participants:participant_id(*)
        `)
        .eq('typeform_response_id', token)
        .maybeSingle();

      if (error) throw error;

      return data;
    } catch (error) {
      console.error(`Error finding application by token ${token}:`, error);
      throw error;
    }
  }

  /**
   * Extract values from a multi-select choices answer
   * @param answer Typeform answer with choices
   * @returns Array of choice objects with id, label, and ref
   */
  private extractChoiceValues(answer: TypeformAnswer): { id: string; label: string; ref?: string }[] {
    try {
      if (!answer) {
        console.warn('Cannot extract choices: answer is null or undefined');
        return [];
      }

      console.log(`MULTI-SELECT: Extracting choices from type=${answer.type}`, JSON.stringify(answer));

      // Handle the webhook format where choices is an object with ids, labels arrays
      // This is the most common format in Typeform webhook payloads for multi-select
      if (answer.type === 'choices' &&
        typeof answer.choices === 'object' &&
        answer.choices !== null &&
        'ids' in answer.choices &&
        Array.isArray(answer.choices.ids)) {

        const choices = answer.choices as { ids: string[], labels: string[], refs?: string[] };
        const ids = choices.ids || [];
        const labels = choices.labels || [];
        const refs = choices.refs || [];

        console.log(`MULTI-SELECT: Found ${ids.length} choices with ids=${ids.join(',')}`);

        // Map each ID to its corresponding label and ref
        return ids.map((id, index) => {
          const result = {
            id: id || '',
            label: (labels[index] as string) || '',
            ref: (refs && refs[index]) || undefined
          };
          console.log(`MULTI-SELECT: Extracted choice: ID=${result.id}, Label=${result.label}`);
          return result;
        });
      }

      // For array format (less common)
      if (answer.type === 'choices' && Array.isArray(answer.choices)) {
        console.log(`MULTI-SELECT: Found choices in array format, count=${answer.choices.length}`);
        return answer.choices.map(choice => ({
          id: choice.id || '',
          label: choice.label || '',
          ref: choice.ref
        }));
      }

      // Handle regular single choice (unlikely in multi-select but included for completeness)
      if (answer.type === 'choice' && answer.choice) {
        console.log(`MULTI-SELECT: Found single choice (unusual): ${answer.choice.id}`);
        return [{
          id: answer.choice.id || '',
          label: answer.choice.label || '',
          ref: answer.choice.ref
        }];
      }

      // Fallback for unexpected formats
      if (answer.choices) {
        console.warn('Unexpected choices format:', JSON.stringify(answer.choices));
      }
      console.log(`MULTI-SELECT: No choices found in answer of type ${answer.type}`);
      return [];
    } catch (error) {
      console.error('Error extracting choice values:', error);
      return [];
    }
  }

  /**
   * Check if a Typeform field is a multi-select field
   * @param answer Typeform answer
   * @param fieldDefinitions Array of Typeform field definitions
   * @returns boolean indicating if it's a multi-select field
   */
  private isMultiSelectField(answer: TypeformAnswer, fieldDefinitions: any[] = []): boolean {
    if (!answer) {
      return false;
    }

    // Primary detection method: Check if the answer type is 'choices'
    // This is the format that Typeform uses for multiple selections
    if (answer.type === 'choices') {
      console.log(`MULTISELECT-DEBUG: Detected multi-select field by type 'choices' for field ${answer.field?.id}`);
      return true;
    }

    // Backup method: Check the field definition if provided
    if (fieldDefinitions?.length && answer.field?.id) {
      const fieldDef = fieldDefinitions.find((f: any) => f.id === answer.field.id);
      if (fieldDef?.type === 'multiple_choice' && fieldDef?.properties?.allow_multiple_selections === true) {
        console.log(`MULTISELECT-DEBUG: Detected multi-select field from field definition for field ${answer.field.id}`);
        return true;
      }
    }

    return false;
  }

  /**
   * Extract a string value from a Typeform answer based on its type
   * @param answer Typeform answer object
   * @returns String representation of the answer
   */
  private extractResponseValue(answer: TypeformAnswer): string {
    try {
      const answerType = answer.type;

      switch (answerType) {
        case 'text':
        case 'email':
          return answer.text || answer.email || '';

        case 'phone_number':
          return answer.phone_number || '';

        case 'number':
          return answer.number?.toString() || '';

        case 'date':
          return answer.date || '';

        case 'boolean':
          return answer.boolean !== undefined ? (answer.boolean ? 'yes' : 'no') : '';

        case 'choice':
          return answer.choice?.label || answer.choice?.id || '';

        case 'choices':
          // For multi-select questions, we'll handle this differently in processAnswers
          // For backward compatibility, return comma-separated IDs
          if (Array.isArray(answer.choices)) {
            return answer.choices.map(choice => {
              if (typeof choice === 'object' && choice !== null) {
                return choice.id || JSON.stringify(choice);
              }
              return String(choice);
            }).join(',');
          } else if (typeof answer.choices === 'object' && answer.choices !== null) {
            // Handle case where choices might be an object with ids array
            if ('ids' in answer.choices && Array.isArray(answer.choices.ids)) {
              return answer.choices.ids.join(',');
            }
            // Other object formats
            return Object.values(answer.choices).map(val => {
              if (typeof val === 'object' && val !== null) {
                return 'id' in val ? String(val.id) : JSON.stringify(val);
              }
              return String(val);
            }).join(',');
          } else if (answer.choices) {
            // If it's some other non-null value, convert to string
            return String(answer.choices);
          }
          return '';

        default:
          return JSON.stringify(answer) || '';
      }
    } catch (error) {
      console.error('Error extracting response value:', error);
      return '';
    }
  }

  /**
   * Get applications whose lock is older than a given ISO timestamp and answers are not processed.
   * Used by the CRON job to find stuck/unprocessed applications.
   */
  async getUnprocessedApplications(olderThanIso: string, limit: number = 10): Promise<Array<SavedTypeFormApplication>> {

    const {data: existingLocks} = await supabaseAdmin
      .from('processing_locks')
      .select('lock_id, tracking_id, created_at')
      .lte('created_at', olderThanIso)
      .like('lock_id', 'typeform\_%');

    let pendingApplications: Array<SavedTypeFormApplication> = [];

    if (existingLocks && existingLocks.length > 0) {
      // Ensure the lock IDs are in the expected format and present in Database.
      const lockIds = existingLocks.map(lock => lock.lock_id.replace('typeform_', ''));
      const {data, error} = await supabaseAdmin
        .from('applications')
        .select('id, typeform_response_id')
        .lte('created_at', olderThanIso)
        .in('typeform_response_id', lockIds)
        // .or('application_data->>answers_processed.is.null,application_data->>answers_processed.eq.false')
        .order('created_at', {ascending: true})
        .limit(limit);

      if (error) {
        console.error('Error fetching applications with old locks:', error);
        return [];
      }

      if (data && data.length > 0) {
        pendingApplications = data.map(app => ({
          id: app.id,
          typeform_response_id: app.typeform_response_id,
        }));
      }

    }


    return pendingApplications || [];
  }
}

// Export singleton instance
export const applicationService = new ApplicationService();
