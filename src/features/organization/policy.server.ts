import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { requireGovernancePolicy } from '$lib/access/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';
import { isFeatureKey, FEATURE_KEYS, type FeatureKey } from '$lib/access/featureSwitches';
import {
	ARCHIVE_RETENTION_CONSTRAINT,
	LOSS_WARNING_CONSTRAINT,
	STRENGTH_FLOOR_CONSTRAINT,
	TRAINING_READINESS_GOAL_CONSTRAINT
} from './policyConstraints';
import type {
	OrganizationPolicyChanges,
	OrganizationPolicyWritePort,
	OrganizationSettingsInput
} from './settingsTypes';

type PolicyPorts = {
	auth: OrganizationAccessGrant;
	audit: PolicyAuditSink;
	organizationPolicyWrite: OrganizationPolicyWritePort;
};

function parseWholeNumber(value: unknown, message: string, range: { min: number; max: number }): number | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== 'number' || !Number.isFinite(value)) fail(400, message);
	const rounded = Math.round(value);
	if (rounded < range.min || rounded > range.max) fail(400, message);
	return rounded;
}

function parseInteger(
	value: unknown,
	message: string,
	range: { min: number; max: number },
	field?: string
): number | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== 'number' || !Number.isInteger(value) || value < range.min || value > range.max)
		fail(400, message, field ? { reason: `field:${field}` } : undefined);
	return value;
}

function parseFeatureKeys(value: unknown): FeatureKey[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || !value.every(isFeatureKey)) {
		fail(400, `Disabled features must be any of ${FEATURE_KEYS.join(', ')}`, { reason: 'field:disabledFeatures' });
	}
	return FEATURE_KEYS.filter((key) => value.includes(key));
}

export async function updateOrganizationSettings(
	ports: PolicyPorts,
	input: OrganizationSettingsInput
): Promise<{ success: true }> {
	await requireGovernancePolicy(ports, POLICY_ACTION_CATALOG.organization.updateSettings);
	if ('criticalTasksDefaultExpirationMonths' in input || 'criticalTasksExpiringSoonWarningDays' in input) {
		fail(400, 'Critical Tasks defaults are managed in the task library');
	}
	const archiveRetentionMonths = parseWholeNumber(
		input.archiveRetentionMonths,
		'Retention months must be between 1 and 120',
		ARCHIVE_RETENTION_CONSTRAINT
	);
	const lossWarningWindowDays = parseWholeNumber(
		input.lossWarningWindowDays,
		'Warning window must be between 1 and 365 days',
		LOSS_WARNING_CONSTRAINT
	);
	const trainingReadinessGoalPercent = parseInteger(
		input.trainingReadinessGoalPercent,
		'Training readiness goal must be a whole number between 1 and 100',
		TRAINING_READINESS_GOAL_CONSTRAINT
	);
	const disabledFeatures = parseFeatureKeys(input.disabledFeatures);
	const strengthFloorPercent = parseInteger(
		input.strengthFloorPercent,
		'Strength floor must be a whole number between 1 and 100',
		STRENGTH_FLOOR_CONSTRAINT,
		'strengthFloorPercent'
	);
	const capMb = parseWholeNumber(
		input.personnelDocumentStorageCapMb,
		'Personnel document storage cap must be between 10 and 1024 MB',
		{ min: 10, max: 1024 }
	);
	const changes: OrganizationPolicyChanges = {};
	const details: Record<string, number | FeatureKey[]> = {};
	if (archiveRetentionMonths !== undefined) {
		changes.archiveRetentionMonths = archiveRetentionMonths;
		details.archive_retention_months = archiveRetentionMonths;
	}
	if (lossWarningWindowDays !== undefined) {
		changes.lossWarningWindowDays = lossWarningWindowDays;
		details.loss_warning_window_days = lossWarningWindowDays;
	}
	if (trainingReadinessGoalPercent !== undefined) {
		changes.trainingReadinessGoalPercent = trainingReadinessGoalPercent;
		details.training_readiness_goal_percent = trainingReadinessGoalPercent;
	}
	if (capMb !== undefined) {
		changes.personnelDocumentStorageCapBytes = capMb * 1024 * 1024;
		details.personnel_document_storage_cap_bytes = changes.personnelDocumentStorageCapBytes;
	}
	if (disabledFeatures !== undefined) changes.disabledFeatures = disabledFeatures;
	if (strengthFloorPercent !== undefined) changes.strengthFloorPercent = strengthFloorPercent;
	if (Object.keys(changes).length === 0) fail(400, 'At least one organization setting must be provided');
	const orgId = ports.auth.orgId.toLowerCase();
	if (disabledFeatures !== undefined || strengthFloorPercent !== undefined) {
		const previous = await ports.organizationPolicyWrite.findFeatureSettings(orgId);
		if (!previous) fail(404, 'Organization not found');
		if (disabledFeatures !== undefined) {
			details.previous_disabled_features = previous.disabledFeatures;
			details.disabled_features = disabledFeatures;
		}
		if (strengthFloorPercent !== undefined) {
			details.previous_strength_floor_percent = previous.strengthFloorPercent;
			details.strength_floor_percent = strengthFloorPercent;
		}
	}
	const message = await ports.organizationPolicyWrite.updatePolicies(orgId, changes);
	if (message) fail(500, message);
	ports.audit.log({
		action: 'organization.settings_updated',
		resourceType: 'organization',
		resourceId: ports.auth.orgId,
		details
	});
	return { success: true };
}
