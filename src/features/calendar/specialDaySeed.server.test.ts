import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { seedFederalHolidays } from './specialDaySeed.server';

function clientFor(handle: (request: Request) => Promise<Response>) {
	return createClient('http://127.0.0.1:9', 'synthetic-anon-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: { fetch: (input, init) => handle(new Request(input, init)) }
	});
}

function denied(message: string) {
	return Response.json({ code: '42501', message, details: '', hint: '' }, { status: 403 });
}

describe('Calendar federal-holiday seed', () => {
	afterEach(() => vi.useRealTimers());

	it('writes the retained four-year defaults for a new Organization and reports provider denial', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
		for (const reject of [false, true]) {
			const writes: Array<Record<string, unknown>[]> = [];
			const client = clientFor(async (request) => {
				expect(new URL(request.url).pathname).toBe('/rest/v1/special_days');
				expect(request.method).toBe('POST');
				writes.push(await request.json());
				return reject ? denied('Holiday seed denied') : new Response(null, { status: 201 });
			});

			expect(await seedFederalHolidays(client, 'org-1')).toBe(reject ? 'Holiday seed denied' : null);
			expect(writes).toHaveLength(1);
			expect(writes[0]).toHaveLength(44);
			expect(writes[0]).toEqual(
				expect.arrayContaining([
					{ organization_id: 'org-1', date: '2025-01-01', name: "New Year's Day", type: 'federal-holiday' },
					{ organization_id: 'org-1', date: '2026-07-03', name: 'Independence Day', type: 'federal-holiday' },
					{ organization_id: 'org-1', date: '2027-11-25', name: 'Thanksgiving Day', type: 'federal-holiday' },
					{ organization_id: 'org-1', date: '2028-12-25', name: 'Christmas Day', type: 'federal-holiday' }
				])
			);
		}
	});

	it('retains the first provider error after a later batch succeeds', async () => {
		const days = Array.from({ length: 51 }, (_, index) => ({
			date: '2026-01-01',
			name: `Synthetic holiday ${index}`,
			type: 'federal-holiday' as const
		}));
		const received: unknown[] = [];
		const client = clientFor(async (request) => {
			received.push(...(await request.json()));
			return received.length <= 50 ? denied('First batch denied') : new Response(null, { status: 201 });
		});
		expect(await seedFederalHolidays(client, 'org-1', days)).toBe('First batch denied');
		expect(received).toEqual(days.map((day) => ({ organization_id: 'org-1', ...day })));
	});
});
