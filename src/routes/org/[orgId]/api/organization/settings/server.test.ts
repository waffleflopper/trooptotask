import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

describe('/api/organization/settings', () => {
	it('persists the warning window for the current organization', async () => {
		const ctx = createTestContext();
		ctx.store.seed('organizations', [{ id: ctx.auth.orgId, name: 'Test Org', archive_retention_months: 36 }]);
		const updateById = vi.spyOn(ctx.rawStore, 'updateById');
		const auditLog = vi.spyOn(ctx.audit, 'log');

		const result = await handleUseCaseRequest(_postConfig, ctx, { lossWarningWindowDays: 90 });

		expect(result).toEqual({ success: true });
		expect(updateById).toHaveBeenCalledWith('organizations', ctx.auth.orgId, {
			archive_retention_months: 36,
			loss_warning_window_days: 90
		});
		expect(auditLog).toHaveBeenCalledWith({
			action: 'organization.settings_updated',
			resourceType: 'organization',
			resourceId: ctx.auth.orgId,
			details: { archive_retention_months: 36, loss_warning_window_days: 90 }
		});
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
