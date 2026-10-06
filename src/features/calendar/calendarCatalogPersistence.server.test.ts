import { describe, expect, it } from 'vitest';
import { createSupabaseCalendarCatalogPersistence } from './calendarCatalogPersistence.server';
import { calendarProvider } from './test-support/calendarProvider';

const ORG = 'org-a';
const TIME = '2026-10-06T12:00:00.123456Z';

describe('Calendar ordinary catalog persistence', () => {
	it('returns complete ordered catalogs and saved metadata without foreign rows', async () => {
		const statuses = Array.from({ length: 1001 }, (_, index) => ({
			id: `status-${index}`,
			organization_id: ORG,
			name: `Status ${index}`,
			color: '#123456',
			text_color: '#abcdef',
			sort_order: 1000 - index,
			created_at: TIME,
			private_column: 'discard'
		}));
		const { client } = calendarProvider({
			status_types: [...statuses, { ...statuses[0], id: 'foreign', organization_id: 'org-b' }],
			assignment_types: [
				{
					id: 'archived',
					organization_id: ORG,
					name: 'Historic',
					short_name: 'H',
					assign_to: 'group',
					color: '#456789',
					sort_order: null,
					show_in_date_header: true,
					exempt_personnel_ids: null,
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
			sortOrder: 0,
			created_at: TIME
		});
		expect(result.at(-1)).toEqual({
			id: 'status-0',
			organization_id: ORG,
			name: 'Status 0',
			color: '#123456',
			textColor: '#abcdef',
			sortOrder: 1000,
			created_at: TIME
		});
		expect((await port.listStatusTypeLabels()).at(-1)).toEqual({ id: 'status-1000', name: 'Status 1000' });
		expect(await port.listAssignmentTypes()).toEqual([
			{
				id: 'archived',
				organization_id: ORG,
				name: 'Historic',
				shortName: 'H',
				assignTo: 'group',
				color: '#456789',
				sortOrder: null,
				showInDateHeader: true,
				exemptPersonnelIds: [],
				archivedAt: '2026-01-01',
				created_at: TIME
			}
		]);
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
		const { client, state } = calendarProvider();
		const port = createSupabaseCalendarCatalogPersistence(client, ORG);
		expect(await port.createStatusType({ name: 'Leave' })).toEqual({
			id: 'saved-1',
			organization_id: ORG,
			created_at: TIME,
			name: 'Leave',
			color: '#6b7280',
			textColor: '#ffffff',
			sortOrder: 0
		});
		expect(await port.updateStatusType('saved-1', { textColor: '#000000', sortOrder: 3 })).toEqual({
			id: 'saved-1',
			organization_id: ORG,
			created_at: TIME,
			name: 'Leave',
			color: '#6b7280',
			textColor: '#000000',
			sortOrder: 3
		});
		expect(await port.createAssignmentType({ name: 'Duty', shortName: 'D', assignTo: 'personnel' })).toEqual({
			id: 'saved-2',
			organization_id: ORG,
			created_at: TIME,
			name: 'Duty',
			shortName: 'D',
			assignTo: 'personnel',
			color: '#6b7280',
			sortOrder: 0,
			exemptPersonnelIds: [],
			showInDateHeader: false
		});
		expect(
			await port.updateAssignmentType('saved-2', {
				assignTo: 'group',
				color: '#123456',
				exemptPersonnelIds: ['person-a'],
				showInDateHeader: true
			})
		).toEqual({
			id: 'saved-2',
			organization_id: ORG,
			created_at: TIME,
			name: 'Duty',
			shortName: 'D',
			assignTo: 'group',
			color: '#123456',
			sortOrder: 0,
			exemptPersonnelIds: ['person-a'],
			showInDateHeader: true
		});
		expect(state.rows.status_types).toEqual([
			{
				id: 'saved-1',
				organization_id: ORG,
				created_at: TIME,
				name: 'Leave',
				color: '#6b7280',
				text_color: '#000000',
				sort_order: 3
			}
		]);
		expect(state.rows.assignment_types).toEqual([
			{
				id: 'saved-2',
				organization_id: ORG,
				created_at: TIME,
				name: 'Duty',
				short_name: 'D',
				assign_to: 'group',
				color: '#123456',
				sort_order: 0,
				exempt_personnel_ids: ['person-a'],
				show_in_date_header: true
			}
		]);
		await expect(
			createSupabaseCalendarCatalogPersistence(client, 'org-b').updateStatusType('saved-1', { name: 'Hidden' })
		).rejects.toThrow('Expected one row');
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

	it('keeps the unfiltered closure set, inclusive ordered range and federal reset effects', async () => {
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
		expect(await port.createSpecialDay({ date: '2026-10-09', name: 'Stand down', type: 'org-closure' })).toEqual({
			id: 'saved-1',
			organization_id: ORG,
			created_at: TIME,
			date: '2026-10-09',
			name: 'Stand down',
			type: 'org-closure'
		});
		expect(await port.updateSpecialDay('saved-1', { name: 'Updated' })).toEqual({
			id: 'saved-1',
			organization_id: ORG,
			created_at: TIME,
			date: '2026-10-09',
			name: 'Updated',
			type: 'org-closure'
		});
		await port.deleteSpecialDay('saved-1');
		await port.deleteSpecialDay('saved-1');
		await port.deleteFederalHolidays();
		await port.createFederalHolidays([{ date: '2026-10-12', name: 'Holiday', type: 'federal-holiday' }]);
		expect(state.rows.special_days).toEqual([
			{
				id: 'closure',
				organization_id: ORG,
				date: '2026-10-08',
				name: 'Closed',
				type: 'org-closure',
				created_at: TIME
			},
			{ id: 'foreign', organization_id: 'org-b', date: '2026-10-07', name: 'Private', type: 'federal-holiday' },
			{
				id: 'saved-2',
				organization_id: ORG,
				date: '2026-10-12',
				name: 'Holiday',
				type: 'federal-holiday',
				created_at: TIME
			}
		]);
		await port.createFederalHolidays([]);
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
