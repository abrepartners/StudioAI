import {
  createRootCodes,
  getAdminSecret,
  getAdminSessionOwner,
  getOriginFromRequest,
  isAdminSecretValid,
  listRootCodes,
} from '../betaStore.js';

const json = (res: any, status: number, body: Record<string, unknown>) => {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
};

const parseBody = (rawBody: unknown): any => {
  if (!rawBody) return {};
  if (typeof rawBody === 'string') {
    try {
      return JSON.parse(rawBody);
    } catch {
      return {};
    }
  }
  if (typeof rawBody === 'object') return rawBody;
  return {};
};

const getAuthToken = (req: any): string => {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || typeof header !== 'string') return '';
  if (!header.startsWith('Bearer ')) return '';
  return header.slice('Bearer '.length).trim();
};

const getSecretOverride = (req: any, body?: any): string => {
  const headerSecret = req.headers['x-admin-secret'];
  if (typeof headerSecret === 'string' && headerSecret.trim()) return headerSecret.trim();
  if (Array.isArray(headerSecret) && headerSecret[0]) return String(headerSecret[0]).trim();
  const bodySecret = body?.secret;
  return String(bodySecret || '').trim();
};

const toPublicCode = (origin: string, entry: { code: string; createdAt: string; createdBy: string }) => ({
  code: entry.code,
  createdAt: entry.createdAt,
  createdBy: entry.createdBy,
  inviteLink: `${origin}/?invite=${encodeURIComponent(entry.code)}`,
});

const authorize = async (req: any, body?: any) => {
  const configuredSecret = getAdminSecret();
  if (!configuredSecret) return false;

  const token = getAuthToken(req);
  if (token) {
    const owner = await getAdminSessionOwner(token);
    if (owner) return true;
  }

  const secret = getSecretOverride(req, body);
  if (!secret) return false;
  return isAdminSecretValid(secret);
};

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-admin-secret');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    const body = req.method === 'POST' ? parseBody(req.body) : undefined;
    const authorized = await authorize(req, body);
    if (!authorized) {
      json(res, 401, { ok: false, code: 'UNAUTHORIZED', error: 'Admin auth required' });
      return;
    }

    const origin = getOriginFromRequest(req);

    if (req.method === 'GET') {
      const limitRaw = req.query?.limit;
      const limit = Number(limitRaw);
      const rootCodes = await listRootCodes(Number.isFinite(limit) ? limit : 50);

      json(res, 200, {
        ok: true,
        rootCodes: rootCodes.map((entry) => toPublicCode(origin, entry)),
      });
      return;
    }

    if (req.method === 'POST') {
      const prefix = String(body?.prefix || '').trim();
      const count = Number(body?.count);
      const created = await createRootCodes({
        prefix,
        count: Number.isFinite(count) ? count : 1,
        createdBy: 'owner',
      });

      json(res, 200, {
        ok: true,
        generated: created.map((entry) => toPublicCode(origin, entry)),
      });
      return;
    }

    json(res, 405, { ok: false, error: 'Method not allowed' });
  } catch (error: any) {
    json(res, 500, {
      ok: false,
      error: 'Unexpected admin invite code error',
      details: error?.message || String(error),
    });
  }
}
