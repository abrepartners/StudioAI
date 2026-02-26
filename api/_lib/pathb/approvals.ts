import { buildAuditEvent } from './audit';
import { getActorFromRequest } from './context';
import { PathBApiError } from './errors';
import { getRequestId, handlePathBError, json, parseBody, setCors, withCorsPreflight } from './http';
import { assertPermission, assertTenantScope } from './rbac';
import { appendAuditEvent, createJobApproval, getJob, saveJob } from './store';
import { ApprovalDecision } from './types';
import { assertTransition } from './workflow';

const DECISIONS: ApprovalDecision[] = ['approve', 'reject', 'request_changes'];

const decisionToStatus = (decision: ApprovalDecision) => {
  if (decision === 'approve') return 'Approved for Processing' as const;
  if (decision === 'reject') return 'Rejected' as const;
  return 'Draft' as const;
};

export default async function handler(req: any, res: any) {
  setCors(res, 'POST,OPTIONS');
  if (withCorsPreflight(req, res)) return;

  const requestId = getRequestId(req);

  if (req.method !== 'POST') {
    json(res, 405, {
      ok: false,
      error: { code: 'VALIDATION_FAILED', message: 'Method not allowed', details: {} },
      requestId,
    });
    return;
  }

  try {
    const actor = getActorFromRequest(req);
    assertPermission(actor.role, 'approve:job');

    const body = parseBody(req.body);
    const jobId = String(body.jobId || '').trim();
    const decisionRaw = String(body.decision || '').trim().toLowerCase() as ApprovalDecision;
    const note = String(body.note || '').trim();

    if (!jobId || !decisionRaw) {
      throw new PathBApiError('VALIDATION_FAILED', 'jobId and decision are required');
    }
    if (!DECISIONS.includes(decisionRaw)) {
      throw new PathBApiError('VALIDATION_FAILED', 'decision must be approve, reject, or request_changes');
    }

    const job = await getJob(jobId);
    if (!job) throw new PathBApiError('NOT_FOUND', 'Job not found', { jobId });
    assertTenantScope(actor, { brokerageId: job.brokerageId, officeId: job.officeId, teamId: job.teamId });

    if (job.status !== 'In Review') {
      throw new PathBApiError('CONFLICT', 'Approval decision can only be recorded for jobs currently In Review', {
        currentStatus: job.status,
      });
    }

    const toStatus = decisionToStatus(decisionRaw);
    assertTransition(job.status, toStatus, actor.role, {
      reason: decisionRaw !== 'approve' ? note : undefined,
      note,
    });

    const approval = await createJobApproval({
      brokerageId: job.brokerageId,
      officeId: job.officeId,
      jobId: job.id,
      reviewerUserId: actor.userId,
      decision: decisionRaw,
      note: note || null,
    });

    const beforeStatus = job.status;
    job.status = toStatus;
    const updated = await saveJob(job);

    await appendAuditEvent(
      actor.brokerageId,
      buildAuditEvent({
        eventType: 'JOB_APPROVAL_DECISION',
        actor,
        scope: { brokerageId: job.brokerageId, officeId: job.officeId, teamId: job.teamId },
        source: 'api',
        targetEntityType: 'job_approval',
        targetEntityId: approval.id,
        afterSnapshot: approval,
        reason: note || null,
      })
    );

    await appendAuditEvent(
      actor.brokerageId,
      buildAuditEvent({
        eventType: 'JOB_STATUS_CHANGED',
        actor,
        scope: { brokerageId: job.brokerageId, officeId: job.officeId, teamId: job.teamId },
        source: 'api',
        targetEntityType: 'job',
        targetEntityId: job.id,
        beforeSnapshot: { status: beforeStatus },
        afterSnapshot: { status: toStatus },
        reason: note || null,
      })
    );

    json(res, 200, {
      ok: true,
      data: { approval, job: updated },
      requestId,
    });
  } catch (error) {
    handlePathBError(res, requestId, error);
  }
}
