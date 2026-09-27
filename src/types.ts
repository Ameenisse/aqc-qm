export type Role = 'ADMIN' | 'PRESENTATION_OPERATOR' | 'JUDGE' | 'RESULT_OFFICER' | 'VIEWER' | 'PODIUM' | 'AUDIENCE';

export type StageStatus =
  | 'HOLDING'
  | 'CALLED'
  | 'QUESTION_SELECTION_ALLOWED'
  | 'QUESTION_SELECTED'
  | 'READY'
  | 'PERFORMING'
  | 'PERFORMANCE_FINISHED'
  | 'RECALLED'
  | 'RESET';

export type ParticipantStatus =
  | 'Registered'
  | 'Waiting'
  | 'Ready'
  | 'Called'
  | 'On Stage'
  | 'Performing'
  | 'Performance Finished'
  | 'Completed'
  | 'Recalled'
  | 'Absent'
  | 'Withdrawn'
  | 'Disqualified';

export type JudgeScoreStatus = 'NOT STARTED' | 'DRAFT' | 'SUBMITTED' | 'REOPENED';

export type ResultStatus =
  | 'INCOMPLETE'
  | 'PENDING JUDGES'
  | 'CALCULATED'
  | 'UNDER REVIEW'
  | 'VERIFIED'
  | 'PUBLISHED'
  | 'HIDDEN';

export type BellType = 'FIRST_WARNING' | 'FINAL_WARNING' | 'STOP';

export interface Competition {
  id: string;
  name: string;
  name_dhivehi: string;
  organization_name: string;
  organization_logo_url: string;
  competition_logo_url: string;
  venue: string;
  competition_year: string;
  start_date: string;
  end_date: string;
  description: string;
  contact_details: string;
  status: 'active' | 'archived' | 'draft';
  results_published: boolean;
  audience_quran_visibility: boolean;
  audience_background_url?: string;
  audience_background_overlay?: number; // 0 - 100 percentage
  tilawa_podium_quran_visibility: boolean;
  hifz_podium_answer_visibility: boolean; // default FALSE
  finished_screen_duration: number; // default 3 seconds
  finished_screen_duration_seconds?: number;
  finished_performance_text: string;
  performance_timer_enabled?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Grade {
  id: string;
  code: string;
  name: string;
  name_dhivehi: string;
  display_order: number;
  is_official: boolean;
  status: 'active' | 'inactive';
}

export interface Branch {
  id: string;
  code: string;
  name_dhivehi: string;
  branch_type: 'TILAWA' | 'HIFZ';
  direction: 'BEGINNING' | 'ENDING';
  surah_start: number;
  surah_end: number;
  display_order: number;
  is_official: boolean;
  status: 'active' | 'inactive';
}

export interface Category {
  id: string;
  competition_id: string;
  grade_id: string;
  branch_id: string;
  name: string;
  name_dhivehi: string;
  status: 'active' | 'inactive';
}

export interface Participant {
  id: string;
  competition_id: string;
  participant_number: string;
  name: string;
  name_dhivehi: string;
  photo_url: string;
  gender?: 'male' | 'female' | 'other';
  dob?: string;
  age?: number;
  institution: string;
  island: string;
  atoll: string;
  contact?: string;
  grade_id: string;
  branch_id: string;
  category_id?: string;
  queue_order: number;
  status: ParticipantStatus;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  // Joined fields for convenience
  grade_name?: string;
  grade_name_dhivehi?: string;
  branch_name_dhivehi?: string;
  branch_type?: 'TILAWA' | 'HIFZ';
  category_name?: string;
}

export interface Question {
  id: string;
  competition_id: string;
  grade_id: string;
  branch_id: string;
  category_id?: string;
  question_number: string; // e.g. "01", "02", ...
  surah_number: number;
  surah_name: string;
  surah_name_arabic: string;
  start_ayah: number;
  end_ayah: number;
  start_surah_name?: string;
  end_surah_name?: string;
  end_surah_number?: number;
  end_surah_name_arabic?: string;
  start_page: number;
  end_page: number;
  juz: number;
  quran_text_preview?: string;
  quran_text_arabic?: string;
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  notes?: string;
  status: 'active' | 'inactive';
  is_active?: boolean;
  used: boolean;
  created_at?: string;
  updated_at?: string;
  // Joined
  grade_name_dhivehi?: string;
  branch_name_dhivehi?: string;
  branch_type?: 'TILAWA' | 'HIFZ';
}

export interface QuestionUsage {
  id: string;
  question_id: string;
  performance_session_id: string;
  participant_id: string;
  selected_by: string;
  selection_method: 'PODIUM' | 'OPERATOR_OVERRIDE' | 'RANDOM_DRAW';
  selected_at: string;
  reset_at?: string;
}

export interface PerformanceSession {
  id: string;
  competition_id: string;
  participant_id: string;
  session_number: number;
  is_recall: boolean;
  supersedes_session_id?: string;
  status: 'active' | 'completed' | 'cancelled';
  called_at: string;
  question_selected_at?: string;
  started_at?: string;
  finished_at?: string;
  active_question_id?: string;
  operator_id?: string;
  created_at?: string;
  updated_at?: string;
  // Joined
  participant_number?: string;
  participant_name?: string;
  participant_name_dhivehi?: string;
  grade_name_dhivehi?: string;
  branch_name_dhivehi?: string;
  branch_type?: 'TILAWA' | 'HIFZ';
  question_number?: string;
  surah_name_arabic?: string;
  surah_number?: number;
  start_ayah?: number;
  end_ayah?: number;
  judges_submitted?: number;
  judges_total?: number;
}

export interface StageState {
  id: string;
  competition_id: string;
  performance_session_id?: string | null;
  participant_id?: string | null;
  stage_status: StageStatus;
  active_question_id?: string | null;
  question_selection_enabled: boolean;
  timer_mode: 'stopwatch' | 'countdown' | 'disabled';
  timer_duration: number; // in seconds (for countdown)
  timer_started_at?: string | null;
  timer_paused_at?: string | null;
  timer_offset: number; // accumulated elapsed time in seconds
  display_state: string; // 'HOLDING' | 'PARTICIPANT' | 'GRID' | 'QUESTION' | 'PERFORMING' | 'FINISHED'
  updated_at: string;
  // Hydrated full details for screens
  competition?: Competition;
  current_participant?: Participant | null;
  selected_question?: Question | null;
  available_question_numbers: string[];
  used_question_numbers: string[];
  recent_bell?: BellEvent | null;
}

export interface User {
  id: string;
  username: string;
  name: string;
  name_dhivehi?: string;
  password?: string;
  role: Role;
  status: 'active' | 'inactive';
  judge_id?: string;
  judge_code?: string;
  can_trigger_stage_bells?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Judge {
  id: string;
  user_id: string;
  judge_code: string; // e.g. "J-01"
  name: string;
  name_dhivehi?: string;
  status: 'active' | 'inactive';
  can_trigger_stage_bells: boolean;
  assigned_grades?: string[];
  assigned_branches?: string[];
}

export interface RubricCriterion {
  id: string;
  rubric_id: string;
  name: string;
  name_dhivehi: string;
  max_points: number;
  weight: number;
  starting_points: number;
  allowed_deductions: number[]; // e.g. [-0.5, -1.0, -2.0]
  display_order: number;
  status: 'active' | 'inactive';
}

export interface Rubric {
  id: string;
  competition_id: string;
  branch_type: 'TILAWA' | 'HIFZ';
  name: string;
  name_dhivehi: string;
  criteria: RubricCriterion[];
}

export interface Deduction {
  id: string;
  judge_score_id: string;
  criterion_id: string;
  value: number; // e.g. -0.5, -1, -2
  reason?: string;
  created_at: string;
}

export interface CriterionScore {
  criterion_id: string;
  starting_score: number;
  deductions_total: number;
  final_score: number;
  deductions: Deduction[];
}

export interface JudgeScore {
  id: string;
  performance_session_id: string;
  participant_id: string;
  judge_id: string;
  judge_code?: string;
  judge_name?: string;
  rubric_id: string;
  subtotal: number;
  deductions_total: number;
  final_total: number;
  submission_status: JudgeScoreStatus;
  submitted_at?: string;
  version: number;
  notes?: string;
  criterion_scores: CriterionScore[];
  created_at?: string;
  updated_at?: string;
}

export interface BellEvent {
  id: string;
  performance_session_id?: string;
  judge_id?: string;
  judge_name?: string;
  bell_type: BellType;
  triggered_at: string;
}

export interface ParticipantResult {
  id: string;
  performance_session_id: string;
  participant_id: string;
  participant_number: string;
  participant_name: string;
  participant_name_dhivehi: string;
  institution: string;
  grade_id: string;
  grade_name_dhivehi: string;
  branch_id: string;
  branch_name_dhivehi: string;
  category_id?: string;
  category_name_dhivehi?: string;
  judge_scores: {
    judge_id: string;
    judge_code: string;
    score: number;
    status: JudgeScoreStatus;
  }[];
  final_score: number;
  rank?: number;
  verification_status: ResultStatus;
  published: boolean;
  score_discrepancy?: boolean;
  discrepancy_delta?: number;
  updated_at?: string;
}

export interface AuditLog {
  id: string;
  user_id?: string;
  username?: string;
  role?: string;
  action: string;
  module: string;
  entity_type?: string;
  entity_id?: string;
  previous_data?: string;
  new_data?: string;
  reason?: string;
  created_at: string;
}

export type ScoreAuditEventType = 'DEDUCTION' | 'SUBMIT_MARKS' | 'DRAFT_MARKS' | 'REOPEN_SCORE';

export interface ScoreAuditEvent {
  id: string;
  event_type: ScoreAuditEventType;
  judge_id: string;
  judge_code: string;
  judge_name: string;
  judge_name_dhivehi?: string;
  participant_id: string;
  participant_number: string;
  participant_name: string;
  participant_name_dhivehi?: string;
  institution?: string;
  island?: string;
  grade_name_dhivehi?: string;
  branch_name_dhivehi?: string;
  performance_session_id?: string;
  criterion_id?: string;
  criterion_name?: string;
  criterion_name_dhivehi?: string;
  deduction_value?: number;
  reason?: string;
  subtotal?: number;
  deductions_total?: number;
  final_total?: number;
  submission_status?: string;
  notes?: string;
  created_at: string;
}

export interface ScoreAuditSummary {
  total_events: number;
  total_deductions_count: number;
  total_deductions_points: number;
  total_submissions: number;
  active_judges_count: number;
  scored_participants_count: number;
}

export interface RealtimeMessage {
  type:
    | 'INIT_STATE'
    | 'STAGE_STATE_UPDATED'
    | 'PARTICIPANT_CALLED'
    | 'QUESTION_SELECTION_ENABLED'
    | 'QUESTION_SELECTED'
    | 'STAGE_READY'
    | 'STAGE_TRANSITIONED'
    | 'PERFORMANCE_STARTED'
    | 'TIMER_UPDATED'
    | 'BELL_TRIGGERED'
    | 'PERFORMANCE_FINISHED'
    | 'HOLDING_SCREEN_STARTED'
    | 'JUDGE_SCORE_SUBMITTED'
    | 'JUDGE_SCORE_REOPENED'
    | 'RESULTS_UPDATED'
    | 'AUDIT_LOG_ADDED';
  payload: any;
  timestamp: string;
}
