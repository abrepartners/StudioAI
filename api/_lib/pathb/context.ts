import { PathBApiError } from './errors';
import { ActorContext, PATH_B_ROLES, PathBRole } from './types';
import { getRequestId } from './http';

const normalizeHeader = (value: unknown) => {
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
};

const assertRole = (roleRaw: string): PathBRole => {
  if ((PATH_B_ROLES as readonly string[]).includes(roleRaw)) {
    return roleRaw as PathBRole;
  }
  throw new PathBApiError('VALIDATION_FAILED', 'Invalid x-pathb-role header', {
    role: roleRaw,
  });
};

export const getActorFromRequest = (req: any): ActorContext => {
  const requestId = getRequestId(req);
  const userId = normalizeHeader(req.headers['x-pathb-user-id']);
  const roleRaw = normalizeHeader(req.headers['x-pathb-role']);
  const brokerageId = normalizeHeader(req.headers['x-pathb-brokerage-id']);
  const officeId = normalizeHeader(req.headers['x-pathb-office-id']) || null;
  const teamId = normalizeHeader(req.headers['x-pathb-team-id']) || null;

  if (!userId || !roleRaw || !brokerageId) {
    throw new PathBApiError('FORBIDDEN', 'Missing actor headers', {
      requiredHeaders: ['x-pathb-user-id', 'x-pathb-role', 'x-pathb-brokerage-id'],
    });
  }

  return {
    requestId,
    userId,
    role: assertRole(roleRaw),
    brokerageId,
    officeId,
    teamId,
  };
};

export const allowBootstrap = (req: any) => {
  const expected = String(process.env.PATHB_BOOTSTRAP_KEY || '').trim();
  if (!expected) return process.env.NODE_ENV !== 'production';

  const provided = normalizeHeader(req.headers['x-pathb-bootstrap-key']);
  return Boolean(provided && provided === expected);
};
