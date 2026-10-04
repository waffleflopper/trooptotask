import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

describe('/api/critical-tasks/settings', () => {
	it('lets an Organization-scoped Critical Tasks configurator save only the two defaults', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'configure',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		const saveDefaults = vi.fn().mockResolvedValue(undefined);
		const selected = { ...ctx, criticalTasksSettingsWrite: { saveDefaults } };

		await expect(
			handleUseCaseRequest(
				_postConfig,
				ctx,
				{ defaultExpirationMonths: 18, expiringSoonWarningDays: 45 },
				() => selected
			)
		).resolves.toEqual({ success: true });
		expect(saveDefaults).toHaveBeenCalledWith(ctx.auth.orgId, {
			defaultExpirationMonths: 18,
			expiringSoonWarningDays: 45
		});
	});

	it('denies Group-scoped configuration before calling the writer', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'configure',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'groups', groupIds: ['group-1'] }
			}
		});
		const saveDefaults = vi.fn();
		const selected = { ...ctx, criticalTasksSettingsWrite: { saveDefaults } };

		await expect(
			handleUseCaseRequest(
				_postConfig,
				ctx,
				{ defaultExpirationMonths: 18, expiringSoonWarningDays: 45 },
				() => selected
			)
		).rejects.toMatchObject({ status: 403 });
		expect(saveDefaults).not.toHaveBeenCalled();
	});
});
