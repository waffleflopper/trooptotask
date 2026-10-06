import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { requireGovernancePolicy } from '$lib/access/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';
import { ARCHIVE_RETENTION_CONSTRAINT, LOSS_WARNING_CONSTRAINT } from './policyConstraints';
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
	const capMb = parseWholeNumber(
		input.personnelDocumentStorageCapMb,
		'Personnel document storage cap must be between 10 and 1024 MB',
		{ min: 10, max: 1024 }
	);
	const changes: OrganizationPolicyChanges = {};
	const details: Record<string, number> = {};
	if (archiveRetentionMonths !== undefined) {
		changes.archiveRetentionMonths = archiveRetentionMonths;
		details.archive_retention_months = archiveRetentionMonths;
	}
	if (lossWarningWindowDays !== undefined) {
		changes.lossWarningWindowDays = lossWarningWindowDays;
		details.loss_warning_window_days = lossWarningWindowDays;
	}
	if (capMb !== undefined) {
		changes.personnelDocumentStorageCapBytes = capMb * 1024 * 1024;
		details.personnel_document_storage_cap_bytes = changes.personnelDocumentStorageCapBytes;
	}
	if (Object.keys(changes).length === 0) fail(400, 'At least one organization setting must be provided');
	const message = await ports.organizationPolicyWrite.updatePolicies(ports.auth.orgId.toLowerCase(), changes);
	if (message) fail(500, message);
	ports.audit.log({
		action: 'organization.settings_updated',
		resourceType: 'organization',
		resourceId: ports.auth.orgId,
		details
	});
	return { success: true };
}
