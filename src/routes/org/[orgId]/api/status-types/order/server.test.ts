import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createTestContext } from '$features/calendar/calendarPersistence.test-support.server';
import { buildRouteRequest } from '$lib/server/adapters/requestContexts.server';
import { PUT } from './+server';

vi.mock('$lib/server/adapters/requestContexts.server', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/adapters/requestContexts.server')>()),
	buildRouteRequest: vi.fn()
}));

// Demo-seeded ids come from md5(...)::uuid and carry no RFC version or variant.
const LEAVE = 'e6110000-0000-0000-0000-000000000401';
const SICK = 'e6110000-0000-0000-0000-000000000402';
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
	const url = new URL('http://app.invalid/org/clinic/api/status-types/order');
	return PUT({
		request: new Request(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body }),
		url,
		params: { orgId: 'clinic' },
		locals: {},
		cookies: {}
	} as Parameters<typeof PUT>[0]);
}

const choice = JSON.stringify({ statusTypeIds: [SICK, LEAVE], expectedStatusTypeIds: [LEAVE, SICK] });
const databaseError = (code: string) => () =>
	Response.json({ code, message: 'synthetic database message', details: null, hint: null }, { status: 500 });

beforeEach(() => {
	provider = { calls: [], reply: () => new Response(null, { status: 204 }) };
});

describe('PUT status order at the route boundary', () => {
	it('answers a committed status order with 200 after one bound command and audits it', async () => {
		const ctx = admit();
		const response = await put(choice);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true });
		expect(provider.calls).toEqual([
			{
				path: '/rest/v1/rpc/set_status_type_order',
				body: {
					p_organization_id: ctx.auth.orgId,
					p_status_type_ids: [SICK, LEAVE],
					p_expected_status_type_ids: [LEAVE, SICK]
				}
			}
		]);
		expect(ctx.audit.events).toMatchObject([
			{
				action: 'status_type.reordered',
				resourceType: 'organization',
				resourceId: ctx.auth.orgId,
				details: { statusTypeIds: [SICK, LEAVE] }
			}
		]);
	});

	it.each([
		['STO01', 409],
		['23514', 500]
	])('answers database %s with %i, no audit and no database message', async (code, status) => {
		const ctx = admit();
		provider.reply = databaseError(code);
		let failure: { status: number; body: { message: string } } | undefined;
		try {
			await put(choice);
		} catch (error) {
			failure = error as typeof failure;
		}
		expect(failure?.status).toBe(status);
		expect(failure?.body.message).not.toContain('synthetic database message');
		expect(ctx.audit.events).toEqual([]);
	});

	it('answers a lost provider reply with the public unconfirmed 503', async () => {
		const ctx = admit();
		provider.reply = () => Promise.reject(new TypeError('fetch failed'));
		await expect(put(choice)).rejects.toMatchObject({ status: 503 });
		expect(ctx.audit.events).toEqual([]);
	});

	it('answers an unexpected provider acknowledgment as an internal error without an audit', async () => {
		const ctx = admit();
		provider.reply = () => Response.json({ saved: true });
		await expect(put(choice)).rejects.toMatchObject({ status: 500 });
		expect(ctx.audit.events).toEqual([]);
	});

	it.each([
		['not JSON', '{'],
		['a repeated type', JSON.stringify({ statusTypeIds: [SICK, SICK], expectedStatusTypeIds: [LEAVE, SICK] })]
	])('rejects a body that is %s with 400 before the provider', async (_, body) => {
		admit();
		await expect(put(body)).rejects.toMatchObject({ status: 400 });
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
