import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Personnel } from '$lib/types';
import { transformPersonnel } from '$lib/server/transforms';

// Mock transforms before importing the module under test
vi.mock('$lib/server/transforms', () => ({
	transformPersonnel: vi.fn((rows: Record<string, unknown>[]) =>
		rows.map((r) => ({
			id: r.id,
			rank: r.rank,
			lastName: r.last_name,
			firstName: r.first_name,
			mos: r.mos ?? '',
			clinicRole: r.clinic_role,
			groupId: r.group_id,
			groupName: (r.groups as Record<string, unknown>)?.name ?? '',
			archivedAt: r.archived_at ?? null
		}))
	)
}));

import { personnelIds, queryPersonnel, validatePersonnelScope, type QueryModifier } from './personnelRepository';

const ORG_ID = '00000000-0000-0000-0000-000000000001';

function makePersonnel(overrides: Partial<Personnel> = {}): Personnel {
	return {
		id: crypto.randomUUID(),
		rank: 'SGT',
		lastName: 'Doe',
		firstName: 'John',
		mos: '11B',
		clinicRole: 'Medic',
		groupId: null,
		groupName: '',
		...overrides
	};
}

function makeDbRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: crypto.randomUUID(),
		rank: 'SGT',
		last_name: 'Doe',
		first_name: 'John',
		mos: '11B',
		clinic_role: 'Medic',
		group_id: null,
		groups: null,
		organization_id: ORG_ID,
		archived_at: null,
		...overrides
	};
}

// Chainable mock that records calls for assertion
function createMockSupabase(
	responseData: Record<string, unknown>[] = [],
	responseError: null | { message: string } = null
) {
	const calls: Record<string, unknown[][]> = {};

	function record(method: string) {
		return (...args: unknown[]) => {
			calls[method] = calls[method] ?? [];
			calls[method].push(args);
			return builder;
		};
	}

	const builder = {
		select: record('select'),
		eq: record('eq'),
		is: record('is'),
		not: record('not'),
		order: record('order'),
		range: record('range'),
		limit: record('limit'),
		in: record('in'),
		ilike: record('ilike'),
		then: undefined as unknown
	};

	// Make it thenable so await resolves to { data, error, count }
	Object.defineProperty(builder, 'then', {
		value: (resolve: (val: unknown) => void) => {
			resolve({ data: responseData, error: responseError, count: responseData.length });
		}
	});

	const supabase = {
		from: (table: string) => {
			calls['from'] = [[table]];
			return builder;
		},
		_calls: calls
	};

	return { supabase, calls };
}

describe('personnelIds', () => {
	it('extracts IDs from a list of personnel', () => {
		const p1 = makePersonnel({ id: 'aaa' });
		const p2 = makePersonnel({ id: 'bbb' });
		const p3 = makePersonnel({ id: 'ccc' });

		expect(personnelIds([p1, p2, p3])).toEqual(['aaa', 'bbb', 'ccc']);
	});

	it('returns empty array for empty input', () => {
		expect(personnelIds([])).toEqual([]);
	});
});

describe('queryPersonnel', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('queries active personnel with default select, order, and transform', async () => {
		const rows = [makeDbRow({ last_name: 'Alpha' }), makeDbRow({ last_name: 'Bravo' })];
		const { supabase, calls } = createMockSupabase(rows);

		const result = await queryPersonnel({ supabase, orgId: ORG_ID });

		// Queried correct table
		expect(calls['from']![0]).toEqual(['personnel']);
		// Default select includes groups join
		expect(calls['select']![0]).toEqual(['*, groups(name)']);
		// Filtered by org
		expect(calls['eq']![0]).toEqual(['organization_id', ORG_ID]);
		// Default archive filter: active only
		expect(calls['is']![0]).toEqual(['archived_at', null]);
		// Default order by last_name ascending
		expect(calls['order']![0]).toEqual(['last_name', { ascending: true }]);
		// Transform was called
		expect(transformPersonnel).toHaveBeenCalledWith(rows);
		// Result shape
		expect(result.data).toHaveLength(2);
		expect(result.error).toBeNull();
	});

	it('applies DB-level group scoping when scopedGroupId is provided', async () => {
		const rows = [makeDbRow({ group_id: 'group-1' })];
		const { supabase, calls } = createMockSupabase(rows);

		await queryPersonnel({ supabase, orgId: ORG_ID, scopedGroupId: 'group-1' });

		// Should have two .eq calls: org_id and group_id
		expect(calls['eq']).toHaveLength(2);
		expect(calls['eq']![1]).toEqual(['group_id', 'group-1']);
	});

	it('does not add group_id filter when scopedGroupId is null', async () => {
		const { supabase, calls } = createMockSupabase([makeDbRow()]);

		await queryPersonnel({ supabase, orgId: ORG_ID, scopedGroupId: null });

		// Only one .eq call: organization_id
		expect(calls['eq']).toHaveLength(1);
	});

	it('archived: true fetches only archived personnel', async () => {
		const { supabase, calls } = createMockSupabase([makeDbRow({ archived_at: '2026-01-01' })]);

		await queryPersonnel({ supabase, orgId: ORG_ID, archived: true });

		// Should use .not('archived_at', 'is', null) instead of .is('archived_at', null)
		expect(calls['is']).toBeUndefined();
		expect(calls['not']![0]).toEqual(['archived_at', 'is', null]);
	});

	it('archived: "all" skips archive filtering entirely', async () => {
		const { supabase, calls } = createMockSupabase([makeDbRow()]);

		await queryPersonnel({ supabase, orgId: ORG_ID, archived: 'all' });

		expect(calls['is']).toBeUndefined();
		expect(calls['not']).toBeUndefined();
	});

	it('headOnly returns empty data with count', async () => {
		const rows = [makeDbRow(), makeDbRow(), makeDbRow()];
		const { supabase } = createMockSupabase(rows);

		const result = await queryPersonnel({ supabase, orgId: ORG_ID, headOnly: true, count: 'exact' });

		expect(result.data).toEqual([]);
		expect(result.count).toBe(3);
		expect(result.error).toBeNull();
	});

	it('transform: "raw" returns untransformed DB rows', async () => {
		const rows = [makeDbRow({ last_name: 'Raw' })];
		const { supabase } = createMockSupabase(rows);
		vi.mocked(transformPersonnel).mockClear();

		const result = await queryPersonnel({ supabase, orgId: ORG_ID, transform: 'raw' });

		expect(transformPersonnel).not.toHaveBeenCalled();
		expect(result.data[0]).toHaveProperty('last_name', 'Raw');
	});

	it('applies composable QueryModifier filters', async () => {
		const { supabase, calls } = createMockSupabase([makeDbRow()]);
		const searchFilter: QueryModifier = (q) => q.ilike('last_name', '%smith%');

		await queryPersonnel({ supabase, orgId: ORG_ID, filters: [searchFilter] });

		expect(calls['ilike']![0]).toEqual(['last_name', '%smith%']);
	});

	it('applies pagination via range', async () => {
		const { supabase, calls } = createMockSupabase([makeDbRow()]);

		await queryPersonnel({ supabase, orgId: ORG_ID, range: { from: 0, to: 9 } });

		expect(calls['range']![0]).toEqual([0, 9]);
	});

	it('returns error object on Supabase failure', async () => {
		const { supabase } = createMockSupabase([], { message: 'connection failed' });

		const result = await queryPersonnel({ supabase, orgId: ORG_ID });

		expect(result.data).toEqual([]);
		expect(result.error).toBe('connection failed');
		expect(result.count).toBeNull();
	});

	it('custom orderBy overrides default', async () => {
		const { supabase, calls } = createMockSupabase([makeDbRow()]);

		await queryPersonnel({
			supabase,
			orgId: ORG_ID,
			orderBy: [
				{ column: 'rank', ascending: false },
				{ column: 'last_name', ascending: true }
			]
		});

		expect(calls['order']).toHaveLength(2);
		expect(calls['order']![0]).toEqual(['rank', { ascending: false }]);
		expect(calls['order']![1]).toEqual(['last_name', { ascending: true }]);
	});

	it('custom select overrides default', async () => {
		const { supabase, calls } = createMockSupabase([makeDbRow()]);

		await queryPersonnel({ supabase, orgId: ORG_ID, select: 'id, last_name' });

		expect(calls['select']![0]).toEqual(['id, last_name']);
	});
});

describe('validatePersonnelScope', () => {
	function createScopeMockSupabase(returnedGroupIds: (string | null)[]) {
		const rows = returnedGroupIds.map((gid, i) => ({ id: `person-${i}`, group_id: gid }));
		const calls: Record<string, unknown[][]> = {};

		function record(method: string) {
			return (...args: unknown[]) => {
				calls[method] = calls[method] ?? [];
				calls[method].push(args);
				return builder;
			};
		}

		const builder = {
			select: record('select'),
			eq: record('eq'),
			in: record('in'),
			then: undefined as unknown
		};

		Object.defineProperty(builder, 'then', {
			value: (resolve: (val: unknown) => void) => {
				resolve({ data: rows, error: null });
			}
		});

		return {
			from: (table: string) => {
				calls['from'] = [[table]];
				return builder;
			},
			_calls: calls
		};
	}

	it('does nothing when scopedGroupId is null (org-wide access)', async () => {
		const supabase = createScopeMockSupabase([]);

		// Should not throw
		await validatePersonnelScope(supabase, ORG_ID, ['person-0'], null);
	});

	it('passes when all personnel belong to the scoped group', async () => {
		const supabase = createScopeMockSupabase(['group-1', 'group-1']);

		// Should not throw
		await validatePersonnelScope(supabase, ORG_ID, ['person-0', 'person-1'], 'group-1');
	});

	it('throws 403 when any personnel is outside the scoped group', async () => {
		const supabase = createScopeMockSupabase(['group-1', 'group-2']);

		await expect(validatePersonnelScope(supabase, ORG_ID, ['person-0', 'person-1'], 'group-1')).rejects.toMatchObject({
			status: 403
		});
	});

	it('throws 403 when personnel count does not match (missing/archived)', async () => {
		// Query returns 1 row but we asked for 2 IDs
		const supabase = createScopeMockSupabase(['group-1']);

		await expect(
			validatePersonnelScope(supabase, ORG_ID, ['person-0', 'person-missing'], 'group-1')
		).rejects.toMatchObject({ status: 403 });
	});
});
