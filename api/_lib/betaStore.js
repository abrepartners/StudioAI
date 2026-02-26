const KV_REST_API_URL = process.env.KV_REST_API_URL;
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;

const ROOT_CODE_ENV_KEYS = ['BETA_ROOT_CODES', 'BETA_BOOTSTRAP_CODES'];
const ADMIN_SECRET_ENV_KEYS = ['BETA_ADMIN_SECRET', 'BETA_OWNER_SECRET', 'ADMIN_BETA_SECRET'];
const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const ROOT_CODE_LIST_KEY = 'beta:rootcodes:list';

const getMemoryStore = () => {
  const g = globalThis;
  if (!g.__studioaiBetaStore) {
    g.__studioaiBetaStore = {
      values: new Map(),
      numbers: new Map(),
      expirations: new Map(),
    };
  }
  return g.__studioaiBetaStore;
};

const getOriginFromRequest = (req) => {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit;

  const protoHeader = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader || 'https';

  const hostHeader = req.headers['x-forwarded-host'] || req.headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;

  if (!host) return 'http://localhost:3000';
  return `${proto}://${host}`;
};

const hasKv = () => Boolean(KV_REST_API_URL && KV_REST_API_TOKEN);

const decodeRedisResult = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.length ? String(value[0]) : null;
  return null;
};

const readMemoryExpiration = (store, key) => {
  const expiresAt = store.expirations.get(key);
  if (!expiresAt) return;
  if (Date.now() >= expiresAt) {
    store.expirations.delete(key);
    store.values.delete(key);
    store.numbers.delete(key);
  }
};

const kvGetRaw = async (key) => {
  if (hasKv()) {
    const response = await fetch(`${KV_REST_API_URL}/get/${encodeURIComponent(key)}`, {
      headers: {
        Authorization: `Bearer ${KV_REST_API_TOKEN}`,
      },
    });

    if (!response.ok) {
      throw new Error(`KV get failed: ${response.status}`);
    }

    const payload = await response.json().catch(() => ({}));
    return decodeRedisResult(payload.result);
  }

  const store = getMemoryStore();
  readMemoryExpiration(store, key);
  if (store.values.has(key)) return store.values.get(key) || null;
  if (store.numbers.has(key)) return String(store.numbers.get(key));
  return null;
};

const kvSetRaw = async (key, value, ttlSeconds) => {
  if (hasKv()) {
    const endpoint = ttlSeconds
      ? `${KV_REST_API_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}?EX=${ttlSeconds}`
      : `${KV_REST_API_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`;

    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${KV_REST_API_TOKEN}`,
      },
    });

    if (!response.ok) {
      throw new Error(`KV set failed: ${response.status}`);
    }
    return;
  }

  const store = getMemoryStore();
  store.values.set(key, value);
  if (ttlSeconds) {
    store.expirations.set(key, Date.now() + ttlSeconds * 1000);
  } else {
    store.expirations.delete(key);
  }
};

const kvIncr = async (key) => {
  if (hasKv()) {
    const response = await fetch(`${KV_REST_API_URL}/incr/${encodeURIComponent(key)}`, {
      headers: {
        Authorization: `Bearer ${KV_REST_API_TOKEN}`,
      },
    });

    if (!response.ok) {
      throw new Error(`KV incr failed: ${response.status}`);
    }

    const payload = await response.json().catch(() => ({}));
    const parsed = Number(payload.result);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const store = getMemoryStore();
  readMemoryExpiration(store, key);
  const current = store.numbers.get(key) || 0;
  const next = current + 1;
  store.numbers.set(key, next);
  return next;
};

const kvExpire = async (key, ttlSeconds) => {
  if (hasKv()) {
    const response = await fetch(`${KV_REST_API_URL}/expire/${encodeURIComponent(key)}/${ttlSeconds}`, {
      headers: {
        Authorization: `Bearer ${KV_REST_API_TOKEN}`,
      },
    });

    if (!response.ok) {
      throw new Error(`KV expire failed: ${response.status}`);
    }
    return;
  }

  const store = getMemoryStore();
  store.expirations.set(key, Date.now() + ttlSeconds * 1000);
};

const getRootCodes = () => {
  const values = [];
  for (const key of ROOT_CODE_ENV_KEYS) {
    const raw = process.env[key];
    if (!raw) continue;
    values.push(...raw.split(','));
  }
  return new Set(values.map((item) => item.trim()).filter(Boolean));
};

const getAdminSecret = () => {
  for (const key of ADMIN_SECRET_ENV_KEYS) {
    const value = process.env[key];
    if (value && value.trim()) return value.trim();
  }
  return '';
};

const isAdminSecretValid = (secretInput) => {
  const configured = getAdminSecret();
  if (!configured) return false;
  return String(secretInput || '').trim() === configured;
};

const getUser = async (userId) => {
  const raw = await kvGetRaw(`beta:user:${userId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const setUser = async (user) => {
  await kvSetRaw(`beta:user:${user.id}`, JSON.stringify(user));
};

const getUserIdByReferralCode = async (referralCode) => kvGetRaw(`beta:refcode:${referralCode}`);

const setReferralCodeOwner = async (referralCode, userId) => {
  await kvSetRaw(`beta:refcode:${referralCode}`, userId);
};

const getUserIdBySession = async (token) => kvGetRaw(`beta:session:${token}`);

const setSessionOwner = async (token, userId) => {
  await kvSetRaw(`beta:session:${token}`, userId, 60 * 60 * 24 * 60);
};

const getUserIdByDevice = async (deviceId) => kvGetRaw(`beta:device:${deviceId}`);

const setDeviceOwner = async (deviceId, userId) => {
  await kvSetRaw(`beta:device:${deviceId}`, userId);
};

const isRootCode = async (code) => {
  const roots = getRootCodes();
  if (roots.has(code)) return true;
  const inKv = await kvGetRaw(`beta:rootcode:${code}`);
  return Boolean(inKv);
};

const issueReferralCode = async () => {
  for (let i = 0; i < 5; i += 1) {
    const code = Math.random().toString(36).slice(2, 10).toUpperCase();
    const existing = await getUserIdByReferralCode(code);
    if (!existing) return code;
  }
  return `${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-2)}`.toUpperCase();
};

const issueToken = () => {
  const randomPart = Math.random().toString(36).slice(2);
  const timePart = Date.now().toString(36);
  return `${timePart}.${randomPart}.${Math.random().toString(36).slice(2)}`;
};

const setAdminSessionOwner = async (token, ownerId = 'owner') => {
  await kvSetRaw(`beta:adminsession:${token}`, ownerId, ADMIN_SESSION_TTL_SECONDS);
};

const getAdminSessionOwner = async (token) => kvGetRaw(`beta:adminsession:${token}`);

const normalizePrefix = (prefix) =>
  String(prefix || '')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);

const readRootCodeList = async () => {
  const raw = await kvGetRaw(ROOT_CODE_LIST_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => entry && typeof entry.code === 'string')
      .map((entry) => ({
        code: String(entry.code || '').toUpperCase(),
        createdAt: String(entry.createdAt || ''),
        createdBy: String(entry.createdBy || 'owner'),
      }));
  } catch {
    return [];
  }
};

const writeRootCodeList = async (entries) => {
  await kvSetRaw(ROOT_CODE_LIST_KEY, JSON.stringify(entries.slice(0, 500)));
};

const issueRootCode = async (prefix = '') => {
  const normalizedPrefix = normalizePrefix(prefix);

  for (let i = 0; i < 10; i += 1) {
    const blockA = Math.random().toString(36).slice(2, 6).toUpperCase();
    const blockB = Math.random().toString(36).slice(2, 6).toUpperCase();
    const code = normalizedPrefix ? `${normalizedPrefix}-${blockA}${blockB}` : `${blockA}-${blockB}`;
    const existingOwner = await getUserIdByReferralCode(code);
    const rootExists = await isRootCode(code);
    if (!existingOwner && !rootExists) return code;
  }

  return `${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
};

const createRootCodes = async ({ prefix = '', count = 1, createdBy = 'owner' } = {}) => {
  const cappedCount = Math.max(1, Math.min(25, Number(count) || 1));
  const now = new Date().toISOString();
  const created = [];

  for (let i = 0; i < cappedCount; i += 1) {
    const code = await issueRootCode(prefix);
    await kvSetRaw(`beta:rootcode:${code}`, '1');
    created.push({
      code,
      createdAt: now,
      createdBy,
    });
  }

  const existing = await readRootCodeList();
  const freshCodes = new Set(created.map((entry) => entry.code));
  const merged = [...created, ...existing.filter((entry) => !freshCodes.has(entry.code))];
  await writeRootCodeList(merged);
  return created;
};

const listRootCodes = async (limit = 50) => {
  const max = Math.max(1, Math.min(200, Number(limit) || 50));
  const list = await readRootCodeList();
  return list.slice(0, max);
};

const enforceRateLimit = async (ipAddress, maxPerMinute = 15) => {
  const minuteBucket = Math.floor(Date.now() / 60000);
  const key = `beta:ratelimit:${ipAddress}:${minuteBucket}`;
  const count = await kvIncr(key);
  if (count === 1) {
    await kvExpire(key, 70);
  }
  return count <= maxPerMinute;
};

const promoteInviter = async (inviterId) => {
  const inviter = await getUser(inviterId);
  if (!inviter) return null;

  inviter.acceptedInvites += 1;
  const now = new Date().toISOString();
  if (inviter.acceptedInvites >= 2 && !inviter.insiderUnlockedAt) {
    inviter.insiderUnlockedAt = now;
  }
  if (inviter.acceptedInvites >= 10 && !inviter.pro2kUnlockedAt) {
    inviter.pro2kUnlockedAt = now;
  }

  await setUser(inviter);
  return inviter;
};

const toPublicUser = (origin, user) => ({
  id: user.id,
  referralCode: user.referralCode,
  acceptedInvites: user.acceptedInvites,
  insiderUnlocked: Boolean(user.insiderUnlockedAt),
  pro2kUnlocked: Boolean(user.pro2kUnlockedAt),
  inviteLink: `${origin}/?ref=${encodeURIComponent(user.referralCode)}`,
});

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof first === 'string' && first.length) {
    return first.split(',')[0].trim();
  }
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real.length) return real;
  return 'unknown';
};

export {
  getOriginFromRequest,
  getRootCodes,
  getAdminSecret,
  isAdminSecretValid,
  getUser,
  setUser,
  getUserIdByReferralCode,
  setReferralCodeOwner,
  getUserIdBySession,
  setSessionOwner,
  setAdminSessionOwner,
  getAdminSessionOwner,
  getUserIdByDevice,
  setDeviceOwner,
  isRootCode,
  issueReferralCode,
  issueRootCode,
  issueToken,
  createRootCodes,
  listRootCodes,
  enforceRateLimit,
  promoteInviter,
  toPublicUser,
  getClientIp,
};
