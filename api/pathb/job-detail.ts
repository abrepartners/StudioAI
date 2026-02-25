import { getActorFromRequest } from './context';
import { PathBApiError } from './errors';
import { getRequestId, handlePathBError, json, setCors, withCorsPreflight } from './http';
import { assertTenantScope } from './rbac';
import {
  getJob,
  listJobApprovals,
  listJobAssets,
  listJobDeliveries,
  listJobRevisions,
} from './store';

const ensureViewerAccess = (role: string, actorUserId: string, job: { agentUserId: string }) => {
  if (role === 'BrokerageAdmin') return;
  if (role === 'OfficeAdmin' || role === 'Reviewer' || role === 'MediaPartner' || role === 'TeamLead') return;
  if (role === 'Agent' && actorUserId === job.agentUserId) return;
  throw new PathBApiError('FORBIDDEN', 'Actor cannot view this job');
};

export default async function handler(req: any, res: any) {
  setCors(res, 'GET,OPTIONS');
  if (withCorsPreflight(req, res)) return;

  const requestId = getRequestId(req);

  if (req.method !== 'GET') {
    json(res, 405, {
      ok: false,
      error: { code: 'VALIDATION_FAILED', message: 'Method not allowed', details: {} },
      requestId,
    });
    return;
  }

  try {
    const actor = getActorFromRequest(req);
    const jobId = String(req.query?.jobId || '').trim();
    if (!jobId) throw new PathBApiError('VALIDATION_FAILED', 'jobId query parameter is required');

    const job = await getJob(jobId);
    if (!job) throw new PathBApiError('NOT_FOUND', 'Job not found', { jobId });

    assertTenantScope(actor, { brokerageId: job.brokerageId, officeId: job.officeId, teamId: job.teamId });
    ensureViewerAccess(actor.role, actor.userId, job);

    const [assets, approvals, revisions, deliveries] = await Promise.all([
      listJobAssets(job.id),
      listJobApprovals(job.id),
      listJobRevisions(job.id),
      listJobDeliveries(job.id),
    ]);

    json(res, 200, {
      ok: true,
      data: {
        job,
        assets,
        approvals,
        revisions,
        deliveries,
      },
      requestId,
    });
  } catch (error) {
    handlePathBError(res, requestId, error);
  }
}
