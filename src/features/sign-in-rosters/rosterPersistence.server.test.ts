import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createSupabaseSignInRosterPersistence } from './rosterPersistence.server';
import { createSupabaseSignInRosterRankReferenceReader } from './signInRosterRankReferences.server';
import { createShiftingPostgrestClient, pagedIds } from '$lib/storage/test-support/shiftingPostgrest.server';

const ORG = 'ordinary-org';
const KEY = 'synthetic-ordinary-key';
type Row = Record<string, unknown>;

const savedRoster: Row = {
	id: 'saved-roster',
	organization_id: ORG,
	title: 'Clinic attendance',
	roster_date: null,
	blank_date: true,
	separate_by_group: true,
	sort_by: 'rank',
	personnel_snapshot: [
		{ id: 'old-person', rank: 'LEGACY', firstName: 'Prior', lastName: 'Person', group: 'Old Group', groupId: 'alpha' }
	],
	filter_config: { groups: ['alpha'], ranks: ['LEGACY'] },
	signed_file_path: 'ordinary-org/sign-in-rosters/saved-roster/signed.pdf',
	created_by: 'original-user',
	created_at: '2026-02-02T03:04:05.123456Z',
	personnel_ids: ['old-person'],
	scope_group_ids: ['alpha'],
	historical_metadata: { imported: { source: 'Prior system', flags: [null, false] } }
};

const expectedRoster = {
	id: 'saved-roster',
	title: 'Clinic attendance',
	rosterDate: null,
	blankDate: true,
	separateByGroup: true,
	sortBy: 'rank',
	personnelSnapshot: [
		{ id: 'old-person', rank: 'LEGACY', firstName: 'Prior', lastName: 'Person', group: 'Old Group', groupId: 'alpha' }
	],
	filterConfig: { groups: ['alpha'], ranks: ['LEGACY'], mos: [], roles: [] },
	signedFilePath: 'ordinary-org/sign-in-rosters/saved-roster/signed.pdf',
	createdBy: 'original-user',
	createdAt: '2026-02-02T03:04:05.123456Z'
};

function fixture(rows: Row[]) {
	const saved = structuredClone(rows);
	const fault = { method: '', from: null as number | null, omitCount: false, nullFind: false };
	const client = createClient('http://ordinary.invalid', KEY, {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				if (url.origin !== 'http://ordinary.invalid' || url.pathname !== '/rest/v1/sign_in_rosters')
					throw new Error('Unexpected roster provider target');
				if (request.headers.get('apikey') !== KEY || request.headers.get('authorization') !== `Bearer ${KEY}`)
					throw new Error('Roster request must retain the ordinary client');
				const offset = Number(url.searchParams.get('offset') ?? 0);
				if (request.method === fault.method || (fault.from !== null && offset >= fault.from))
					return Response.json({ code: '42501', message: 'Roster provider unavailable' }, { status: 403 });
				const matches = (row: Row) =>
					[...url.searchParams].every(([column, filter]) => {
						if (['select', 'order', 'offset', 'limit'].includes(column)) return true;
						if (filter.startsWith('eq.')) return String(row[column]) === filter.slice(3);
						if (filter === 'is.null') return row[column] === null || row[column] === undefined;
						if (filter.startsWith('cd.{')) {
							const allowed = filter.slice(4, -1).split(',');
							return Array.isArray(row[column]) && row[column].every((id) => allowed.includes(String(id)));
						}
						if (filter === 'not.eq.{}') return Array.isArray(row[column]) && row[column].length > 0;
						if (filter.startsWith('gte.')) return Date.parse(String(row[column])) >= Date.parse(filter.slice(4));
						if (filter.startsWith('lt.')) return Date.parse(String(row[column])) < Date.parse(filter.slice(3));
						if (filter.startsWith('ilike.')) {
							const pattern = [...filter.slice(6)]
								.map((char) => (char === '%' ? '.*' : char === '_' ? '.' : char.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')))
								.join('');
							return new RegExp(`^${pattern}$`, 'i').test(String(row[column]));
						}
						throw new Error(`Unexpected roster predicate ${column}=${filter}`);
					});
				let visible = saved.filter(matches);
				if (request.method === 'POST') {
					const row = { id: 'created-roster', created_at: '2026-03-04T05:06:07.654321Z', ...(await request.json()) };
					saved.push(row);
					visible = [row];
				} else if (request.method !== 'GET' && request.method !== 'HEAD') {
					throw new Error('Unexpected roster provider method');
				}
				const ordering = url.searchParams.get('order');
				if (ordering) {
					const terms = ordering.split(',').map((term) => term.split('.'));
					visible = visible.toSorted((left, right) => {
						for (const [column, direction] of terms) {
							const order = String(left[column]).localeCompare(String(right[column]));
							if (order) return order * (direction === 'desc' ? -1 : 1);
						}
						return 0;
					});
				}
				const count = visible.length;
				const limit = Math.min(Number(url.searchParams.get('limit') ?? 1000), 1000);
				visible = visible.slice(offset, offset + limit);
				const select = url.searchParams.get('select');
				const projected = visible.map((row) =>
					!select || select === '*' ? row : Object.fromEntries(select.split(',').map((column) => [column, row[column]]))
				);
				if (fault.nullFind && request.method === 'GET' && request.headers.get('accept')?.includes('vnd.pgrst.object'))
					return Response.json(null);
				if (request.headers.get('accept')?.includes('vnd.pgrst.object'))
					return projected.length === 1
						? Response.json(projected[0])
						: Response.json({ code: 'PGRST116', message: 'No matching roster' }, { status: 406 });
				return Response.json(projected, {
					headers:
						!fault.omitCount && request.headers.get('prefer')?.includes('count=exact')
							? { 'Content-Range': `${offset}-${offset + visible.length - 1}/${count}` }
							: undefined
				});
			}
		}
	});
	return { client, fault, rows: () => structuredClone(saved) };
}

const page = { title: '', createdFrom: null, createdBefore: null, limit: 20, offset: 0 };

function persistence(run: ReturnType<typeof fixture>, groupIds?: string[]) {
	return createSupabaseSignInRosterPersistence(run.client, {
		orgId: ORG,
		scopeSet: groupIds ? groupCoverageForTest({ kind: 'groups', groupIds }) : { kind: 'organization' }
	});
}

describe('ordinary Sign-in Roster persistence through the actual SDK', () => {
	it('maps saved snapshot fields without exposing raw archive columns or rewriting timestamp precision', async () => {
		const run = fixture([savedRoster, { ...savedRoster, id: 'foreign', organization_id: 'foreign-org' }]);
		const port = persistence(run);
		expect(await port.find('saved-roster')).toEqual(expectedRoster);
		expect(await port.list(page)).toEqual({ data: [expectedRoster], count: 1, unsigned: 0 });
		expect(await port.find('foreign')).toBeNull();
		expect(await port.find('missing')).toBeNull();
	});

	it('keeps a null ordinary provider find as a missing roster', async () => {
		const run = fixture([savedRoster]);
		run.fault.nullFind = true;
		expect(await persistence(run).find('saved-roster')).toBeNull();
	});

	it('counts title/date-filtered Group rows before paginating in the existing creation order', async () => {
		const run = fixture([
			{ ...savedRoster, id: 'early', created_at: '2026-02-01T05:00:00Z' },
			{ ...savedRoster, id: 'middle', created_at: '2026-02-02T00:00:00Z' },
			{ ...savedRoster, id: 'late', created_at: '2026-02-04T04:59:59.999Z' },
			{ ...savedRoster, id: 'before', created_at: '2026-02-01T04:59:59Z' },
			{ ...savedRoster, id: 'after', created_at: '2026-02-04T05:00:00Z' },
			{ ...savedRoster, id: 'other-title', title: 'Other attendance' },
			{ ...savedRoster, id: 'mixed', scope_group_ids: ['alpha', 'bravo'] },
			{ ...savedRoster, id: 'org-only', scope_group_ids: [] },
			{ ...savedRoster, id: 'foreign', organization_id: 'foreign-org' }
		]);
		const port = persistence(run, ['alpha']);
		const easternDays = { createdFrom: '2026-02-01T05:00:00.000Z', createdBefore: '2026-02-04T05:00:00.000Z' };
		expect(await port.list({ title: 'cLiNiC', ...easternDays, limit: 1, offset: 1 })).toEqual({
			data: [{ ...expectedRoster, id: 'middle', createdAt: '2026-02-02T00:00:00Z' }],
			count: 3,
			unsigned: 0
		});
		expect(await port.find('mixed')).toBeNull();
		expect(await port.find('org-only')).toBeNull();
		expect(await port.find('foreign')).toBeNull();
	});

	it('counts rosters without a signed scan across every page, under the same title, date and Group filters', async () => {
		const unsigned = { signed_file_path: null };
		const run = fixture([
			{ ...savedRoster, id: 'oldest', created_at: '2026-02-01T00:00:00Z', ...unsigned },
			{ ...savedRoster, id: 'signed-a', created_at: '2026-02-02T00:00:00Z' },
			{ ...savedRoster, id: 'signed-b', created_at: '2026-02-03T00:00:00Z' },
			{ ...savedRoster, id: 'old-range', created_at: '2026-01-01T00:00:00Z', ...unsigned },
			{ ...savedRoster, id: 'other-title', title: 'Other', created_at: '2026-02-02T00:00:00Z', ...unsigned },
			{
				...savedRoster,
				id: 'out-of-scope',
				scope_group_ids: ['bravo'],
				created_at: '2026-02-02T00:00:00Z',
				...unsigned
			},
			{ ...savedRoster, id: 'foreign', organization_id: 'foreign-org', ...unsigned }
		]);
		const port = persistence(run, ['alpha']);
		const firstPage = await port.list({ ...page, title: 'clinic', createdFrom: '2026-02-01T00:00:00Z', limit: 1 });
		expect(firstPage.data.map((roster) => roster.id)).toEqual(['signed-b']);
		expect(firstPage).toMatchObject({ count: 3, unsigned: 1 });
		expect(await port.list(page)).toMatchObject({ count: 5, unsigned: 3 });
	});

	it('requires the whole nonempty roster scope to fit a multiple-Group grant', async () => {
		const run = fixture([
			{ ...savedRoster, id: 'both', scope_group_ids: ['alpha', 'bravo'] },
			{ ...savedRoster, id: 'overlap', scope_group_ids: ['alpha', 'charlie'] },
			{ ...savedRoster, id: 'unassigned', scope_group_ids: [] }
		]);
		const port = persistence(run, ['alpha', 'bravo']);
		expect(await port.list(page)).toEqual({ data: [{ ...expectedRoster, id: 'both' }], count: 1, unsigned: 0 });
		expect(await port.find('both')).toEqual({ ...expectedRoster, id: 'both' });
		expect(await port.find('overlap')).toBeNull();
		expect(await persistence(run).find('unassigned')).toEqual({ ...expectedRoster, id: 'unassigned' });
	});

	it('returns no rows for an empty Group grant without depending on provider availability', async () => {
		const run = fixture([savedRoster]);
		run.fault.method = 'GET';
		const port = persistence(run, []);
		expect(await port.list(page)).toEqual({ data: [], count: 0, unsigned: 0 });
		expect(await port.find('saved-roster')).toBeNull();
	});

	it('lists each roster once across pages when rosters share one creation time', async () => {
		const ids = pagedIds(45, 'saved');
		const client = createShiftingPostgrestClient({
			sign_in_rosters: ids.map((id) => ({ ...savedRoster, id }))
		});
		const port = createSupabaseSignInRosterPersistence(client, { orgId: ORG, scopeSet: { kind: 'organization' } });
		const listed: string[] = [];
		for (let offset = 0; offset < ids.length; offset += 20)
			listed.push(...(await port.list({ ...page, offset })).data.map((roster) => roster.id));
		expect(listed.toSorted()).toEqual(ids);
	});

	it('preserves a missing provider count instead of substituting the page length', async () => {
		const run = fixture([savedRoster]);
		run.fault.omitCount = true;
		expect(await persistence(run).list(page)).toEqual({ data: [expectedRoster], count: null, unsigned: 0 });
	});

	it('creates only mapped owner facts in this Organization without a scan', async () => {
		const foreign = { ...savedRoster, id: 'foreign', organization_id: 'foreign-org' };
		const run = fixture([foreign]);
		const port = persistence(run);
		const input = {
			title: 'New snapshot',
			rosterDate: '2026-03-04',
			blankDate: false,
			separateByGroup: false,
			sortBy: 'alphabetical' as const,
			personnelSnapshot: [
				{ id: 'current-person', rank: 'PFC', firstName: 'New', lastName: 'Person', group: 'Bravo', groupId: 'bravo' }
			],
			personnelIds: ['current-person'],
			scopeGroupIds: ['bravo'],
			filterConfig: { groups: ['bravo'], ranks: ['PFC'], mos: ['68W'], roles: ['Driver'] },
			createdBy: 'current-user',
			organization_id: 'foreign-org',
			unexpected_provider_column: 'must not be stored'
		};
		expect(await port.create(input)).toEqual({
			id: 'created-roster',
			title: 'New snapshot',
			rosterDate: '2026-03-04',
			blankDate: false,
			separateByGroup: false,
			sortBy: 'alphabetical',
			personnelSnapshot: [
				{ id: 'current-person', rank: 'PFC', firstName: 'New', lastName: 'Person', group: 'Bravo', groupId: 'bravo' }
			],
			filterConfig: { groups: ['bravo'], ranks: ['PFC'], mos: ['68W'], roles: ['Driver'] },
			signedFilePath: null,
			createdBy: 'current-user',
			createdAt: '2026-03-04T05:06:07.654321Z'
		});
		expect(run.rows()).toEqual([
			foreign,
			{
				id: 'created-roster',
				organization_id: ORG,
				title: 'New snapshot',
				roster_date: '2026-03-04',
				blank_date: false,
				separate_by_group: false,
				sort_by: 'alphabetical',
				personnel_snapshot: [
					{ id: 'current-person', rank: 'PFC', firstName: 'New', lastName: 'Person', group: 'Bravo', groupId: 'bravo' }
				],
				personnel_ids: ['current-person'],
				scope_group_ids: ['bravo'],
				filter_config: { groups: ['bravo'], ranks: ['PFC'], mos: ['68W'], roles: ['Driver'] },
				signed_file_path: null,
				created_by: 'current-user',
				created_at: '2026-03-04T05:06:07.654321Z'
			}
		]);
	});

	it.each(['list', 'find', 'create'] as const)(
		'rejects %s provider failure without modifying saved history',
		async (operation) => {
			const run = fixture([savedRoster]);
			const port = persistence(run);
			run.fault.method = operation === 'create' ? 'POST' : 'GET';
			const action =
				operation === 'list'
					? () => port.list(page)
					: operation === 'find'
						? () => port.find('saved-roster')
						: () =>
								port.create({
									title: 'New',
									rosterDate: null,
									blankDate: false,
									separateByGroup: false,
									sortBy: 'alphabetical',
									personnelSnapshot: [],
									personnelIds: [],
									scopeGroupIds: [],
									filterConfig: null,
									createdBy: 'current-user'
								});
			await expect(action()).rejects.toThrow('Roster provider unavailable');
			expect(run.rows()).toEqual([savedRoster]);
		}
	);
});

describe('ordinary owned Sign-in Roster rank projection through the actual SDK', () => {
	it('retains eligible historical strings without normalization or per-roster deduplication', async () => {
		const run = fixture([
			{
				id: 'c',
				organization_id: ORG,
				filter_config: 'SGT',
				personnel_snapshot: [['PFC'], { rank: '  DET  SGT  ' }, { rank: null }]
			},
			{ id: 'b', organization_id: ORG, filter_config: [{ ranks: ['COL'] }], personnel_snapshot: { rank: 'SFC' } },
			{
				id: 'a',
				organization_id: ORG,
				filter_config: { ranks: [' SGT ', 5, null, '', 'SGT', 'sgt'], mos: ['68W'], roles: ['Driver'] },
				personnel_snapshot: [{ rank: ' SSG ' }, null, 'PFC', { rank: 4 }, ['COL'], { rank: 'SGT' }, { rank: '' }]
			},
			{
				id: 'foreign',
				organization_id: 'foreign-org',
				filter_config: { ranks: ['SECRET'] },
				personnel_snapshot: [{ rank: 'SECRET' }]
			}
		]);
		expect(await createSupabaseSignInRosterRankReferenceReader(run.client, ORG)()).toEqual([
			{ filterRanks: [' SGT ', '', 'SGT', 'sgt'], snapshotRanks: [' SSG ', 'SGT', ''] },
			{ filterRanks: [], snapshotRanks: [] },
			{ filterRanks: [], snapshotRanks: ['  DET  SGT  '] }
		]);
	});

	it('returns final-page rank history beyond the provider cap and permits a truly empty Organization', async () => {
		const rows = Array.from({ length: 1000 }, (_, index) => ({
			id: `saved-${String(index).padStart(4, '0')}`,
			organization_id: ORG,
			filter_config: null,
			personnel_snapshot: []
		}));
		const run = fixture([
			{
				id: 'zz-final',
				organization_id: ORG,
				scope_group_ids: [],
				filter_config: { ranks: ['RETIRED'] },
				personnel_snapshot: [{ rank: 'UNKNOWN' }]
			},
			...rows.toReversed()
		]);
		const references = await createSupabaseSignInRosterRankReferenceReader(run.client, ORG)();
		expect(references).toHaveLength(1001);
		expect(references[0]).toEqual({ filterRanks: [], snapshotRanks: [] });
		expect(references.at(-1)).toEqual({ filterRanks: ['RETIRED'], snapshotRanks: ['UNKNOWN'] });
		expect(await createSupabaseSignInRosterRankReferenceReader(run.client, 'empty-org')()).toEqual([]);
	});

	it.each([0, 1000])(
		'rejects a failed page at offset %s without returning partial reference summaries',
		async (from) => {
			const run = fixture(
				Array.from({ length: 1001 }, (_, index) => ({
					id: `saved-${String(index).padStart(4, '0')}`,
					organization_id: ORG,
					filter_config: { ranks: ['REFERENCED'] },
					personnel_snapshot: []
				}))
			);
			run.fault.from = from;
			await expect(createSupabaseSignInRosterRankReferenceReader(run.client, ORG)()).rejects.toThrow(
				'Roster provider unavailable'
			);
		}
	);
});
