import { buildAuditEvent } from './audit';
import { getActorFromRequest } from './context';
import { PathBApiError } from './errors';
import { getRequestId, handlePathBError, json, parseBody, setCors, withCorsPreflight } from './http';
import { assertPermission, assertTenantScope } from './rbac';
import { appendAuditEvent, createJobAsset, createJobDelivery, getJob, saveJob } from './store';
import { EditLabel } from './types';
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
    assertPermission(actor.role, 'deliver:job');

    const body = parseBody(req.body);
    const jobId = String(body.jobId || '').trim();
    const outputs = Array.isArray(body.outputs) ? body.outputs : [];
    const notes = String(body.notes || '').trim() || null;

    if (!jobId) throw new PathBApiError('VALIDATION_FAILED', 'jobId is required');
    if (outputs.length === 0) throw new PathBApiError('VALIDATION_FAILED', 'outputs is required');

    const job = await getJob(jobId);
    if (!job) throw new PathBApiError('NOT_FOUND', 'Job not found', { jobId });
    assertTenantScope(actor, { brokerageId: job.brokerageId, officeId: job.officeId, teamId: job.teamId });

    const outputAssets = [];
    const version = Math.max(1, job.revisionCount + 1);
    for (const output of outputs) {
      const url = String(output?.url || '').trim();
      if (!url) continue;
      const name = String(output?.name || '').trim() || null;
      const editLabel = String(output?.editLabel || '').trim() || null;
      const asset = await createJobAsset({
        brokerageId: job.brokerageId,
        officeId: job.officeId,
        jobId: job.id,
        kind: 'processed',
        version,
        editLabel: (editLabel as EditLabel) || null,
        url,
        name,
        uploadedByUserId: actor.userId,
      });
      outputAssets.push(asset);
    }

    if (outputAssets.length === 0) {
      throw new PathBApiError('VALIDATION_FAILED', 'At least one valid output url is required');
    }

    assertTransition(job.status, 'Delivered', actor.role, {
      outputAssetIds: outputAssets.map((asset) => asset.id),
      note: notes || undefined,
    });

    const beforeStatus = job.status;
    job.status = 'Delivered';
    job.deliveredAt = new Date().toISOString();
    const updated = await saveJob(job);

    const delivery = await createJobDelivery({
      brokerageId: job.brokerageId,
      officeId: job.officeId,
      jobId: job.id,
      deliveredByUserId: actor.userId,
      outputAssetIds: outputAssets.map((asset) => asset.id),
      notes,
      disclosureFlagPresent: job.disclosureRequired,
    });

    await appendAuditEvent(
      actor.brokerageId,
      buildAuditEvent({
        eventType: 'JOB_DELIVERY_CREATED',
        actor,
        scope: { brokerageId: job.brokerageId, officeId: job.officeId, teamId: job.teamId },
        source: 'api',
        targetEntityType: 'job_delivery',
        targetEntityId: delivery.id,
        afterSnapshot: delivery,
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
        afterSnapshot: { status: 'Delivered' },
        note: notes,
      })
    );

    json(res, 200, {
      ok: true,
      data: {
        job: updated,
        delivery,
        assets: outputAssets,
      },
      requestId,
    });
  } catch (error) {
    handlePathBError(res, requestId, error);
  }
}
