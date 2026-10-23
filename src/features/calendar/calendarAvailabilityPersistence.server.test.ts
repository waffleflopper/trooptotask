import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSupabaseCalendarAvailabilityPersistence } from './calendarAvailabilityPersistence.server';
import { calendarProvider } from './test-support/calendarProvider';

const RANGE = { rangeStart: '2026-10-06', rangeEnd: '2026-10-08' };
const SAVED = {
	id: 'entry-a',
	organization_id: 'org-a',
	personnel_id: 'person-a',
	status_type_id: 'status-a',
	start_date: '2026-10-01',
	end_date: '2026-10-06',
	note: null,
	created_at: '2026-01-02T03:04:05.123456Z'
};
function persistence(
	client: Parameters<typeof createSupabaseCalendarAvailabilityPersistence>[0],
	options: Partial<Parameters<typeof createSupabaseCalendarAvailabilityPersistence>[1]> = {}
) {
	return createSupabaseCalendarAvailabilityPersistence(client, {
		orgId: 'org-a',
		scopeSet: { kind: 'organization' },
		loadScopedPersonnelIds: async () => [],
		...options
	});
}

describe('Calendar ordinary availability persistence', () => {
	it('retains every tied entry once across reordered provider pages', async () => {
		const ids = Array.from({ length: 1001 }, (_, index) => `entry-${String(index).padStart(4, '0')}`);
		const { client, state } = calendarProvider({
			availability_entries: ids.map((id) => ({ ...SAVED, id }))
		});
		state.unstablePages = true;
		const port = persistence(client);
		for (const result of [
			await port.listOverlapping(RANGE),
			await port.listOverlapping({ ...RANGE, orderByEndDate: true }),
			await port.listPersonnelHistory('person-a')
		]) {
			expect(result.map(({ id }) => id).sort()).toEqual(ids);
		}
	});

	it('binds bulk removal to the captured ordinary client and Organization independently of read scope', async () => {
		const original = [SAVED, { ...SAVED, id: 'foreign', organization_id: 'org-b' }];
		let rows = structuredClone(original);
		const client = createClient('http://calendar-removal.invalid', 'synthetic-ordinary-key', {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: {
				fetch: async (input, init) => {
					const request = new Request(input, init);
					const url = new URL(request.url);
					if (
						url.origin !== 'http://calendar-removal.invalid' ||
						request.headers.get('authorization') !== 'Bearer synthetic-ordinary-key'
					)
						throw new Error('Unexpected removal authority');
					if (request.method === 'GET' && url.pathname === '/rest/v1/availability_entries') {
						const org = url.searchParams.get('organization_id')?.slice(3);
						const ids = url.searchParams.get('id')?.slice(4, -1).split(',') ?? [];
						return Response.json(
							rows
								.filter((row) => row.organization_id === org && ids.includes(row.id))
								.map((row) => ({ personnel_id: row.personnel_id }))
						);
					}
					if (request.method === 'POST' && url.pathname === '/rest/v1/rpc/delete_availability_entries') {
						const { p_organization_id, p_ids } = await request.json();
						const selected = rows.filter((row) => row.organization_id === p_organization_id && p_ids.includes(row.id));
						rows = rows.filter((row) => !selected.includes(row));
						return Response.json(selected.length);
					}
					throw new Error('Unexpected removal transport');
				}
			}
		});
		const port = persistence(client, {
			scopeSet: { kind: 'groups', groupIds: [] },
			loadScopedPersonnelIds: async () => {
				throw new Error('Removal must not use app read scope');
			}
		});
		expect(await port.findPersonnelIds(['entry-a', 'foreign'])).toEqual(['person-a']);
		expect(await port.deleteIds(['entry-a', 'foreign'])).toBe(1);
		expect(rows).toEqual([original[1]]);
	});

	it('sends an import as one Organization-bound transaction and trusts only a matching acknowledgment', async () => {
		const calls: unknown[] = [];
		let reply: () => Response = () => Response.json({ inserted: 1, deleted: 2, stale: [1] });
		const client = createClient('http://calendar-import.invalid', 'synthetic-ordinary-key', {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: {
				fetch: async (input, init) => {
					const request = new Request(input, init);
					if (new URL(request.url).pathname !== '/rest/v1/rpc/import_availability_entries')
						throw new Error('Unexpected import transport');
					calls.push(await request.json());
					return reply();
				}
			}
		});
		const port = persistence(client);
		const entry = {
			personnelId: 'person-a',
			statusTypeId: 'status-a',
			startDate: '2026-11-03',
			endDate: '2026-11-09',
			replaces: [
				{ id: 'entry-a', statusTypeId: 'status-a', startDate: '2026-11-01', endDate: '2026-11-04', note: 'Approved' },
				{ id: 'entry-b', statusTypeId: 'status-b', startDate: '2026-11-08', endDate: '2026-11-12', note: null }
			]
		};
		const free = { ...entry, startDate: '2026-12-01', endDate: '2026-12-01', replaces: [] };

		expect(await port.insertReplacing([entry, free])).toEqual({ inserted: 1, deleted: 2, stale: [1] });
		expect(calls).toEqual([
			{
				p_organization_id: 'org-a',
				p_entries: [
					{
						personnel_id: 'person-a',
						status_type_id: 'status-a',
						start_date: '2026-11-03',
						end_date: '2026-11-09',
						note: null,
						replaces: [
							{
								id: 'entry-a',
								status_type_id: 'status-a',
								start_date: '2026-11-01',
								end_date: '2026-11-04',
								note: 'Approved'
							},
							{
								id: 'entry-b',
								status_type_id: 'status-b',
								start_date: '2026-11-08',
								end_date: '2026-11-12',
								note: null
							}
						]
					},
					{
						personnel_id: 'person-a',
						status_type_id: 'status-a',
						start_date: '2026-12-01',
						end_date: '2026-12-01',
						note: null,
						replaces: []
					}
				]
			}
		]);

		for (const body of [
			{ inserted: 0, deleted: 0, stale: [] },
			{ inserted: 1, deleted: 0 },
			{ inserted: 0, deleted: 0, stale: [1] }
		]) {
			reply = () => Response.json(body);
			await expect(port.insertReplacing([free])).rejects.toThrow('Invalid Calendar import acknowledgment');
		}
		reply = () =>
			Response.json({ code: '42501', message: 'Calendar availability import is not allowed' }, { status: 403 });
		await expect(port.insertReplacing([free])).rejects.toMatchObject({
			status: 403,
			message: 'You do not have access to that Calendar scope'
		});
	});

	it('reads inclusive overlap and exact Person in global end-date order', async () => {
		const { client } = calendarProvider({
			availability_entries: [
				{ ...SAVED, id: 'long', start_date: '2026-10-08', end_date: '2026-10-15' },
				SAVED,
				{ ...SAVED, id: 'past', end_date: '2026-10-05' },
				{ ...SAVED, id: 'future', start_date: '2026-10-09', end_date: '2026-10-10' },
				{ ...SAVED, id: 'other-person', personnel_id: 'person-b' },
				{ ...SAVED, id: 'foreign', organization_id: 'org-b' }
			]
		});
		expect(
			await persistence(client).listOverlapping({ ...RANGE, personnelId: 'person-a', orderByEndDate: true })
		).toEqual([
			{
				id: 'entry-a',
				organization_id: 'org-a',
				personnelId: 'person-a',
				statusTypeId: 'status-a',
				startDate: '2026-10-01',
				endDate: '2026-10-06',
				note: null,
				created_at: '2026-01-02T03:04:05.123456Z'
			},
			{
				id: 'long',
				organization_id: 'org-a',
				personnelId: 'person-a',
				statusTypeId: 'status-a',
				startDate: '2026-10-08',
				endDate: '2026-10-15',
				note: null,
				created_at: '2026-01-02T03:04:05.123456Z'
			}
		]);
	});

	it('intersects explicit IDs with captured scope and shares the pending ordinary lookup', async () => {
		const { client, state } = calendarProvider({
			availability_entries: [SAVED, { ...SAVED, id: 'entry-b', personnel_id: 'person-b' }]
		});
		const pending = Promise.withResolvers<string[]>();
		const lookup = vi.fn(() => pending.promise);
		const port = persistence(client, {
			scopeSet: { kind: 'groups', groupIds: ['alpha'] },
			loadScopedPersonnelIds: lookup
		});
		const first = port.listOverlapping(RANGE);
		const second = port.listOverlapping({ ...RANGE, personnelIds: ['person-a', 'person-b'] });
		expect(lookup).toHaveBeenCalledTimes(1);
		pending.resolve(['person-a']);
		expect((await first).map(({ id }) => id)).toEqual(['entry-a']);
		expect((await second).map(({ id }) => id)).toEqual(['entry-a']);
		expect(await port.listOverlapping({ ...RANGE, personnelId: 'person-b' })).toEqual([]);
		expect(await port.listOverlapping({ ...RANGE, personnelIds: [] })).toEqual([]);
		expect(state.requests.every(({ url }) => url.searchParams.get('personnel_id') === 'in.(person-a)')).toBe(true);
	});

	it('reads only the admitted Person for a Group-scoped single-Person read, and nothing out of scope', async () => {
		const scopedIds = ['person-a', ...Array.from({ length: 250 }, (_, index) => `scoped-${index}`)];
		const { client, state } = calendarProvider({
			availability_entries: [SAVED, { ...SAVED, id: 'entry-scoped', personnel_id: 'scoped-0' }]
		});
		const port = persistence(client, {
			scopeSet: { kind: 'groups', groupIds: ['alpha'] },
			loadScopedPersonnelIds: async () => scopedIds
		});

		expect((await port.listOverlapping({ ...RANGE, personnelId: 'person-a' })).map(({ id }) => id)).toEqual([
			'entry-a'
		]);
		expect(state.requests.map(({ url }) => url.searchParams.getAll('personnel_id'))).toEqual([['eq.person-a']]);
		state.requests.length = 0;
		expect(await port.listOverlapping({ ...RANGE, personnelId: 'person-b' })).toEqual([]);
		expect(state.requests).toEqual([]);
	});

	it('avoids scope lookup for Organization and provider access for explicit empty scopes', async () => {
		const { client, state } = calendarProvider({ availability_entries: [SAVED] });
		const lookup = vi.fn(async () => ['person-b']);
		expect(
			(await persistence(client, { loadScopedPersonnelIds: lookup }).listOverlapping(RANGE)).map(({ id }) => id)
		).toEqual(['entry-a']);
		expect(lookup).not.toHaveBeenCalled();
		state.requests.length = 0;
		expect(
			await persistence(client, {
				scopeSet: { kind: 'groups', groupIds: [] },
				loadScopedPersonnelIds: lookup
			}).listOverlapping(RANGE)
		).toEqual([]);
		expect(
			await persistence(client, { loadScopedPersonnelIds: lookup }).listOverlapping({ ...RANGE, personnelIds: [] })
		).toEqual([]);
		expect(state.requests).toEqual([]);
		expect(lookup).not.toHaveBeenCalled();
	});

	it('keeps complete history and references Organization bound while bypassing app scope', async () => {
		const { client, state } = calendarProvider({
			availability_entries: [
				SAVED,
				{ ...SAVED, id: 'older', start_date: '2025-01-01' },
				{ ...SAVED, id: 'foreign', organization_id: 'org-b' }
			]
		});
		const lookup = vi.fn(async () => []);
		const port = persistence(client, { scopeSet: { kind: 'groups', groupIds: [] }, loadScopedPersonnelIds: lookup });
		expect((await port.listPersonnelHistory('person-a')).map(({ id }) => id)).toEqual(['entry-a', 'older']);
		expect(await port.findReference('entry-a')).toEqual({ personnelId: 'person-a' });
		expect(await port.findReference('foreign')).toBeNull();
		expect(await port.findReference('missing')).toBeNull();
		state.nullData = true;
		expect(await port.findReference('entry-a')).toBeNull();
		state.nullData = false;
		expect(lookup).not.toHaveBeenCalled();
		state.failure = () => ({ code: '42501', message: 'Reference unavailable', status: 403 });
		await expect(port.findReference('entry-a')).rejects.toThrow('Reference unavailable');
	});

	it('completes1000-row pages and rejects first or late read failures', async () => {
		const { client, state } = calendarProvider({
			availability_entries: Array.from({ length: 1001 }, (_, index) => ({ ...SAVED, id: `entry-${index}` }))
		});
		const port = persistence(client);
		expect((await port.listOverlapping(RANGE)).map(({ id }) => id)).toHaveLength(1001);
		expect((await port.listPersonnelHistory('person-a')).map(({ id }) => id).sort()).toEqual(
			Array.from({ length: 1001 }, (_, index) => `entry-${index}`).sort()
		);
		for (const offset of [0, 1000]) {
			state.failure = (request) =>
				request.offset >= offset ? { code: '42501', message: 'Availability unavailable', status: 403 } : null;
			await expect(port.listOverlapping(RANGE)).rejects.toThrow('Availability unavailable');
			await expect(port.listPersonnelHistory('person-a')).rejects.toThrow('Availability unavailable');
		}
		state.failure = null;
		state.nullData = true;
		expect(await port.listOverlapping(RANGE)).toEqual([]);
		expect(await port.listPersonnelHistory('person-a')).toEqual([]);
	});

	it('bounds large scoped ID reads and keeps global ordering across chunks', async () => {
		const ids = Array.from(
			{ length: 1001 },
			(_, index) => `00000000-0000-4000-a000-${String(index).padStart(12, '0')}`
		);
		const { client, state } = calendarProvider({
			availability_entries: ids.map((personnel_id, index) => ({
				...SAVED,
				id: `entry-${index}`,
				personnel_id,
				end_date: index === 1000 ? '2026-10-06' : '2026-10-08'
			}))
		});
		const port = persistence(client, {
			scopeSet: { kind: 'groups', groupIds: ['alpha'] },
			loadScopedPersonnelIds: async () => ids
		});
		const result = await port.listOverlapping({ ...RANGE, orderByEndDate: true });
		expect(result).toHaveLength(1001);
		expect(result[0].id).toBe('entry-1000');
		expect(new Set(result.map(({ personnelId }) => personnelId))).toEqual(new Set(ids));
		expect(Math.max(...state.requests.map(({ url }) => url.href.length))).toBeLessThan(6000);
		state.failure = (request) =>
			request.url.searchParams.get('personnel_id')?.includes(ids[100])
				? { code: '42501', message: 'Later scope chunk failed', status: 403 }
				: null;
		await expect(port.listOverlapping(RANGE)).rejects.toThrow('Later scope chunk failed');
	});

	it('returns actual saved writes and nullable notes', async () => {
		const { client, state } = calendarProvider({
			availability_entries: [{ ...SAVED, id: 'foreign', organization_id: 'org-b' }]
		});
		const port = persistence(client);
		expect(
			await port.create({
				personnelId: 'person-a',
				statusTypeId: 'status-a',
				startDate: '2026-10-06',
				endDate: '2026-10-08'
			})
		).toEqual({
			id: 'saved-1',
			organization_id: 'org-a',
			created_at: '2026-10-06T12:00:00.123456Z',
			personnelId: 'person-a',
			statusTypeId: 'status-a',
			startDate: '2026-10-06',
			endDate: '2026-10-08',
			note: null
		});
		expect(await port.update('saved-1', { note: 'Retained identity' })).toMatchObject({
			id: 'saved-1',
			personnelId: 'person-a',
			startDate: '2026-10-06',
			note: 'Retained identity'
		});
		expect(await port.update('saved-1', { note: null })).toMatchObject({ id: 'saved-1', note: null });
		expect(
			await port.createMany([
				{
					personnelId: 'person-b',
					statusTypeId: 'status-a',
					startDate: '2026-10-07',
					endDate: '2026-10-07',
					note: 'Batch'
				}
			])
		).toEqual([
			{
				id: 'saved-2',
				organization_id: 'org-a',
				created_at: '2026-10-06T12:00:00.123456Z',
				personnelId: 'person-b',
				statusTypeId: 'status-a',
				startDate: '2026-10-07',
				endDate: '2026-10-07',
				note: 'Batch'
			}
		]);
		await port.delete('saved-1');
		await port.delete('saved-2');
		await port.delete('saved-2');
		expect(state.rows.availability_entries).toEqual([{ ...SAVED, id: 'foreign', organization_id: 'org-b' }]);
		state.requests.length = 0;
		expect(await port.createMany([])).toEqual([]);
		expect(state.requests).toEqual([]);
	});

	it.each(['create', 'update', 'createMany'] as const)(
		'classifies only the named org/status conflict from %s',
		async (method) => {
			const { client, state } = calendarProvider();
			const port = persistence(client);
			const input = {
				personnelId: 'person-a',
				statusTypeId: 'status-a',
				startDate: '2026-10-06',
				endDate: '2026-10-06'
			};
			const execute = () =>
				method === 'create'
					? port.create(input)
					: method === 'update'
						? port.update('missing', { statusTypeId: 'status-a' })
						: port.createMany([input]);
			state.failure = () => ({
				code: '23503',
				message: 'violates foreign key constraint "availability_entries_org_status_type_fkey"',
				status: 409
			});
			await expect(execute()).rejects.toMatchObject({
				status: 404,
				message: 'Status type is unavailable for this Organization'
			});
			state.failure = () => ({ code: '23503', message: 'Different reference constraint', status: 409 });
			await expect(execute()).rejects.toMatchObject({ message: 'Different reference constraint' });
			expect(state.rows.availability_entries).toEqual([]);
		}
	);

	it.each([
		['availability_entries_note_length', 'Note must be 200 characters or fewer'],
		['valid_date_range', 'End date must be on or after the start date']
	])('turns the %s check into a public 400 without saving', async (constraint, message) => {
		const { client, state } = calendarProvider({ availability_entries: [] });
		state.failure = (request) =>
			request.method === 'POST'
				? {
						code: '23514',
						message: `new row for relation "availability_entries" violates check constraint "${constraint}"`,
						status: 400
					}
				: null;
		await expect(
			persistence(client).create({
				personnelId: 'person-a',
				statusTypeId: 'status-a',
				startDate: '2026-10-06',
				endDate: '2026-10-01'
			})
		).rejects.toMatchObject({ status: 400, message });
		expect(state.rows.availability_entries).toEqual([]);
	});
});
