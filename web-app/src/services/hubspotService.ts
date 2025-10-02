/*
  HubSpot integration service
  - Keeps HubSpot-specific logic isolated from app logic
*/

type HubSpotDeal = {
  id: string;
  properties?: Record<string, any>;
};

const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY;
const HUBSPOT_BASE = 'https://api.hubapi.com';

function assertApiKey() {
  if (!HUBSPOT_API_KEY) {
    throw new Error('HUBSPOT_API_KEY is not configured');
  }
}

async function hsFetch<T>(path: string, init?: RequestInit): Promise<T> {
  assertApiKey();
  const res = await fetch(`${HUBSPOT_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    // Throw structured error so callers can detect missing scopes and skip loudly but safely
    const err = new Error(`HubSpot API ${path} failed: ${res.status} ${text}`) as any;
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return res.json() as Promise<T>;
}

// Map internal app status to HubSpot pipeline stage (update this config as needed)
const statusToStage: Record<string, { pipeline: string; stage: string }> = {
  // internal_status: { pipeline: 'default', stage: 'appointmentscheduled' }
  pending: { pipeline: 'default', stage: '1142575458' },
  new: { pipeline: 'default', stage: '1142575458' },
  screening_scheduled: { pipeline: 'default', stage: 'appointmentscheduled' },
  screening_no_show: { pipeline: 'default', stage: 'appointmentscheduled' },
  invited_to_reschedule: { pipeline: 'default', stage: 'appointmentscheduled' },
  secondary_screening: { pipeline: 'default', stage: 'appointmentscheduled' },
  screening_in_process: { pipeline: 'default', stage: 'appointmentscheduled' },
  medical_review_required: { pipeline: 'default', stage: 'appointmentscheduled' },
  conditionally_approved: { pipeline: 'default', stage: 'qualifiedtobuy' },
  closed: { pipeline: 'default', stage: '121534028' },
};

// Provided by user: application_status (dropdown), application_score (single-line), screener_notes (multi-line)
const dealProps = {
  applicationStatus: 'application_status',
  applicationScore: 'application_score',
  screenerNotes: 'screener_notes',
};

export class HubSpotService {
  // Find a contact by email and return HubSpot contact ID
  static async findContactIdByEmail(email: string): Promise<string | null> {
    assertApiKey();
    try {
      const body = {
        filterGroups: [
          {
            filters: [{ propertyName: 'email', operator: 'EQ', value: email }],
          },
        ],
        properties: ['email'],
        limit: 1,
      };
      const data = await hsFetch<{ results: Array<{ id: string }> }>(`/crm/v3/objects/contacts/search`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return data.results?.[0]?.id || null;
    } catch (e) {
      console.warn('HubSpot findContactIdByEmail failed:', e);
      return null;
    }
  }

  static async findMostRecentDealIdForContact(contactId: string): Promise<string | null> {
    assertApiKey();
    try {
      // Get associated deals
      const assoc = await hsFetch<{ results: Array<{ id: string }> }>(`/crm/v3/objects/contacts/${contactId}/associations/deals`);
      const dealIds = assoc.results?.map(r => r.id) || [];
      if (dealIds.length === 0) return null;
      // HubSpot batch read
      const batch = await hsFetch<{ results: Array<{ id: string; properties?: any }> }>(`/crm/v3/objects/deals/batch/read`, {
        method: 'POST',
        body: JSON.stringify({
          properties: ['lastmodifieddate', 'createdate'],
          inputs: dealIds.map(id => ({ id })),
        }),
      });
      const sorted = (batch.results || []).sort((a, b) => {
        const aTime = Date.parse(a.properties?.lastmodifieddate || a.properties?.createdate || '');
        const bTime = Date.parse(b.properties?.lastmodifieddate || b.properties?.createdate || '');
        return bTime - aTime; // desc
      });
      return sorted[0]?.id || dealIds[0] || null;
    } catch (e) {
      console.warn('HubSpot findMostRecentDealIdForContact failed:', e);
      return null;
    }
  }
  // Find a deal by application id stored as a custom property on the deal
  static async findDealIdByApplicationId(applicationId: string): Promise<string | null> {
    assertApiKey();
    try {
      const searchBody = {
        filterGroups: [
          {
            filters: [
              { propertyName: 'br_application_id', operator: 'EQ', value: applicationId },
            ],
          },
        ],
        properties: ['dealname', 'pipeline', 'dealstage'],
        limit: 1,
      };
      const data = await hsFetch<{ results: HubSpotDeal[] }>(`/crm/v3/objects/deals/search`, {
        method: 'POST',
        body: JSON.stringify(searchBody),
      });
      const deal = data.results?.[0];
      return deal?.id || null;
    } catch (e) {
      console.warn('HubSpot findDealIdByApplicationId failed:', e);
      return null;
    }
  }

  static async updateDealStage(dealId: string, pipeline: string, stage: string): Promise<void> {
    assertApiKey();
    await hsFetch(`/crm/v3/objects/deals/${dealId}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties: { pipeline, dealstage: stage } }),
    });
  }

  static async updateDealProperties(dealId: string, properties: Record<string, any>): Promise<void> {
    assertApiKey();
    try {
      if ('screeners_name' in properties) {
        console.log('[HubSpot] Updating screeners_name on deal', dealId, 'with value:', properties['screeners_name']);
      }
    } catch {}
    await hsFetch(`/crm/v3/objects/deals/${dealId}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties }),
    });
  }

  static getStageForStatus(
    status: string,
    closedReason?: string | null,
    rejectedType?: string | null
  ): { pipeline: string; stage: string } | null {
    // Handle closed status with different reasons
    if (status === 'closed') {
      const reason = (closedReason || '').toLowerCase();
      if (reason === 'approved') return { pipeline: 'default', stage: 'closedwon' };
      if (reason === 'unresponsive') return { pipeline: 'default', stage: '121534028' };
      if (reason === 'rejected') return { pipeline: 'default', stage: '121534028' };
    }
    
    // Handle screening_completed with different reasons
    if (status === 'screening_completed') {
      const reason = (closedReason || '').toLowerCase();
      if (reason === 'approved') return { pipeline: 'default', stage: 'qualifiedtobuy' };
      if (reason === 'unresponsive') return { pipeline: 'default', stage: '107658399' };
      if (reason === 'rejected') {
        const type = (rejectedType || '').toLowerCase();
        if (type === 'temporary') return { pipeline: 'default', stage: '107658399' };
        if (type === 'permanent') return { pipeline: 'default', stage: '107658399' };
        // Default to application denied if type not specified
        return { pipeline: 'default', stage: '107658399' };
      }
    }
    
    return statusToStage[status] || null;
  }

  static buildScoreSummary(red?: number, yellow?: number, green?: number): string | null {
    if (red == null && yellow == null && green == null) return null;
    return `${red ?? 0} / ${yellow ?? 0} / ${green ?? 0}`;
  }

  // Build merged application status string directly from DB fields
  // Format: `${status}` or `${status} - ${closedReason}` or `${status} - ${closedReason} - ${rejectedType}`
  static buildMergedStatusFromDb(
    status?: string | null,
    closedReason?: string | null,
    rejectedType?: string | null
  ): string | null {
    if (!status) return null;
    const parts: string[] = [status];
    if (closedReason) parts.push(closedReason);
    if (rejectedType) parts.push(rejectedType);
    return parts.join(' - ');
  }

  // Fetch dropdown options for a deal property
  static async getDealPropertyOptions(propertyName: string): Promise<Array<{ label: string; value: string }>> {
    assertApiKey();
    try {
      const data = await hsFetch<{ options?: Array<{ label: string; value: string }> }>(`/crm/v3/properties/deals/${propertyName}`);
      return data.options || [];
    } catch (e) {
      console.warn(`HubSpot getDealPropertyOptions failed for ${propertyName}:`, e);
      return [];
    }
  }

  // Find the screeners_name dropdown value by matching exact full name (case-insensitive)
  static async findScreenerDropdownValueByExactName(fullName: string): Promise<string | null> {
    const target = (fullName || '').trim().toLowerCase();
    if (!target) return null;
    const options = await this.getDealPropertyOptions('screeners_name');
    if (!options.length) {
      console.warn('[HubSpot] screeners_name has no dropdown options to match.');
      return null;
    }
    console.log('[HubSpot] Matching screeners_name for target:', target, 'against', options.length, 'options');
    const match = options.find(opt =>
      opt.label?.trim().toLowerCase() === target || opt.value?.trim().toLowerCase() === target
    );
    if (match) {
      console.log('[HubSpot] Matched screeners_name option value:', match.value, 'label:', match.label);
      return match.value;
    }
    console.warn('[HubSpot] No screeners_name option matched for target:', target);
    return null;
  }

  // Convenience helper to update app status, score, and notes properties in one call
  static async updateApplicationProperties(
    dealId: string,
    params: { status?: string | null; score?: string | null; notes?: string | null }
  ): Promise<void> {
    const properties: Record<string, any> = {};
    if (params.status != null) properties[dealProps.applicationStatus] = params.status;
    if (params.score != null) properties[dealProps.applicationScore] = params.score;
    if (params.notes != null) {
      const str = typeof params.notes === 'string' ? params.notes : String(params.notes ?? '');
      properties[dealProps.screenerNotes] = str;
    }
    if (Object.keys(properties).length === 0) return;
    await this.updateDealProperties(dealId, properties);
  }

  // Map internal status + closed_reason to HubSpot dropdown value for application_status
  static mapStatusToApplicationStatusProperty(
    status: string | null | undefined,
    closedReason?: string | null,
    rejectedType?: string | null
  ): string | null {
    if (!status) return null;
    switch (status) {
      case 'pending':
      case 'new':
        return 'Pending';
      case 'screening_scheduled':
        return 'Screening Scheduled';
      case 'screening_no_show':
        return 'Screening No Show';
      case 'invited_to_reschedule':
        return 'Invited to Reschedule';
      case 'secondary_screening':
        return 'Secondary Screening';
      case 'medical_review_required':
        return 'Medical Review Required';
      case 'screening_in_process':
        return 'Screening';
      case 'conditionally_approved':
        return 'Conditionally Approved';
      case 'closed': {
        const reason = (closedReason || '').toLowerCase();
        if (reason === 'approved') return 'Screening Completed - Approved';
        if (reason === 'unresponsive') return 'Screening Completed - Unresponsive';
        if (reason === 'rejected') {
          const type = (rejectedType || '').toLowerCase();
          if (type === 'temporary') return 'Screening Completed - Rejected - Temporary';
          if (type === 'permanent') return 'Screening Completed - Rejected - Permanent';
          // If not specified, default to generic Rejected
          return 'Screening Completed - Rejected';
        }
        // Fallback
        return 'pending';
      }
      default:
        return null;
    }
  }

  // Map specifically for the dropdown close action to legacy "Closed - ..." variants
  static mapStatusToClosedApplicationStatusProperty(
    status: string | null | undefined,
    closedReason?: string | null,
    rejectedType?: string | null
  ): string | null {
    if (!status) return null;
    switch (status) {
      case 'pending':
      case 'new':
        return 'Pending';
      case 'screening_scheduled':
        return 'Screening Scheduled';
      case 'screening_no_show':
        return 'Screening No Show';
      case 'invited_to_reschedule':
        return 'Invited to Reschedule';
      case 'secondary_screening':
        return 'Secondary Screening';
      case 'medical_review_required':
        return 'Medical Review Required';
      case 'screening_in_process':
        return 'Screening';
      case 'conditionally_approved':
        return 'Conditionally Approved';
      case 'screening_completed': {
        const reason = (closedReason || '').toLowerCase();
        if (reason === 'approved') return 'Screening Completed - Approved';
        if (reason === 'unresponsive') return 'Screening Completed - Unresponsive';
        if (reason === 'rejected') {
          const type = (rejectedType || '').toLowerCase();
          if (type === 'temporary') return 'Screening Completed - Rejected - Temporary';
          if (type === 'permanent') return 'Screening Completed - Rejected - Permanent';
          return 'Screening Completed - Rejected';
        }
        return 'Screening Completed';
      }
      case 'closed': {
        const reason = (closedReason || '').toLowerCase();
        if (reason === 'approved') return 'Closed - Approved';
        if (reason === 'unresponsive') return 'Closed - Unresponsive';
        if (reason === 'rejected') {
          const type = (rejectedType || '').toLowerCase();
          if (type === 'temporary') return 'Closed - Rejected - Temporary';
          if (type === 'permanent') return 'Closed - Rejected - Permanent';
          return 'Closed - Rejected';
        }
        return 'Pending';
      }
      default:
        return null;
    }
  }
}

export default HubSpotService;


