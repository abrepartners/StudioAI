import { getActorFromRequest } from './context';
import { getRequestId, handlePathBError, json, setCors, withCorsPreflight } from './http';
import { assertPermission, assertTenantScope } from './rbac';
import { listJobApprovals, listJobsByBrokerage } from './store';

export default async function handler(req: any, res: any) {
  setCors(res, 'GET,OPTIONS');
  if (withCorsPreflight(req, res)) return;

  const requestId = getRequestId(req);

  try {
    const actor = getActorFromRequest(req);
    if (req.method !== 'GET') {
      json(res, 405, {
        ok: false,
        error: { code: 'VALIDATION_FAILED', message: 'Method not allowed', details: {} },
        requestId,
      });
      return;
    }

    assertPermission(actor.role, 'approve:job');
    assertTenantScope(actor, { brokerageId: actor.brokerageId, officeId: actor.officeId, teamId: actor.teamId });

    let queue = (await listJobsByBrokerage(actor.brokerageId)).filter((job) => job.status === 'In Review');

    if (actor.role === 'OfficeAdmin' || actor.role === 'Reviewer') {
      if (actor.officeId) queue = queue.filter((job) => job.officeId === actor.officeId);
    } else if (actor.role === 'TeamLead') {
      if (actor.teamId) queue = queue.filter((job) => job.teamId === actor.teamId);
    }

    const includeApprovals = String(req.query?.includeApprovals || '').toLowerCase() === 'true';
    if (!includeApprovals) {
      json(res, 200, { ok: true, data: { queue }, requestId });
      return;
    }

    const queueWithApprovals = await Promise.all(
      queue.map(async (job) => ({
        ...job,
        approvals: await listJobApprovals(job.id),
      }))
    );

    json(res, 200, { ok: true, data: { queue: queueWithApprovals }, requestId });
  } catch (error) {
    handlePathBError(res, requestId, error);
  }
}
