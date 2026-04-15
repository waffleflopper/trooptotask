import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import type { UseCaseContext } from '$lib/server/core/ports';

interface OrganizationSettingsInput {
	archiveRetentionMonths?: number;
	criticalTasksDefaultExpirationMonths?: number | null;
	criticalTasksExpiringSoonWarningDays?: number | null;
}

function parseNullableWholeNumber(
	value: number | null | undefined,
	label: string,
	range: { min: number; max: number }
): number | null | undefined {
	if (value === undefined) return undefined;
	if (value === null) return null;
	if (!Number.isFinite(value) || value < range.min || value > range.max) {
		fail(400, `${label} must be between ${range.min} and ${range.max}`);
	}
	return Math.round(value);
}

export const _postConfig: RouteConfig<OrganizationSettingsInput, { success: true }> = {
	permission: 'privileged',
	mutation: true,
	fn: async (ctx: UseCaseContext, input: OrganizationSettingsInput) => {
		const archiveRetentionMonths = parseNullableWholeNumber(input.archiveRetentionMonths, 'Retention months', {
			min: 1,
			max: 120
		});
		const criticalTasksDefaultExpirationMonths = parseNullableWholeNumber(
			input.criticalTasksDefaultExpirationMonths,
			'Critical Tasks default expiration months',
			{ min: 1, max: 120 }
		);
		const criticalTasksExpiringSoonWarningDays = parseNullableWholeNumber(
			input.criticalTasksExpiringSoonWarningDays,
			'Critical Tasks expiring-soon warning days',
			{ min: 1, max: 365 }
		);

		const updates: Record<string, number | null> = {};

		if (archiveRetentionMonths !== undefined) {
			updates.archive_retention_months = archiveRetentionMonths;
		}
		if (criticalTasksDefaultExpirationMonths !== undefined) {
			updates.critical_tasks_default_expiration_months = criticalTasksDefaultExpirationMonths;
		}
		if (criticalTasksExpiringSoonWarningDays !== undefined) {
			updates.critical_tasks_expiring_soon_warning_days = criticalTasksExpiringSoonWarningDays;
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
