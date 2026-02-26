import { getActorFromRequest } from './context';
import { getRequestId, handlePathBError, json, setCors, withCorsPreflight } from './http';
import { assertPermission, assertTenantScope } from './rbac';
import { applyJobFilters, scopeFilterJobs, toCsv } from './reporting';
import { listJobRevisions, listJobsByBrokerage } from './store';

const sendCsv = (res: any, fileName: string, csv: string) => {
  res.status(200);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(csv);
};

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

    const type = String(req.query?.type || 'jobs').trim().toLowerCase();
    const allJobs = await listJobsByBrokerage(actor.brokerageId);
    const scoped = scopeFilterJobs(actor, allJobs);
    const jobs = applyJobFilters(scoped, req.query);

    if (type === 'jobs') {
      const rows = jobs.map((job) => ({
        job_id: job.id,
        brokerage_id: job.brokerageId,
        office_id: job.officeId,
        team_id: job.teamId || '',
        agent_user_id: job.agentUserId,
        property_address: job.propertyAddress,
        mls_id: job.mlsId || '',
        status: job.status,
        priority: job.priority,
        revision_count: job.revisionCount,
        disclosure_required: job.disclosureRequired ? 'true' : 'false',
        created_at: job.createdAt,
        submitted_at: job.submittedAt || '',
        delivered_at: job.deliveredAt || '',
        completed_at: job.completedAt || '',
      }));
      sendCsv(res, 'pathb_jobs.csv', toCsv(rows));
      return;
    }

    if (type === 'office-usage') {
      const officeStats = new Map<string, { jobs: number; completed: number; revisions: number }>();
      for (const job of jobs) {
        const current = officeStats.get(job.officeId) || { jobs: 0, completed: 0, revisions: 0 };
        current.jobs += 1;
        if (job.status === 'Completed') current.completed += 1;
        current.revisions += job.revisionCount;
        officeStats.set(job.officeId, current);
      }

      const rows = Array.from(officeStats.entries()).map(([officeId, stats]) => ({
        office_id: officeId,
        jobs: stats.jobs,
        completed: stats.completed,
        revisions: stats.revisions,
      }));
      sendCsv(res, 'pathb_office_usage.csv', toCsv(rows));
      return;
    }

    if (type === 'revisions') {
      const rows: Array<Record<string, unknown>> = [];
      for (const job of jobs) {
        const revisions = await listJobRevisions(job.id);
        for (const revision of revisions) {
          rows.push({
            revision_id: revision.id,
            job_id: revision.jobId,
            office_id: revision.officeId,
            requested_by_user_id: revision.requestedByUserId,
            reason_category: revision.reasonCategory,
            notes: revision.notes || '',
            cycle_number: revision.cycleNumber,
            created_at: revision.createdAt,
          });
        }
      }
      sendCsv(res, 'pathb_revisions.csv', toCsv(rows));
      return;
    }

    json(res, 400, {
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'type must be jobs, office-usage, or revisions',
        details: {},
      },
      requestId,
    });
  } catch (error) {
    handlePathBError(res, requestId, error);
  }
}
