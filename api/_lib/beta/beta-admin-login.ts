import {
  enforceRateLimit,
  getAdminSecret,
  getClientIp,
  isAdminSecretValid,
  issueToken,
  setAdminSessionOwner,
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

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    json(res, 405, { ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const configuredSecret = getAdminSecret();
    if (!configuredSecret) {
      json(res, 503, { ok: false, code: 'ADMIN_NOT_CONFIGURED', error: 'Admin login is not configured' });
      return;
    }

    const clientIp = getClientIp(req);
    const withinLimit = await enforceRateLimit(`admin:${clientIp}`, 20);
    if (!withinLimit) {
      json(res, 429, { ok: false, code: 'RATE_LIMITED', error: 'Too many login attempts' });
      return;
    }

    const body = parseBody(req.body);
    const secret = String(body.secret || '').trim();
    if (!secret) {
      json(res, 400, { ok: false, code: 'MISSING_SECRET', error: 'secret is required' });
      return;
    }

    if (!isAdminSecretValid(secret)) {
      json(res, 401, { ok: false, code: 'INVALID_SECRET', error: 'Invalid admin secret' });
      return;
    }

    const token = issueToken();
    await setAdminSessionOwner(token, 'owner');

    json(res, 200, {
      ok: true,
      token,
      role: 'owner',
      expiresInDays: 30,
    });
  } catch (error: any) {
    json(res, 500, {
      ok: false,
      error: 'Unexpected admin login error',
      details: error?.message || String(error),
    });
  }
}
