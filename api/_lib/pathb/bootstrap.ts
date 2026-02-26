import { buildAuditEvent } from './audit';
import { allowBootstrap } from './context';
import { PathBApiError } from './errors';
import { getRequestId, handlePathBError, json, parseBody, setCors, withCorsPreflight } from './http';
import {
  appendAuditEvent,
  createBrokerage,
  createMembership,
  createOffice,
  createTeam,
  createUser,
} from './store';
import { ActorContext } from './types';

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
    if (!allowBootstrap(req)) {
      throw new PathBApiError('FORBIDDEN', 'Bootstrap is disabled');
    }

    const body = parseBody(req.body);
    const brokerageName = String(body.brokerageName || '').trim();
    const officeName = String(body.officeName || '').trim();
    const teamName = String(body.teamName || '').trim();
    const adminName = String(body.adminName || '').trim();
    const adminEmail = String(body.adminEmail || '').trim().toLowerCase();

    if (!brokerageName || !officeName || !adminName || !adminEmail) {
      throw new PathBApiError('VALIDATION_FAILED', 'brokerageName, officeName, adminName, and adminEmail are required');
    }

    const brokerage = await createBrokerage({ name: brokerageName });
    const office = await createOffice({ brokerageId: brokerage.id, name: officeName });
    const team = teamName ? await createTeam({ brokerageId: brokerage.id, officeId: office.id, name: teamName }) : null;
    const adminUser = await createUser({
      brokerageId: brokerage.id,
      email: adminEmail,
      name: adminName,
    });

    const membership = await createMembership({
      brokerageId: brokerage.id,
      userId: adminUser.id,
      role: 'BrokerageAdmin',
      scopeType: 'brokerage',
    });

    const actor: ActorContext = {
      userId: adminUser.id,
      role: 'BrokerageAdmin',
      brokerageId: brokerage.id,
      officeId: office.id,
      teamId: team?.id || null,
      requestId,
    };

    await appendAuditEvent(
      brokerage.id,
      buildAuditEvent({
        eventType: 'USER_INVITED',
        actor,
        scope: actor,
        source: 'api',
        targetEntityType: 'user',
        targetEntityId: adminUser.id,
        afterSnapshot: adminUser,
        note: 'Bootstrap admin user created',
      })
    );

    await appendAuditEvent(
      brokerage.id,
      buildAuditEvent({
        eventType: 'MEMBERSHIP_CHANGED',
        actor,
        scope: actor,
        source: 'api',
        targetEntityType: 'membership',
        targetEntityId: membership.id,
        afterSnapshot: membership,
        note: 'Bootstrap admin membership created',
      })
    );

    json(res, 200, {
      ok: true,
      data: {
        brokerage,
        office,
        team,
        adminUser,
        membership,
        actorHeaders: {
          'x-pathb-user-id': adminUser.id,
          'x-pathb-role': 'BrokerageAdmin',
          'x-pathb-brokerage-id': brokerage.id,
          'x-pathb-office-id': office.id,
          ...(team?.id ? { 'x-pathb-team-id': team.id } : {}),
        },
      },
      requestId,
    });
  } catch (error) {
    handlePathBError(res, requestId, error);
  }
}
