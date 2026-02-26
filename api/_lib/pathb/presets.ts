import { buildAuditEvent } from './audit';
import { getActorFromRequest } from './context';
import { PathBApiError } from './errors';
import { getRequestId, handlePathBError, json, parseBody, setCors, withCorsPreflight } from './http';
import { assertPermission, assertTenantScope, hasPermission } from './rbac';
import { appendAuditEvent, createPreset, getOffice, listPresetsByBrokerage, listPresetsByOffice } from './store';
import { EditLabel, PresetRecord } from './types';

const EDIT_LABELS: EditLabel[] = [
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

const sanitizeEditLabels = (values: unknown): EditLabel[] => {
  if (!Array.isArray(values)) return [];
  const list = values
    .map((v) => String(v || '').trim())
    .filter((v): v is EditLabel => (EDIT_LABELS as readonly string[]).includes(v));
  return Array.from(new Set(list));
};

export default async function handler(req: any, res: any) {
  setCors(res, 'GET,POST,OPTIONS');
  if (withCorsPreflight(req, res)) return;

  const requestId = getRequestId(req);

  try {
    const actor = getActorFromRequest(req);
    assertTenantScope(actor, { brokerageId: actor.brokerageId, officeId: actor.officeId, teamId: actor.teamId });

    if (req.method === 'GET') {
      if (!hasPermission(actor.role, 'create:job') && !hasPermission(actor.role, 'manage:office-presets')) {
        throw new PathBApiError('FORBIDDEN', 'Role is not allowed to view presets');
      }

      const includeInactive = String(req.query?.includeInactive || '').toLowerCase() === 'true';
      const brokeragePresets = await listPresetsByBrokerage(actor.brokerageId);
      const officePresets = actor.officeId ? await listPresetsByOffice(actor.officeId) : [];

      const mergedById = new Map<string, PresetRecord>();
      for (const preset of [...brokeragePresets, ...officePresets]) {
        if (!includeInactive && !preset.active) continue;
        mergedById.set(preset.id, preset);
      }

      json(res, 200, { ok: true, data: { presets: Array.from(mergedById.values()) }, requestId });
      return;
    }

    if (req.method === 'POST') {
      const body = parseBody(req.body);
      const scopeType = String(body.scopeType || '').trim() as PresetRecord['scopeType'];
      const name = String(body.name || '').trim();
      const scopeId = String(body.scopeId || '').trim();
      const allowedEditTypes = sanitizeEditLabels(body.allowedEditTypes);
      const active = body.active !== false;
      const approvalRequired = Boolean(body.approvalRequired);
      const disclosureRequiredDefault = Boolean(body.disclosureRequiredDefault);
      const defaultSettingsJson =
        body.defaultSettingsJson && typeof body.defaultSettingsJson === 'object' ? body.defaultSettingsJson : {};
      const deliveryNotesTemplate = String(body.deliveryNotesTemplate || '').trim();
      const revisionPolicyTemplate = String(body.revisionPolicyTemplate || '').trim();

      if (!name || !scopeId || !scopeType) {
        throw new PathBApiError('VALIDATION_FAILED', 'name, scopeType, and scopeId are required');
      }
      if (allowedEditTypes.length === 0) {
        throw new PathBApiError('VALIDATION_FAILED', 'At least one allowedEditType is required');
      }

      let officeId: string | null = null;
      if (scopeType === 'brokerage') {
        assertPermission(actor.role, 'manage:brokerage-presets');
        if (scopeId !== actor.brokerageId) {
          throw new PathBApiError('TENANT_SCOPE_VIOLATION', 'scopeId must match actor brokerageId for brokerage presets');
        }
      } else if (scopeType === 'office') {
        assertPermission(actor.role, 'manage:office-presets');
        const office = await getOffice(scopeId);
        if (!office) throw new PathBApiError('NOT_FOUND', 'Office not found', { officeId: scopeId });
        assertTenantScope(actor, { brokerageId: office.brokerageId, officeId: office.id });
        if (actor.role === 'OfficeAdmin' && actor.officeId && actor.officeId !== office.id) {
          throw new PathBApiError('FORBIDDEN', 'OfficeAdmin can only manage presets in their own office');
        }
        officeId = office.id;
      } else {
        throw new PathBApiError('VALIDATION_FAILED', 'scopeType must be brokerage or office');
      }

      const preset = await createPreset({
        brokerageId: actor.brokerageId,
        officeId,
        name,
        scopeType,
        scopeId,
        active,
        allowedEditTypes,
        defaultSettingsJson,
        approvalRequired,
        disclosureRequiredDefault,
        deliveryNotesTemplate,
        revisionPolicyTemplate,
        createdBy: actor.userId,
      });

      await appendAuditEvent(
        actor.brokerageId,
        buildAuditEvent({
          eventType: 'PRESET_CREATED',
          actor,
          scope: { brokerageId: actor.brokerageId, officeId },
          source: 'api',
          targetEntityType: 'preset',
          targetEntityId: preset.id,
          afterSnapshot: preset,
        })
      );

      json(res, 200, { ok: true, data: { preset }, requestId });
      return;
    }

    json(res, 405, {
      ok: false,
      error: { code: 'VALIDATION_FAILED', message: 'Method not allowed', details: {} },
      requestId,
    });
  } catch (error) {
    handlePathBError(res, requestId, error);
  }
}
