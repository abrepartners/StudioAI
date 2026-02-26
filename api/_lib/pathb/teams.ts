import { buildAuditEvent } from './audit';
import { getActorFromRequest } from './context';
import { PathBApiError } from './errors';
import { getRequestId, handlePathBError, json, parseBody, setCors, withCorsPreflight } from './http';
import { assertPermission, assertTenantScope } from './rbac';
import { appendAuditEvent, createTeam, getOffice, listTeamsByOffice } from './store';

export default async function handler(req: any, res: any) {
  setCors(res, 'GET,POST,OPTIONS');
  if (withCorsPreflight(req, res)) return;

  const requestId = getRequestId(req);

  try {
    const actor = getActorFromRequest(req);

    if (req.method === 'GET') {
      const officeId = String(req.query?.officeId || '').trim();
      if (!officeId) {
        throw new PathBApiError('VALIDATION_FAILED', 'officeId query parameter is required');
      }

      const office = await getOffice(officeId);
      if (!office) {
        throw new PathBApiError('NOT_FOUND', 'Office not found', { officeId });
      }

      assertTenantScope(actor, { brokerageId: office.brokerageId, officeId: office.id });

      const teams = await listTeamsByOffice(office.id);
      json(res, 200, { ok: true, data: { teams }, requestId });
      return;
    }

    if (req.method === 'POST') {
      assertPermission(actor.role, 'manage:office-users');
      const body = parseBody(req.body);
      const officeId = String(body.officeId || '').trim();
      const name = String(body.name || '').trim();

      if (!officeId || !name) {
        throw new PathBApiError('VALIDATION_FAILED', 'officeId and name are required');
      }

      const office = await getOffice(officeId);
      if (!office) {
        throw new PathBApiError('NOT_FOUND', 'Office not found', { officeId });
      }

      assertTenantScope(actor, { brokerageId: office.brokerageId, officeId: office.id });
      if (actor.role === 'OfficeAdmin' && actor.officeId && actor.officeId !== office.id) {
        throw new PathBApiError('FORBIDDEN', 'OfficeAdmin can only create teams in their own office');
      }

      const team = await createTeam({
        brokerageId: office.brokerageId,
        officeId: office.id,
        name,
      });

      await appendAuditEvent(
        actor.brokerageId,
        buildAuditEvent({
          eventType: 'ORG_STRUCTURE_CHANGED',
          actor,
          scope: { brokerageId: office.brokerageId, officeId: office.id, teamId: team.id },
          source: 'api',
          targetEntityType: 'team',
          targetEntityId: team.id,
          afterSnapshot: team,
          note: 'Team created',
        })
      );

      json(res, 200, { ok: true, data: { team }, requestId });
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
