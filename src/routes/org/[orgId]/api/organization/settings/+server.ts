import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';

interface OrganizationSettingsInput {
	archiveRetentionMonths?: number;
	lossWarningWindowDays?: number;
}

interface OrganizationSettingsOutput {
	success: true;
}

const LOSS_WARNING_WINDOW_MIN_DAYS = 1;
const LOSS_WARNING_WINDOW_MAX_DAYS = 365;

function validateWarningWindow(days: unknown): number | null {
	if (days === undefined) return null;
	if (typeof days !== 'number' || !Number.isFinite(days)) {
		fail(400, 'Warning window must be between 1 and 365 days');
	}
	const rounded = Math.round(days);
	if (rounded < LOSS_WARNING_WINDOW_MIN_DAYS || rounded > LOSS_WARNING_WINDOW_MAX_DAYS) {
		fail(400, 'Warning window must be between 1 and 365 days');
	}
	return rounded;
}

export const _postConfig: RouteConfig<OrganizationSettingsInput, OrganizationSettingsOutput> = {
	permission: 'privileged',
	mutation: true,
	fn: async (ctx, input) => {
		const currentOrg = await ctx.rawStore.findOne<{
			archive_retention_months: number | null;
			loss_warning_window_days: number | null;
		}>('organizations', ctx.auth.orgId, { id: ctx.auth.orgId });

		const { archiveRetentionMonths, lossWarningWindowDays } = input;

		if (
			archiveRetentionMonths !== undefined &&
			(typeof archiveRetentionMonths !== 'number' || archiveRetentionMonths < 1 || archiveRetentionMonths > 120)
		) {
			fail(400, 'Retention months must be between 1 and 120');
		}

		const nextArchiveRetentionMonths = archiveRetentionMonths ?? currentOrg?.archive_retention_months ?? 36;
		const nextLossWarningWindowDays =
			validateWarningWindow(lossWarningWindowDays) ?? currentOrg?.loss_warning_window_days ?? 180;

		await ctx.rawStore.updateById('organizations', ctx.auth.orgId, {
			archive_retention_months: Math.round(nextArchiveRetentionMonths),
			loss_warning_window_days: nextLossWarningWindowDays
		});

		ctx.audit.log({
			action: 'organization.settings_updated',
			resourceType: 'organization',
			resourceId: ctx.auth.orgId,
			details: {
				archive_retention_months: nextArchiveRetentionMonths,
				loss_warning_window_days: nextLossWarningWindowDays
			}
		});

		return { success: true };
	}
};

export const POST = handle(_postConfig);
