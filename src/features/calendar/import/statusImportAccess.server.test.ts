import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lastFirstSplitter, rosterPersonReference } from '$features/personnel';
import { ImportSession, questionKey } from '$lib/components/patterns/import-flow';
import {
	createTestAuditPort,
	createTestAuthContext,
	createTestScopeEnforcementPort
} from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import {
	createRequestAvailabilityContext,
	createRequestCalendarRangeContext
} from '$lib/server/adapters/requestContexts.server';
import { _getConfig } from '../../../routes/org/[orgId]/api/calendar-range/+server';
import { importAvailabilityEntries } from '../availabilityImport.server';
import { createStatusImportLane, type StatusImportColumns, type StatusImportSource } from './statusImportLane';

const { getAdminClient } = vi.hoisted(() => ({ getAdminClient: vi.fn() }));
vi.mock('$lib/server/supabase', () => ({ getAdminClient }));
afterEach(() => vi.resetAllMocks());

const ORG = '00000000-0000-4000-8000-000000000001';
const PERSON = '00000000-0000-4000-8000-000000000010';
const LEAVE = '00000000-0000-4000-8000-000000000020';
const TDY = '00000000-0000-4000-8000-000000000021';
const RANGE = { rangeStart: '2026-11-01', rangeEnd: '2026-11-30' };

function fixture() {
	const people = [
		{ id: PERSON, organization_id: ORG, group_id: 'alpha', last_name: 'Diaz', first_name: 'Renata', archived_at: null },
		{
			id: 'outside',
			organization_id: ORG,
			group_id: 'bravo',
			last_name: 'Banks',
			first_name: 'Tamara',
			archived_at: null
		},
		{
			id: 'foreign',
			organization_id: 'other-org',
			group_id: 'alpha',
			last_name: 'Smith',
			first_name: 'Jane',
			archived_at: null
		}
	];
	const statuses = people.map((person) => ({
		id: `saved-${person.id}`,
		organization_id: person.organization_id,
		personnel_id: person.id,
		status_type_id: LEAVE,
		start_date: '2026-11-05',
		end_date: '2026-11-12',
		note: null
	}));
	const mutations: string[] = [];
	function client(key: string) {
		return createClient('http://calendar-import-access.invalid', key, {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: {
				fetch: async (input, init) => {
					const request = new Request(input, init);
					const url = new URL(request.url);
					if (request.method !== 'GET') {
						mutations.push(url.pathname);
						const { p_entries } = await request.json();
						return Response.json({ inserted: p_entries.length, deleted: 0, stale: [] });
					}
					let rows: Record<string, unknown>[];
					if (url.pathname === '/rest/v1/personnel') rows = key === 'synthetic-calendar-roster' ? people : [];
					else if (url.pathname === '/rest/v1/availability_entries') {
						if (key !== 'synthetic-calendar-ordinary') throw new Error('Availability must use ordinary authority');
						rows = statuses;
					} else throw new Error('Unexpected Calendar transport');
					for (const [column, filter] of url.searchParams) {
						if (filter.startsWith('eq.')) rows = rows.filter((row) => row[column] === filter.slice(3));
						else if (filter.startsWith('in.('))
							rows = rows.filter((row) => filter.slice(4, -1).split(',').includes(String(row[column])));
						else if (filter.startsWith('gte.')) rows = rows.filter((row) => String(row[column]) >= filter.slice(4));
						else if (filter.startsWith('lte.')) rows = rows.filter((row) => String(row[column]) <= filter.slice(4));
					}
					return Response.json(rows);
				}
			}
		});
	}
	getAdminClient.mockReturnValue(client('synthetic-calendar-roster'));
	return {
		mutations,
		request: {
			auth: createTestAuthContext({
				orgId: ORG,
				role: 'member',
				isPrivileged: false,
				scopeSet: { kind: 'groups', groupIds: ['alpha'] },
				capabilityMap: {
					calendar: 'operate',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}),
			audit: createTestAuditPort(),
			scope: createTestScopeEnforcementPort(),
			session: null,
			disabledFeatures: [],
			supabase: client('synthetic-calendar-ordinary')
		}
	};
}

describe('Calendar-only group-scoped status import', () => {
	it('loads in-scope overlaps for Review and marks an exact re-import Unchanged', async () => {
		const { request } = fixture();
		const ctx = createRequestCalendarRangeContext(request);
		const personnel = await ctx.personnelCalendarRoster.listActive(request.auth);
		const source: StatusImportSource = {
			orgId: ORG,
			orgUrlSegment: 'unit',
			person: rosterPersonReference<StatusImportColumns>(personnel),
			nameSplitter: lastFirstSplitter<StatusImportColumns>(),
			statusTypes: [LEAVE, TDY].map((id) => ({
				id,
				name: id === LEAVE ? 'Leave' : 'TDY',
				color: '#000000',
				textColor: '#ffffff',
				shortLabel: null,
				sortOrder: 0
			})),
			entries: [],
			loaded: [],
			async reloadEntries(range: typeof RANGE) {
				const result = await handleUseCaseRequest(
					_getConfig,
					ctx,
					{ ...range, collections: ['availability'] },
					() => ctx
				);
				source.entries = result.availabilityEntries ?? [];
			}
		};
		const session = new ImportSession(() => createStatusImportLane(source));
		await session.chooseFile([
			new File(['Name,Status,From,To\n"Diaz, Renata",TDY,2026-11-08,2026-11-09'], 'statuses.csv')
		]);
		session.goTo('review');
		await vi.waitFor(() => expect(session.phase.step).toBe('review'));
		expect(source.entries.map((entry) => entry.personnelId)).toEqual([PERSON]);
		expect(session.review.questions.map((question) => question.key)).toContain(questionKey({ lane: 'overlap' }));
		await session.chooseFile([
			new File(['Name,Status,From,To\n"Diaz, Renata",Leave,2026-11-05,2026-11-12'], 'reimport.csv')
		]);
		session.goTo('review');
		await vi.waitFor(() => expect(session.phase.step).toBe('review'));
		expect(session.review.rows.map((row) => row.outcome)).toEqual(['unchanged']);
	});

	it('refuses an unreviewed overlap and an exact duplicate before writing', async () => {
		const { request, mutations } = fixture();
		const result = await importAvailabilityEntries(createRequestAvailabilityContext(request), {
			entries: [
				{
					personnelId: PERSON,
					statusTypeId: TDY,
					startDate: '2026-11-08',
					endDate: '2026-11-09',
					note: null,
					overlap: 'none'
				},
				{
					personnelId: PERSON,
					statusTypeId: LEAVE,
					startDate: '2026-11-05',
					endDate: '2026-11-12',
					note: null,
					overlap: 'none'
				}
			]
		});
		expect(result).toMatchObject({ added: 0, removed: 0, errors: [{ index: 0 }, { index: 1 }] });
		expect(mutations).toEqual([]);
	});
});
