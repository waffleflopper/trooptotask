import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createTestContext } from '$features/calendar/calendarPersistence.test-support.server';
import { buildRouteRequest } from '$lib/server/adapters/requestContexts.server';
import { PUT } from './+server';

const NOT_SAVED = 'Another Calendar change was saving at the same time, so this change was not saved. Try again.';
const LANES_MESSAGE = 'Choose the assignment types to show on the calendar';
const UNCONFIRMED = "We couldn't confirm this Calendar change. Reload to see what is saved.";

vi.mock('$lib/server/adapters/requestContexts.server', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/adapters/requestContexts.server')>()),
	buildRouteRequest: vi.fn()
}));

const STAFF = '00000000-0000-4000-8000-000000000401';
const GROUP = '00000000-0000-4000-8000-000000000402';
let provider: { calls: Array<{ path: string; body: unknown }>; reply: () => Response | Promise<Response> };

function admit(capabilityMap?: NonNullable<Parameters<typeof createTestContext>[0]>['auth']) {
	const ctx = createTestContext(capabilityMap ? { auth: capabilityMap } : undefined);
	const supabase = createClient('http://127.0.0.1:9', 'synthetic-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				provider.calls.push({ path: new URL(request.url).pathname, body: await request.json() });
				return provider.reply();
			}
		}
	});
	vi.mocked(buildRouteRequest).mockResolvedValue({ auth: ctx.auth, audit: ctx.audit, supabase } as never);
	return ctx;
}

function put(body: string) {
	const url = new URL('http://app.invalid/org/clinic/api/assignment-types/lanes');
	return PUT({
		request: new Request(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body }),
		url,
		params: { orgId: 'clinic' },
		locals: {},
		cookies: {}
	} as Parameters<typeof PUT>[0]);
}

const choice = JSON.stringify({ laneTypeIds: [GROUP, STAFF], expectedLaneTypeIds: [STAFF] });
const databaseError = (code: string) => () =>
	Response.json({ code, message: 'synthetic database message', details: null, hint: null }, { status: 500 });

beforeEach(() => {
	provider = { calls: [], reply: () => new Response(null, { status: 204 }) };
});

describe('PUT calendar lanes at the route boundary', () => {
	it('answers a committed lane change with 200 after one bound command and audits it', async () => {
		const ctx = admit();
		const response = await put(choice);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true });
		expect(provider.calls).toEqual([
			{
				path: '/rest/v1/rpc/set_calendar_lanes',
				body: {
					p_organization_id: ctx.auth.orgId,
					p_lane_type_ids: [GROUP, STAFF],
					p_expected_lane_type_ids: [STAFF]
				}
			}
		]);
		expect(ctx.audit.events).toMatchObject([
			{
				action: 'assignment_type.calendar_lanes_set',
				resourceType: 'organization',
				resourceId: ctx.auth.orgId,
				details: { laneTypeIds: [GROUP, STAFF] }
			}
		]);
	});

	it.each([
		['42501', 403, 'You do not have access to configure the Calendar'],
		['P0002', 404, 'That assignment type is no longer available.'],
		['22023', 400, 'Invalid Calendar configuration'],
		['40P01', 409, NOT_SAVED],
		['40001', 409, NOT_SAVED],
		['23505', 409, NOT_SAVED],
		['23514', 500, 'Internal server error']
	])('answers database %s with %i and no audit', async (code, status, message) => {
		const ctx = admit();
		provider.reply = databaseError(code);
		await expect(put(choice)).rejects.toMatchObject({ status, body: { message } });
		expect(ctx.audit.events).toEqual([]);
	});

	it('answers a lost provider reply with the public unconfirmed 503', async () => {
		admit();
		provider.reply = () => Promise.reject(new TypeError('fetch failed'));
		await expect(put(choice)).rejects.toMatchObject({
			status: 503,
			body: { message: UNCONFIRMED }
		});
	});

	it('answers an unexpected provider acknowledgment as an internal error', async () => {
		admit();
		provider.reply = () => Response.json({ saved: true });
		await expect(put(choice)).rejects.toMatchObject({ status: 500, body: { message: 'Internal server error' } });
	});

	it.each([
		['{', 'Invalid JSON in request body'],
		['{}', LANES_MESSAGE],
		[JSON.stringify({ laneTypeIds: [GROUP, GROUP], expectedLaneTypeIds: [] }), LANES_MESSAGE],
		[JSON.stringify({ laneTypeIds: ['not-a-type'], expectedLaneTypeIds: [] }), LANES_MESSAGE],
		[JSON.stringify({ laneTypeIds: [GROUP], expectedLaneTypeIds: [], showOnCalendar: true }), LANES_MESSAGE]
	])('rejects body %s with 400 before the provider', async (body, message) => {
		admit();
		await expect(put(body)).rejects.toMatchObject({ status: 400, body: { message } });
		expect(provider.calls).toEqual([]);
	});

	it('denies a Calendar operator with 403 before the provider', async () => {
		admit({
			capabilityMap: {
				calendar: 'operate',
				personnel: 'configure',
				training: 'configure',
				criticalTasks: 'configure',
				onboarding: 'configure',
				ratingScheme: 'configure'
			}
		});
		await expect(put(choice)).rejects.toMatchObject({ status: 403 });
		expect(provider.calls).toEqual([]);
	});
});
