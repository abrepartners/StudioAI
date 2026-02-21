const KV_REST_API_URL = process.env.KV_REST_API_URL;
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;

const ROOT_CODE_ENV_KEYS = ['BETA_ROOT_CODES', 'BETA_BOOTSTRAP_CODES'];

type MemoryStore = {
  values: Map<string, string>;
  numbers: Map<string, number>;
  expirations: Map<string, number>;
};

type GlobalWithStore = typeof globalThis & {
  __studioaiBetaStore?: MemoryStore;
};

const getMemoryStore = (): MemoryStore => {
  const g = globalThis as GlobalWithStore;
  if (!g.__studioaiBetaStore) {
    g.__studioaiBetaStore = {
      values: new Map(),
      numbers: new Map(),
      expirations: new Map(),
    };
  }
  return g.__studioaiBetaStore;
};

export type BetaUserRecord = {
  id: string;
  createdAt: string;
  referralCode: string;
  referredByUserId: string | null;
  acceptedInvites: number;
  insiderUnlockedAt: string | null;
  pro2kUnlockedAt: string | null;
};

export type PublicBetaUser = {
  id: string;
  referralCode: string;
  acceptedInvites: number;
  insiderUnlocked: boolean;
  pro2kUnlocked: boolean;
  inviteLink: string;
};

export const getOriginFromRequest = (req: any): string => {
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

const decodeRedisResult = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.length ? String(value[0]) : null;
  return null;
};

const readMemoryExpiration = (store: MemoryStore, key: string) => {
  const expiresAt = store.expirations.get(key);
  if (!expiresAt) return;
  if (Date.now() >= expiresAt) {
    store.expirations.delete(key);
    store.values.delete(key);
    store.numbers.delete(key);
  }
};

const kvGetRaw = async (key: string): Promise<string | null> => {
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

const kvSetRaw = async (key: string, value: string, ttlSeconds?: number) => {
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

const kvIncr = async (key: string): Promise<number> => {
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

const kvExpire = async (key: string, ttlSeconds: number) => {
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

export const getRootCodes = (): Set<string> => {
  const values: string[] = [];
  for (const key of ROOT_CODE_ENV_KEYS) {
    const raw = process.env[key];
    if (!raw) continue;
    values.push(...raw.split(','));
  }
  return new Set(values.map((item) => item.trim()).filter(Boolean));
};

export const getUser = async (userId: string): Promise<BetaUserRecord | null> => {
  const raw = await kvGetRaw(`beta:user:${userId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BetaUserRecord;
  } catch {
    return null;
  }
};

export const setUser = async (user: BetaUserRecord) => {
  await kvSetRaw(`beta:user:${user.id}`, JSON.stringify(user));
};

export const getUserIdByReferralCode = async (referralCode: string): Promise<string | null> => {
  return kvGetRaw(`beta:refcode:${referralCode}`);
};

export const setReferralCodeOwner = async (referralCode: string, userId: string) => {
  await kvSetRaw(`beta:refcode:${referralCode}`, userId);
};

export const getUserIdBySession = async (token: string): Promise<string | null> => {
  return kvGetRaw(`beta:session:${token}`);
};

export const setSessionOwner = async (token: string, userId: string) => {
  await kvSetRaw(`beta:session:${token}`, userId, 60 * 60 * 24 * 60);
};

export const getUserIdByDevice = async (deviceId: string): Promise<string | null> => {
  return kvGetRaw(`beta:device:${deviceId}`);
};

export const setDeviceOwner = async (deviceId: string, userId: string) => {
  await kvSetRaw(`beta:device:${deviceId}`, userId);
};

export const isRootCode = async (code: string): Promise<boolean> => {
  const roots = getRootCodes();
  if (roots.has(code)) return true;
  const inKv = await kvGetRaw(`beta:rootcode:${code}`);
  return Boolean(inKv);
};

export const issueReferralCode = async (): Promise<string> => {
  for (let i = 0; i < 5; i += 1) {
    const code = Math.random().toString(36).slice(2, 10).toUpperCase();
    const existing = await getUserIdByReferralCode(code);
    if (!existing) return code;
  }
  return `${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-2)}`.toUpperCase();
};

export const issueToken = () => {
  const randomPart = Math.random().toString(36).slice(2);
  const timePart = Date.now().toString(36);
  return `${timePart}.${randomPart}.${Math.random().toString(36).slice(2)}`;
};

export const enforceRateLimit = async (ipAddress: string, maxPerMinute = 15): Promise<boolean> => {
  const minuteBucket = Math.floor(Date.now() / 60000);
  const key = `beta:ratelimit:${ipAddress}:${minuteBucket}`;
  const count = await kvIncr(key);
  if (count === 1) {
    await kvExpire(key, 70);
  }
  return count <= maxPerMinute;
};

export const promoteInviter = async (inviterId: string): Promise<BetaUserRecord | null> => {
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

export const toPublicUser = (origin: string, user: BetaUserRecord): PublicBetaUser => ({
  id: user.id,
  referralCode: user.referralCode,
  acceptedInvites: user.acceptedInvites,
  insiderUnlocked: Boolean(user.insiderUnlockedAt),
  pro2kUnlocked: Boolean(user.pro2kUnlockedAt),
  inviteLink: `${origin}/?ref=${encodeURIComponent(user.referralCode)}`,
});

export const getClientIp = (req: any): string => {
  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof first === 'string' && first.length) {
    return first.split(',')[0].trim();
  }
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real.length) return real;
  return 'unknown';
};
