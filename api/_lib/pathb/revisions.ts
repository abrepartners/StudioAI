import { buildAuditEvent } from './audit';
import { getActorFromRequest } from './context';
import { PathBApiError } from './errors';
import { getRequestId, handlePathBError, json, parseBody, setCors, withCorsPreflight } from './http';
import { assertPermission, assertTenantScope } from './rbac';
import { appendAuditEvent, createJobRevision, getJob, saveJob } from './store';
import { assertTransition } from './workflow';

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
    assertPermission(actor.role, 'request:revision');

    const body = parseBody(req.body);
    const jobId = String(body.jobId || '').trim();
    const reasonCategory = String(body.reasonCategory || '').trim();
    const notes = String(body.notes || '').trim();

    if (!jobId || !reasonCategory) {
      throw new PathBApiError('VALIDATION_FAILED', 'jobId and reasonCategory are required');
    }

    const job = await getJob(jobId);
    if (!job) throw new PathBApiError('NOT_FOUND', 'Job not found', { jobId });
    assertTenantScope(actor, { brokerageId: job.brokerageId, officeId: job.officeId, teamId: job.teamId });

    assertTransition(job.status, 'Revision Requested', actor.role, {
      reason: notes || reasonCategory,
      revisionReasonCategory: reasonCategory,
      note: notes || undefined,
    });

    const revision = await createJobRevision({
      brokerageId: job.brokerageId,
      officeId: job.officeId,
      jobId: job.id,
      requestedByUserId: actor.userId,
      reasonCategory,
      notes: notes || null,
      cycleNumber: job.revisionCount + 1,
    });

    const beforeStatus = job.status;
    job.status = 'Revision Requested';
    job.revisionCount += 1;
    const updated = await saveJob(job);

    await appendAuditEvent(
      actor.brokerageId,
      buildAuditEvent({
        eventType: 'JOB_REVISION_REQUESTED',
        actor,
        scope: { brokerageId: job.brokerageId, officeId: job.officeId, teamId: job.teamId },
        source: 'api',
        targetEntityType: 'job_revision',
        targetEntityId: revision.id,
        afterSnapshot: revision,
        reason: notes || reasonCategory,
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
        afterSnapshot: { status: 'Revision Requested', revisionCount: updated.revisionCount },
        reason: notes || reasonCategory,
      })
    );

    json(res, 200, {
      ok: true,
      data: { revision, job: updated },
      requestId,
    });
  } catch (error) {
    handlePathBError(res, requestId, error);
  }
}
