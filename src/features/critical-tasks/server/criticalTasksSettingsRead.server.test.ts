import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { fetchCriticalTasksSettings } from './criticalTasksSettingsRead.server';

describe('Critical Tasks settings read', () => {
	it('reads the Organization defaults through its owned reader', async () => {
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
	it.each([
		{
			stored: { critical_tasks_default_expiration_months: null, critical_tasks_expiring_soon_warning_days: null },
			expected: { defaultExpirationMonths: 12, expiringSoonWarningDays: 60 }
		},
		{
			stored: { critical_tasks_default_expiration_months: 0, critical_tasks_expiring_soon_warning_days: -1 },
			expected: { defaultExpirationMonths: 12, expiringSoonWarningDays: 60 }
		},
		{
			stored: { critical_tasks_default_expiration_months: 400, critical_tasks_expiring_soon_warning_days: 900 },
			expected: { defaultExpirationMonths: 400, expiringSoonWarningDays: 900 }
		}
	])('keeps existing read normalization without imposing write caps', async ({ stored, expected }) => {
		const ctx = createTestContext();
		ctx.store.seed('organizations', [{ id: ctx.auth.orgId, ...stored }]);
		await expect(fetchCriticalTasksSettings(ctx)).resolves.toEqual(expected);
	});
});
