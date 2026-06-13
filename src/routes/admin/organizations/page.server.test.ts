import { isHttpError } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { selectAllSupabaseRowsMock, platformMetricsMock } = vi.hoisted(() => ({
	selectAllSupabaseRowsMock: vi.fn(),
	platformMetricsMock: {
		getOrganizationMetrics: vi.fn()
	}
}));

vi.mock('$lib/server/adapters/adminAdapter', () => ({
	loadWithAdminContext: (config: { fn: (ctx: unknown, event: unknown) => unknown }) => (event: { __ctx: unknown }) =>
		config.fn(event.__ctx, event)
}));

vi.mock('$lib/server/supabasePagination', () => ({
	selectAllSupabaseRows: selectAllSupabaseRowsMock
}));

vi.mock('$lib/server/adapters/supabasePlatformMetrics', () => ({
	createSupabasePlatformMetrics: () => platformMetricsMock
}));

import { load } from './+page.server';

function makeContext() {
	return {
		adminUser: { id: 'admin-1', role: 'super_admin' },
		adminClient: {},
		sessionClient: {},
		session: null,
		audit: vi.fn()
	};
}

async function expectSanitizedServerError(loadResult: unknown, message: string) {
	try {
		await loadResult;
		expect.unreachable('Expected load to throw');
	} catch (err) {
		expect(isHttpError(err)).toBe(true);
		expect(err).toMatchObject({
			status: 500,
			body: { message }
		});
		expect(err).not.toMatchObject({
			body: { message: expect.stringContaining('database offline') }
		});
	}
}

describe('admin organizations route load', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		selectAllSupabaseRowsMock.mockResolvedValue({ data: [], error: null });
		platformMetricsMock.getOrganizationMetrics.mockResolvedValue({
			memberCounts: new Map(),
			activePersonnelCounts: new Map(),
			ownerMemberships: new Map()
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('throws a sanitized load error when the primary organization ledger cannot load', async () => {
		selectAllSupabaseRowsMock.mockResolvedValueOnce({
			data: null,
			error: { message: 'database offline' }
		});

		await expectSanitizedServerError(
			load({
				__ctx: makeContext()
			} as unknown as Parameters<typeof load>[0]),
			'Unable to load platform organizations.'
		);
		expect(platformMetricsMock.getOrganizationMetrics).not.toHaveBeenCalled();
	});
});
