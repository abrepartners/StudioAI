import {
  getOriginFromRequest,
  getUser,
  getUserIdBySession,
  toPublicUser,
} from '../betaStore.js';

const json = (res: any, status: number, body: Record<string, unknown>) => {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
};

const getAuthToken = (req: any): string => {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || typeof header !== 'string') return '';
  if (!header.startsWith('Bearer ')) return '';
  return header.slice('Bearer '.length).trim();
};

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    json(res, 405, { ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const token = getAuthToken(req);
    if (!token) {
      json(res, 401, { ok: false, error: 'Missing auth token' });
      return;
    }

    const userId = await getUserIdBySession(token);
    if (!userId) {
      json(res, 401, { ok: false, error: 'Session not found' });
      return;
    }

    const user = await getUser(userId);
    if (!user) {
      json(res, 404, { ok: false, error: 'Beta user not found' });
      return;
    }

    const origin = getOriginFromRequest(req);
    const publicUser = toPublicUser(origin, user);

    json(res, 200, {
      ok: true,
      user: publicUser,
      milestones: {
        insider: {
          target: 2,
          completed: publicUser.acceptedInvites >= 2,
        },
        pro2k: {
          target: 10,
          completed: publicUser.acceptedInvites >= 10,
        },
      },
      shareMessage: 'Your friend loves you. You are invited to shape StudioAI beta.',
    });
  } catch (error: any) {
    json(res, 500, {
      ok: false,
      error: 'Unexpected beta share error',
      details: error?.message || String(error),
    });
  }
}
