import { ActorContext, TenantScopeContext } from './types';

export const AUDIT_EVENT_TYPES = [
  'USER_INVITED',
  'MEMBERSHIP_CHANGED',
  'PRESET_CREATED',
  'PRESET_UPDATED',
  'PRESET_DELETED',
  'JOB_SUBMITTED',
  'JOB_STATUS_CHANGED',
  'JOB_APPROVAL_DECISION',
  'JOB_DELIVERY_CREATED',
  'JOB_REVISION_REQUESTED',
  'JOB_ASSET_UPLOADED',
  'JOB_DISCLOSURE_UPDATED',
  'REPORT_EXPORTED',
] as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];
export type AuditSource = 'ui' | 'api' | 'system';

export interface AuditEvent {
  eventType: AuditEventType;
  actorUserId: string;
  actorRole: string;
  brokerageId: string;
  officeId?: string | null;
  teamId?: string | null;
  targetEntityType: string;
  targetEntityId: string;
  timestamp: string;
  source: AuditSource;
  beforeSnapshot?: Record<string, unknown> | null;
  afterSnapshot?: Record<string, unknown> | null;
  reason?: string | null;
  note?: string | null;
  requestId: string;
}

export interface BuildAuditEventInput {
  eventType: AuditEventType;
  actor: ActorContext;
  scope: TenantScopeContext;
  targetEntityType: string;
  targetEntityId: string;
  source: AuditSource;
  beforeSnapshot?: Record<string, unknown> | null;
  afterSnapshot?: Record<string, unknown> | null;
  reason?: string | null;
  note?: string | null;
}

export const buildAuditEvent = (input: BuildAuditEventInput): AuditEvent => ({
  eventType: input.eventType,
  actorUserId: input.actor.userId,
  actorRole: input.actor.role,
  brokerageId: input.scope.brokerageId,
  officeId: input.scope.officeId || null,
  teamId: input.scope.teamId || null,
  targetEntityType: input.targetEntityType,
  targetEntityId: input.targetEntityId,
  timestamp: new Date().toISOString(),
  source: input.source,
  beforeSnapshot: input.beforeSnapshot || null,
  afterSnapshot: input.afterSnapshot || null,
  reason: input.reason || null,
  note: input.note || null,
  requestId: input.actor.requestId,
});
