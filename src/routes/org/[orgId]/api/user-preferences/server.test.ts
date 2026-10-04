import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { buildRouteContext, createRequestAccountPreferencesProvider } from '$lib/server/adapters/httpAdapter';
import { PATCH } from './+server';

vi.mock('$lib/server/adapters/httpAdapter', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/adapters/httpAdapter')>()),
	buildRouteContext: vi.fn(),
	createRequestAccountPreferencesProvider: vi.fn()
}));

const preferences = {
	calendar: { showStatusText: false, showPersonnelRoles: false, highlightOnboarding: true },
	training: { selectedGroupId: null, selectedViewId: null, matrixViewMode: 'by-group' }
};
let readError: null | { message: string };
let writes: number;
beforeEach(() => {
	vi.mocked(buildRouteContext).mockReset().mockResolvedValue(createTestContext());
	readError = null;
	writes = 0;
	const query = {
		select: () => query,
		eq: () => query,
		maybeSingle: async () => ({ data: null, error: readError }),
		upsert: () => {
			writes++;
			return query;
		},
		single: async () => ({ data: { user_id: 'test-user', organization_id: 'test-org', preferences }, error: null })
	};
	vi.mocked(createRequestAccountPreferencesProvider)
		.mockReset()
		.mockReturnValue({ supabase: { from: () => query } as unknown as SupabaseClient });
});
function event(body: string): Parameters<typeof PATCH>[0] {
	return {
		request: new Request('http://127.0.0.1:9/org/test-org/api/user-preferences', { method: 'PATCH', body }),
		locals: {}
	} as Parameters<typeof PATCH>[0];
}

describe('PATCH preference HTTP delivery', () => {
	it.each(['{', '{"calendar":{"showStatusText":"yes"}}'])(
		'retains HTTP 400 for malformed JSON or invalid preferences: %s',
		async (body) => {
			await expect(PATCH(event(body))).rejects.toMatchObject({ status: 400, body: { message: expect.any(String) } });
			expect(writes).toBe(0);
		}
	);
	it('returns the normalized choices of the admitted scope without honoring body identities', async () => {
		const response = await PATCH(event('{"user_id":"peer","organization_id":"foreign"}'));
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual(preferences);
	});
	it('converts provider failure to a generic HTTP 500 without claiming a save', async () => {
		readError = { message: 'private provider details' };
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			await expect(PATCH(event('{}'))).rejects.toMatchObject({
				status: 500,
				body: { message: 'Internal server error' }
			});
			expect(writes).toBe(0);
		} finally {
			log.mockRestore();
		}
	});
	it('converts anonymous owner denial to HTTP 401 before any write', async () => {
		vi.mocked(buildRouteContext).mockResolvedValue(createTestContext({ auth: { userId: '' } }));
		await expect(PATCH(event('{}'))).rejects.toMatchObject({ status: 401 });
		expect(writes).toBe(0);
	});
});
