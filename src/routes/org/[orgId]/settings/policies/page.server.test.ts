import { describe, expect, it, vi } from 'vitest';

const { loadWithContextMock, rawFindOneMock } = vi.hoisted(() => ({
	loadWithContextMock: vi.fn(),
	rawFindOneMock: vi.fn()
}));

vi.mock('$lib/server/adapters/httpAdapter', () => ({
	loadWithContext: loadWithContextMock
}));

import { load } from './+page.server';

describe('organization policies page server load', () => {
	it('defaults the warning window and Critical Tasks settings when the organization settings are unset', async () => {
		rawFindOneMock.mockResolvedValue({ archive_retention_months: 36 });
		loadWithContextMock.mockImplementation((_locals, _cookies, _orgId, config) =>
			config.fn({
				auth: { orgId: 'org-1' },
				rawStore: { findOne: rawFindOneMock }
			})
		);
		const locals = { supabase: {} };
		const cookies = {};

		const result = await load({
			params: { orgId: 'org-1' },
			locals,
			cookies: cookies as never
		} as never);

		expect(loadWithContextMock).toHaveBeenCalledWith(locals, cookies, 'org-1', {
			permission: 'privileged',
			fn: expect.any(Function)
		});
		expect(rawFindOneMock).toHaveBeenCalledWith(
			'organizations',
			'org-1',
			{},
			'archive_retention_months, loss_warning_window_days, critical_tasks_default_expiration_months, critical_tasks_expiring_soon_warning_days'
		);
		expect(result).toEqual({
			retentionMonths: 36,
			lossWarningWindowDays: 180,
			criticalTasksSettings: {
				defaultExpirationMonths: 12,
				expiringSoonWarningDays: 60
			}
		});
	});
});
