import {
  BetaUserRecord,
  enforceRateLimit,
  getClientIp,
  getOriginFromRequest,
  getUserIdByDevice,
  getUserIdByReferralCode,
  isRootCode,
  issueReferralCode,
  issueToken,
  promoteInviter,
  setDeviceOwner,
  setReferralCodeOwner,
  setSessionOwner,
  setUser,
  toPublicUser,
} from './betaStore';

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
    const body = parseBody(req.body);
    const inviteCode = String(body.inviteCode || '').trim().toUpperCase();
    const referralCodeInput = String(body.referralCode || '').trim().toUpperCase();
    const deviceId = String(body.deviceId || '').trim();

    if (!inviteCode || !deviceId) {
      json(res, 400, { ok: false, error: 'inviteCode and deviceId are required' });
      return;
    }

    const clientIp = getClientIp(req);
    const withinLimit = await enforceRateLimit(clientIp);
    if (!withinLimit) {
      json(res, 429, { ok: false, code: 'RATE_LIMITED', error: 'Rate limited' });
      return;
    }

    const existingUserId = await getUserIdByDevice(deviceId);
    if (existingUserId) {
      json(res, 409, { ok: false, code: 'ALREADY_ACTIVATED_DEVICE', error: 'Device already activated' });
      return;
    }

    const inviteOwnerId = await getUserIdByReferralCode(inviteCode);
    const inviteIsRootCode = await isRootCode(inviteCode);
    if (!inviteOwnerId && !inviteIsRootCode) {
      json(res, 400, { ok: false, code: 'INVALID_CODE', error: 'Invalid invite code' });
      return;
    }

    let referredByUserId: string | null = null;
    if (referralCodeInput) {
      referredByUserId = await getUserIdByReferralCode(referralCodeInput);
      if (!referredByUserId) {
        json(res, 400, { ok: false, code: 'INVALID_REFERRAL', error: 'Invalid referral code' });
        return;
      }
    } else if (inviteOwnerId) {
      referredByUserId = inviteOwnerId;
    }

    const userId = `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const referralCode = await issueReferralCode();
    const now = new Date().toISOString();

    const userRecord: BetaUserRecord = {
      id: userId,
      createdAt: now,
      referralCode,
      referredByUserId,
      acceptedInvites: 0,
      insiderUnlockedAt: null,
      pro2kUnlockedAt: null,
    };

    if (referredByUserId && referredByUserId === userId) {
      json(res, 400, { ok: false, code: 'SELF_REFERRAL', error: 'Self referral is not allowed' });
      return;
    }

    await setUser(userRecord);
    await setReferralCodeOwner(referralCode, userId);
    await setDeviceOwner(deviceId, userId);

    const token = issueToken();
    await setSessionOwner(token, userId);

    if (referredByUserId) {
      await promoteInviter(referredByUserId);
    }

    const origin = getOriginFromRequest(req);
    json(res, 200, {
      ok: true,
      token,
      user: toPublicUser(origin, userRecord),
      message: referredByUserId
        ? 'Your friend loves you. You are in.'
        : 'Welcome to the private StudioAI beta.',
    });
  } catch (error: any) {
    json(res, 500, {
      ok: false,
      error: 'Unexpected activation error',
      details: error?.message || String(error),
    });
  }
}
