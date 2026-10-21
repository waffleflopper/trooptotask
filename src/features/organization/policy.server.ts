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
	FeatureSwitchChange,
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

function parseFeatureSwitch(value: unknown): FeatureSwitchChange | undefined {
	if (value === undefined) return undefined;
	const change = value as Partial<FeatureSwitchChange> | null;
	if (!change || !isFeatureKey(change.feature) || typeof change.on !== 'boolean') {
		fail(400, `A feature switch names one of ${FEATURE_KEYS.join(', ')} and whether it is on`, {
			reason: 'field:featureSwitch'
		});
	}
	return { feature: change.feature, on: change.on };
}

const SWITCH_WRITE_ATTEMPTS = 3;

/**
 * Reads what a switch or floor change replaces. A switch applies to the stored set and writes only while
 * that set is unchanged, so two admins' overlapping saves both land and each audit names what it replaced.
 */
async function withFeatureSettings(
	port: OrganizationPolicyWritePort,
	orgId: string,
	featureSwitch: FeatureSwitchChange | undefined,
	strengthFloorPercent: number | undefined
): Promise<{
	changes: OrganizationPolicyChanges;
	details: Record<string, number | FeatureKey[]>;
	ifDisabledFeatures?: readonly string[];
}> {
	if (featureSwitch === undefined && strengthFloorPercent === undefined) return { changes: {}, details: {} };
	const previous = await port.findFeatureSettings(orgId);
	if (!previous) fail(404, 'Organization not found');
	const details: Record<string, number | FeatureKey[]> = {};
	if (strengthFloorPercent !== undefined) {
		details.previous_strength_floor_percent = previous.strengthFloorPercent;
		details.strength_floor_percent = strengthFloorPercent;
	}
	if (featureSwitch === undefined) return { changes: {}, details };
	const disabledFeatures = FEATURE_KEYS.filter((key) =>
		key === featureSwitch.feature ? !featureSwitch.on : previous.disabledFeatures.includes(key)
	);
	return {
		changes: { disabledFeatures },
		details: {
			previous_disabled_features: previous.disabledFeatures,
			disabled_features: disabledFeatures,
			...details
		},
		ifDisabledFeatures: previous.storedDisabledFeatures
	};
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
	const featureSwitch = parseFeatureSwitch(input.featureSwitch);
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
	if (strengthFloorPercent !== undefined) changes.strengthFloorPercent = strengthFloorPercent;
	if (Object.keys(changes).length === 0 && featureSwitch === undefined)
		fail(400, 'At least one organization setting must be provided');
	const orgId = ports.auth.orgId.toLowerCase();
	for (let attempt = 1; ; attempt++) {
		const write = await withFeatureSettings(ports.organizationPolicyWrite, orgId, featureSwitch, strengthFloorPercent);
		const result = await ports.organizationPolicyWrite.updatePolicies(
			orgId,
			{ ...changes, ...write.changes },
			write.ifDisabledFeatures
		);
		if (result.status === 'failed') fail(500, result.message);
		if (result.status === 'saved') {
			ports.audit.log({
				action: 'organization.settings_updated',
				resourceType: 'organization',
				resourceId: ports.auth.orgId,
				details: { ...details, ...write.details }
			});
			break;
		}
		if (attempt === SWITCH_WRITE_ATTEMPTS)
			fail(409, 'Another change to the feature switches saved at the same time. Try again.');
	}
	return { success: true };
}
