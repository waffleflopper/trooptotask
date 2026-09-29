import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { fetchCriticalTasksSettings } from './criticalTasksSettingsRead.server';

describe('Critical Tasks settings read', () => {
	it('reads the Organization defaults through the request store', async () => {
		const ctx = createTestContext();
		ctx.store.seed('organizations', [
			{
				id: 'test-org',
				critical_tasks_default_expiration_months: 18,
				critical_tasks_expiring_soon_warning_days: 45
			}
		]);

		await expect(fetchCriticalTasksSettings(ctx)).resolves.toEqual({
			defaultExpirationMonths: 18,
			expiringSoonWarningDays: 45
		});
	});
});
