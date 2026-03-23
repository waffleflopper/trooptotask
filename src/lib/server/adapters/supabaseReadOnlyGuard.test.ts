import { describe, it, expect, vi } from 'vitest';
import { createSupabaseReadOnlyGuard } from './supabaseReadOnlyGuard';

vi.mock('$lib/server/subscription', () => ({
	isOrgReadOnly: vi.fn()
}));

import { isOrgReadOnly } from '$lib/server/subscription';

const mockIsOrgReadOnly = vi.mocked(isOrgReadOnly);

describe('SupabaseReadOnlyGuard', () => {
	const fakeSupabase = {} as Parameters<typeof createSupabaseReadOnlyGuard>[0];
	const orgId = 'org-123';

	it('returns false when org is not read-only', async () => {
		mockIsOrgReadOnly.mockResolvedValue(false);

		const guard = createSupabaseReadOnlyGuard(fakeSupabase, orgId);
		const result = await guard.check();

		expect(result).toBe(false);
		expect(mockIsOrgReadOnly).toHaveBeenCalledWith(fakeSupabase, orgId);
	});

	it('returns true when org is read-only', async () => {
		mockIsOrgReadOnly.mockResolvedValue(true);

		const guard = createSupabaseReadOnlyGuard(fakeSupabase, orgId);
		const result = await guard.check();

		expect(result).toBe(true);
	});
});
