import React, { useCallback, useEffect, useMemo, useState } from 'react';

type PathBRole = 'BrokerageAdmin' | 'OfficeAdmin' | 'TeamLead' | 'Agent' | 'MediaPartner' | 'Reviewer';
type ScopeType = 'brokerage' | 'office' | 'team';
type JobPriority = 'low' | 'normal' | 'high' | 'urgent';

type ActorState = {
  userId: string;
  role: PathBRole;
  brokerageId: string;
  officeId: string;
  teamId: string;
  bootstrapKey: string;
};

type ApiResponse = {
  ok: boolean;
  status: number;
  payload: any;
};

const ACTOR_STORAGE_KEY = 'studioai_pathb_actor_context';

const ROLE_OPTIONS: PathBRole[] = [
  'BrokerageAdmin',
  'OfficeAdmin',
  'TeamLead',
  'Agent',
  'MediaPartner',
  'Reviewer',
];

const SCOPE_OPTIONS: ScopeType[] = ['brokerage', 'office', 'team'];

const STATUS_OPTIONS = [
  'Draft',
  'Submitted',
  'In Review',
  'Approved for Processing',
  'Processing',
  'Delivered',
  'Revision Requested',
  'Completed',
  'Rejected',
  'Cancelled',
] as const;

const PRIORITY_OPTIONS: JobPriority[] = ['low', 'normal', 'high', 'urgent'];

const EDIT_LABELS = [
  'Virtual Staging',
  'Restaging',
  'Twilight',
  'Declutter',
  'Object Removal',
  'Lawn Enhancement',
  'Sky Replacement',
  'Minor Cleanup',
  'Renovation Preview',
];

const defaultActor: ActorState = {
  userId: '',
  role: 'BrokerageAdmin',
  brokerageId: '',
  officeId: '',
  teamId: '',
  bootstrapKey: '',
};

const toList = (value: string) =>
  value
    .split('\n')
    .map((part) => part.trim())
    .filter(Boolean);

const parseApiError = (payload: any, fallbackStatus: number) => {
  if (payload?.error?.message) return String(payload.error.message);
  if (payload?.message) return String(payload.message);
  return `Request failed (${fallbackStatus})`;
};

const buildHeaders = (actor: ActorState, includeBootstrapHeader = false): Record<string, string> => {
  const headers: Record<string, string> = {};
  if (actor.userId) headers['x-pathb-user-id'] = actor.userId;
  if (actor.role) headers['x-pathb-role'] = actor.role;
  if (actor.brokerageId) headers['x-pathb-brokerage-id'] = actor.brokerageId;
  if (actor.officeId) headers['x-pathb-office-id'] = actor.officeId;
  if (actor.teamId) headers['x-pathb-team-id'] = actor.teamId;
  if (includeBootstrapHeader && actor.bootstrapKey) headers['x-pathb-bootstrap-key'] = actor.bootstrapKey;
  return headers;
};

const renderTime = (value?: string | null) => {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const PathBOpsPanel: React.FC = () => {
  const [actor, setActor] = useState<ActorState>(() => {
    if (typeof window === 'undefined') return defaultActor;
    try {
      const saved = JSON.parse(localStorage.getItem(ACTOR_STORAGE_KEY) || 'null');
      if (!saved || typeof saved !== 'object') return defaultActor;
      return {
        ...defaultActor,
        ...saved,
        role: ROLE_OPTIONS.includes(saved.role) ? saved.role : 'BrokerageAdmin',
      };
    } catch {
      return defaultActor;
    }
  });

  const [isBusy, setIsBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [lastResponse, setLastResponse] = useState('');

  const [bootstrapForm, setBootstrapForm] = useState({
    brokerageName: '',
    officeName: '',
    teamName: '',
    adminName: '',
    adminEmail: '',
  });

  const [officeName, setOfficeName] = useState('');
  const [teamForm, setTeamForm] = useState({ officeId: '', name: '' });
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    role: 'Agent' as PathBRole,
    scopeType: 'office' as ScopeType,
    officeId: '',
    teamId: '',
  });
  const [membershipForm, setMembershipForm] = useState({
    userId: '',
    role: 'Agent' as PathBRole,
    scopeType: 'office' as ScopeType,
    officeId: '',
    teamId: '',
  });
  const [presetForm, setPresetForm] = useState({
    name: '',
    scopeType: 'brokerage' as 'brokerage' | 'office',
    scopeId: '',
    allowedEditTypesText: 'Virtual Staging',
    approvalRequired: true,
    disclosureRequiredDefault: true,
    deliveryNotesTemplate: '',
    revisionPolicyTemplate: '',
  });
  const [jobForm, setJobForm] = useState({
    propertyAddress: '',
    mlsId: '',
    officeId: '',
    teamId: '',
    agentUserId: '',
    selectedPresetId: '',
    requestedEditCategoriesText: 'Virtual Staging',
    requestedTurnaround: '',
    priority: 'normal' as JobPriority,
    notes: '',
    disclosureRelevant: true,
    assetUrl: '',
    assetName: '',
    assetEditLabel: 'Virtual Staging',
    submitNow: true,
  });
  const [transitionForm, setTransitionForm] = useState({
    jobId: '',
    toStatus: 'Processing',
    reason: '',
    note: '',
    revisionReasonCategory: '',
    outputAssetIdsText: '',
  });
  const [approvalForm, setApprovalForm] = useState({
    jobId: '',
    decision: 'approve',
    note: '',
  });
  const [deliveryForm, setDeliveryForm] = useState({
    jobId: '',
    outputsText: '',
    notes: '',
  });
  const [revisionForm, setRevisionForm] = useState({
    jobId: '',
    reasonCategory: 'Composition mismatch',
    notes: '',
  });
  const [jobDetailId, setJobDetailId] = useState('');
  const [reportFilters, setReportFilters] = useState({
    status: '',
    officeId: '',
    teamId: '',
    agentUserId: '',
    from: '',
    to: '',
  });

  const [brokerages, setBrokerages] = useState<any[]>([]);
  const [offices, setOffices] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [memberships, setMemberships] = useState<any[]>([]);
  const [presets, setPresets] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [reviewQueue, setReviewQueue] = useState<any[]>([]);
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [reportData, setReportData] = useState<any | null>(null);
  const [jobDetail, setJobDetail] = useState<any | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(ACTOR_STORAGE_KEY, JSON.stringify(actor));
  }, [actor]);

  useEffect(() => {
    setTeamForm((prev) => (prev.officeId ? prev : { ...prev, officeId: actor.officeId }));
    setUserForm((prev) => ({
      ...prev,
      officeId: prev.officeId || actor.officeId,
      teamId: prev.teamId || actor.teamId,
    }));
    setMembershipForm((prev) => ({
      ...prev,
      officeId: prev.officeId || actor.officeId,
      teamId: prev.teamId || actor.teamId,
    }));
    setPresetForm((prev) => ({
      ...prev,
      scopeId: prev.scopeId || actor.brokerageId,
    }));
    setJobForm((prev) => ({
      ...prev,
      officeId: prev.officeId || actor.officeId,
      teamId: prev.teamId || actor.teamId,
      agentUserId: prev.agentUserId || actor.userId,
    }));
  }, [actor]);

  const actorHeadersPreview = useMemo(() => buildHeaders(actor, true), [actor]);

  const runJsonRequest = useCallback(
    async (
      path: string,
      options?: {
        method?: 'GET' | 'POST';
        query?: Record<string, string>;
        body?: Record<string, unknown>;
        includeBootstrapHeader?: boolean;
      }
    ): Promise<ApiResponse> => {
      const method = options?.method || 'GET';
      const query = options?.query || {};
      const body = options?.body;

      const params = new URLSearchParams();
      Object.entries(query).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      const url = params.toString() ? `${path}?${params.toString()}` : path;

      const headers = buildHeaders(actor, options?.includeBootstrapHeader);
      if (method !== 'GET') {
        headers['Content-Type'] = 'application/json';
      }

      const response = await fetch(url, {
        method,
        headers,
        body: method === 'GET' ? undefined : JSON.stringify(body || {}),
      });

      const payload = await response.json().catch(() => ({
        ok: false,
        error: {
          code: 'INVALID_RESPONSE',
          message: 'Could not parse server response as JSON',
        },
      }));

      return {
        ok: response.ok && payload?.ok !== false,
        status: response.status,
        payload,
      };
    },
    [actor]
  );

  const runCsvRequest = useCallback(
    async (type: 'jobs' | 'office-usage' | 'revisions') => {
      const params = new URLSearchParams({ type });
      if (reportFilters.status) params.set('status', reportFilters.status);
      if (reportFilters.officeId) params.set('officeId', reportFilters.officeId);
      if (reportFilters.teamId) params.set('teamId', reportFilters.teamId);
      if (reportFilters.agentUserId) params.set('agentUserId', reportFilters.agentUserId);
      if (reportFilters.from) params.set('from', reportFilters.from);
      if (reportFilters.to) params.set('to', reportFilters.to);

      const response = await fetch(`/api/pathb/report-export?${params.toString()}`, {
        method: 'GET',
        headers: buildHeaders(actor, false),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(parseApiError(payload, response.status));
      }

      const csv = await response.text();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const fileName = `pathb_${type}_${new Date().toISOString().slice(0, 10)}.csv`;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      return csv;
    },
    [actor, reportFilters]
  );

  const setResponseEnvelope = useCallback((label: string, payload: any) => {
    setLastResponse(
      JSON.stringify(
        {
          label,
          at: new Date().toISOString(),
          payload,
        },
        null,
        2
      )
    );
  }, []);

  const execute = useCallback(
    async (label: string, task: () => Promise<void>) => {
      setIsBusy(true);
      setErrorMessage('');
      setStatusMessage('');
      try {
        await task();
        setStatusMessage(`${label} completed.`);
      } catch (error: any) {
        setErrorMessage(error?.message || `Failed: ${label}`);
      } finally {
        setIsBusy(false);
      }
    },
    []
  );

  const refreshSnapshot = useCallback(async () => {
    await execute('Snapshot refresh', async () => {
      const [brokeragesRes, officesRes, usersRes, membershipsRes, presetsRes, jobsRes, queueRes, auditRes] =
        await Promise.all([
          runJsonRequest('/api/pathb/brokerages'),
          runJsonRequest('/api/pathb/offices'),
          runJsonRequest('/api/pathb/users'),
          runJsonRequest('/api/pathb/memberships'),
          runJsonRequest('/api/pathb/presets'),
          runJsonRequest('/api/pathb/jobs'),
          runJsonRequest('/api/pathb/review-queue', { query: { includeApprovals: 'true' } }),
          runJsonRequest('/api/pathb/audit-events', { query: { limit: '40' } }),
        ]);

      const maybeTeamsRes = actor.officeId
        ? await runJsonRequest('/api/pathb/teams', { query: { officeId: actor.officeId } })
        : null;
      const maybeReportRes = await runJsonRequest('/api/pathb/reports', {
        query: {
          status: reportFilters.status,
          officeId: reportFilters.officeId,
          teamId: reportFilters.teamId,
          agentUserId: reportFilters.agentUserId,
          from: reportFilters.from,
          to: reportFilters.to,
        },
      });

      const responses = [
        brokeragesRes,
        officesRes,
        usersRes,
        membershipsRes,
        presetsRes,
        jobsRes,
        queueRes,
        auditRes,
        ...(maybeTeamsRes ? [maybeTeamsRes] : []),
        maybeReportRes,
      ];

      const firstFailure = responses.find((result) => !result.ok);
      if (firstFailure) {
        throw new Error(parseApiError(firstFailure.payload, firstFailure.status));
      }

      setBrokerages(
        brokeragesRes.payload?.data?.brokerages ||
          (brokeragesRes.payload?.data?.brokerage ? [brokeragesRes.payload?.data?.brokerage] : [])
      );
      setOffices(officesRes.payload?.data?.offices || []);
      setUsers(usersRes.payload?.data?.users || []);
      setMemberships(membershipsRes.payload?.data?.memberships || []);
      setPresets(presetsRes.payload?.data?.presets || []);
      setJobs(jobsRes.payload?.data?.jobs || []);
      setReviewQueue(queueRes.payload?.data?.queue || []);
      setAuditEvents(auditRes.payload?.data?.events || []);
      setTeams(maybeTeamsRes?.payload?.data?.teams || []);
      setReportData(maybeReportRes.payload?.data || null);

      setResponseEnvelope('Snapshot refresh', {
        brokerages: brokeragesRes.payload?.data,
        offices: officesRes.payload?.data,
        users: usersRes.payload?.data,
        memberships: membershipsRes.payload?.data,
        presets: presetsRes.payload?.data,
        jobs: jobsRes.payload?.data,
        queue: queueRes.payload?.data,
        audits: auditRes.payload?.data,
        teams: maybeTeamsRes?.payload?.data || null,
        reports: maybeReportRes.payload?.data || null,
      });
    });
  }, [actor.officeId, execute, reportFilters, runJsonRequest, setResponseEnvelope]);

  const createBootstrap = async (event: React.FormEvent) => {
    event.preventDefault();
    await execute('Bootstrap', async () => {
      const response = await runJsonRequest('/api/pathb/bootstrap', {
        method: 'POST',
        body: {
          brokerageName: bootstrapForm.brokerageName.trim(),
          officeName: bootstrapForm.officeName.trim(),
          teamName: bootstrapForm.teamName.trim(),
          adminName: bootstrapForm.adminName.trim(),
          adminEmail: bootstrapForm.adminEmail.trim().toLowerCase(),
        },
        includeBootstrapHeader: true,
      });

      if (!response.ok) {
        throw new Error(parseApiError(response.payload, response.status));
      }

      const actorHeaders = response.payload?.data?.actorHeaders || {};
      setActor((prev) => ({
        ...prev,
        userId: actorHeaders['x-pathb-user-id'] || prev.userId,
        role: actorHeaders['x-pathb-role'] || prev.role,
        brokerageId: actorHeaders['x-pathb-brokerage-id'] || prev.brokerageId,
        officeId: actorHeaders['x-pathb-office-id'] || prev.officeId,
        teamId: actorHeaders['x-pathb-team-id'] || prev.teamId,
      }));
      setResponseEnvelope('Bootstrap', response.payload);
      setBootstrapForm({
        brokerageName: '',
        officeName: '',
        teamName: '',
        adminName: '',
        adminEmail: '',
      });
    });
  };

  const createOfficeAction = async (event: React.FormEvent) => {
    event.preventDefault();
    await execute('Create office', async () => {
      const response = await runJsonRequest('/api/pathb/offices', {
        method: 'POST',
        body: { name: officeName.trim() },
      });
      if (!response.ok) throw new Error(parseApiError(response.payload, response.status));
      setResponseEnvelope('Create office', response.payload);
      setOfficeName('');
      await refreshSnapshot();
    });
  };

  const createTeamAction = async (event: React.FormEvent) => {
    event.preventDefault();
    await execute('Create team', async () => {
      const response = await runJsonRequest('/api/pathb/teams', {
        method: 'POST',
        body: {
          officeId: teamForm.officeId.trim(),
          name: teamForm.name.trim(),
        },
      });
      if (!response.ok) throw new Error(parseApiError(response.payload, response.status));
      setResponseEnvelope('Create team', response.payload);
      setTeamForm({ ...teamForm, name: '' });
      await refreshSnapshot();
    });
  };

  const createUserAction = async (event: React.FormEvent) => {
    event.preventDefault();
    await execute('Create user', async () => {
      const response = await runJsonRequest('/api/pathb/users', {
        method: 'POST',
        body: {
          name: userForm.name.trim(),
          email: userForm.email.trim(),
          role: userForm.role,
          scopeType: userForm.scopeType,
          officeId: userForm.officeId.trim() || undefined,
          teamId: userForm.teamId.trim() || undefined,
        },
      });
      if (!response.ok) throw new Error(parseApiError(response.payload, response.status));
      setResponseEnvelope('Create user', response.payload);
      setUserForm((prev) => ({ ...prev, name: '', email: '' }));
      await refreshSnapshot();
    });
  };

  const createMembershipAction = async (event: React.FormEvent) => {
    event.preventDefault();
    await execute('Create membership', async () => {
      const response = await runJsonRequest('/api/pathb/memberships', {
        method: 'POST',
        body: {
          userId: membershipForm.userId.trim(),
          role: membershipForm.role,
          scopeType: membershipForm.scopeType,
          officeId: membershipForm.officeId.trim() || undefined,
          teamId: membershipForm.teamId.trim() || undefined,
        },
      });
      if (!response.ok) throw new Error(parseApiError(response.payload, response.status));
      setResponseEnvelope('Create membership', response.payload);
      await refreshSnapshot();
    });
  };

  const createPresetAction = async (event: React.FormEvent) => {
    event.preventDefault();
    await execute('Create preset', async () => {
      const allowedEditTypes = toList(presetForm.allowedEditTypesText).filter((label) =>
        EDIT_LABELS.includes(label)
      );

      const response = await runJsonRequest('/api/pathb/presets', {
        method: 'POST',
        body: {
          name: presetForm.name.trim(),
          scopeType: presetForm.scopeType,
          scopeId: presetForm.scopeId.trim(),
          allowedEditTypes,
          approvalRequired: presetForm.approvalRequired,
          disclosureRequiredDefault: presetForm.disclosureRequiredDefault,
          deliveryNotesTemplate: presetForm.deliveryNotesTemplate.trim(),
          revisionPolicyTemplate: presetForm.revisionPolicyTemplate.trim(),
          defaultSettingsJson: {},
        },
      });
      if (!response.ok) throw new Error(parseApiError(response.payload, response.status));
      setResponseEnvelope('Create preset', response.payload);
      setPresetForm((prev) => ({ ...prev, name: '' }));
      await refreshSnapshot();
    });
  };

  const createJobAction = async (event: React.FormEvent) => {
    event.preventDefault();
    await execute('Create job', async () => {
      const requestedEditCategories = toList(jobForm.requestedEditCategoriesText);
      const outputs: Array<Record<string, string>> = [];
      if (jobForm.assetUrl.trim()) {
        outputs.push({
          url: jobForm.assetUrl.trim(),
          name: jobForm.assetName.trim(),
          editLabel: jobForm.assetEditLabel.trim(),
        });
      }

      const response = await runJsonRequest('/api/pathb/jobs', {
        method: 'POST',
        body: {
          propertyAddress: jobForm.propertyAddress.trim(),
          mlsId: jobForm.mlsId.trim() || undefined,
          officeId: jobForm.officeId.trim(),
          teamId: jobForm.teamId.trim() || undefined,
          agentUserId: jobForm.agentUserId.trim(),
          selectedPresetId: jobForm.selectedPresetId.trim(),
          requestedEditCategories,
          requestedTurnaround: jobForm.requestedTurnaround.trim() || undefined,
          priority: jobForm.priority,
          notes: jobForm.notes.trim() || undefined,
          disclosureRelevant: jobForm.disclosureRelevant,
          submit: jobForm.submitNow,
          assets: outputs,
        },
      });
      if (!response.ok) throw new Error(parseApiError(response.payload, response.status));
      setResponseEnvelope('Create job', response.payload);
      setJobForm((prev) => ({ ...prev, propertyAddress: '', mlsId: '', notes: '', assetUrl: '', assetName: '' }));
      await refreshSnapshot();
    });
  };

  const runTransitionAction = async (event: React.FormEvent) => {
    event.preventDefault();
    await execute('Job transition', async () => {
      const response = await runJsonRequest('/api/pathb/job-transition', {
        method: 'POST',
        body: {
          jobId: transitionForm.jobId.trim(),
          toStatus: transitionForm.toStatus,
          reason: transitionForm.reason.trim() || undefined,
          note: transitionForm.note.trim() || undefined,
          revisionReasonCategory: transitionForm.revisionReasonCategory.trim() || undefined,
          outputAssetIds: toList(transitionForm.outputAssetIdsText),
        },
      });
      if (!response.ok) throw new Error(parseApiError(response.payload, response.status));
      setResponseEnvelope('Job transition', response.payload);
      await refreshSnapshot();
    });
  };

  const runApprovalAction = async (event: React.FormEvent) => {
    event.preventDefault();
    await execute('Approval decision', async () => {
      const response = await runJsonRequest('/api/pathb/approvals', {
        method: 'POST',
        body: {
          jobId: approvalForm.jobId.trim(),
          decision: approvalForm.decision,
          note: approvalForm.note.trim() || undefined,
        },
      });
      if (!response.ok) throw new Error(parseApiError(response.payload, response.status));
      setResponseEnvelope('Approval decision', response.payload);
      await refreshSnapshot();
    });
  };

  const runDeliveryAction = async (event: React.FormEvent) => {
    event.preventDefault();
    await execute('Create delivery', async () => {
      const outputs = toList(deliveryForm.outputsText).map((line) => ({
        url: line,
        name: null,
        editLabel: null,
      }));

      const response = await runJsonRequest('/api/pathb/deliveries', {
        method: 'POST',
        body: {
          jobId: deliveryForm.jobId.trim(),
          outputs,
          notes: deliveryForm.notes.trim() || undefined,
        },
      });
      if (!response.ok) throw new Error(parseApiError(response.payload, response.status));
      setResponseEnvelope('Create delivery', response.payload);
      await refreshSnapshot();
    });
  };

  const runRevisionAction = async (event: React.FormEvent) => {
    event.preventDefault();
    await execute('Create revision', async () => {
      const response = await runJsonRequest('/api/pathb/revisions', {
        method: 'POST',
        body: {
          jobId: revisionForm.jobId.trim(),
          reasonCategory: revisionForm.reasonCategory.trim(),
          notes: revisionForm.notes.trim() || undefined,
        },
      });
      if (!response.ok) throw new Error(parseApiError(response.payload, response.status));
      setResponseEnvelope('Create revision', response.payload);
      await refreshSnapshot();
    });
  };

  const loadJobDetail = async (event: React.FormEvent) => {
    event.preventDefault();
    await execute('Load job detail', async () => {
      const response = await runJsonRequest('/api/pathb/job-detail', {
        query: { jobId: jobDetailId.trim() },
      });
      if (!response.ok) throw new Error(parseApiError(response.payload, response.status));
      setJobDetail(response.payload?.data || null);
      setResponseEnvelope('Job detail', response.payload);
    });
  };

  const loadReports = async (event?: React.FormEvent) => {
    event?.preventDefault();
    await execute('Load reports', async () => {
      const response = await runJsonRequest('/api/pathb/reports', {
        query: {
          status: reportFilters.status,
          officeId: reportFilters.officeId,
          teamId: reportFilters.teamId,
          agentUserId: reportFilters.agentUserId,
          from: reportFilters.from,
          to: reportFilters.to,
        },
      });
      if (!response.ok) throw new Error(parseApiError(response.payload, response.status));
      setReportData(response.payload?.data || null);
      setResponseEnvelope('Reports', response.payload);
    });
  };

  const downloadReport = async (type: 'jobs' | 'office-usage' | 'revisions') => {
    await execute(`Download ${type} CSV`, async () => {
      await runCsvRequest(type);
      setResponseEnvelope(`Report export ${type}`, { ok: true, downloaded: true, type });
    });
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 pb-6">
      <section className="premium-surface-strong rounded-[1.5rem] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-text)]/70">Path B Operations</p>
            <h2 className="font-display text-2xl sm:text-3xl">Brokerage Ops Console</h2>
            <p className="mt-1 text-sm text-[var(--color-text)]/80">
              Internal admin surface for org setup, workflow testing, and reporting.
            </p>
          </div>
          <button
            type="button"
            onClick={refreshSnapshot}
            disabled={isBusy}
            className="cta-primary rounded-xl px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] disabled:opacity-50"
          >
            {isBusy ? 'Working...' : 'Refresh Snapshot'}
          </button>
        </div>

        {statusMessage && (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {statusMessage}
          </p>
        )}
        {errorMessage && (
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
            {errorMessage}
          </p>
        )}
      </section>

      <section className="premium-surface rounded-[1.5rem] p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl">Request Context</h3>
          <p className="text-xs text-[var(--color-text)]/75">Headers are required for all Path B endpoints.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          <input
            value={actor.userId}
            onChange={(event) => setActor((prev) => ({ ...prev, userId: event.target.value }))}
            placeholder="x-pathb-user-id"
            className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
          />
          <select
            value={actor.role}
            onChange={(event) => setActor((prev) => ({ ...prev, role: event.target.value as PathBRole }))}
            className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
          >
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <input
            value={actor.brokerageId}
            onChange={(event) => setActor((prev) => ({ ...prev, brokerageId: event.target.value }))}
            placeholder="x-pathb-brokerage-id"
            className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
          />
          <input
            value={actor.officeId}
            onChange={(event) => setActor((prev) => ({ ...prev, officeId: event.target.value }))}
            placeholder="x-pathb-office-id (optional)"
            className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
          />
          <input
            value={actor.teamId}
            onChange={(event) => setActor((prev) => ({ ...prev, teamId: event.target.value }))}
            placeholder="x-pathb-team-id (optional)"
            className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
          />
          <input
            value={actor.bootstrapKey}
            onChange={(event) => setActor((prev) => ({ ...prev, bootstrapKey: event.target.value }))}
            placeholder="x-pathb-bootstrap-key (bootstrap only)"
            className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
          />
        </div>
        <pre className="max-h-40 overflow-auto rounded-xl border border-[var(--color-border)] bg-slate-950 text-slate-100 p-3 text-xs">
{JSON.stringify(actorHeadersPreview, null, 2)}
        </pre>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <form onSubmit={createBootstrap} className="premium-surface rounded-[1.5rem] p-4 sm:p-5 space-y-3">
          <h3 className="font-display text-xl">Bootstrap</h3>
          <p className="text-xs text-[var(--color-text)]/74">
            Creates first brokerage, office, optional team, admin user, and returns actor headers.
          </p>
          <input
            value={bootstrapForm.brokerageName}
            onChange={(event) => setBootstrapForm((prev) => ({ ...prev, brokerageName: event.target.value }))}
            placeholder="Brokerage name"
            className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
          />
          <input
            value={bootstrapForm.officeName}
            onChange={(event) => setBootstrapForm((prev) => ({ ...prev, officeName: event.target.value }))}
            placeholder="Office name"
            className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
          />
          <input
            value={bootstrapForm.teamName}
            onChange={(event) => setBootstrapForm((prev) => ({ ...prev, teamName: event.target.value }))}
            placeholder="Team name (optional)"
            className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={bootstrapForm.adminName}
              onChange={(event) => setBootstrapForm((prev) => ({ ...prev, adminName: event.target.value }))}
              placeholder="Admin full name"
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
            />
            <input
              value={bootstrapForm.adminEmail}
              onChange={(event) => setBootstrapForm((prev) => ({ ...prev, adminEmail: event.target.value }))}
              placeholder="Admin email"
              type="email"
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
            />
          </div>
          <button type="submit" disabled={isBusy} className="cta-primary rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50">
            Run Bootstrap
          </button>
        </form>

        <div className="premium-surface rounded-[1.5rem] p-4 sm:p-5 space-y-3">
          <h3 className="font-display text-xl">Snapshot</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <div className="rounded-xl border border-[var(--color-border)] bg-white/75 px-3 py-2">
              <p className="uppercase tracking-[0.11em] text-[var(--color-text)]/70">Brokerages</p>
              <p className="text-lg font-semibold">{brokerages.length}</p>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-white/75 px-3 py-2">
              <p className="uppercase tracking-[0.11em] text-[var(--color-text)]/70">Offices</p>
              <p className="text-lg font-semibold">{offices.length}</p>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-white/75 px-3 py-2">
              <p className="uppercase tracking-[0.11em] text-[var(--color-text)]/70">Teams</p>
              <p className="text-lg font-semibold">{teams.length}</p>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-white/75 px-3 py-2">
              <p className="uppercase tracking-[0.11em] text-[var(--color-text)]/70">Users</p>
              <p className="text-lg font-semibold">{users.length}</p>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-white/75 px-3 py-2">
              <p className="uppercase tracking-[0.11em] text-[var(--color-text)]/70">Presets</p>
              <p className="text-lg font-semibold">{presets.length}</p>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-white/75 px-3 py-2">
              <p className="uppercase tracking-[0.11em] text-[var(--color-text)]/70">Jobs</p>
              <p className="text-lg font-semibold">{jobs.length}</p>
            </div>
          </div>
          <p className="text-xs text-[var(--color-text)]/74">
            Queue items: {reviewQueue.length} · Audit events loaded: {auditEvents.length}
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <form onSubmit={createOfficeAction} className="premium-surface rounded-[1.5rem] p-4 sm:p-5 space-y-3">
          <h3 className="font-display text-xl">Org: Office + Team</h3>
          <input
            value={officeName}
            onChange={(event) => setOfficeName(event.target.value)}
            placeholder="New office name"
            className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
          />
          <button type="submit" disabled={isBusy} className="cta-secondary rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50">
            Create Office
          </button>
          <div className="h-px bg-[var(--color-border)]" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={teamForm.officeId}
              onChange={(event) => setTeamForm((prev) => ({ ...prev, officeId: event.target.value }))}
              placeholder="Office ID"
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
            />
            <input
              value={teamForm.name}
              onChange={(event) => setTeamForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Team name"
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={createTeamAction}
            disabled={isBusy}
            className="cta-secondary rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Create Team
          </button>
        </form>

        <form onSubmit={createUserAction} className="premium-surface rounded-[1.5rem] p-4 sm:p-5 space-y-3">
          <h3 className="font-display text-xl">Users + Memberships</h3>
          <input
            value={userForm.name}
            onChange={(event) => setUserForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="User name"
            className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
          />
          <input
            value={userForm.email}
            onChange={(event) => setUserForm((prev) => ({ ...prev, email: event.target.value }))}
            placeholder="User email"
            type="email"
            className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select
              value={userForm.role}
              onChange={(event) => setUserForm((prev) => ({ ...prev, role: event.target.value as PathBRole }))}
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <select
              value={userForm.scopeType}
              onChange={(event) => setUserForm((prev) => ({ ...prev, scopeType: event.target.value as ScopeType }))}
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
            >
              {SCOPE_OPTIONS.map((scopeType) => (
                <option key={scopeType} value={scopeType}>
                  {scopeType}
                </option>
              ))}
            </select>
            <input
              value={userForm.officeId}
              onChange={(event) => setUserForm((prev) => ({ ...prev, officeId: event.target.value }))}
              placeholder="Office ID"
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
            />
            <input
              value={userForm.teamId}
              onChange={(event) => setUserForm((prev) => ({ ...prev, teamId: event.target.value }))}
              placeholder="Team ID"
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
            />
          </div>
          <button type="submit" disabled={isBusy} className="cta-secondary rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50">
            Create User
          </button>

          <div className="h-px bg-[var(--color-border)]" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={membershipForm.userId}
              onChange={(event) => setMembershipForm((prev) => ({ ...prev, userId: event.target.value }))}
              placeholder="Existing user ID"
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
            />
            <select
              value={membershipForm.role}
              onChange={(event) => setMembershipForm((prev) => ({ ...prev, role: event.target.value as PathBRole }))}
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
            >
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <select
              value={membershipForm.scopeType}
              onChange={(event) => setMembershipForm((prev) => ({ ...prev, scopeType: event.target.value as ScopeType }))}
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
            >
              {SCOPE_OPTIONS.map((scopeType) => (
                <option key={scopeType} value={scopeType}>
                  {scopeType}
                </option>
              ))}
            </select>
            <input
              value={membershipForm.officeId}
              onChange={(event) => setMembershipForm((prev) => ({ ...prev, officeId: event.target.value }))}
              placeholder="Office ID"
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
            />
            <input
              value={membershipForm.teamId}
              onChange={(event) => setMembershipForm((prev) => ({ ...prev, teamId: event.target.value }))}
              placeholder="Team ID"
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={createMembershipAction}
            disabled={isBusy}
            className="cta-secondary rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Attach Membership
          </button>
        </form>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <form onSubmit={createPresetAction} className="premium-surface rounded-[1.5rem] p-4 sm:p-5 space-y-3">
          <h3 className="font-display text-xl">Preset Management</h3>
          <input
            value={presetForm.name}
            onChange={(event) => setPresetForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Preset name"
            className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select
              value={presetForm.scopeType}
              onChange={(event) =>
                setPresetForm((prev) => ({
                  ...prev,
                  scopeType: event.target.value as 'brokerage' | 'office',
                }))
              }
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
            >
              <option value="brokerage">brokerage</option>
              <option value="office">office</option>
            </select>
            <input
              value={presetForm.scopeId}
              onChange={(event) => setPresetForm((prev) => ({ ...prev, scopeId: event.target.value }))}
              placeholder="Scope ID"
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
            />
          </div>
          <textarea
            value={presetForm.allowedEditTypesText}
            onChange={(event) => setPresetForm((prev) => ({ ...prev, allowedEditTypesText: event.target.value }))}
            placeholder="Allowed edit labels (one per line)"
            className="w-full min-h-[88px] rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <label className="rounded-xl border border-[var(--color-border)] bg-white/75 px-3 py-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={presetForm.approvalRequired}
                onChange={(event) => setPresetForm((prev) => ({ ...prev, approvalRequired: event.target.checked }))}
              />
              Approval required
            </label>
            <label className="rounded-xl border border-[var(--color-border)] bg-white/75 px-3 py-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={presetForm.disclosureRequiredDefault}
                onChange={(event) =>
                  setPresetForm((prev) => ({ ...prev, disclosureRequiredDefault: event.target.checked }))
                }
              />
              Disclosure required
            </label>
          </div>
          <textarea
            value={presetForm.deliveryNotesTemplate}
            onChange={(event) => setPresetForm((prev) => ({ ...prev, deliveryNotesTemplate: event.target.value }))}
            placeholder="Delivery notes template"
            className="w-full min-h-[70px] rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
          />
          <textarea
            value={presetForm.revisionPolicyTemplate}
            onChange={(event) => setPresetForm((prev) => ({ ...prev, revisionPolicyTemplate: event.target.value }))}
            placeholder="Revision policy template"
            className="w-full min-h-[70px] rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
          />
          <button type="submit" disabled={isBusy} className="cta-secondary rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50">
            Create Preset
          </button>
        </form>

        <form onSubmit={createJobAction} className="premium-surface rounded-[1.5rem] p-4 sm:p-5 space-y-3">
          <h3 className="font-display text-xl">Job Intake</h3>
          <input
            value={jobForm.propertyAddress}
            onChange={(event) => setJobForm((prev) => ({ ...prev, propertyAddress: event.target.value }))}
            placeholder="Property address"
            className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={jobForm.mlsId}
              onChange={(event) => setJobForm((prev) => ({ ...prev, mlsId: event.target.value }))}
              placeholder="MLS ID (optional)"
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
            />
            <select
              value={jobForm.priority}
              onChange={(event) => setJobForm((prev) => ({ ...prev, priority: event.target.value as JobPriority }))}
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
            >
              {PRIORITY_OPTIONS.map((priority) => (
                <option key={priority} value={priority}>
                  {priority}
                </option>
              ))}
            </select>
            <input
              value={jobForm.officeId}
              onChange={(event) => setJobForm((prev) => ({ ...prev, officeId: event.target.value }))}
              placeholder="Office ID"
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
            />
            <input
              value={jobForm.teamId}
              onChange={(event) => setJobForm((prev) => ({ ...prev, teamId: event.target.value }))}
              placeholder="Team ID (optional)"
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
            />
            <input
              value={jobForm.agentUserId}
              onChange={(event) => setJobForm((prev) => ({ ...prev, agentUserId: event.target.value }))}
              placeholder="Agent user ID"
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
            />
            <input
              value={jobForm.selectedPresetId}
              onChange={(event) => setJobForm((prev) => ({ ...prev, selectedPresetId: event.target.value }))}
              placeholder="Preset ID"
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
            />
          </div>
          <textarea
            value={jobForm.requestedEditCategoriesText}
            onChange={(event) => setJobForm((prev) => ({ ...prev, requestedEditCategoriesText: event.target.value }))}
            placeholder="Requested edit categories (one per line)"
            className="w-full min-h-[78px] rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
          />
          <input
            value={jobForm.requestedTurnaround}
            onChange={(event) => setJobForm((prev) => ({ ...prev, requestedTurnaround: event.target.value }))}
            placeholder="Requested turnaround (e.g. 24h)"
            className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
          />
          <textarea
            value={jobForm.notes}
            onChange={(event) => setJobForm((prev) => ({ ...prev, notes: event.target.value }))}
            placeholder="Notes"
            className="w-full min-h-[68px] rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              value={jobForm.assetUrl}
              onChange={(event) => setJobForm((prev) => ({ ...prev, assetUrl: event.target.value }))}
              placeholder="Original asset URL (optional)"
              className="sm:col-span-2 rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
            />
            <input
              value={jobForm.assetName}
              onChange={(event) => setJobForm((prev) => ({ ...prev, assetName: event.target.value }))}
              placeholder="Asset name"
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
            />
          </div>
          <label className="rounded-xl border border-[var(--color-border)] bg-white/75 px-3 py-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={jobForm.submitNow}
              onChange={(event) => setJobForm((prev) => ({ ...prev, submitNow: event.target.checked }))}
            />
            Submit now (otherwise stays Draft)
          </label>
          <button type="submit" disabled={isBusy} className="cta-secondary rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50">
            Create Job
          </button>
        </form>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <form onSubmit={runTransitionAction} className="premium-surface rounded-[1.5rem] p-4 sm:p-5 space-y-3">
          <h3 className="font-display text-xl">Workflow Actions</h3>
          <input
            value={transitionForm.jobId}
            onChange={(event) => setTransitionForm((prev) => ({ ...prev, jobId: event.target.value }))}
            placeholder="Job ID"
            className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
          />
          <select
            value={transitionForm.toStatus}
            onChange={(event) => setTransitionForm((prev) => ({ ...prev, toStatus: event.target.value }))}
            className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <input
            value={transitionForm.reason}
            onChange={(event) => setTransitionForm((prev) => ({ ...prev, reason: event.target.value }))}
            placeholder="Reason (required in restricted transitions)"
            className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
          />
          <input
            value={transitionForm.revisionReasonCategory}
            onChange={(event) => setTransitionForm((prev) => ({ ...prev, revisionReasonCategory: event.target.value }))}
            placeholder="Revision reason category (if Revision Requested)"
            className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
          />
          <textarea
            value={transitionForm.outputAssetIdsText}
            onChange={(event) => setTransitionForm((prev) => ({ ...prev, outputAssetIdsText: event.target.value }))}
            placeholder="Output asset IDs (one per line, for Delivered)"
            className="w-full min-h-[70px] rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
          />
          <textarea
            value={transitionForm.note}
            onChange={(event) => setTransitionForm((prev) => ({ ...prev, note: event.target.value }))}
            placeholder="Optional note"
            className="w-full min-h-[70px] rounded-xl border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm"
          />
          <button type="submit" disabled={isBusy} className="cta-secondary rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50">
            Apply Transition
          </button>
        </form>

        <div className="premium-surface rounded-[1.5rem] p-4 sm:p-5 space-y-4">
          <form onSubmit={runApprovalAction} className="space-y-2">
            <h4 className="font-semibold text-sm uppercase tracking-[0.12em] text-[var(--color-text)]/76">Approval</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                value={approvalForm.jobId}
                onChange={(event) => setApprovalForm((prev) => ({ ...prev, jobId: event.target.value }))}
                placeholder="Job ID"
                className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
              />
              <select
                value={approvalForm.decision}
                onChange={(event) => setApprovalForm((prev) => ({ ...prev, decision: event.target.value }))}
                className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
              >
                <option value="approve">approve</option>
                <option value="reject">reject</option>
                <option value="request_changes">request_changes</option>
              </select>
              <button type="submit" disabled={isBusy} className="cta-secondary rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-50">
                Submit
              </button>
            </div>
            <input
              value={approvalForm.note}
              onChange={(event) => setApprovalForm((prev) => ({ ...prev, note: event.target.value }))}
              placeholder="Decision note"
              className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
            />
          </form>

          <form onSubmit={runDeliveryAction} className="space-y-2">
            <h4 className="font-semibold text-sm uppercase tracking-[0.12em] text-[var(--color-text)]/76">Delivery</h4>
            <input
              value={deliveryForm.jobId}
              onChange={(event) => setDeliveryForm((prev) => ({ ...prev, jobId: event.target.value }))}
              placeholder="Job ID"
              className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
            />
            <textarea
              value={deliveryForm.outputsText}
              onChange={(event) => setDeliveryForm((prev) => ({ ...prev, outputsText: event.target.value }))}
              placeholder="Output URLs (one per line)"
              className="w-full min-h-[70px] rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
            />
            <input
              value={deliveryForm.notes}
              onChange={(event) => setDeliveryForm((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="Delivery notes"
              className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
            />
            <button type="submit" disabled={isBusy} className="cta-secondary rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-50">
              Create Delivery
            </button>
          </form>

          <form onSubmit={runRevisionAction} className="space-y-2">
            <h4 className="font-semibold text-sm uppercase tracking-[0.12em] text-[var(--color-text)]/76">Revision</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                value={revisionForm.jobId}
                onChange={(event) => setRevisionForm((prev) => ({ ...prev, jobId: event.target.value }))}
                placeholder="Job ID"
                className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
              />
              <input
                value={revisionForm.reasonCategory}
                onChange={(event) => setRevisionForm((prev) => ({ ...prev, reasonCategory: event.target.value }))}
                placeholder="Reason category"
                className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
              />
            </div>
            <input
              value={revisionForm.notes}
              onChange={(event) => setRevisionForm((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="Revision notes"
              className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
            />
            <button type="submit" disabled={isBusy} className="cta-secondary rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-50">
              Request Revision
            </button>
          </form>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="premium-surface rounded-[1.5rem] p-4 sm:p-5 space-y-3">
          <h3 className="font-display text-xl">Job Detail + Queue</h3>
          <form onSubmit={loadJobDetail} className="flex flex-col sm:flex-row gap-2">
            <input
              value={jobDetailId}
              onChange={(event) => setJobDetailId(event.target.value)}
              placeholder="Job ID"
              className="flex-1 rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
            />
            <button type="submit" disabled={isBusy} className="cta-secondary rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50">
              Load Detail
            </button>
          </form>
          <div className="max-h-48 overflow-auto space-y-2">
            {reviewQueue.length === 0 ? (
              <p className="text-xs text-[var(--color-text)]/75">No jobs currently in review queue.</p>
            ) : (
              reviewQueue.slice(0, 8).map((job) => (
                <div key={job.id} className="rounded-xl border border-[var(--color-border)] bg-white/80 px-3 py-2 text-xs">
                  <p className="font-semibold text-[var(--color-ink)]">{job.id}</p>
                  <p className="text-[var(--color-text)]/78">
                    {job.propertyAddress} · {job.status}
                  </p>
                </div>
              ))
            )}
          </div>
          {jobDetail && (
            <div className="rounded-xl border border-[var(--color-border)] bg-white/75 px-3 py-2 text-xs space-y-1">
              <p>
                <strong>Job:</strong> {jobDetail.job?.id}
              </p>
              <p>
                <strong>Status:</strong> {jobDetail.job?.status}
              </p>
              <p>
                <strong>Assets:</strong> {jobDetail.assets?.length || 0}
              </p>
              <p>
                <strong>Approvals:</strong> {jobDetail.approvals?.length || 0}
              </p>
              <p>
                <strong>Revisions:</strong> {jobDetail.revisions?.length || 0}
              </p>
              <p>
                <strong>Deliveries:</strong> {jobDetail.deliveries?.length || 0}
              </p>
            </div>
          )}
        </div>

        <form onSubmit={loadReports} className="premium-surface rounded-[1.5rem] p-4 sm:p-5 space-y-3">
          <h3 className="font-display text-xl">Reporting + Exports</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              value={reportFilters.status}
              onChange={(event) => setReportFilters((prev) => ({ ...prev, status: event.target.value }))}
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <input
              value={reportFilters.officeId}
              onChange={(event) => setReportFilters((prev) => ({ ...prev, officeId: event.target.value }))}
              placeholder="Office ID"
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
            />
            <input
              value={reportFilters.teamId}
              onChange={(event) => setReportFilters((prev) => ({ ...prev, teamId: event.target.value }))}
              placeholder="Team ID"
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
            />
            <input
              value={reportFilters.agentUserId}
              onChange={(event) => setReportFilters((prev) => ({ ...prev, agentUserId: event.target.value }))}
              placeholder="Agent User ID"
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={reportFilters.from}
              onChange={(event) => setReportFilters((prev) => ({ ...prev, from: event.target.value }))}
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={reportFilters.to}
              onChange={(event) => setReportFilters((prev) => ({ ...prev, to: event.target.value }))}
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={isBusy} className="cta-secondary rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50">
              Load Report
            </button>
            <button
              type="button"
              onClick={() => downloadReport('jobs')}
              disabled={isBusy}
              className="cta-secondary rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] disabled:opacity-50"
            >
              Jobs CSV
            </button>
            <button
              type="button"
              onClick={() => downloadReport('office-usage')}
              disabled={isBusy}
              className="cta-secondary rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] disabled:opacity-50"
            >
              Office CSV
            </button>
            <button
              type="button"
              onClick={() => downloadReport('revisions')}
              disabled={isBusy}
              className="cta-secondary rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] disabled:opacity-50"
            >
              Revisions CSV
            </button>
          </div>
          {reportData && (
            <div className="rounded-xl border border-[var(--color-border)] bg-white/75 px-3 py-2 text-xs">
              <p>
                <strong>Jobs:</strong> {reportData?.totals?.jobsCount ?? 0}
              </p>
              <p>
                <strong>Submitted:</strong> {reportData?.totals?.jobsSubmitted ?? 0}
              </p>
              <p>
                <strong>Completed:</strong> {reportData?.totals?.jobsCompleted ?? 0}
              </p>
              <p>
                <strong>Avg turnaround hours:</strong> {reportData?.totals?.averageTurnaroundHours ?? 0}
              </p>
              <p>
                <strong>Revision rate:</strong> {reportData?.totals?.revisionRate ?? 0}%
              </p>
            </div>
          )}
        </form>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="premium-surface rounded-[1.5rem] p-4 sm:p-5">
          <h3 className="font-display text-xl">Latest Jobs</h3>
          <div className="mt-3 max-h-64 overflow-auto space-y-2">
            {jobs.length === 0 ? (
              <p className="text-xs text-[var(--color-text)]/75">No jobs loaded.</p>
            ) : (
              jobs.slice(0, 12).map((job) => (
                <div key={job.id} className="rounded-xl border border-[var(--color-border)] bg-white/80 px-3 py-2 text-xs">
                  <p className="font-semibold text-[var(--color-ink)]">{job.propertyAddress}</p>
                  <p className="text-[var(--color-text)]/78">
                    {job.id} · {job.status} · {job.priority}
                  </p>
                  <p className="text-[var(--color-text)]/68">Updated: {renderTime(job.updatedAt)}</p>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="premium-surface rounded-[1.5rem] p-4 sm:p-5">
          <h3 className="font-display text-xl">Response Inspector</h3>
          <pre className="mt-3 max-h-64 overflow-auto rounded-xl border border-[var(--color-border)] bg-slate-950 text-slate-100 p-3 text-xs">
{lastResponse || '{\n  "hint": "Run an action to inspect payloads."\n}'}
          </pre>
        </div>
      </section>
    </div>
  );
};

export default PathBOpsPanel;
