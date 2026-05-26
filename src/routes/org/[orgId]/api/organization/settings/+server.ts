import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/server/core/errors';
import type { UseCaseContext } from '$lib/server/core/ports';
import {
	ARCHIVE_RETENTION_CONSTRAINT,
	CRITICAL_TASKS_DEFAULT_EXPIRATION_CONSTRAINT,
	CRITICAL_TASKS_EXPIRING_SOON_WARNING_CONSTRAINT,
	LOSS_WARNING_CONSTRAINT
} from '../../../settings/settingsPolicyConstraints';

interface OrganizationSettingsInput {
	archiveRetentionMonths?: number;
	lossWarningWindowDays?: number;
	criticalTasksDefaultExpirationMonths?: number | null;
	criticalTasksExpiringSoonWarningDays?: number | null;
	personnelDocumentStorageCapMb?: number;
}

function parseWholeNumber(
	value: unknown,
	errorMessage: string,
	range: { min: number; max: number }
): number | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		fail(400, errorMessage);
	}
	const rounded = Math.round(value);
	if (rounded < range.min || rounded > range.max) {
		fail(400, errorMessage);
	}
	return rounded;
}

function parseNullableWholeNumber(
	value: unknown,
	errorMessage: string,
	range: { min: number; max: number }
): number | null | undefined {
	if (value === undefined) return undefined;
	if (value === null) return null;
	return parseWholeNumber(value, errorMessage, range);
}

export const _postConfig: RouteConfig<OrganizationSettingsInput, { success: true }> = {
	policyAction: POLICY_ACTION_CATALOG.organization.updateSettings,
	policyResource: { kind: 'organization' },
	mutation: true,
	fn: async (ctx: UseCaseContext, input: OrganizationSettingsInput) => {
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
		const criticalTasksDefaultExpirationMonths = parseNullableWholeNumber(
			input.criticalTasksDefaultExpirationMonths,
			'Critical Tasks default expiration months must be between 1 and 120',
			CRITICAL_TASKS_DEFAULT_EXPIRATION_CONSTRAINT
		);
		const criticalTasksExpiringSoonWarningDays = parseNullableWholeNumber(
			input.criticalTasksExpiringSoonWarningDays,
			'Critical Tasks expiring-soon warning days must be between 1 and 365',
			CRITICAL_TASKS_EXPIRING_SOON_WARNING_CONSTRAINT
		);
		const personnelDocumentStorageCapMb = parseWholeNumber(
			input.personnelDocumentStorageCapMb,
			'Personnel document storage cap must be between 10 and 1024 MB',
			{ min: 10, max: 1024 }
		);

		const updates: Record<string, number | null> = {};

		if (archiveRetentionMonths !== undefined) {
			updates.archive_retention_months = archiveRetentionMonths;
		}
		if (lossWarningWindowDays !== undefined) {
			updates.loss_warning_window_days = lossWarningWindowDays;
		}
		if (criticalTasksDefaultExpirationMonths !== undefined) {
			updates.critical_tasks_default_expiration_months = criticalTasksDefaultExpirationMonths;
		}
		if (criticalTasksExpiringSoonWarningDays !== undefined) {
			updates.critical_tasks_expiring_soon_warning_days = criticalTasksExpiringSoonWarningDays;
		}
		if (personnelDocumentStorageCapMb !== undefined) {
			updates.personnel_document_storage_cap_bytes = personnelDocumentStorageCapMb * 1024 * 1024;
		}

		if (Object.keys(updates).length === 0) {
			fail(400, 'At least one organization setting must be provided');
		}

		await ctx.rawStore.updateById('organizations', ctx.auth.orgId, updates);

		ctx.audit.log({
			action: 'organization.settings_updated',
			resourceType: 'organization',
			resourceId: ctx.auth.orgId,
			details: updates
		});

		return { success: true };
	}
};

export const POST = handle(_postConfig);
