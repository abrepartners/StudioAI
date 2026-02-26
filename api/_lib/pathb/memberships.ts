import { buildAuditEvent } from './audit';
import { getActorFromRequest } from './context';
import { PathBApiError } from './errors';
import { getRequestId, handlePathBError, json, parseBody, setCors, withCorsPreflight } from './http';
import { assertPermission, assertTenantScope } from './rbac';
import {
  appendAuditEvent,
  createMembership,
  getOffice,
  getTeam,
  getUser,
  listMembershipsByBrokerage,
} from './store';
import { PATH_B_ROLES, PathBRole, ScopeType } from './types';

const VALID_SCOPE_TYPES: ScopeType[] = ['brokerage', 'office', 'team'];

export default async function handler(req: any, res: any) {
  setCors(res, 'GET,POST,OPTIONS');
  if (withCorsPreflight(req, res)) return;

  const requestId = getRequestId(req);

  try {
    const actor = getActorFromRequest(req);
    assertTenantScope(actor, { brokerageId: actor.brokerageId, officeId: actor.officeId, teamId: actor.teamId });

    if (req.method === 'GET') {
      assertPermission(actor.role, 'manage:office-users');
      const memberships = await listMembershipsByBrokerage(actor.brokerageId);
      json(res, 200, { ok: true, data: { memberships }, requestId });
      return;
    }

    if (req.method === 'POST') {
      assertPermission(actor.role, 'manage:office-users');

      const body = parseBody(req.body);
      const userId = String(body.userId || '').trim();
      const roleRaw = String(body.role || '').trim();
      const scopeType = String(body.scopeType || '').trim() as ScopeType;
      const officeId = String(body.officeId || '').trim() || null;
      const teamId = String(body.teamId || '').trim() || null;

      if (!userId || !roleRaw || !scopeType) {
        throw new PathBApiError('VALIDATION_FAILED', 'userId, role, and scopeType are required');
      }

      if (!(PATH_B_ROLES as readonly string[]).includes(roleRaw)) {
        throw new PathBApiError('VALIDATION_FAILED', 'Invalid role for membership', { role: roleRaw });
      }
      const role = roleRaw as PathBRole;

      if (!VALID_SCOPE_TYPES.includes(scopeType)) {
        throw new PathBApiError('VALIDATION_FAILED', 'scopeType must be brokerage, office, or team', { scopeType });
      }

      const user = await getUser(userId);
      if (!user) throw new PathBApiError('NOT_FOUND', 'User not found', { userId });
      assertTenantScope(actor, { brokerageId: user.brokerageId });

      if (scopeType === 'office' || scopeType === 'team') {
        if (!officeId) throw new PathBApiError('VALIDATION_FAILED', 'officeId is required for office/team scope');
        const office = await getOffice(officeId);
        if (!office) throw new PathBApiError('NOT_FOUND', 'Office not found', { officeId });
        assertTenantScope(actor, { brokerageId: office.brokerageId, officeId: office.id });
      }

      if (scopeType === 'team') {
        if (!teamId) throw new PathBApiError('VALIDATION_FAILED', 'teamId is required for team scope');
        const team = await getTeam(teamId);
        if (!team) throw new PathBApiError('NOT_FOUND', 'Team not found', { teamId });
        assertTenantScope(actor, { brokerageId: team.brokerageId, officeId: team.officeId, teamId: team.id });
      }

      const membership = await createMembership({
        brokerageId: actor.brokerageId,
        officeId,
        teamId,
        userId,
        role,
        scopeType,
      });

      await appendAuditEvent(
        actor.brokerageId,
        buildAuditEvent({
          eventType: 'MEMBERSHIP_CHANGED',
          actor,
          scope: { brokerageId: actor.brokerageId, officeId, teamId },
          source: 'api',
          targetEntityType: 'membership',
          targetEntityId: membership.id,
          afterSnapshot: membership,
          note: 'Membership created',
        })
      );

      json(res, 200, { ok: true, data: { membership }, requestId });
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
