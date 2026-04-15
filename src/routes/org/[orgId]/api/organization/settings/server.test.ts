import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

describe('/api/organization/settings', () => {
	it('requires privileged access for settings updates', () => {
		expect(_postConfig.permission).toBe('privileged');
		expect(_postConfig.mutation).toBe(true);
	});

	it('persists archive retention and Critical Tasks settings on the organization row', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('organizations', [
			{
				id: ctx.auth.orgId,
				organization_id: ctx.auth.orgId,
				archive_retention_months: 36,
				critical_tasks_default_expiration_months: null,
				critical_tasks_expiring_soon_warning_days: null
			}
		]);

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			archiveRetentionMonths: 48,
			criticalTasksDefaultExpirationMonths: 18,
			criticalTasksExpiringSoonWarningDays: 45
		});
		const saved = await ctx.rawStore.findOne<Record<string, unknown>>('organizations', ctx.auth.orgId, {
			id: ctx.auth.orgId
		});

		expect(result).toEqual({ success: true });
		expect(saved).toMatchObject({
			archive_retention_months: 48,
			critical_tasks_default_expiration_months: 18,
			critical_tasks_expiring_soon_warning_days: 45
		});
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'organization.settings_updated',
				resourceType: 'organization',
				resourceId: ctx.auth.orgId,
				details: {
					archive_retention_months: 48,
					critical_tasks_default_expiration_months: 18,
					critical_tasks_expiring_soon_warning_days: 45
				}
			})
		]);
	});
});
