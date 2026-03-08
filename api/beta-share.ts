import {
  getOriginFromRequest,
  getUser,
  getUserIdBySession,
  toPublicUser,
} from './betaStore.js';

import { json, setCors, handleOptions, rejectMethod, getAuthToken } from './utils.js';

export default async function handler(req: any, res: any) {
  setCors(res, 'GET,OPTIONS');
  if (handleOptions(req, res)) return;
  if (rejectMethod(req, res, 'GET')) return;

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
