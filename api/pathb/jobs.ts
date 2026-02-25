import { buildAuditEvent } from './audit';
import { getActorFromRequest } from './context';
import { PathBApiError } from './errors';
import { getRequestId, handlePathBError, json, parseBody, setCors, withCorsPreflight } from './http';
import { assertPermission, assertTenantScope } from './rbac';
import {
  appendAuditEvent,
  createJob,
  createJobAsset,
  getOffice,
  getPreset,
  getTeam,
  getUser,
  listJobAssets,
  listJobsByAgent,
  listJobsByBrokerage,
} from './store';
import { EditLabel, JobPriority, JobRecord } from './types';

const PRIORITIES: JobPriority[] = ['low', 'normal', 'high', 'urgent'];

const sanitizeEditLabels = (values: unknown): EditLabel[] => {
  if (!Array.isArray(values)) return [];
  return values.map((v) => String(v || '').trim()).filter(Boolean) as EditLabel[];
};

export default async function handler(req: any, res: any) {
  setCors(res, 'GET,POST,OPTIONS');
  if (withCorsPreflight(req, res)) return;

  const requestId = getRequestId(req);

  try {
    const actor = getActorFromRequest(req);
    assertTenantScope(actor, { brokerageId: actor.brokerageId, officeId: actor.officeId, teamId: actor.teamId });

    if (req.method === 'GET') {
      let jobs = actor.role === 'Agent' ? await listJobsByAgent(actor.userId) : await listJobsByBrokerage(actor.brokerageId);

      if (actor.role !== 'BrokerageAdmin') {
        if (actor.role === 'OfficeAdmin' || actor.role === 'Reviewer' || actor.role === 'MediaPartner') {
          if (actor.officeId) jobs = jobs.filter((job) => job.officeId === actor.officeId);
        }
        if (actor.role === 'TeamLead') {
          if (actor.teamId) jobs = jobs.filter((job) => job.teamId === actor.teamId);
        }
        if (actor.role === 'Agent') {
          jobs = jobs.filter((job) => job.agentUserId === actor.userId);
        }
      }

      const includeAssets = String(req.query?.includeAssets || '').toLowerCase() === 'true';
      if (!includeAssets) {
        json(res, 200, { ok: true, data: { jobs }, requestId });
        return;
      }

      const jobsWithAssets = await Promise.all(
        jobs.map(async (job) => ({
          ...job,
          assets: await listJobAssets(job.id),
        }))
      );
      json(res, 200, { ok: true, data: { jobs: jobsWithAssets }, requestId });
      return;
    }

    if (req.method === 'POST') {
      assertPermission(actor.role, 'create:job');

      const body = parseBody(req.body);
      const propertyAddress = String(body.propertyAddress || '').trim();
      const mlsId = String(body.mlsId || '').trim() || null;
      const officeId = String(body.officeId || actor.officeId || '').trim();
      const teamId = String(body.teamId || actor.teamId || '').trim() || null;
      const agentUserId = String(body.agentUserId || actor.userId || '').trim();
      const selectedPresetId = String(body.selectedPresetId || '').trim();
      const requestedEditCategories = sanitizeEditLabels(body.requestedEditCategories);
      const requestedTurnaround = String(body.requestedTurnaround || '').trim() || null;
      const priorityRaw = String(body.priority || 'normal').trim().toLowerCase() as JobPriority;
      const priority: JobPriority = PRIORITIES.includes(priorityRaw) ? priorityRaw : 'normal';
      const notes = String(body.notes || '').trim() || null;
      const disclosureRelevant = Boolean(body.disclosureRelevant);
      const submitNow = body.submit !== false;
      const assetsInput = Array.isArray(body.assets) ? body.assets : [];

      if (!propertyAddress || !officeId || !agentUserId || !selectedPresetId) {
        throw new PathBApiError('VALIDATION_FAILED', 'propertyAddress, officeId, agentUserId, and selectedPresetId are required');
      }
      if (requestedEditCategories.length === 0) {
        throw new PathBApiError('VALIDATION_FAILED', 'requestedEditCategories is required');
      }

      const office = await getOffice(officeId);
      if (!office) throw new PathBApiError('NOT_FOUND', 'Office not found', { officeId });
      assertTenantScope(actor, { brokerageId: office.brokerageId, officeId: office.id });

      if (teamId) {
        const team = await getTeam(teamId);
        if (!team) throw new PathBApiError('NOT_FOUND', 'Team not found', { teamId });
        assertTenantScope(actor, { brokerageId: team.brokerageId, officeId: team.officeId, teamId: team.id });
      }

      const agent = await getUser(agentUserId);
      if (!agent) throw new PathBApiError('NOT_FOUND', 'Agent user not found', { agentUserId });
      assertTenantScope(actor, { brokerageId: agent.brokerageId });

      const preset = await getPreset(selectedPresetId);
      if (!preset) throw new PathBApiError('NOT_FOUND', 'Preset not found', { selectedPresetId });
      assertTenantScope(actor, { brokerageId: preset.brokerageId, officeId: preset.officeId || office.id });
      if (!preset.active) throw new PathBApiError('VALIDATION_FAILED', 'Selected preset is inactive');

      const status: JobRecord['status'] = !submitNow
        ? 'Draft'
        : preset.approvalRequired
          ? 'In Review'
          : 'Approved for Processing';

      const now = new Date().toISOString();
      const job = await createJob({
        brokerageId: office.brokerageId,
        officeId: office.id,
        teamId,
        agentUserId,
        propertyAddress,
        mlsId,
        selectedPresetId,
        requestedEditCategories,
        requestedTurnaround,
        priority,
        notes,
        disclosureRelevant,
        disclosureRequired: preset.disclosureRequiredDefault,
        status,
        revisionCount: 0,
        submittedAt: submitNow ? now : null,
        deliveredAt: null,
        completedAt: null,
      });

      const uploadedAssets = [];
      for (const rawAsset of assetsInput) {
        const url = String(rawAsset?.url || '').trim();
        if (!url) continue;
        const name = String(rawAsset?.name || '').trim() || null;
        const editLabel = String(rawAsset?.editLabel || '').trim() || null;
        const asset = await createJobAsset({
          brokerageId: job.brokerageId,
          officeId: job.officeId,
          jobId: job.id,
          kind: 'original',
          version: 1,
          editLabel: (editLabel as EditLabel) || null,
          url,
          name,
          uploadedByUserId: actor.userId,
        });
        uploadedAssets.push(asset);

        await appendAuditEvent(
          actor.brokerageId,
          buildAuditEvent({
            eventType: 'JOB_ASSET_UPLOADED',
            actor,
            scope: { brokerageId: job.brokerageId, officeId: job.officeId, teamId: job.teamId },
            source: 'api',
            targetEntityType: 'job_asset',
            targetEntityId: asset.id,
            afterSnapshot: asset,
          })
        );
      }

      if (submitNow) {
        await appendAuditEvent(
          actor.brokerageId,
          buildAuditEvent({
            eventType: 'JOB_SUBMITTED',
            actor,
            scope: { brokerageId: job.brokerageId, officeId: job.officeId, teamId: job.teamId },
            source: 'api',
            targetEntityType: 'job',
            targetEntityId: job.id,
            afterSnapshot: job,
          })
        );
      }

      await appendAuditEvent(
        actor.brokerageId,
        buildAuditEvent({
          eventType: 'JOB_STATUS_CHANGED',
          actor,
          scope: { brokerageId: job.brokerageId, officeId: job.officeId, teamId: job.teamId },
          source: 'api',
          targetEntityType: 'job',
          targetEntityId: job.id,
          afterSnapshot: { status: job.status },
          note: submitNow
            ? preset.approvalRequired
              ? 'System routed submitted job to In Review'
              : 'System routed submitted job to Approved for Processing'
            : 'Draft created',
        })
      );

      json(res, 200, { ok: true, data: { job, assets: uploadedAssets }, requestId });
      return;
    }

    json(res, 405, {
      ok: false,
      error: { code: 'VALIDATION_FAILED', message: 'Method not allowed', details: {} },
      requestId,
    });
  } catch (error) {
    handlePathBError(res, requestId, error);
  }
}
