import { ActorContext, JobRecord } from './types';

const toMs = (value: string | null | undefined) => {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

const inDateRange = (job: JobRecord, from?: string, to?: string) => {
  const ts = toMs(job.createdAt);
  if (!ts) return false;
  const fromMs = toMs(from || undefined);
  const toMsValue = toMs(to || undefined);
  if (fromMs && ts < fromMs) return false;
  if (toMsValue && ts > toMsValue) return false;
  return true;
};

export const scopeFilterJobs = (actor: ActorContext, jobs: JobRecord[]) => {
  if (actor.role === 'BrokerageAdmin') return jobs;
  if (actor.role === 'OfficeAdmin') return actor.officeId ? jobs.filter((job) => job.officeId === actor.officeId) : jobs;
  if (actor.role === 'TeamLead') return actor.teamId ? jobs.filter((job) => job.teamId === actor.teamId) : jobs;
  if (actor.role === 'Agent') return jobs.filter((job) => job.agentUserId === actor.userId);
  return jobs;
};

export const applyJobFilters = (jobs: JobRecord[], query: any) => {
  const from = String(query?.from || '').trim();
  const to = String(query?.to || '').trim();
  const officeId = String(query?.officeId || '').trim();
  const teamId = String(query?.teamId || '').trim();
  const status = String(query?.status || '').trim();
  const editCategory = String(query?.editCategory || '').trim();
  const agentUserId = String(query?.agentUserId || '').trim();

  return jobs.filter((job) => {
    if (from || to) {
      if (!inDateRange(job, from || undefined, to || undefined)) return false;
    }
    if (officeId && job.officeId !== officeId) return false;
    if (teamId && job.teamId !== teamId) return false;
    if (status && job.status !== status) return false;
    if (agentUserId && job.agentUserId !== agentUserId) return false;
    if (editCategory && !job.requestedEditCategories.includes(editCategory as any)) return false;
    return true;
  });
};

export const calculateAvgTurnaroundHours = (jobs: JobRecord[]) => {
  let totalMs = 0;
  let count = 0;
  for (const job of jobs) {
    const start = toMs(job.submittedAt || undefined);
    const end = toMs(job.completedAt || job.deliveredAt || undefined);
    if (!start || !end || end < start) continue;
    totalMs += end - start;
    count += 1;
  }
  return count ? Number((totalMs / count / (1000 * 60 * 60)).toFixed(2)) : 0;
};

export const toCsv = (rows: Record<string, unknown>[]) => {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escapeValue = (value: unknown) => {
    const str = value === null || value === undefined ? '' : String(value);
    if (str.includes('"') || str.includes(',') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((key) => escapeValue(row[key])).join(','));
  }
  return lines.join('\n');
};
