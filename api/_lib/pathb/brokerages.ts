import { getActorFromRequest } from './context';
import { PathBApiError } from './errors';
import { getRequestId, handlePathBError, json, setCors, withCorsPreflight } from './http';
import { assertTenantScope } from './rbac';
import { getBrokerage, listBrokerages } from './store';

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

    assertTenantScope(actor, { brokerageId: actor.brokerageId });
    const brokerage = await getBrokerage(actor.brokerageId);
    if (!brokerage) {
      throw new PathBApiError('NOT_FOUND', 'Brokerage not found', { brokerageId: actor.brokerageId });
    }

    if (actor.role === 'BrokerageAdmin' && String(req.query?.all || '').toLowerCase() === 'true') {
      const brokerages = await listBrokerages();
      json(res, 200, { ok: true, data: { brokerage, brokerages }, requestId });
      return;
    }

    json(res, 200, { ok: true, data: { brokerage }, requestId });
  } catch (error) {
    handlePathBError(res, requestId, error);
  }
}
