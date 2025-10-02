import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  Application,
  ApplicationStatus,
  ScoreValue,
  TypeformAnswer,
} from '@/types/application';
import HubSpotService from '@/services/hubspotService';

// Extend the ApplicationFieldResponse with properties needed for scoring
interface ApplicationFieldResponse {
  id: string;
  application_id: string;
  field_version_id: string;
  response_value: any;
  score?: string;
  created_at: string;
  is_raw?: boolean;
  choice_version_id?: string | null;
  response_metadata?: {
    is_multi_select?: boolean;
    is_choice?: boolean;
    choice_id?: string;
    [key: string]: any;
  };
}

// Initialize Supabase client with service role for admin operations
const supabaseAdmin: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Define interfaces for scoring operations
interface ScoringRule {
  id: string;
  target_type: 'field' | 'choice';
  target_id: string;
  is_active: boolean;
  score_value: ScoreValue;
  criteria: any;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

interface FieldDetails {
  id: string;
  name: string;
  type: string;
  ref: string;
  version_id: string;
  created_at: string;
  updated_at: string;
}

interface ChoiceDetails {
  id: string;
  field_id: string;
  label: string;
  ref: string;
  version_id: string;
  created_at: string;
  updated_at: string;
}

interface ScoringResult {
  red: number;
  yellow: number;
  green: number;
  na: number;
  details: Array<{ rule: ScoringRule; matched: boolean }>;
}

interface ScoringSummary {
  applicationId: string;
  redCount: number;
  yellowCount: number;
  greenCount: number;
  totalScore: number;
}

interface BatchResult {
  response: ApplicationFieldResponse;
  score: ScoreValue;
  counts: { red: number; yellow: number; green: number };
}

export class ScoringService {
  private readonly BATCH_SIZE = 10;
  private readonly MAX_EXECUTION_TIME = 45000;
  private readonly UPDATE_BATCH_SIZE = 50;
  private startTime: number = 0;

  private checkTimeout(): boolean {
    const elapsed = Date.now() - this.startTime;
    const remaining = this.MAX_EXECUTION_TIME - elapsed;
    if (remaining < 5000) {
      console.warn(`Timeout approaching: ${remaining}ms remaining`);
      return true;
    }
    return false;
  }

  async calculateApplicationScore(applicationId: string): Promise<ScoringSummary> {
    this.startTime = Date.now();
    
    try {
      console.log(`\n=== Calculating score for application ${applicationId} ===`);
      console.log(`Environment: ${process.env.NODE_ENV}, Region: ${process.env.VERCEL_REGION || 'local'}`);

      console.log('Fetching responses and scoring rules...');
      const [responses, allScoringRules, fieldDetailsMap] = await Promise.all([
        this.getApplicationResponses(applicationId),
        this.getAllActiveScoringRules(),
        this.getAllFieldDetails()
      ]);
      
      if (!responses || responses.length === 0) {
        console.warn(`No field responses found for application ${applicationId}`);
        return this.createEmptyScoringSummary(applicationId);
      }
      
      console.log(`Found ${responses.length} field responses to score`);
      console.log(`Loaded ${allScoringRules.size} scoring rule groups`);
      console.log(`Loaded ${fieldDetailsMap.size} field details`);
      
      if (this.checkTimeout()) {
        console.warn('Timeout approaching early, using fallback processing');
        return await this.processWithTimeoutFallback(applicationId, responses, allScoringRules, fieldDetailsMap);
      }

      console.log('Processing responses in batches...');
      const batchResults = await this.processBatchedResponses(responses, allScoringRules, fieldDetailsMap);
      
      console.log('Calculating final scores...');
      const { redCount, yellowCount, greenCount, totalScore } = this.calculateFinalScores(batchResults);
      
      console.log(`Calculated totals: Red: ${redCount}, Yellow: ${yellowCount}, Green: ${greenCount}, Score: ${totalScore}`);
      
      console.log('Updating database...');
      await this.updateApplicationScore(applicationId, redCount, yellowCount, greenCount, totalScore);
      
      await this.batchUpdateResponseScores(batchResults);
      
      await this.syncToHubSpotWithTimeout(applicationId, redCount, yellowCount, greenCount);

      console.log(`=== Scoring completed for application ${applicationId} ===`);
      
      return {
        applicationId,
        redCount,
        yellowCount,
        greenCount,
        totalScore
      };
    } catch (error) {
      console.error('Error calculating application score:', error);
      console.error('Error context:', {
        applicationId,
        timeElapsed: Date.now() - this.startTime,
        environment: process.env.NODE_ENV
      });
      throw error;
    }
  }

  private async processBatchedResponses(
    responses: ApplicationFieldResponse[], 
    allScoringRules: Map<string, ScoringRule[]>,
    fieldDetailsMap: Map<string, FieldDetails>
  ): Promise<BatchResult[]> {
    const results: BatchResult[] = [];
    const totalBatches = Math.ceil(responses.length / this.BATCH_SIZE);
    
    for (let i = 0; i < responses.length; i += this.BATCH_SIZE) {
      const currentBatch = Math.floor(i / this.BATCH_SIZE) + 1;
      
      if (this.checkTimeout()) {
        console.warn(`Timeout approaching at batch ${currentBatch}/${totalBatches}, stopping processing`);
        break;
      }
      
      const batch = responses.slice(i, i + this.BATCH_SIZE);
      console.log(`Processing batch ${currentBatch}/${totalBatches} (${batch.length} responses)`);
      
      const batchResults = await Promise.all(
        batch.map(response => this.evaluateFieldResponseOptimized(response, allScoringRules, fieldDetailsMap))
      );
      
      results.push(...batchResults);
      
      console.log(`Completed batch ${currentBatch}/${totalBatches}`);
    }
    
    return results;
  }

  private async getAllActiveScoringRules(): Promise<Map<string, ScoringRule[]>> {
    const { data, error } = await supabaseAdmin
      .from('scoring_rules')
      .select('*')
      .eq('is_active', true);

    if (error) {
      console.error('Error fetching scoring rules:', error);
      throw new Error(`Failed to fetch scoring rules: ${error.message}`);
    }

    const rulesMap = new Map<string, ScoringRule[]>();
    
    (data || []).forEach(rule => {
      const key = rule.target_id;
      if (!rulesMap.has(key)) {
        rulesMap.set(key, []);
      }
      rulesMap.get(key)!.push(rule);
    });

    console.log(`Loaded ${rulesMap.size} scoring rule groups from ${data?.length || 0} total rules`);
    return rulesMap;
  }

  private async getAllFieldDetails(): Promise<Map<string, FieldDetails>> {
    const { data, error } = await supabaseAdmin
      .from('typeform_field_versions')
      .select('*');

    if (error) {
      console.error('Error fetching field details:', error);
      return new Map();
    }

    const fieldDetailsMap = new Map<string, FieldDetails>();
    
    (data || []).forEach(field => {
      fieldDetailsMap.set(field.id, {
        id: field.field_id,
        name: field.field_title,
        type: field.field_type,
        ref: field.field_ref,
        version_id: field.id,
        created_at: field.created_at,
        updated_at: field.updated_at
      });
    });

    return fieldDetailsMap;
  }

  private async evaluateFieldResponseOptimized(
    response: ApplicationFieldResponse, 
    allScoringRules: Map<string, ScoringRule[]>,
    fieldDetailsMap: Map<string, FieldDetails>
  ): Promise<BatchResult> {
    const counts = { red: 0, yellow: 0, green: 0 };
    
    try {
      const fieldVersionId = response.field_version_id;
      
      const fieldDetails = fieldDetailsMap.get(fieldVersionId);
      if (!fieldDetails) {
        console.warn(`Field details not found for version ID: ${fieldVersionId}`);
        return { response, score: 'na', counts };
      }
      
      const fieldRules = allScoringRules.get(fieldVersionId) || [];
      
      if (response.choice_version_id) {
        const choiceRules = allScoringRules.get(response.choice_version_id) || [];
        this.applyRules(choiceRules, counts);
      }
      
      if (fieldDetails.type === 'yes_no') {
        this.applyYesNoRules(fieldRules, response, counts);
      } else if (fieldDetails.type === 'multiple_choice') {
        await this.applyMultipleChoiceRules(fieldRules, response, counts, allScoringRules);
      } else if (fieldDetails.type === 'opinion_scale') {
        await this.applyOpinionScaleRules(response, counts, allScoringRules);
      } else {
        this.applyRules(fieldRules, counts);
      }
      
      let finalScore: ScoreValue = 'na';
      if (counts.red > 0) finalScore = 'red';
      else if (counts.yellow > 0) finalScore = 'yellow';
      else if (counts.green > 0) finalScore = 'green';
      
      return { response, score: finalScore, counts };
      
    } catch (error) {
      console.error(`Error evaluating response ${response.id}:`, error);
      return { response, score: 'na', counts };
    }
  }

  private applyRules(rules: ScoringRule[], counts: { red: number; yellow: number; green: number }): void {
    rules.forEach(rule => {
      if (rule.is_active) {
        switch (rule.score_value) {
          case 'red': counts.red++; break;
          case 'yellow': counts.yellow++; break;
          case 'green': counts.green++; break;
        }
      }
    });
  }

  private applyYesNoRules(
    rules: ScoringRule[], 
    response: ApplicationFieldResponse, 
    counts: { red: number; yellow: number; green: number }
  ): void {
    rules.forEach(rule => {
      if (!rule.is_active) return;
      
      let criteria: any = rule.criteria;
      if (typeof criteria === 'string') {
        try {
          criteria = JSON.parse(criteria);
        } catch (e) {
          console.warn(`Failed to parse criteria for rule ${rule.id}:`, e);
          return;
        }
      }
      
      if (criteria?.answer && 
          criteria.answer.toLowerCase() === response.response_value?.toString().toLowerCase()) {
        switch (rule.score_value) {
          case 'red': counts.red++; break;
          case 'yellow': counts.yellow++; break;
          case 'green': counts.green++; break;
        }
      }
    });
  }

  private async applyMultipleChoiceRules(
    fieldRules: ScoringRule[],
    response: ApplicationFieldResponse,
    counts: { red: number; yellow: number; green: number },
    allScoringRules: Map<string, ScoringRule[]>
  ): Promise<void> {
    try {
      this.applyRules(fieldRules, counts);

      const responseValue = response.response_value?.toString();
      if (!responseValue) return;

      const choiceVersion = await this.findChoiceVersionByLabel(response.field_version_id, responseValue);
      if (choiceVersion) {
        const choiceRules = allScoringRules.get(choiceVersion) || [];
        this.applyRules(choiceRules, counts);
      }
    } catch (error) {
      console.warn(`Error applying multiple choice rules:`, error);
    }
  }

  private async applyOpinionScaleRules(
    response: ApplicationFieldResponse,
    counts: { red: number; yellow: number; green: number },
    allScoringRules: Map<string, ScoringRule[]>
  ): Promise<void> {
    try {
      const responseValue = response.response_value?.toString();
      if (!responseValue) return;

      const choiceVersion = await this.findChoiceVersionByLabel(response.field_version_id, responseValue);
      if (choiceVersion) {
        const choiceRules = allScoringRules.get(choiceVersion) || [];
        this.applyRules(choiceRules, counts);
      }
    } catch (error) {
      console.warn(`Error applying opinion scale rules:`, error);
    }
  }

  private async findChoiceVersionByLabel(fieldVersionId: string, label: string): Promise<string | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('typeform_choice_versions')
        .select('id')
        .eq('field_version_id', fieldVersionId)
        .eq('choice_label', label)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn(`Error finding choice version for label "${label}":`, error);
        return null;
      }

      return data?.id || null;
    } catch (error) {
      console.warn(`Error in findChoiceVersionByLabel:`, error);
      return null;
    }
  }

  private calculateFinalScores(batchResults: BatchResult[]): {
    redCount: number; yellowCount: number; greenCount: number; totalScore: number;
  } {
    const totals = batchResults.reduce(
      (acc, result) => ({
        redCount: acc.redCount + result.counts.red,
        yellowCount: acc.yellowCount + result.counts.yellow,
        greenCount: acc.greenCount + result.counts.green,
      }),
      { redCount: 0, yellowCount: 0, greenCount: 0 }
    );

    const totalScore = (totals.greenCount * 3) - (totals.redCount * 3) - totals.yellowCount;
    
    return { ...totals, totalScore };
  }

  private async updateApplicationScore(
    applicationId: string, 
    redCount: number, 
    yellowCount: number, 
    greenCount: number, 
    totalScore: number
  ): Promise<void> {
    const { data, error } = await supabaseAdmin
      .from('applications')
      .update({
        calculated_score: totalScore,
        red_count: redCount,
        yellow_count: yellowCount,
        green_count: greenCount
      })
      .eq('id', applicationId)
      .select('id');
      
    if (error) {
      console.error('Error updating application score:', error);
      throw new Error(`Failed to update application score: ${error.message}`);
    }

    console.log(`Updated application ${applicationId} with scores in database`);
  }

  private async batchUpdateResponseScores(batchResults: BatchResult[]): Promise<void> {
    if (batchResults.length === 0) return;

    try {
      for (let i = 0; i < batchResults.length; i += this.UPDATE_BATCH_SIZE) {
        if (this.checkTimeout()) {
          console.warn(`Timeout approaching, stopping response score updates at ${i}/${batchResults.length}`);
          break;
        }

        const batch = batchResults.slice(i, i + this.UPDATE_BATCH_SIZE);
        
        const updates = batch.map(item => ({
          id: item.response.id,
          score: item.score,
          application_id: item.response.application_id,
          field_version_id: item.response.field_version_id,
          choice_version_id: item.response.choice_version_id,
          response_value: item.response.response_value,
          response_metadata: item.response.response_metadata,
          is_raw: item.response.is_raw,
          created_at: item.response.created_at
        }));
        
        const { error } = await supabaseAdmin
          .from('application_field_responses')
          .upsert(updates, { onConflict: 'id' });
          
        if (error) {
          console.error(`Error updating response scores batch starting at ${i}:`, error);
        } else {
          console.log(`Updated response scores for batch ${Math.floor(i / this.UPDATE_BATCH_SIZE) + 1}`);
        }
      }
    } catch (error) {
      console.error('Error in batchUpdateResponseScores:', error);
    }
  }

  private async syncToHubSpotWithTimeout(
    applicationId: string, 
    redCount: number, 
    yellowCount: number, 
    greenCount: number
  ): Promise<void> {
    const timeRemaining = this.MAX_EXECUTION_TIME - (Date.now() - this.startTime);
    if (timeRemaining < 10000) {
      console.warn(`[HubSpot] Skipping sync due to insufficient time (${timeRemaining}ms remaining)`);
      return;
    }

    try {
      console.log('[HubSpot] Starting sync for application', applicationId);
      
      await this.waitForCalendlyDataWithBackoff(applicationId);
      
      const { data: app } = await supabaseAdmin
        .from('applications')
        .select('participant_id, status, closed_reason, rejected_type, assigned_to, id, application_data')
        .eq('id', applicationId)
        .maybeSingle();
        
      if (!app?.participant_id) {
        console.log('[HubSpot] No participant_id found');
        return;
      }
      
      const { data: participant } = await supabaseAdmin
        .from('participants')
        .select('email')
        .eq('id', app.participant_id)
        .maybeSingle();
        
      if (!participant?.email) {
        console.log('[HubSpot] No participant email found');
        return;
      }
      
      console.log(`[HubSpot] Looking up contact for email: ${participant.email}`);
      const contactId = await HubSpotService.findContactIdByEmail(participant.email);
      if (!contactId) {
        console.log('[HubSpot] No HubSpot contact found');
        return;
      }
      
      console.log(`[HubSpot] Found contact ID: ${contactId}, looking up deal...`);

      const dealId = await this.findDealWithRetry(contactId);
      if (!dealId) {
        console.log(`[HubSpot] No HubSpot deal found; skipping updates`);
        return;
      }
      
      console.log(`[HubSpot] Found deal ID: ${dealId}, determining status and screener...`);
      
      const mappedStatus = await this.determineHubSpotStatus(applicationId, app);
      console.log(`[HubSpot] Final mappedStatus for HubSpot: ${mappedStatus}`);
      
      const scoreSummary = `Red: ${redCount} / Yellow: ${yellowCount} / Green: ${greenCount}`;
      console.log(`[HubSpot] Updating deal with status: ${mappedStatus}, score: ${scoreSummary}`);
      
      try {
        await HubSpotService.updateApplicationProperties(dealId, {
          status: mappedStatus,
          score: scoreSummary,
        });
        console.log('[HubSpot] Successfully updated application properties');
      } catch (e: any) {
        if (e?.status === 403) {
          console.warn('[HubSpot] Status/score update skipped (missing scopes)');
        } else {
          console.error('[HubSpot] Error updating application properties:', e);
          throw e;
        }
      }

      const screenersDropdownValue = await this.determineScreenerName(applicationId, app);
      
      if (screenersDropdownValue) {
        console.log(`[HubSpot] Updating screener dropdown with value: ${screenersDropdownValue}`);
        try {
          await HubSpotService.updateDealProperties(dealId, { screeners_name: screenersDropdownValue });
          console.log('[HubSpot] Successfully updated screener dropdown');
        } catch (e: any) {
          if (e?.status === 403) {
            console.warn('[HubSpot] Screener update skipped (missing scopes)');
          } else {
            console.error('[HubSpot] Error updating screener:', e);
            throw e;
          }
        }
      } else {
        console.log('[HubSpot] No screener dropdown value found to update');
      }
      
      console.log('[HubSpot] Sync completed successfully');
    } catch (error) {
      console.error('[HubSpot] Sync failed:', error);
    }
  }

  private async waitForCalendlyDataWithBackoff(applicationId: string): Promise<void> {
    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const overallDeadline = this.startTime + this.MAX_EXECUTION_TIME - 12000;
    const MAX_ATTEMPTS = 8;
    
    let attempts = 0;
    let backoffMs = 600;
    let dataFound = false;
    
    console.log('[HubSpot] Waiting for Calendly data or UI hints...');
    
    while (!dataFound && attempts < MAX_ATTEMPTS && Date.now() < overallDeadline) {
      attempts++;
      
      const { data: app } = await supabaseAdmin
        .from('applications')
        .select('application_data, status')
        .eq('id', applicationId)
        .maybeSingle();
      
      const appData = (app?.application_data as any) || {};
      const hasStatusHint = typeof appData.hubspot_status_hint === 'string' && appData.hubspot_status_hint.trim().length > 0;
      const hasScreenerHint = typeof appData.hubspot_screener_hint === 'string' && appData.hubspot_screener_hint.trim().length > 0;
      
      if (hasStatusHint || hasScreenerHint) {
        console.log(`[HubSpot] Found UI hints after ${attempts} attempts (status: ${hasStatusHint}, screener: ${hasScreenerHint})`);
        dataFound = true;
        break;
      }
      
      const { data: meeting } = await supabaseAdmin
        .from('calendly_screening_meetings')
        .select('id, user_name')
        .eq('application_id', applicationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (meeting?.id) {
        console.log(`[HubSpot] Found Calendly meeting after ${attempts} attempts`);
        dataFound = true;
        break;
      }
      
      if (attempts < MAX_ATTEMPTS) {
        const waitTime = Math.min(3000, backoffMs);
        const waitUntil = Date.now() + waitTime;
        
        if (waitUntil >= overallDeadline) {
          console.log(`[HubSpot] Would exceed deadline, stopping wait at attempt ${attempts}`);
          break;
        }
        
        console.log(`[HubSpot] No data found yet, waiting ${waitTime}ms (attempt ${attempts}/${MAX_ATTEMPTS})...`);
        await wait(waitTime);
        backoffMs = Math.floor(backoffMs * 1.6);
      }
    }
    
    if (!dataFound) {
      console.log(`[HubSpot] No Calendly data or hints found after ${attempts} attempts, proceeding with available data`);
    }
  }

  private async findDealWithRetry(contactId: string): Promise<string | null> {
    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const overallDeadline = this.startTime + this.MAX_EXECUTION_TIME - 10000;
    const MAX_RETRIES = 20;
    
    let dealId: string | null = null;
    let attempt = 0;
    let backoffMs = 1000;
    
    if (Date.now() + 1500 < overallDeadline) {
      console.log('[HubSpot] Waiting 1.5s before first deal lookup...');
      await wait(1500);
    }
    
    while (!dealId && Date.now() < overallDeadline && attempt < MAX_RETRIES) {
      attempt++;
      
      try {
        dealId = await HubSpotService.findMostRecentDealIdForContact(contactId);
      } catch (e) {
        console.warn('[HubSpot] Deal lookup attempt failed:', e);
      }
      
      if (dealId) break;
      
      const jitter = Math.floor(Math.random() * 300);
      const waitMs = Math.min(5000, backoffMs) + jitter;
      const waitUntil = Date.now() + waitMs;
      
      if (waitUntil >= overallDeadline || attempt >= MAX_RETRIES) break;
      
      console.log(`[HubSpot] Deal not found (attempt ${attempt}/${MAX_RETRIES}), retrying in ${waitMs}ms...`);
      await wait(waitMs);
      backoffMs = Math.floor(backoffMs * 1.6);
    }
    
    return dealId;
  }

  private async determineHubSpotStatus(applicationId: string, app: any): Promise<string | null> {
    try {
      const hint = (app?.application_data as any)?.hubspot_status_hint as string | undefined;
      if (typeof hint === 'string' && hint.trim().length > 0) {
        const trimmedHint = hint.trim();
        console.log(`[HubSpot] Using hubspot_status_hint from application_data: ${trimmedHint}`);
        const hinted = HubSpotService.mapStatusToClosedApplicationStatusProperty(
          trimmedHint as any, 
          undefined, 
          undefined
        );
        if (hinted) {
          return hinted;
        }
      }
    } catch (e) {
      console.warn('[HubSpot] Error reading hubspot_status_hint:', e);
    }

    try {
      const { data: meeting } = await supabaseAdmin
        .from('calendly_screening_meetings')
        .select('id')
        .eq('application_id', applicationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (meeting?.id) {
        console.log('[HubSpot] Calendly meeting exists, using "Screening Scheduled" status');
        const scheduledStatus = HubSpotService.mapStatusToClosedApplicationStatusProperty(
          'screening_scheduled' as any, 
          undefined, 
          undefined
        );
        if (scheduledStatus) {
          return scheduledStatus;
        }
      }
    } catch (e) {
      console.warn('[HubSpot] Error checking Calendly meeting:', e);
    }

    console.log(`[HubSpot] Using default status mapping for: ${app.status}`);
    return HubSpotService.mapStatusToClosedApplicationStatusProperty(
      app.status,
      app.closed_reason,
      app.rejected_type
    );
  }

  private async determineScreenerName(applicationId: string, app: any): Promise<string | null> {
    try {
      const screenerHint = (app?.application_data as any)?.hubspot_screener_hint as string | undefined;
      if (typeof screenerHint === 'string' && screenerHint.trim().length > 0) {
        const trimmedName = screenerHint.trim();
        console.log(`[HubSpot] Using hubspot_screener_hint from application_data: ${trimmedName}`);
        const dropdownValue = await HubSpotService.findScreenerDropdownValueByExactName(trimmedName);
        if (dropdownValue) {
          return dropdownValue;
        }
      }
    } catch (e) {
      console.warn('[HubSpot] Error reading hubspot_screener_hint:', e);
    }

    if (app.assigned_to) {
      try {
        const { data: profile } = await supabaseAdmin
          .from('user_profiles')
          .select('first_name, last_name')
          .eq('id', app.assigned_to)
          .maybeSingle();
        
        const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
        if (fullName) {
          console.log(`[HubSpot] Found screener name from profile: ${fullName}`);
          const dropdownValue = await HubSpotService.findScreenerDropdownValueByExactName(fullName);
          if (dropdownValue) {
            return dropdownValue;
          }
        }
      } catch (err) {
        console.warn('[HubSpot] Failed loading screener profile:', err);
      }
    }

    try {
      const { data: meeting } = await supabaseAdmin
        .from('calendly_screening_meetings')
        .select('user_name')
        .eq('application_id', applicationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      const calName = (meeting?.user_name || '').trim();
      if (calName) {
        console.log(`[HubSpot] Found screener name from Calendly: ${calName}`);
        const dropdownValue = await HubSpotService.findScreenerDropdownValueByExactName(calName);
        if (dropdownValue) {
          return dropdownValue;
        }
      }
    } catch (err) {
      console.warn('[HubSpot] Failed querying Calendly meeting:', err);
    }

    return null;
  }

  private createEmptyScoringSummary(applicationId: string): ScoringSummary {
    return {
      applicationId,
      redCount: 0,
      yellowCount: 0,
      greenCount: 0,
      totalScore: 0
    };
  }

  private async processWithTimeoutFallback(
    applicationId: string,
    responses: ApplicationFieldResponse[],
    allScoringRules: Map<string, ScoringRule[]>,
    fieldDetailsMap: Map<string, FieldDetails>
  ): Promise<ScoringSummary> {
    console.warn('Using timeout fallback processing');
    
    const limitedResponses = responses.slice(0, Math.min(this.BATCH_SIZE, responses.length));
    
    const batchResults = await Promise.all(
      limitedResponses.map(response => 
        this.evaluateFieldResponseOptimized(response, allScoringRules, fieldDetailsMap)
      )
    );
    
    const { redCount, yellowCount, greenCount, totalScore } = this.calculateFinalScores(batchResults);
    
    await this.updateApplicationScore(applicationId, redCount, yellowCount, greenCount, totalScore);
    
    console.warn(`Timeout protection: processed ${limitedResponses.length}/${responses.length} responses`);
    
    return {
      applicationId,
      redCount,
      yellowCount,
      greenCount,
      totalScore
    };
  }

  private async getApplicationResponses(applicationId: string): Promise<ApplicationFieldResponse[]> {
    console.log(`Getting responses for application: ${applicationId}`);
    
    const { data, error } = await supabaseAdmin
      .from('application_field_responses')
      .select(`
        id, 
        application_id,
        field_version_id,
        choice_version_id,
        response_value,
        response_metadata,
        is_raw,
        created_at
      `)
      .eq('application_id', applicationId);
    
    if (error) {
      console.error('Error fetching application responses:', error);
      throw new Error(`Failed to fetch application responses: ${error.message}`);
    }
    
    return data || [];
  }

  private async getFieldDetails(fieldVersionId: string): Promise<FieldDetails | null> {
    const { data, error } = await supabaseAdmin
      .from('typeform_field_versions')
      .select(`*`)
      .eq('id', fieldVersionId)
      .limit(1)
      .maybeSingle();

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

  private async getFieldChoices(fieldVersionId: string): Promise<ChoiceDetails[]> {
    try {
      console.log(`Getting choices for field version: ${fieldVersionId}`);
      const { data, error } = await supabaseAdmin
        .from('typeform_choice_versions')
        .select(`
          id,
          choice_id,
          choice_label,
          choice_ref,
          field_version_id,
          version_date
        `)
        .eq('field_version_id', fieldVersionId);

      if (error) {
        console.error('Error fetching field choices:', error);
        return [];
      }

      return data?.map(item => ({
        id: item.choice_id,
        field_id: item.field_version_id,
        label: item.choice_label,
        ref: item.choice_ref,
        version_id: item.id,
        created_at: item.version_date || new Date().toISOString(),
        updated_at: item.version_date || new Date().toISOString()
      })) || [];
    } catch (error) {
      console.error('Error in getFieldChoices:', error);
      return [];
    }
  }

  private async getScoringRulesForField(fieldVersionId: string): Promise<ScoringRule[]> {
    const { data, error } = await supabaseAdmin
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

  private async getScoringRulesForChoice(choiceVersionId: string): Promise<ScoringRule[]> {
    const { data, error } = await supabaseAdmin
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
}

export const scoringService = new ScoringService();