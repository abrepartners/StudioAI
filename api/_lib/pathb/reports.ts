import { getActorFromRequest } from './context';
import { getRequestId, handlePathBError, json, setCors, withCorsPreflight } from './http';
import { assertPermission, assertTenantScope } from './rbac';
import { listJobsByBrokerage } from './store';
import { applyJobFilters, calculateAvgTurnaroundHours, scopeFilterJobs } from './reporting';

const toSortedEntries = (map: Map<string, number>) =>
  Array.from(map.entries())
    .map(([key, value]) => ({ key, count: value }))
    .sort((a, b) => b.count - a.count);

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

    assertPermission(actor.role, 'export:report');
    assertTenantScope(actor, { brokerageId: actor.brokerageId, officeId: actor.officeId, teamId: actor.teamId });

    const allJobs = await listJobsByBrokerage(actor.brokerageId);
    const scoped = scopeFilterJobs(actor, allJobs);
    const jobs = applyJobFilters(scoped, req.query);

    const jobsSubmitted = jobs.filter((job) => job.status !== 'Draft').length;
    const jobsCompleted = jobs.filter((job) => job.status === 'Completed').length;
    const revisionCount = jobs.filter((job) => job.revisionCount > 0).length;
    const revisionRate = jobs.length ? Number(((revisionCount / jobs.length) * 100).toFixed(2)) : 0;
    const averageTurnaroundHours = calculateAvgTurnaroundHours(jobs);
    const approvalBottlenecks = jobs.filter((job) => job.status === 'In Review').length;
    const disclosureFlagged = jobs.filter((job) => job.disclosureRequired).length;

    const byOfficeMap = new Map<string, number>();
    const byAgentMap = new Map<string, number>();
    const byEditCategoryMap = new Map<string, number>();

    for (const job of jobs) {
      byOfficeMap.set(job.officeId, (byOfficeMap.get(job.officeId) || 0) + 1);
      byAgentMap.set(job.agentUserId, (byAgentMap.get(job.agentUserId) || 0) + 1);
      for (const editType of job.requestedEditCategories) {
        byEditCategoryMap.set(editType, (byEditCategoryMap.get(editType) || 0) + 1);
      }
    }

    json(res, 200, {
      ok: true,
      data: {
        totals: {
          jobsCount: jobs.length,
          jobsSubmitted,
          jobsCompleted,
          averageTurnaroundHours,
          revisionRate,
          approvalBottlenecks,
          disclosureFlagged,
        },
        volumeByOffice: toSortedEntries(byOfficeMap),
        volumeByAgent: toSortedEntries(byAgentMap),
        volumeByEditCategory: toSortedEntries(byEditCategoryMap),
      },
      requestId,
    });
  } catch (error) {
    handlePathBError(res, requestId, error);
  }
}
