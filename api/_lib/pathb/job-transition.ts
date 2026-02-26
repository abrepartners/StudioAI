import { buildAuditEvent } from './audit';
import { getActorFromRequest } from './context';
import { PathBApiError } from './errors';
import { getRequestId, handlePathBError, json, parseBody, setCors, withCorsPreflight } from './http';
import { assertPermission, assertTenantScope } from './rbac';
import { appendAuditEvent, getJob, saveJob } from './store';
import { JobStatus, TransitionMetadata } from './types';
import { assertTransition } from './workflow';

const needsApprovePermission = (from: JobStatus, to: JobStatus) =>
  from === 'In Review' && ['Approved for Processing', 'Rejected', 'Draft'].includes(to);

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
    const body = parseBody(req.body);
    const jobId = String(body.jobId || '').trim();
    const toStatus = String(body.toStatus || '').trim() as JobStatus;
    if (!jobId || !toStatus) {
      throw new PathBApiError('VALIDATION_FAILED', 'jobId and toStatus are required');
    }

    const job = await getJob(jobId);
    if (!job) throw new PathBApiError('NOT_FOUND', 'Job not found', { jobId });
    assertTenantScope(actor, { brokerageId: job.brokerageId, officeId: job.officeId, teamId: job.teamId });

    const metadata: TransitionMetadata = {
      reason: String(body.reason || '').trim(),
      note: String(body.note || '').trim(),
      revisionReasonCategory: String(body.revisionReasonCategory || '').trim(),
      outputAssetIds: Array.isArray(body.outputAssetIds)
        ? body.outputAssetIds.map((value: unknown) => String(value || '').trim()).filter(Boolean)
        : [],
    };

    if (toStatus === 'Processing') {
      assertPermission(actor.role, 'process:job');
    }
    if (toStatus === 'Delivered') {
      assertPermission(actor.role, 'deliver:job');
    }
    if (toStatus === 'Revision Requested') {
      assertPermission(actor.role, 'request:revision');
    }
    if (needsApprovePermission(job.status, toStatus)) {
      assertPermission(actor.role, 'approve:job');
    }

    assertTransition(job.status, toStatus, actor.role, metadata);

    const beforeStatus = job.status;
    const now = new Date().toISOString();
    job.status = toStatus;
    if (toStatus === 'Delivered') job.deliveredAt = now;
    if (toStatus === 'Completed') job.completedAt = now;
    if (toStatus === 'Revision Requested') job.revisionCount += 1;

    const updated = await saveJob(job);

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
        reason: metadata.reason || null,
        note: metadata.note || null,
      })
    );

    if (toStatus === 'Revision Requested') {
      await appendAuditEvent(
        actor.brokerageId,
        buildAuditEvent({
          eventType: 'JOB_REVISION_REQUESTED',
          actor,
          scope: { brokerageId: job.brokerageId, officeId: job.officeId, teamId: job.teamId },
          source: 'api',
          targetEntityType: 'job',
          targetEntityId: job.id,
          afterSnapshot: {
            revisionCount: updated.revisionCount,
            revisionReasonCategory: metadata.revisionReasonCategory,
          },
          reason: metadata.reason || null,
        })
      );
    }

    if (toStatus === 'Delivered') {
      await appendAuditEvent(
        actor.brokerageId,
        buildAuditEvent({
          eventType: 'JOB_DELIVERY_CREATED',
          actor,
          scope: { brokerageId: job.brokerageId, officeId: job.officeId, teamId: job.teamId },
          source: 'api',
          targetEntityType: 'job',
          targetEntityId: job.id,
          afterSnapshot: {
            deliveredAt: updated.deliveredAt,
            outputAssetIds: metadata.outputAssetIds || [],
          },
        })
      );
    }

    json(res, 200, { ok: true, data: { job: updated }, requestId });
  } catch (error) {
    handlePathBError(res, requestId, error);
  }
}
