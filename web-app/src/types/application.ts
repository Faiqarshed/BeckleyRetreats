// Types for Application Intake feature

// Database Participant type
export interface Participant {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  date_of_birth?: string; // ISO date string
  hubspot_contact_id?: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

// Application status options
export type ApplicationStatus =
  | 'new'
  | 'pending'
  | 'screening_scheduled'
  | 'screening_no_show'
  | 'invited_to_reschedule'
  | 'secondary_screening'
  | 'medical_review_required'
  | 'pending_medical_review'
  | 'pending_medication_change'
  | 'pending_ic'
  | 'conditionally_approved'
  | 'screening_in_process'
  | 'screening_completed'
  | 'closed';

export interface SavedTypeFormApplication {
  id: string,
  typeform_response_id: string
}


// Database Application type
export interface Application {
  id: string;
  participant_id: string;
  form_id: string;
  typeform_response_id?: string;
  submission_date: string;
  form_title?: string; // Added to match API response
  raw_data?: any;
  calculated_score?: number;
  red_count?: number;
  yellow_count?: number;
  green_count?: number;
  status: ApplicationStatus;
  assigned_to?: string;
  assigned_screener_id?: string; // ID of the assigned screener user
  hubspot_deal_id?: string;
  created_at: string;
  updated_at: string;
  closed_reason?: string;
  rejected_type?: string;
  // Added participants property to match joined data from API
  participants?: Participant;
  // Enhanced fields for UI integration
  screener?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    role: string;
  } | string;
  screening_meeting?: {
    id: string;
    calendly_event_type: string;
    calendly_payload: any;
    application_id: string;
    participant_id: string;
    invitee_email: string;
    invitee_name: string;
    event_start: string;
    event_end: string;
    join_url: string;
    user_name: string;
    user_email: string;
    created_at: string;
    updated_at: string;
  } | null;
  initial_screening?: Screening | null;
  // Field responses for displaying application answers
  field_responses?: ApplicationFieldResponse[];
}

// Score values that match scoring_rules
export type ScoreValue = 'red' | 'yellow' | 'green' | 'na';

// Application field response
export interface ApplicationFieldResponse {
  id: string;
  application_id: string;
  field_version_id: string;
  response_value: string;
  score?: ScoreValue;
  created_at: string;
}

// TypeformWebhook interface (reflects Typeform webhook submission format)
export interface TypeformWebhook {
  event_id: string;
  event_type: string;
  form_response: {
    form_id: string;
    token: string; // response ID
    submitted_at: string;
    landed_at: string;
    calculated?: {
      score?: number;
    };
    hidden?: Record<string, any>;
    definition: {
      id: string;
      title: string;
      fields: TypeformFieldDefinition[];
    };
    answers: TypeformAnswer[];
  };
}

export interface TypeformFieldDefinition {
  id: string;
  title: string;
  type: string;
  ref?: string;
  properties?: any;
}

export interface TypeformField {
  id: string;
  ref: string;
  type: string;
  title: string;
  properties?: {
    allow_multiple_selections?: boolean;
    [key: string]: any;
  };
  choices?: {
    id: string;
    ref: string;
    label: string;
  }[];

  [key: string]: any;
}

export interface TypeformChoice {
  id: string;
  label: string;
  ref?: string;
}

export interface TypeformAnswer {
  field: {
    id: string;
    type: string;
    ref?: string;
  };
  type: string;
  text?: string;
  email?: string;
  phone_number?: string;
  number?: number;
  date?: string;
  boolean?: boolean;
  choice?: TypeformChoice;
  choices?: TypeformChoice[] | {
    ids: string[];
    labels: string[];
    refs?: string[];
  };
}

// Interface for extracting participant data from Typeform answers
export interface ParticipantData {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  dateOfBirth?: string;
}

export interface ScreeningNoteValues {
  initialScreeningSummary: string;
  secondaryScreeningSummary: string;
  generalNotes?: string; // New field added for general notes
  desiredRetreat: string;
  scholarshipNeeds?: string; // Old field kept for backward compatibility
  scholarshipNeeded: boolean; // New boolean field replacing scholarshipNeeds string
  medsHealthHistory: string;
  supportSystem: string;
  intention: string;
  psychHistory: string;
  psychObservation: string;
  psychedelicExperience: string;
  supportiveHabits: string;
  actionLogs?: string[];
}

export type ScreeningStatus = 'PENDING' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';

export interface Screening {
  id: string; // uuid
  participant_id?: string | null; // uuid
  application_id: string; // uuid
  screener_id?: string | null; // uuid, references user_profiles.id
  status: ScreeningStatus;
  notes?: ScreeningNoteValues | null; // JSONB
  scheduled_at?: string | null; // timestamp with time zone
  completed_at?: string | null; // timestamp with time zone
  created_at: string; // timestamp with time zone
  updated_at: string; // timestamp with time zone
  screening_type: string; // e.g., 'initial', 'secondary', 'medical'
}
