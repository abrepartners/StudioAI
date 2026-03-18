import {
  getOriginFromRequest,
  getUser,
  getUserIdByDevice,
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
    const deviceId = String(req.query?.deviceId || '').trim();

    let userId: string | null = null;
    if (token) {
      userId = await getUserIdBySession(token);
    }

    if (!userId && deviceId) {
      userId = await getUserIdByDevice(deviceId);
    }

    if (!userId) {
      json(res, 401, { ok: false, error: 'No beta session found' });
      return;
    }

    const user = await getUser(userId);
    if (!user) {
      json(res, 404, { ok: false, error: 'Beta user not found' });
      return;
    }

    const origin = getOriginFromRequest(req);
    json(res, 200, {
      ok: true,
      user: toPublicUser(origin, user),
    });
  } catch (error: any) {
    json(res, 500, {
      ok: false,
      error: 'Unexpected beta session error',
      details: error?.message || String(error),
    });
  }
}
