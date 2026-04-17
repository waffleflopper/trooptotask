import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

describe('/api/organization/settings', () => {
	it('requires privileged access for settings updates', () => {
		expect(_postConfig.permission).toBe('privileged');
		expect(_postConfig.mutation).toBe(true);
	});

	it('persists archive retention, loss warning, and Critical Tasks settings on the organization row', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('organizations', [
			{
				id: ctx.auth.orgId,
				organization_id: ctx.auth.orgId,
				archive_retention_months: 36,
				loss_warning_window_days: 180,
				critical_tasks_default_expiration_months: null,
				critical_tasks_expiring_soon_warning_days: null
			}
		]);

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			archiveRetentionMonths: 48,
			lossWarningWindowDays: 90,
			criticalTasksDefaultExpirationMonths: 18,
			criticalTasksExpiringSoonWarningDays: 45
		});
		const saved = await ctx.rawStore.findOne<Record<string, unknown>>('organizations', ctx.auth.orgId, {
			id: ctx.auth.orgId
		});

		expect(result).toEqual({ success: true });
		expect(saved).toMatchObject({
			archive_retention_months: 48,
			loss_warning_window_days: 90,
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
					loss_warning_window_days: 90,
					critical_tasks_default_expiration_months: 18,
					critical_tasks_expiring_soon_warning_days: 45
				}
			})
		]);
	});

	it('supports partial updates for the warning window without rewriting other settings', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('organizations', [
			{
				id: ctx.auth.orgId,
				organization_id: ctx.auth.orgId,
				archive_retention_months: 36,
				loss_warning_window_days: 180,
				critical_tasks_default_expiration_months: 12,
				critical_tasks_expiring_soon_warning_days: 60
			}
		]);

		const result = await handleUseCaseRequest(_postConfig, ctx, { lossWarningWindowDays: 90 });
		const saved = await ctx.rawStore.findOne<Record<string, unknown>>('organizations', ctx.auth.orgId, {
			id: ctx.auth.orgId
		});

		expect(result).toEqual({ success: true });
		expect(saved).toMatchObject({
			archive_retention_months: 36,
			loss_warning_window_days: 90,
			critical_tasks_default_expiration_months: 12,
			critical_tasks_expiring_soon_warning_days: 60
		});
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'organization.settings_updated',
				resourceType: 'organization',
				resourceId: ctx.auth.orgId,
				details: { loss_warning_window_days: 90 }
			})
		]);
	});

	it('rejects invalid warning-window values before writing', async () => {
		const ctx = createTestContext();
		const updateById = vi.spyOn(ctx.rawStore, 'updateById');

		await expect(handleUseCaseRequest(_postConfig, ctx, { lossWarningWindowDays: 0 })).rejects.toThrow(
			'Warning window must be between 1 and 365 days'
		);
		expect(updateById).not.toHaveBeenCalled();
	});
});
