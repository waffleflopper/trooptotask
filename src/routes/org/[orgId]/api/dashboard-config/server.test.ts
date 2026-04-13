import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import type { DashboardConfig } from '$features/dashboard/dashboard.types';
import { DEFAULT_DASHBOARD_CONFIG } from '$features/dashboard/dashboard.types';
import { _getConfig, _putConfig } from './+server';

describe('/api/dashboard-config', () => {
	it('matches dashboard route access for read and write operations', () => {
		expect(_getConfig.permission).toBe('none');
		expect(_getConfig.mutation).toBeUndefined();
		expect(_putConfig.permission).toBe('none');
		expect(_putConfig.mutation).toBe(true);
	});

	it('returns the saved dashboard config for the current user and org', async () => {
		const ctx = createTestContext();
		const savedConfig: DashboardConfig = {
			version: 3,
			widgets: [{ id: 'saved-1', widgetId: 'quick-stats', config: { metrics: ['total-strength'] } }]
		};
		ctx.store.seed('dashboard_configs', [
			{
				id: 'cfg-1',
				org_id: ctx.auth.orgId,
				user_id: ctx.auth.userId,
				config: savedConfig,
				updated_at: '2026-04-12T00:00:00Z'
			}
		]);

		const result = await handleUseCaseRequest(_getConfig, ctx, undefined);

		expect(result).toEqual({ config: savedConfig });
	});

	it('falls back to the default dashboard config when none is saved', async () => {
		const ctx = createTestContext();

		const result = await handleUseCaseRequest(_getConfig, ctx, undefined);

		expect(result).toEqual({ config: DEFAULT_DASHBOARD_CONFIG });
	});

	it('updates an existing dashboard config for the current user and org', async () => {
		const ctx = createTestContext();
		const nextConfig: DashboardConfig = {
			version: 3,
			widgets: [{ id: 'saved-2', widgetId: 'strength', config: {} }]
		};
		ctx.store.seed('dashboard_configs', [
			{
				id: 'cfg-1',
				org_id: ctx.auth.orgId,
				user_id: ctx.auth.userId,
				config: DEFAULT_DASHBOARD_CONFIG,
				updated_at: '2026-04-12T00:00:00Z'
			}
		]);

		const result = await handleUseCaseRequest(_putConfig, ctx, nextConfig);
		const saved = await ctx.store.findOne<{ config: DashboardConfig }>('dashboard_configs', ctx.auth.orgId, {
			user_id: ctx.auth.userId
		});

		expect(result).toEqual({ config: nextConfig });
		expect(saved?.config).toEqual(nextConfig);
	});
});
