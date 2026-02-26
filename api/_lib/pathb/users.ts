import { buildAuditEvent } from './audit';
import { getActorFromRequest } from './context';
import { PathBApiError } from './errors';
import { getRequestId, handlePathBError, json, parseBody, setCors, withCorsPreflight } from './http';
import { assertPermission, assertTenantScope } from './rbac';
import {
  appendAuditEvent,
  createMembership,
  createUser,
  getOffice,
  getTeam,
  listUsersByBrokerage,
} from './store';
import { PATH_B_ROLES, PathBRole, ScopeType } from './types';

export default async function handler(req: any, res: any) {
  setCors(res, 'GET,POST,OPTIONS');
  if (withCorsPreflight(req, res)) return;

  const requestId = getRequestId(req);

  try {
    const actor = getActorFromRequest(req);
    assertTenantScope(actor, { brokerageId: actor.brokerageId, officeId: actor.officeId, teamId: actor.teamId });

    if (req.method === 'GET') {
      assertPermission(actor.role, 'manage:office-users');
      const users = await listUsersByBrokerage(actor.brokerageId);
      json(res, 200, { ok: true, data: { users }, requestId });
      return;
    }

    if (req.method === 'POST') {
      assertPermission(actor.role, 'manage:office-users');
      const body = parseBody(req.body);
      const email = String(body.email || '').trim().toLowerCase();
      const name = String(body.name || '').trim();

      if (!email || !name) {
        throw new PathBApiError('VALIDATION_FAILED', 'name and email are required');
      }

      const user = await createUser({
        brokerageId: actor.brokerageId,
        email,
        name,
      });

      const scopeType = String(body.scopeType || '').trim() as ScopeType;
      const roleRaw = String(body.role || '').trim();
      const officeId = String(body.officeId || '').trim() || null;
      const teamId = String(body.teamId || '').trim() || null;

      let membership = null;
      if (scopeType && roleRaw) {
        if (!['brokerage', 'office', 'team'].includes(scopeType)) {
          throw new PathBApiError('VALIDATION_FAILED', 'scopeType must be brokerage, office, or team');
        }
        if (!(PATH_B_ROLES as readonly string[]).includes(roleRaw)) {
          throw new PathBApiError('VALIDATION_FAILED', 'Invalid role for membership', { role: roleRaw });
        }

        const role = roleRaw as PathBRole;

        if (scopeType === 'office' || scopeType === 'team') {
          if (!officeId) {
            throw new PathBApiError('VALIDATION_FAILED', 'officeId is required for office/team membership');
          }
          const office = await getOffice(officeId);
          if (!office) throw new PathBApiError('NOT_FOUND', 'Office not found', { officeId });
          assertTenantScope(actor, { brokerageId: office.brokerageId, officeId: office.id });
        }

        if (scopeType === 'team') {
          if (!teamId) throw new PathBApiError('VALIDATION_FAILED', 'teamId is required for team membership');
          const team = await getTeam(teamId);
          if (!team) throw new PathBApiError('NOT_FOUND', 'Team not found', { teamId });
          assertTenantScope(actor, {
            brokerageId: team.brokerageId,
            officeId: team.officeId,
            teamId: team.id,
          });
        }

        membership = await createMembership({
          brokerageId: actor.brokerageId,
          officeId,
          teamId,
          userId: user.id,
          role,
          scopeType,
        });
      }

      await appendAuditEvent(
        actor.brokerageId,
        buildAuditEvent({
          eventType: 'USER_INVITED',
          actor,
          scope: { brokerageId: actor.brokerageId, officeId, teamId },
          source: 'api',
          targetEntityType: 'user',
          targetEntityId: user.id,
          afterSnapshot: user,
          note: 'User created from admin endpoint',
        })
      );

      if (membership) {
        await appendAuditEvent(
          actor.brokerageId,
          buildAuditEvent({
            eventType: 'MEMBERSHIP_CHANGED',
            actor,
            scope: { brokerageId: actor.brokerageId, officeId: membership.officeId, teamId: membership.teamId },
            source: 'api',
            targetEntityType: 'membership',
            targetEntityId: membership.id,
            afterSnapshot: membership,
            note: 'Membership created during user create',
          })
        );
      }

      json(res, 200, { ok: true, data: { user, membership }, requestId });
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
