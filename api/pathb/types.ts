export const PATH_B_ROLES = [
  'BrokerageAdmin',
  'OfficeAdmin',
  'TeamLead',
  'Agent',
  'MediaPartner',
  'Reviewer',
] as const;

export type PathBRole = (typeof PATH_B_ROLES)[number];
export type TransitionActorRole = PathBRole | 'System';

export const JOB_STATUSES = [
  'Draft',
  'Submitted',
  'In Review',
  'Approved for Processing',
  'Processing',
  'Delivered',
  'Revision Requested',
  'Completed',
  'Rejected',
  'Cancelled',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export type ScopeType = 'brokerage' | 'office' | 'team';

export type Permission =
  | 'manage:brokerage-users'
  | 'manage:office-users'
  | 'manage:brokerage-presets'
  | 'manage:office-presets'
  | 'create:job'
  | 'view:job-own'
  | 'view:job-office'
  | 'approve:job'
  | 'process:job'
  | 'deliver:job'
  | 'request:revision'
  | 'export:report'
  | 'view:audit';

export interface TenantScopeContext {
  brokerageId: string;
  officeId?: string | null;
  teamId?: string | null;
}

export interface ActorContext extends TenantScopeContext {
  userId: string;
  role: PathBRole;
  requestId: string;
}

export interface TransitionMetadata {
  reason?: string;
  outputAssetIds?: string[];
  revisionReasonCategory?: string;
  note?: string;
}
