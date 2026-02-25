import { buildAuditEvent } from './audit';
import { getActorFromRequest } from './context';
import { PathBApiError } from './errors';
import { getRequestId, handlePathBError, json, parseBody, setCors, withCorsPreflight } from './http';
import { assertPermission, assertTenantScope } from './rbac';
import { appendAuditEvent, createOffice, listOfficesByBrokerage } from './store';

export default async function handler(req: any, res: any) {
  setCors(res, 'GET,POST,OPTIONS');
  if (withCorsPreflight(req, res)) return;

  const requestId = getRequestId(req);

  try {
    const actor = getActorFromRequest(req);

    if (req.method === 'GET') {
      assertTenantScope(actor, { brokerageId: actor.brokerageId });
      const offices = await listOfficesByBrokerage(actor.brokerageId);
      json(res, 200, { ok: true, data: { offices }, requestId });
      return;
    }

    if (req.method === 'POST') {
      assertPermission(actor.role, 'manage:office-users');
      if (actor.role !== 'BrokerageAdmin') {
        throw new PathBApiError('FORBIDDEN', 'Only BrokerageAdmin can create offices');
      }

      const body = parseBody(req.body);
      const name = String(body.name || '').trim();
      if (!name) {
        throw new PathBApiError('VALIDATION_FAILED', 'Office name is required');
      }

      const office = await createOffice({
        brokerageId: actor.brokerageId,
        name,
      });

      await appendAuditEvent(
        actor.brokerageId,
        buildAuditEvent({
          eventType: 'ORG_STRUCTURE_CHANGED',
          actor,
          scope: { brokerageId: actor.brokerageId, officeId: office.id },
          source: 'api',
          targetEntityType: 'office',
          targetEntityId: office.id,
          afterSnapshot: office,
          note: 'Office created',
        })
      );

      json(res, 200, { ok: true, data: { office }, requestId });
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
