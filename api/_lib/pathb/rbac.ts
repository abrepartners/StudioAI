import { PathBApiError } from './errors';
import { ActorContext, PathBRole, Permission, TenantScopeContext } from './types';

const ROLE_PERMISSIONS: Record<PathBRole, ReadonlySet<Permission>> = {
  BrokerageAdmin: new Set<Permission>([
    'manage:brokerage-users',
    'manage:office-users',
    'manage:brokerage-presets',
    'manage:office-presets',
    'create:job',
    'view:job-own',
    'view:job-office',
    'approve:job',
    'process:job',
    'deliver:job',
    'request:revision',
    'export:report',
    'view:audit',
  ]),
  OfficeAdmin: new Set<Permission>([
    'manage:office-users',
    'manage:office-presets',
    'create:job',
    'view:job-own',
    'view:job-office',
    'approve:job',
    'process:job',
    'deliver:job',
    'request:revision',
    'export:report',
    'view:audit',
  ]),
  TeamLead: new Set<Permission>(['create:job', 'view:job-own', 'approve:job', 'request:revision']),
  Agent: new Set<Permission>(['create:job', 'view:job-own', 'request:revision']),
  MediaPartner: new Set<Permission>(['view:job-own', 'process:job', 'deliver:job']),
  Reviewer: new Set<Permission>(['view:job-own', 'view:job-office', 'approve:job', 'deliver:job', 'request:revision']),
};

export const hasPermission = (role: PathBRole, permission: Permission) => ROLE_PERMISSIONS[role].has(permission);

export const assertPermission = (role: PathBRole, permission: Permission) => {
  if (!hasPermission(role, permission)) {
    throw new PathBApiError('FORBIDDEN', `Role ${role} lacks permission ${permission}`, {
      role,
      permission,
    });
  }
};

export const assertTenantScope = (actor: ActorContext, target: TenantScopeContext) => {
  if (actor.brokerageId !== target.brokerageId) {
    throw new PathBApiError('TENANT_SCOPE_VIOLATION', 'Cross-brokerage access is not allowed', {
      actorBrokerageId: actor.brokerageId,
      targetBrokerageId: target.brokerageId,
    });
  }

  if (actor.role === 'BrokerageAdmin') return;

  if (actor.role === 'OfficeAdmin' || actor.role === 'Reviewer' || actor.role === 'MediaPartner') {
    if (target.officeId && actor.officeId && target.officeId !== actor.officeId) {
      throw new PathBApiError('TENANT_SCOPE_VIOLATION', 'Cross-office access is not allowed for this role', {
        actorOfficeId: actor.officeId,
        targetOfficeId: target.officeId,
      });
    }
    return;
  }

  if (actor.role === 'TeamLead' || actor.role === 'Agent') {
    if (target.teamId && actor.teamId && target.teamId !== actor.teamId) {
      throw new PathBApiError('TENANT_SCOPE_VIOLATION', 'Cross-team access is not allowed for this role', {
        actorTeamId: actor.teamId,
        targetTeamId: target.teamId,
      });
    }
  }
};
