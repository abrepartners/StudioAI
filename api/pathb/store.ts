import { AuditEvent } from './audit';
import {
  BrokerageRecord,
  JobAssetRecord,
  JobRecord,
  MembershipRecord,
  OfficeRecord,
  PresetRecord,
  TeamRecord,
  UserRecord,
} from './types';

const KV_REST_API_URL = process.env.KV_REST_API_URL;
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;

const getMemoryStore = () => {
  const g = globalThis as any;
  if (!g.__studioaiPathBStore) {
    g.__studioaiPathBStore = {
      values: new Map<string, string>(),
      numbers: new Map<string, number>(),
      expirations: new Map<string, number>(),
    };
  }
  return g.__studioaiPathBStore as {
    values: Map<string, string>;
    numbers: Map<string, number>;
    expirations: Map<string, number>;
  };
};

const hasKv = () => Boolean(KV_REST_API_URL && KV_REST_API_TOKEN);

const readMemoryExpiration = (store: ReturnType<typeof getMemoryStore>, key: string) => {
  const expiresAt = store.expirations.get(key);
  if (!expiresAt) return;
  if (Date.now() >= expiresAt) {
    store.expirations.delete(key);
    store.values.delete(key);
    store.numbers.delete(key);
  }
};

const decodeRedisResult = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.length ? String(value[0]) : null;
  return null;
};

const kvGetRaw = async (key: string): Promise<string | null> => {
  if (hasKv()) {
    const response = await fetch(`${KV_REST_API_URL}/get/${encodeURIComponent(key)}`, {
      headers: {
        Authorization: `Bearer ${KV_REST_API_TOKEN}`,
      },
    });

    if (!response.ok) {
      throw new Error(`PathB KV get failed: ${response.status}`);
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
      throw new Error(`PathB KV set failed: ${response.status}`);
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

const parseJson = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const getJson = async <T>(key: string, fallback: T): Promise<T> => {
  const raw = await kvGetRaw(key);
  return parseJson(raw, fallback);
};

const setJson = async (key: string, value: unknown) => kvSetRaw(key, JSON.stringify(value));

const addUniqueIndexValue = async (key: string, id: string) => {
  const list = await getJson<string[]>(key, []);
  if (!list.includes(id)) {
    list.push(id);
    await setJson(key, list);
  }
};

const issueId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const entityKey = {
  brokerage: (id: string) => `pathb:brokerage:${id}`,
  office: (id: string) => `pathb:office:${id}`,
  team: (id: string) => `pathb:team:${id}`,
  user: (id: string) => `pathb:user:${id}`,
  membership: (id: string) => `pathb:membership:${id}`,
  preset: (id: string) => `pathb:preset:${id}`,
  job: (id: string) => `pathb:job:${id}`,
  jobAsset: (id: string) => `pathb:job-asset:${id}`,
  auditByBrokerage: (brokerageId: string) => `pathb:audit:${brokerageId}`,
};

const indexKey = {
  brokerages: () => 'pathb:index:brokerages',
  officesByBrokerage: (brokerageId: string) => `pathb:index:offices:${brokerageId}`,
  teamsByOffice: (officeId: string) => `pathb:index:teams:${officeId}`,
  usersByBrokerage: (brokerageId: string) => `pathb:index:users:${brokerageId}`,
  membershipsByBrokerage: (brokerageId: string) => `pathb:index:memberships:${brokerageId}`,
  membershipsByUser: (userId: string) => `pathb:index:user-memberships:${userId}`,
  presetsByBrokerage: (brokerageId: string) => `pathb:index:presets:${brokerageId}`,
  presetsByOffice: (officeId: string) => `pathb:index:presets-office:${officeId}`,
  jobsByBrokerage: (brokerageId: string) => `pathb:index:jobs:${brokerageId}`,
  jobsByOffice: (officeId: string) => `pathb:index:jobs-office:${officeId}`,
  jobsByAgent: (agentUserId: string) => `pathb:index:jobs-agent:${agentUserId}`,
  assetsByJob: (jobId: string) => `pathb:index:job-assets:${jobId}`,
};

const nowIso = () => new Date().toISOString();

export const createBrokerage = async (input: { id?: string; name: string }): Promise<BrokerageRecord> => {
  const id = input.id?.trim() || issueId('brg');
  const timestamp = nowIso();
  const record: BrokerageRecord = {
    id,
    name: input.name.trim(),
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await setJson(entityKey.brokerage(id), record);
  await addUniqueIndexValue(indexKey.brokerages(), id);
  return record;
};

export const getBrokerage = async (id: string): Promise<BrokerageRecord | null> =>
  getJson<BrokerageRecord | null>(entityKey.brokerage(id), null);

export const listBrokerages = async (): Promise<BrokerageRecord[]> => {
  const ids = await getJson<string[]>(indexKey.brokerages(), []);
  const items = await Promise.all(ids.map((id) => getBrokerage(id)));
  return items.filter((item): item is BrokerageRecord => Boolean(item));
};

export const createOffice = async (input: { brokerageId: string; name: string; id?: string }): Promise<OfficeRecord> => {
  const id = input.id?.trim() || issueId('ofc');
  const timestamp = nowIso();
  const record: OfficeRecord = {
    id,
    brokerageId: input.brokerageId,
    name: input.name.trim(),
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await setJson(entityKey.office(id), record);
  await addUniqueIndexValue(indexKey.officesByBrokerage(input.brokerageId), id);
  return record;
};

export const getOffice = async (id: string): Promise<OfficeRecord | null> =>
  getJson<OfficeRecord | null>(entityKey.office(id), null);

export const listOfficesByBrokerage = async (brokerageId: string): Promise<OfficeRecord[]> => {
  const ids = await getJson<string[]>(indexKey.officesByBrokerage(brokerageId), []);
  const items = await Promise.all(ids.map((id) => getOffice(id)));
  return items.filter((item): item is OfficeRecord => Boolean(item));
};

export const createTeam = async (input: {
  brokerageId: string;
  officeId: string;
  name: string;
  id?: string;
}): Promise<TeamRecord> => {
  const id = input.id?.trim() || issueId('team');
  const timestamp = nowIso();
  const record: TeamRecord = {
    id,
    brokerageId: input.brokerageId,
    officeId: input.officeId,
    name: input.name.trim(),
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await setJson(entityKey.team(id), record);
  await addUniqueIndexValue(indexKey.teamsByOffice(input.officeId), id);
  return record;
};

export const getTeam = async (id: string): Promise<TeamRecord | null> =>
  getJson<TeamRecord | null>(entityKey.team(id), null);

export const listTeamsByOffice = async (officeId: string): Promise<TeamRecord[]> => {
  const ids = await getJson<string[]>(indexKey.teamsByOffice(officeId), []);
  const items = await Promise.all(ids.map((id) => getTeam(id)));
  return items.filter((item): item is TeamRecord => Boolean(item));
};

export const createUser = async (input: {
  brokerageId: string;
  email: string;
  name: string;
  id?: string;
}): Promise<UserRecord> => {
  const id = input.id?.trim() || issueId('usr');
  const timestamp = nowIso();
  const record: UserRecord = {
    id,
    brokerageId: input.brokerageId,
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await setJson(entityKey.user(id), record);
  await addUniqueIndexValue(indexKey.usersByBrokerage(input.brokerageId), id);
  return record;
};

export const getUser = async (id: string): Promise<UserRecord | null> =>
  getJson<UserRecord | null>(entityKey.user(id), null);

export const listUsersByBrokerage = async (brokerageId: string): Promise<UserRecord[]> => {
  const ids = await getJson<string[]>(indexKey.usersByBrokerage(brokerageId), []);
  const items = await Promise.all(ids.map((id) => getUser(id)));
  return items.filter((item): item is UserRecord => Boolean(item));
};

export const createMembership = async (input: {
  brokerageId: string;
  officeId?: string | null;
  teamId?: string | null;
  userId: string;
  role: MembershipRecord['role'];
  scopeType: MembershipRecord['scopeType'];
  id?: string;
}): Promise<MembershipRecord> => {
  const id = input.id?.trim() || issueId('mship');
  const timestamp = nowIso();
  const record: MembershipRecord = {
    id,
    brokerageId: input.brokerageId,
    officeId: input.officeId || null,
    teamId: input.teamId || null,
    userId: input.userId,
    role: input.role,
    scopeType: input.scopeType,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await setJson(entityKey.membership(id), record);
  await addUniqueIndexValue(indexKey.membershipsByBrokerage(input.brokerageId), id);
  await addUniqueIndexValue(indexKey.membershipsByUser(input.userId), id);
  return record;
};

export const getMembership = async (id: string): Promise<MembershipRecord | null> =>
  getJson<MembershipRecord | null>(entityKey.membership(id), null);

export const listMembershipsByBrokerage = async (brokerageId: string): Promise<MembershipRecord[]> => {
  const ids = await getJson<string[]>(indexKey.membershipsByBrokerage(brokerageId), []);
  const items = await Promise.all(ids.map((id) => getMembership(id)));
  return items.filter((item): item is MembershipRecord => Boolean(item));
};

export const listMembershipsByUser = async (userId: string): Promise<MembershipRecord[]> => {
  const ids = await getJson<string[]>(indexKey.membershipsByUser(userId), []);
  const items = await Promise.all(ids.map((id) => getMembership(id)));
  return items.filter((item): item is MembershipRecord => Boolean(item));
};

export const createPreset = async (input: {
  brokerageId: string;
  officeId?: string | null;
  name: string;
  scopeType: 'brokerage' | 'office';
  scopeId: string;
  active: boolean;
  allowedEditTypes: PresetRecord['allowedEditTypes'];
  defaultSettingsJson: Record<string, unknown>;
  approvalRequired: boolean;
  disclosureRequiredDefault: boolean;
  deliveryNotesTemplate: string;
  revisionPolicyTemplate: string;
  createdBy: string;
  id?: string;
}): Promise<PresetRecord> => {
  const id = input.id?.trim() || issueId('preset');
  const timestamp = nowIso();

  const record: PresetRecord = {
    id,
    name: input.name.trim(),
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    brokerageId: input.brokerageId,
    officeId: input.officeId || null,
    active: input.active,
    allowedEditTypes: input.allowedEditTypes,
    defaultSettingsJson: input.defaultSettingsJson,
    approvalRequired: input.approvalRequired,
    disclosureRequiredDefault: input.disclosureRequiredDefault,
    deliveryNotesTemplate: input.deliveryNotesTemplate,
    revisionPolicyTemplate: input.revisionPolicyTemplate,
    createdBy: input.createdBy,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await setJson(entityKey.preset(id), record);
  await addUniqueIndexValue(indexKey.presetsByBrokerage(input.brokerageId), id);
  if (record.officeId) {
    await addUniqueIndexValue(indexKey.presetsByOffice(record.officeId), id);
  }
  return record;
};

export const getPreset = async (id: string): Promise<PresetRecord | null> =>
  getJson<PresetRecord | null>(entityKey.preset(id), null);

export const listPresetsByBrokerage = async (brokerageId: string): Promise<PresetRecord[]> => {
  const ids = await getJson<string[]>(indexKey.presetsByBrokerage(brokerageId), []);
  const items = await Promise.all(ids.map((id) => getPreset(id)));
  return items.filter((item): item is PresetRecord => Boolean(item));
};

export const listPresetsByOffice = async (officeId: string): Promise<PresetRecord[]> => {
  const ids = await getJson<string[]>(indexKey.presetsByOffice(officeId), []);
  const items = await Promise.all(ids.map((id) => getPreset(id)));
  return items.filter((item): item is PresetRecord => Boolean(item));
};

export const createJob = async (input: Omit<JobRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<JobRecord> => {
  const id = input.id?.trim() || issueId('job');
  const timestamp = nowIso();
  const record: JobRecord = {
    ...input,
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await setJson(entityKey.job(id), record);
  await addUniqueIndexValue(indexKey.jobsByBrokerage(record.brokerageId), id);
  await addUniqueIndexValue(indexKey.jobsByOffice(record.officeId), id);
  await addUniqueIndexValue(indexKey.jobsByAgent(record.agentUserId), id);
  return record;
};

export const getJob = async (id: string): Promise<JobRecord | null> =>
  getJson<JobRecord | null>(entityKey.job(id), null);

export const saveJob = async (job: JobRecord) => {
  const next: JobRecord = {
    ...job,
    updatedAt: nowIso(),
  };
  await setJson(entityKey.job(job.id), next);
  return next;
};

export const listJobsByBrokerage = async (brokerageId: string): Promise<JobRecord[]> => {
  const ids = await getJson<string[]>(indexKey.jobsByBrokerage(brokerageId), []);
  const items = await Promise.all(ids.map((id) => getJob(id)));
  return items.filter((item): item is JobRecord => Boolean(item));
};

export const listJobsByAgent = async (agentUserId: string): Promise<JobRecord[]> => {
  const ids = await getJson<string[]>(indexKey.jobsByAgent(agentUserId), []);
  const items = await Promise.all(ids.map((id) => getJob(id)));
  return items.filter((item): item is JobRecord => Boolean(item));
};

export const createJobAsset = async (input: Omit<JobAssetRecord, 'id' | 'createdAt'> & { id?: string }): Promise<JobAssetRecord> => {
  const id = input.id?.trim() || issueId('asset');
  const record: JobAssetRecord = {
    ...input,
    id,
    createdAt: nowIso(),
  };

  await setJson(entityKey.jobAsset(id), record);
  await addUniqueIndexValue(indexKey.assetsByJob(record.jobId), id);
  return record;
};

export const getJobAsset = async (id: string): Promise<JobAssetRecord | null> =>
  getJson<JobAssetRecord | null>(entityKey.jobAsset(id), null);

export const listJobAssets = async (jobId: string): Promise<JobAssetRecord[]> => {
  const ids = await getJson<string[]>(indexKey.assetsByJob(jobId), []);
  const items = await Promise.all(ids.map((id) => getJobAsset(id)));
  return items.filter((item): item is JobAssetRecord => Boolean(item));
};

export const appendAuditEvent = async (brokerageId: string, event: AuditEvent) => {
  const key = entityKey.auditByBrokerage(brokerageId);
  const events = await getJson<AuditEvent[]>(key, []);
  events.unshift(event);
  await setJson(key, events.slice(0, 2000));
};

export const listAuditEvents = async (brokerageId: string, limit = 100): Promise<AuditEvent[]> => {
  const events = await getJson<AuditEvent[]>(entityKey.auditByBrokerage(brokerageId), []);
  return events.slice(0, Math.max(1, Math.min(limit, 500)));
};
