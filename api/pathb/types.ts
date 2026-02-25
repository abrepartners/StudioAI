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

export interface BrokerageRecord {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OfficeRecord {
  id: string;
  brokerageId: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TeamRecord {
  id: string;
  brokerageId: string;
  officeId: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserRecord {
  id: string;
  brokerageId: string;
  email: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MembershipRecord {
  id: string;
  brokerageId: string;
  officeId?: string | null;
  teamId?: string | null;
  userId: string;
  role: PathBRole;
  scopeType: ScopeType;
  createdAt: string;
  updatedAt: string;
}

export type EditLabel =
  | 'Virtual Staging'
  | 'Restaging'
  | 'Twilight'
  | 'Declutter'
  | 'Object Removal'
  | 'Lawn Enhancement'
  | 'Sky Replacement'
  | 'Minor Cleanup'
  | 'Renovation Preview';

export interface PresetRecord {
  id: string;
  name: string;
  scopeType: 'brokerage' | 'office';
  scopeId: string;
  brokerageId: string;
  officeId?: string | null;
  active: boolean;
  allowedEditTypes: EditLabel[];
  defaultSettingsJson: Record<string, unknown>;
  approvalRequired: boolean;
  disclosureRequiredDefault: boolean;
  deliveryNotesTemplate: string;
  revisionPolicyTemplate: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type JobPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface JobRecord {
  id: string;
  brokerageId: string;
  officeId: string;
  teamId?: string | null;
  agentUserId: string;
  propertyAddress: string;
  mlsId?: string | null;
  selectedPresetId: string;
  requestedEditCategories: EditLabel[];
  requestedTurnaround?: string | null;
  priority: JobPriority;
  notes?: string | null;
  disclosureRelevant: boolean;
  disclosureRequired: boolean;
  status: JobStatus;
  revisionCount: number;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string | null;
  deliveredAt?: string | null;
  completedAt?: string | null;
}

export interface JobAssetRecord {
  id: string;
  brokerageId: string;
  officeId: string;
  jobId: string;
  kind: 'original' | 'processed';
  version: number;
  editLabel?: EditLabel | null;
  url: string;
  name?: string | null;
  uploadedByUserId: string;
  createdAt: string;
}

export type ApprovalDecision = 'approve' | 'reject' | 'request_changes';

export interface JobApprovalRecord {
  id: string;
  brokerageId: string;
  officeId: string;
  jobId: string;
  reviewerUserId: string;
  decision: ApprovalDecision;
  note?: string | null;
  createdAt: string;
}
