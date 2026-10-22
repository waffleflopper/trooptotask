import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseCalendarCatalogPersistence } from './calendarCatalogPersistence.server';
import { calendarProvider } from './test-support/calendarProvider';

const ORG = 'org-a';
const TIME = '2026-10-06T12:00:00.123456Z';

describe('Calendar ordinary catalog persistence', () => {
	it.each([
		['status_types', 'listStatusTypes', false],
		['status_types', 'listStatusTypeLabels', false],
		['assignment_types', 'listAssignmentTypes', false],
		['special_days', 'listSpecialDays', false],
		['special_days', 'listSpecialDays', true]
	] as const)('returns every %s row once through %s despite tied page reordering', async (table, method, ranged) => {
		const ids = Array.from({ length: 1001 }, (_, index) => `row-${String(index).padStart(4, '0')}`);
		const { client, state } = calendarProvider({
			[table]: ids.map((id) => ({
				id,
				organization_id: ORG,
				name: id,
				color: '#123456',
				text_color: '#ffffff',
				sort_order: 0,
				date: '2026-10-06',
				type: 'org-closure',
				short_name: id,
				assign_to: 'personnel',
				show_on_calendar: false,
				roster_pool_rules: null,
				roster_weekend_mode: 'same'
			}))
		});
		state.unstablePages = true;
		const port = createSupabaseCalendarCatalogPersistence(client, ORG);
		const result = ranged
			? await port.listSpecialDays({ rangeStart: '2026-10-06', rangeEnd: '2026-10-06' })
			: await port[method]();
		expect(result.map(({ id }) => id).sort()).toEqual(ids);
	});

	it('returns complete ordered catalogs and saved metadata without foreign rows', async () => {
		const statuses = Array.from({ length: 1001 }, (_, index) => ({
			id: `status-${index}`,
			organization_id: ORG,
			name: `Status ${index}`,
			color: '#123456',
			text_color: '#abcdef',
			short_label: index === 0 ? 'S0' : null,
			sort_order: 1000 - index,
			created_at: TIME,
			private_column: 'discard'
		}));
		const { client, state } = calendarProvider({
			status_types: [...statuses, { ...statuses[0], id: 'foreign', organization_id: 'org-b' }],
			assignment_types: [
				{
					id: 'archived',
					organization_id: ORG,
					name: 'Historic',
					short_name: 'H',
					assign_to: 'group',
					color: '#456789',
					sort_order: 2,
					show_on_calendar: false,
					roster_pool_rules: null,
					roster_weekend_mode: 'separate',
					roster_excusals: [
						{ personnel_id: 'p-1', reason: 'First sergeant', starts_on: '2026-01-01', ends_on: null },
						{ personnel_id: 'p-2', reason: 'Reinstated', starts_on: '2026-01-01', ends_on: '2026-02-01' }
					],
					archived_at: '2026-01-01',
					created_at: TIME
				}
			]
		});
		const port = createSupabaseCalendarCatalogPersistence(client, ORG);
		const result = await port.listStatusTypes();
		expect(result).toHaveLength(1001);
		expect(result[0]).toEqual({
			id: 'status-1000',
			organization_id: ORG,
			name: 'Status 1000',
			color: '#123456',
			textColor: '#abcdef',
			shortLabel: null,
			sortOrder: 0,
			created_at: TIME
		});
		expect(result.at(-1)).toEqual({
			id: 'status-0',
			organization_id: ORG,
			name: 'Status 0',
			color: '#123456',
			textColor: '#abcdef',
			shortLabel: 'S0',
			sortOrder: 1000,
			created_at: TIME
		});
		const labels = await port.listStatusTypeLabels();
		expect(labels.map(({ id }) => id).sort()).toEqual(statuses.map(({ id }) => id).sort());
		expect(labels.find(({ id }) => id === 'status-1000')).toEqual({ id: 'status-1000', name: 'Status 1000' });
		expect(await port.listAssignmentTypes()).toEqual([
			{
				id: 'archived',
				organization_id: ORG,
				name: 'Historic',
				shortName: 'H',
				assignTo: 'group',
				color: '#456789',
				showOnCalendar: false,
				sortOrder: 2,
				poolRules: null,
				weekendMode: 'separate',
				excusals: [{ personId: 'p-1', reason: 'First sergeant', startsOn: '2026-01-01' }],
				archivedAt: '2026-01-01',
				created_at: TIME
			}
		]);
		expect(
			state.requests
				.filter(({ table }) => table === 'assignment_types')
				.map(({ url }) => url.searchParams.get('roster_excusals.ends_on'))
		).toEqual(['is.null']);
	});

	it('retains returned null sort order and omission without inventing saved metadata', async () => {
		const { client } = calendarProvider({
			status_types: [
				{ id: 'null', name: 'Null', color: '#111111', text_color: '#ffffff', sort_order: null, organization_id: ORG },
				{ id: 'omitted', name: 'Omitted', color: '#222222', text_color: '#000000', organization_id: ORG }
			]
		});
		expect(await createSupabaseCalendarCatalogPersistence(client, ORG).listStatusTypes()).toEqual([
			{ id: 'null', name: 'Null', color: '#111111', textColor: '#ffffff', sortOrder: null, organization_id: ORG },
			{ id: 'omitted', name: 'Omitted', color: '#222222', textColor: '#000000', organization_id: ORG }
		]);
	});

	it.each(['listStatusTypes', 'listStatusTypeLabels', 'listAssignmentTypes', 'listSpecialDays'] as const)(
		'rejects first and late failures in %s without partial results',
		async (method) => {
			const table = method.startsWith('listStatus')
				? 'status_types'
				: method === 'listAssignmentTypes'
					? 'assignment_types'
					: 'special_days';
			const { client, state } = calendarProvider({
				[table]: Array.from({ length: 1001 }, (_, index) => ({ id: `row-${index}`, organization_id: ORG }))
			});
			const port = createSupabaseCalendarCatalogPersistence(client, ORG);
			for (const offset of [0, 1000]) {
				state.failure = (request) =>
					request.offset >= offset ? { code: '42501', message: 'Catalog unavailable', status: 403 } : null;
				await expect(port[method]()).rejects.toThrow('Catalog unavailable');
			}
			state.failure = null;
			state.nullData = true;
			expect(await port[method]()).toEqual([]);
		}
	);

	it('creates saved rows with defaults and patches only submitted fields', async () => {
		const shownLane = {
			id: 'shown-1',
			organization_id: ORG,
			created_at: TIME,
			name: 'Staff Duty',
			short_name: 'SD',
			assign_to: 'personnel',
			color: '#b91c1c',
			sort_order: 7,
			show_on_calendar: true,
			roster_pool_rules: null,
			roster_weekend_mode: 'same'
		};
		const savedStatus = (id: string, organization_id: string, sort_order: number) => ({
			id,
			organization_id,
			created_at: TIME,
			name: id,
			color: '#123456',
			text_color: '#ffffff',
			short_label: null,
			sort_order
		});
		const existingStatuses = [
			savedStatus('school', ORG, 2),
			savedStatus('tdy', ORG, 9),
			savedStatus('cq', ORG, 9),
			savedStatus('foreign', 'org-b', 40)
		];
		const { client, state } = calendarProvider({ assignment_types: [shownLane], status_types: existingStatuses });
		const port = createSupabaseCalendarCatalogPersistence(client, ORG);
		expect(await port.createStatusType({ name: 'Leave' })).toEqual({
			id: 'saved-1',
			organization_id: ORG,
			created_at: TIME,
			name: 'Leave',
			color: '#6b7280',
			textColor: '#ffffff',
			shortLabel: null,
			sortOrder: 10
		});
		expect(await port.createStatusType({ name: 'Sick', shortLabel: 'SK' })).toMatchObject({
			id: 'saved-2',
			shortLabel: 'SK',
			sortOrder: 11
		});
		expect(await port.updateStatusType('saved-1', { textColor: '#000000', shortLabel: 'LV' })).toEqual({
			id: 'saved-1',
			organization_id: ORG,
			created_at: TIME,
			name: 'Leave',
			color: '#6b7280',
			textColor: '#000000',
			shortLabel: 'LV',
			sortOrder: 10
		});
		expect(await port.createAssignmentType({ name: 'Duty', shortName: 'D', assignTo: 'personnel' })).toEqual({
			id: 'saved-3',
			organization_id: ORG,
			created_at: TIME,
			name: 'Duty',
			shortName: 'D',
			assignTo: 'personnel',
			color: '#6b7280',
			showOnCalendar: false,
			sortOrder: 0,
			poolRules: null,
			weekendMode: 'same',
			excusals: []
		});
		const edit = { assignTo: 'group' as const, showOnCalendar: false, sortOrder: 2, weekendMode: 'none' };
		expect(await port.updateAssignmentType('shown-1', edit)).toEqual({
			id: 'shown-1',
			organization_id: ORG,
			created_at: TIME,
			name: 'Staff Duty',
			shortName: 'SD',
			assignTo: 'group',
			color: '#b91c1c',
			showOnCalendar: true,
			sortOrder: 7,
			poolRules: null,
			weekendMode: 'same',
			excusals: []
		});
		expect(state.rows.status_types).toEqual([
			...existingStatuses,
			{
				id: 'saved-1',
				organization_id: ORG,
				created_at: TIME,
				name: 'Leave',
				color: '#6b7280',
				text_color: '#000000',
				short_label: 'LV',
				sort_order: 10
			},
			{
				id: 'saved-2',
				organization_id: ORG,
				created_at: TIME,
				name: 'Sick',
				color: '#6b7280',
				text_color: '#ffffff',
				short_label: 'SK',
				sort_order: 11
			}
		]);
		expect(state.rows.assignment_types).toEqual([
			{ ...shownLane, assign_to: 'group' },
			{
				id: 'saved-3',
				organization_id: ORG,
				created_at: TIME,
				name: 'Duty',
				short_name: 'D',
				assign_to: 'personnel',
				color: '#6b7280',
				sort_order: 0,
				show_on_calendar: false,
				roster_pool_rules: null,
				roster_weekend_mode: 'same'
			}
		]);
		const statusPatches = state.requests.filter(({ table, method }) => table === 'status_types' && method === 'PATCH');
		expect(statusPatches.map(({ body }) => body)).toEqual([{ text_color: '#000000', short_label: 'LV' }]);
		const typeWrites = state.requests.filter(({ table, body }) => table === 'assignment_types' && body);
		for (const { body } of typeWrites) {
			expect(body).not.toHaveProperty('sort_order');
			expect(body).not.toHaveProperty('show_on_calendar');
		}
		// Roster rules change only when a DA 6 form closes, so a details edit never writes them.
		const typePatches = state.requests.filter(
			({ table, method }) => table === 'assignment_types' && method === 'PATCH'
		);
		expect(typePatches).toHaveLength(1);
		expect(typePatches[0].body).not.toHaveProperty('roster_weekend_mode');
		expect(typePatches[0].body).not.toHaveProperty('roster_pool_rules');
		await expect(
			createSupabaseCalendarCatalogPersistence(client, 'org-b').updateStatusType('saved-1', { name: 'Hidden' })
		).resolves.toBeNull();
		expect(state.rows.status_types.find((row) => row.id === 'saved-1')).toMatchObject({
			organization_id: ORG,
			name: 'Leave'
		});
	});

	it('reads exact target IDs in finite chunks and preserves the personnel fallback', async () => {
		const ids = Array.from(
			{ length: 1001 },
			(_, index) => `00000000-0000-4000-a000-${String(index).padStart(12, '0')}`
		);
		const { client, state } = calendarProvider({
			assignment_types: ids.map((id, index) => ({
				id,
				organization_id: index === 1000 ? 'org-b' : ORG,
				assign_to: index === 1 ? 'group' : 'legacy'
			}))
		});
		const port = createSupabaseCalendarCatalogPersistence(client, ORG);
		expect(await port.listAssignmentTypeTargets([])).toEqual([]);
		expect(state.requests).toEqual([]);
		const result = await port.listAssignmentTypeTargets([...ids, ids[0]]);
		expect(result).toHaveLength(1000);
		expect(result.slice(0, 2)).toEqual([
			{ id: ids[0], assignTo: 'personnel' },
			{ id: ids[1], assignTo: 'group' }
		]);
		expect(result.at(-1)).toEqual({ id: ids[999], assignTo: 'personnel' });
		expect(Math.max(...state.requests.map(({ url }) => url.href.length))).toBeLessThan(6000);
		state.failure = (request) =>
			request.url.searchParams.get('id')?.includes(ids[100])
				? { code: '42501', message: 'Targets unavailable', status: 403 }
				: null;
		await expect(port.listAssignmentTypeTargets(ids)).rejects.toThrow('Targets unavailable');
	});

	it('keeps the unfiltered closure set and inclusive ordered range', async () => {
		const { client, state } = calendarProvider({
			special_days: [
				{
					id: 'closure',
					organization_id: ORG,
					date: '2026-10-08',
					name: 'Closed',
					type: 'org-closure',
					created_at: TIME
				},
				{ id: 'old-holiday', organization_id: ORG, date: '2026-10-06', name: 'Custom', type: 'federal-holiday' },
				{ id: 'foreign', organization_id: 'org-b', date: '2026-10-07', name: 'Private', type: 'federal-holiday' }
			]
		});
		const port = createSupabaseCalendarCatalogPersistence(client, ORG);
		expect((await port.listSpecialDays()).map(({ id }) => id)).toEqual(['closure', 'old-holiday']);
		expect(
			(await port.listSpecialDays({ rangeStart: '2026-10-06', rangeEnd: '2026-10-08' })).map(({ id }) => id)
		).toEqual(['old-holiday', 'closure']);
		expect(await port.updateSpecialDay('closure', { name: 'Updated' })).toEqual({
			id: 'closure',
			organization_id: ORG,
			created_at: TIME,
			date: '2026-10-08',
			name: 'Updated',
			type: 'org-closure'
		});
		await port.deleteSpecialDay('closure');
		await port.deleteSpecialDay('closure');
		expect(state.rows.special_days.map(({ id }) => id)).toEqual(['old-holiday', 'foreign']);
	});

	it.each(['deleteStatusType', 'deleteAssignmentType', 'deleteSpecialDay'] as const)(
		'keeps %s idempotent and propagates provider failure',
		async (method) => {
			const { client, state } = calendarProvider();
			const port = createSupabaseCalendarCatalogPersistence(client, ORG);
			await port[method]('absent');
			state.failure = () => ({ code: '23503', message: 'Referenced catalog', status: 409 });
			await expect(port[method]('absent')).rejects.toThrow('Referenced catalog');
		}
	);
});

const COMMAND_ORG = '00000000-0000-4000-8000-0000000000a1';
const STAFF = '00000000-0000-4000-8000-000000000401';
const GROUP = '00000000-0000-4000-8000-000000000402';

function calendarRpc(reply: () => Response | Promise<Response>) {
	const calls: Array<{ path: string; body: unknown }> = [];
	const client = createClient('http://127.0.0.1:9', 'synthetic-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				calls.push({ path: new URL(request.url).pathname, body: await request.json() });
				return reply();
			}
		}
	});
	return { calls, port: createSupabaseCalendarCatalogPersistence(client, COMMAND_ORG) };
}

function databaseError(code: string, message: string, status = 400) {
	return () => Response.json({ code, message, details: null, hint: null }, { status });
}

const closureRow = (id: string, date: string, name = 'Holiday leave') => ({
	id,
	organization_id: COMMAND_ORG,
	date,
	name,
	type: 'org-closure',
	created_at: TIME
});

const holidayRow = (id: string, date: string, name: string) => ({
	id,
	organization_id: COMMAND_ORG,
	date,
	name,
	type: 'federal-holiday',
	created_at: TIME
});

describe('Calendar configuration commands', () => {
	it('resets federal holidays in one call bound to the Organization and returns the saved rows', async () => {
		const { calls, port } = calendarRpc(() =>
			Response.json([
				holidayRow('h-1', '2026-12-25', 'Christmas Day'),
				holidayRow('h-2', '2027-01-01', "New Year's Day")
			])
		);
		const holidays = [
			{ date: '2027-01-01', name: "New Year's Day" },
			{ date: '2026-12-25', name: 'Christmas Day' }
		];
		await expect(port.resetFederalHolidays(holidays)).resolves.toEqual([
			{
				id: 'h-1',
				organization_id: COMMAND_ORG,
				created_at: TIME,
				date: '2026-12-25',
				name: 'Christmas Day',
				type: 'federal-holiday'
			},
			{
				id: 'h-2',
				organization_id: COMMAND_ORG,
				created_at: TIME,
				date: '2027-01-01',
				name: "New Year's Day",
				type: 'federal-holiday'
			}
		]);
		expect(calls).toEqual([
			{ path: '/rest/v1/rpc/reset_federal_holidays', body: { p_organization_id: COMMAND_ORG, p_holidays: holidays } }
		]);
	});

	it('adds closure days in one call bound to the Organization and returns the added rows', async () => {
		const { calls, port } = calendarRpc(() =>
			Response.json([closureRow('c-1', '2026-12-23'), closureRow('c-2', '2026-12-29')])
		);
		await expect(port.addClosureDays('Holiday leave', ['2026-12-29', '2026-12-25', '2026-12-23'])).resolves.toEqual([
			{
				id: 'c-1',
				organization_id: COMMAND_ORG,
				created_at: TIME,
				date: '2026-12-23',
				name: 'Holiday leave',
				type: 'org-closure'
			},
			{
				id: 'c-2',
				organization_id: COMMAND_ORG,
				created_at: TIME,
				date: '2026-12-29',
				name: 'Holiday leave',
				type: 'org-closure'
			}
		]);
		expect(calls).toEqual([
			{
				path: '/rest/v1/rpc/add_closure_days',
				body: {
					p_organization_id: COMMAND_ORG,
					p_name: 'Holiday leave',
					p_dates: ['2026-12-29', '2026-12-25', '2026-12-23']
				}
			}
		]);
	});

	it('treats added rows that do not match the closure request as an internal error', async () => {
		const dates = ['2026-12-23', '2026-12-24'];
		for (const rows of [
			[{ ...closureRow('c-1', '2026-12-23'), type: 'federal-holiday' }],
			[{ ...closureRow('c-1', '2026-12-23'), organization_id: 'foreign-org' }],
			[closureRow('c-1', '2026-12-23', 'Other leave')],
			[closureRow('c-1', '2026-12-25')],
			[closureRow('c-1', '2026-12-23'), closureRow('c-1', '2026-12-24')],
			[closureRow('c-2', '2026-12-24'), closureRow('c-1', '2026-12-23')],
			[closureRow('c-1', '2026-12-23'), closureRow('c-2', '2026-12-23')]
		]) {
			const unexpected = calendarRpc(() => Response.json(rows));
			await expect(unexpected.port.addClosureDays('Holiday leave', dates)).rejects.not.toHaveProperty('status');
		}
	});

	it('saves the Calendar lanes in one call and accepts the empty acknowledgment', async () => {
		const { calls, port } = calendarRpc(() => new Response(null, { status: 204 }));
		await expect(port.setCalendarLanes([GROUP, STAFF], [STAFF])).resolves.toBeUndefined();
		expect(calls).toEqual([
			{
				path: '/rest/v1/rpc/set_calendar_lanes',
				body: { p_organization_id: COMMAND_ORG, p_lane_type_ids: [GROUP, STAFF], p_expected_lane_type_ids: [STAFF] }
			}
		]);
	});

	it('saves the status order in one call and accepts the empty acknowledgment', async () => {
		const { calls, port } = calendarRpc(() => new Response(null, { status: 204 }));
		await expect(port.setStatusTypeOrder([STAFF, GROUP], [GROUP, STAFF])).resolves.toBeUndefined();
		expect(calls).toEqual([
			{
				path: '/rest/v1/rpc/set_status_type_order',
				body: {
					p_organization_id: COMMAND_ORG,
					p_status_type_ids: [STAFF, GROUP],
					p_expected_status_type_ids: [GROUP, STAFF]
				}
			}
		]);
	});

	it.each([
		['42501', 403],
		['P0002', 404],
		['22023', 400],
		['22P02', 400],
		['CLN01', 409],
		['STO01', 409],
		['40P01', 409],
		['40001', 409],
		['55P03', 409],
		['23505', 409]
	])('answers a rolled back %s as a %i without forwarding the database message', async (code, status) => {
		const { port } = calendarRpc(databaseError(code, 'synthetic database message', 500));
		for (const command of [
			() => port.setCalendarLanes([GROUP], [STAFF]),
			() => port.setStatusTypeOrder([GROUP, STAFF], [STAFF, GROUP]),
			() => port.resetFederalHolidays([{ date: '2026-12-25', name: 'Christmas Day' }]),
			() => port.addClosureDays('Holiday leave', ['2026-12-23'])
		]) {
			const failure = await command().then(
				() => undefined,
				(error: unknown) => error
			);
			expect(failure).toMatchObject({ name: 'RequestFailure', status });
			expect((failure as Error).message).not.toContain('synthetic database message');
		}
	});

	it('says a lost or unreadable reply is unconfirmed', async () => {
		for (const reply of [
			() => Promise.reject(new TypeError('fetch failed')),
			() => new Response('<html>Bad gateway</html>', { status: 502 })
		]) {
			const { port } = calendarRpc(reply);
			await expect(port.setCalendarLanes([GROUP], [STAFF])).rejects.toMatchObject({ status: 503, publicMessage: true });
			await expect(port.setStatusTypeOrder([GROUP, STAFF], [STAFF, GROUP])).rejects.toMatchObject({
				status: 503,
				publicMessage: true
			});
			await expect(port.resetFederalHolidays([{ date: '2026-12-25', name: 'Christmas Day' }])).rejects.toMatchObject({
				status: 503,
				publicMessage: true
			});
			await expect(port.addClosureDays('Holiday leave', ['2026-12-23'])).rejects.toMatchObject({
				status: 503,
				publicMessage: true
			});
		}
	});

	it('treats any other database failure and an unexpected result as internal errors', async () => {
		const other = calendarRpc(databaseError('22008', 'date/time field value out of range'));
		await expect(other.port.resetFederalHolidays([{ date: '2026-02-30', name: 'Bad' }])).rejects.toThrow(
			'date/time field value out of range'
		);
		await expect(other.port.setCalendarLanes([GROUP], [STAFF])).rejects.not.toHaveProperty('status');
		for (const rows of [
			[{ ...holidayRow('h-1', '2026-12-25', 'Christmas Day'), type: 'org-closure' }],
			[{ id: 'h-1', date: '2026-12-25', name: 'Christmas Day', type: 'federal-holiday' }],
			{ id: 'h-1' }
		]) {
			const malformed = calendarRpc(() => Response.json(rows));
			await expect(
				malformed.port.resetFederalHolidays([{ date: '2026-12-25', name: 'Christmas Day' }])
			).rejects.toThrow('reset_federal_holidays returned an unexpected result');
		}
		const acknowledged = calendarRpc(() => Response.json({ saved: true }));
		await expect(acknowledged.port.setCalendarLanes([GROUP], [STAFF])).rejects.toThrow(
			'set_calendar_lanes returned an unexpected result'
		);
	});

	it('treats a successful reset that does not hold exactly the submitted defaults as an internal error', async () => {
		const holidays = [
			{ date: '2026-12-25', name: 'Christmas Day' },
			{ date: '2027-01-01', name: "New Year's Day" }
		];
		const christmas = holidayRow('h-1', '2026-12-25', 'Christmas Day');
		const newYear = holidayRow('h-2', '2027-01-01', "New Year's Day");
		const empty = calendarRpc(() => Response.json([]));
		await expect(empty.port.resetFederalHolidays(holidays)).rejects.toThrow(
			'reset_federal_holidays returned an unexpected result'
		);
		for (const rows of [
			[christmas],
			[christmas, { ...newYear, id: 'h-1' }],
			[christmas, { ...newYear, organization_id: 'foreign-org' }],
			[christmas, { ...newYear, name: 'New Year Observed' }],
			[christmas, christmas, newYear]
		]) {
			const incomplete = calendarRpc(() => Response.json(rows));
			await expect(incomplete.port.resetFederalHolidays(holidays)).rejects.toThrow(
				'reset_federal_holidays returned an incomplete result'
			);
		}
		const repeated = [...holidays, holidays[0]];
		const complete = calendarRpc(() => Response.json([christmas, { ...christmas, id: 'h-3' }, newYear]));
		expect((await complete.port.resetFederalHolidays(repeated)).map(({ id }) => id)).toEqual(['h-1', 'h-3', 'h-2']);
	});
});
