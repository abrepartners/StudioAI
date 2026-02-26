import { getActorFromRequest } from './context';
import { getRequestId, handlePathBError, json, setCors, withCorsPreflight } from './http';
import { assertPermission, assertTenantScope } from './rbac';
import { listAuditEvents } from './store';

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

    assertPermission(actor.role, 'view:audit');
    assertTenantScope(actor, { brokerageId: actor.brokerageId, officeId: actor.officeId, teamId: actor.teamId });

    const limit = Number(req.query?.limit || '100');
    const events = await listAuditEvents(actor.brokerageId, Number.isFinite(limit) ? limit : 100);
    json(res, 200, { ok: true, data: { events }, requestId });
  } catch (error) {
    handlePathBError(res, requestId, error);
  }
}
