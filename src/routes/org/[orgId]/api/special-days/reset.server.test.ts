import { describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createTestContext } from '$features/calendar/calendarPersistence.test-support.server';
import { buildRouteRequest } from '$lib/server/adapters/requestContexts.server';
import { POST } from './+server';

const NOT_SAVED = 'Another Calendar change was saving at the same time, so this change was not saved. Try again.';
const UNCONFIRMED = "We couldn't confirm this Calendar change. Reload to see what is saved.";

vi.mock('$lib/server/adapters/requestContexts.server', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/adapters/requestContexts.server')>()),
	buildRouteRequest: vi.fn()
}));

const TIME = '2026-10-14T12:00:00.000000+00:00';

type Holiday = { date: string; name: string };
type Reply = (submitted: Holiday[]) => Response | Promise<Response>;

const savedRows = (holidays: Holiday[]) =>
	holidays.map(({ date, name }, index) => ({
		id: `h-${index}`,
		organization_id: 'test-org',
		date,
		name,
		type: 'federal-holiday',
		created_at: TIME
	}));

function reset(reply: Reply) {
	const ctx = createTestContext();
	const supabase = createClient('http://127.0.0.1:9', 'synthetic-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) =>
				reply(((await new Request(input, init).json()) as { p_holidays: Holiday[] }).p_holidays)
		}
	});
	vi.mocked(buildRouteRequest).mockResolvedValue({ auth: ctx.auth, audit: ctx.audit, supabase } as never);
	const url = new URL('http://app.invalid/org/clinic/api/special-days');
	const response = POST({
		request: new Request(url, { method: 'POST', body: JSON.stringify({ action: 'resetFederalHolidays' }) }),
		url,
		params: { orgId: 'clinic' },
		locals: {},
		cookies: {}
	} as Parameters<typeof POST>[0]);
	return { ctx, response };
}

describe('POST federal holiday reset at the route boundary', () => {
	it('answers a committed reset with the saved federal rows', async () => {
		let submitted: Holiday[] = [];
		const { ctx, response } = reset((holidays) => {
			submitted = holidays;
			return Response.json(savedRows(holidays));
		});
		const saved = await response;
		expect(saved.status).toBe(200);
		expect(submitted.filter(({ name }) => name === 'Christmas Day')).toHaveLength(4);
		expect(await saved.json()).toEqual(savedRows(submitted));
		expect(ctx.audit.events.map(({ action }) => action)).toEqual(['special_day.federal_holidays_reset']);
	});

	it.each<[string, Reply, number, string]>([
		['a serialization failure', () => Response.json({ code: '40001', message: 'x' }, { status: 500 }), 409, NOT_SAVED],
		['a lost reply', () => Promise.reject(new TypeError('fetch failed')), 503, UNCONFIRMED],
		['a malformed row', () => Response.json([{ id: 'h-1' }]), 500, 'Internal server error'],
		['an empty result', () => Response.json([]), 500, 'Internal server error'],
		['a partial result', (holidays) => Response.json(savedRows(holidays).slice(1)), 500, 'Internal server error']
	])('answers %s without an audit', async (_label, reply, status, message) => {
		const { ctx, response } = reset(reply);
		await expect(response).rejects.toMatchObject({ status, body: { message } });
		expect(ctx.audit.events).toEqual([]);
	});
});
