import { describe, it, expect, vi } from 'vitest';
import { createSupabaseReadOnlyGuard } from './supabaseReadOnlyGuard';

vi.mock('$lib/server/subscription', () => ({
	getOrgReadOnlyState: vi.fn(),
	isOrgReadOnly: vi.fn()
}));

import { getOrgReadOnlyState, isOrgReadOnly } from '$lib/server/subscription';

const mockGetOrgReadOnlyState = vi.mocked(getOrgReadOnlyState);
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

	it('surfaces payment failure read-only state for server-side mutation gates', async () => {
		mockGetOrgReadOnlyState.mockResolvedValue({
			isReadOnly: true,
			reason: 'payment_failure',
			message:
				'Organization is in billing grace mode because a payment failed. Update the payment method to restore full access.'
		});

		const guard = createSupabaseReadOnlyGuard(fakeSupabase, orgId);
		const result = await guard.checkState?.();

		expect(result).toEqual({
			isReadOnly: true,
			reason: 'payment_failure',
			message:
				'Organization is in billing grace mode because a payment failed. Update the payment method to restore full access.'
		});
		expect(mockGetOrgReadOnlyState).toHaveBeenCalledWith(fakeSupabase, orgId);
	});
});
