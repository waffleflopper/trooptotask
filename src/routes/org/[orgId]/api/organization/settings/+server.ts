import { handle } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';

export const POST = handle<Record<string, unknown>, unknown>({
	permission: 'privileged',
	mutation: true,
	fn: async (ctx, input) => {
		const { archiveRetentionMonths } = input;

		if (typeof archiveRetentionMonths !== 'number' || archiveRetentionMonths < 1 || archiveRetentionMonths > 120) {
			fail(400, 'Retention months must be between 1 and 120');
		}

		await ctx.rawStore.updateById('organizations', ctx.auth.orgId, {
			archive_retention_months: Math.round(archiveRetentionMonths as number)
		});

		ctx.audit.log({
			action: 'organization.settings_updated',
			resourceType: 'organization',
			resourceId: ctx.auth.orgId,
			details: { archive_retention_months: archiveRetentionMonths }
		});

		return { success: true };
	}
});
