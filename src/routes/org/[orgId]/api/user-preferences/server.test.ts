import { buildRouteRequest } from '$lib/server/adapters/requestContexts.server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '$lib/server/database';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { createRequestAccountPreferencesProvider } from '$lib/server/adapters/httpAdapter';
import { PATCH } from './+server';

vi.mock('$lib/server/adapters/httpAdapter', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/adapters/httpAdapter')>()),
	createRequestAccountPreferencesProvider: vi.fn()
}));

vi.mock('$lib/server/adapters/requestContexts.server', () => ({ buildRouteRequest: vi.fn() }));

function requestContext(options?: Parameters<typeof createTestContext>[0]) {
	return { ...createTestContext(options), supabase: {} as SupabaseClient, session: null };
}

const preferences = {
	calendar: {
		showStatusText: false,
		showPersonnelRoles: false,
		highlightOnboarding: true,
		showDaysLane: true,
		showEventLanes: true,
		showAssignmentLanes: true
	},
	training: {
		selectedGroupId: null,
		selectedViewId: null,
		matrixViewMode: 'by-group',
		matrixColorAll: false,
		matrixCurrentMark: 'date',
		matrixNeedsActionOnly: false
	}
};
let readError: null | { message: string };
let writes: number;
let conflicts: boolean;
beforeEach(() => {
	vi.mocked(buildRouteRequest).mockReset().mockResolvedValue(requestContext());
	readError = null;
	writes = 0;
	conflicts = false;
	const query = {
		select: () => query,
		eq: () => query,
		maybeSingle: async () => ({ data: null, error: readError }),
		upsert: () => {
			writes++;
			return query;
		},
		then: (resolve: (value: unknown) => unknown) =>
			Promise.resolve({
				data: conflicts ? [] : [{ user_id: 'test-user', organization_id: 'test-org', preferences }],
				error: null
			}).then(resolve)
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
	it('returns a retryable HTTP 409 when repeated concurrent saves prevent confirmation', async () => {
		conflicts = true;
		await expect(PATCH(event('{}'))).rejects.toMatchObject({
			status: 409,
			body: { message: 'Your preferences changed while saving. Try again.' }
		});
	});

	it('converts anonymous owner denial to HTTP 401 before any write', async () => {
		vi.mocked(buildRouteRequest).mockResolvedValue(requestContext({ auth: { userId: '' } }));
		await expect(PATCH(event('{}'))).rejects.toMatchObject({ status: 401 });
		expect(writes).toBe(0);
	});
});
