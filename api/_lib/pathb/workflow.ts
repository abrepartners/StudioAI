import { PathBApiError } from './errors';
import { JobStatus, TransitionActorRole, TransitionMetadata } from './types';

export interface TransitionRule {
  from: JobStatus;
  to: JobStatus;
  allowedActors: readonly TransitionActorRole[];
  reasonRequired?: boolean;
  requiresOutputAssets?: boolean;
  requiresRevisionReasonCategory?: boolean;
}

export const WORKFLOW_TRANSITION_RULES: readonly TransitionRule[] = [
  { from: 'Draft', to: 'Submitted', allowedActors: ['Agent', 'OfficeAdmin', 'BrokerageAdmin'] },
  { from: 'Submitted', to: 'In Review', allowedActors: ['System'] },
  { from: 'Submitted', to: 'Approved for Processing', allowedActors: ['System'] },
  { from: 'In Review', to: 'Approved for Processing', allowedActors: ['Reviewer', 'OfficeAdmin', 'TeamLead'] },
  { from: 'In Review', to: 'Rejected', allowedActors: ['Reviewer', 'OfficeAdmin', 'TeamLead'], reasonRequired: true },
  { from: 'In Review', to: 'Draft', allowedActors: ['Reviewer', 'OfficeAdmin', 'TeamLead'], reasonRequired: true },
  { from: 'Approved for Processing', to: 'Processing', allowedActors: ['MediaPartner', 'Reviewer', 'System'] },
  { from: 'Processing', to: 'Delivered', allowedActors: ['MediaPartner', 'Reviewer', 'OfficeAdmin'], requiresOutputAssets: true },
  { from: 'Delivered', to: 'Revision Requested', allowedActors: ['Agent', 'TeamLead', 'OfficeAdmin', 'BrokerageAdmin'], requiresRevisionReasonCategory: true },
  { from: 'Delivered', to: 'Completed', allowedActors: ['Agent', 'OfficeAdmin', 'BrokerageAdmin', 'System'] },
  { from: 'Revision Requested', to: 'Processing', allowedActors: ['MediaPartner', 'Reviewer'] },
  { from: 'Revision Requested', to: 'Cancelled', allowedActors: ['OfficeAdmin', 'BrokerageAdmin'], reasonRequired: true },
  { from: 'Rejected', to: 'Draft', allowedActors: ['Agent', 'OfficeAdmin'] },
  { from: 'Submitted', to: 'Cancelled', allowedActors: ['Agent', 'OfficeAdmin', 'BrokerageAdmin'], reasonRequired: true },
  { from: 'Processing', to: 'Cancelled', allowedActors: ['OfficeAdmin', 'BrokerageAdmin'], reasonRequired: true },
];

const transitionRuleKey = (from: JobStatus, to: JobStatus) => `${from}=>${to}`;

const TRANSITION_RULE_MAP = new Map<string, TransitionRule>(
  WORKFLOW_TRANSITION_RULES.map((rule) => [transitionRuleKey(rule.from, rule.to), rule])
);

export const getTransitionRule = (from: JobStatus, to: JobStatus) =>
  TRANSITION_RULE_MAP.get(transitionRuleKey(from, to)) || null;

export const validateTransition = (
  from: JobStatus,
  to: JobStatus,
  actorRole: TransitionActorRole,
  metadata: TransitionMetadata = {}
) => {
  const rule = getTransitionRule(from, to);
  if (!rule) {
    return {
      ok: false as const,
      code: 'INVALID_TRANSITION' as const,
      message: `Transition ${from} -> ${to} is not allowed`,
    };
  }

  if (!rule.allowedActors.includes(actorRole)) {
    return {
      ok: false as const,
      code: 'FORBIDDEN' as const,
      message: `Role ${actorRole} cannot transition ${from} -> ${to}`,
    };
  }

  if (rule.reasonRequired && !metadata.reason?.trim()) {
    return {
      ok: false as const,
      code: 'VALIDATION_FAILED' as const,
      message: 'Transition reason is required',
    };
  }

  if (rule.requiresOutputAssets && (!metadata.outputAssetIds || metadata.outputAssetIds.length === 0)) {
    return {
      ok: false as const,
      code: 'VALIDATION_FAILED' as const,
      message: 'Delivered transition requires output asset ids',
    };
  }

  if (rule.requiresRevisionReasonCategory && !metadata.revisionReasonCategory?.trim()) {
    return {
      ok: false as const,
      code: 'VALIDATION_FAILED' as const,
      message: 'Revision requested transition requires revision reason category',
    };
  }

  return {
    ok: true as const,
    rule,
  };
};

export const assertTransition = (
  from: JobStatus,
  to: JobStatus,
  actorRole: TransitionActorRole,
  metadata: TransitionMetadata = {}
) => {
  const result = validateTransition(from, to, actorRole, metadata);
  if (!result.ok) {
    throw new PathBApiError(result.code, result.message, {
      from,
      to,
      actorRole,
      metadata,
    });
  }

  return result.rule;
};
