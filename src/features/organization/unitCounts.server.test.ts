import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { createInMemoryRatingSchemePersistence } from '$features/rating-scheme/server/inMemoryRatingSchemePersistence.server';
import { createSupabaseOrganizationUnitCountsPort } from './unitCountsProvider.server';
import { readUnitCounts } from './unitCounts.server';
import { UNIT_COUNT_KEYS } from './unitCounts';

type Row = Record<string, unknown>;

const ORG = 'org-a';
const OTHER = 'org-b';

function rows(count: number, organizationId: string, extra: Row = {}): Row[] {
	return Array.from({ length: count }, (_, i) => ({
		id: `${organizationId}-${i}`,
		organization_id: organizationId,
		...extra
	}));
}

/** Org A holds a distinct count in every family; org B holds rows in every family that must never count. */
function seed(): Record<string, Row[]> {
	const archivedAt = '2025-01-01T00:00:00.000Z';
	return {
		personnel: [
			...rows(5, ORG, { archived_at: null }),
			...rows(2, ORG, { archived_at: archivedAt }).map((r) => ({ ...r, id: `${r.id}-archived` })),
			...rows(9, OTHER, { archived_at: null }),
			...rows(9, OTHER, { archived_at: archivedAt }).map((r) => ({ ...r, id: `${r.id}-archived` }))
		],
		organization_memberships: [...rows(3, ORG), ...rows(8, OTHER)],
		status_types: [...rows(6, ORG), ...rows(8, OTHER)],
		assignment_types: [
			...rows(4, ORG, { archived_at: null }),
			...rows(3, ORG, { archived_at: archivedAt }).map((r) => ({ ...r, id: `${r.id}-archived` })),
			...rows(8, OTHER, { archived_at: null })
		],
		special_days: [...rows(11, ORG), ...rows(8, OTHER)],
		training_types: [...rows(7, ORG), ...rows(8, OTHER)],
		personnel_trainings: [...rows(13, ORG), ...rows(8, OTHER)],
		ict_tasks: [
			...rows(10, ORG, { archived_at: null }),
			...rows(1, ORG, { archived_at: archivedAt }).map((r) => ({ ...r, id: `${r.id}-archived` })),
			...rows(8, OTHER, { archived_at: null })
		],
		rating_scheme_entries: [...rows(12, ORG), ...rows(8, OTHER)],
		onboarding_templates: [...rows(2, ORG), ...rows(8, OTHER)]
	};
}

const EXPECTED = {
	activePersonnel: 5,
	archivedPersonnel: 2,
	members: 3,
	statusTypes: 6,
	assignmentTypes: 4,
	specialDays: 11,
	trainingTypes: 7,
	trainingRecords: 13,
	criticalTaskLists: 10,
	ratingSchemeEntries: 12,
	onboardingTemplates: 2
};

function inMemoryContext(tables: Record<string, Row[]>) {
	const ctx = createTestContext({
		auth: { orgId: ORG },
		ratingSchemeFactory: createInMemoryRatingSchemePersistence
	});
	for (const [table, tableRows] of Object.entries(tables)) ctx.rawStore.seed(table, tableRows);
	return ctx;
}

function inMemoryUnit(tables: Record<string, Row[]>) {
	return inMemoryContext(tables).unitCounts;
}

/** Answers PostgREST count requests from `tables`; `requests` records each one. */
function supabaseUnit(tables: Record<string, Row[]>) {
	const requests: Array<{ method: string; table: string; prefer: string | null }> = [];
	const client = createClient('http://counts.invalid', 'ordinary-request-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(request.url);
				const table = url.pathname.replace('/rest/v1/', '');
				requests.push({ method: request.method, table, prefer: request.headers.get('prefer') });
				if (request.headers.get('authorization') !== 'Bearer ordinary-request-key') throw new Error('Wrong authority');
				const matching = (tables[table] ?? []).filter((row) => {
					for (const [column, filter] of url.searchParams) {
						if (column === 'select') continue;
						if (filter.startsWith('eq.')) {
							if (String(row[column]) !== filter.slice(3)) return false;
						} else if (filter === 'is.null') {
							if (row[column] != null) return false;
						} else if (filter === 'not.is.null') {
							if (row[column] == null) return false;
						} else throw new Error(`Unexpected predicate ${column}=${filter}`);
					}
					return true;
				});
				return new Response(null, { status: 200, headers: { 'Content-Range': `*/${matching.length}` } });
			}
		}
	});
	return {
		requests,
		port: createSupabaseOrganizationUnitCountsPort(client, ORG, inMemoryContext(tables).ratingScheme)
	};
}

describe.each([
	{ adapter: 'in-memory', build: (tables: Record<string, Row[]>) => inMemoryUnit(tables) },
	{ adapter: 'Supabase', build: (tables: Record<string, Row[]>) => supabaseUnit(tables).port }
])('unit counts through the $adapter adapter', ({ build }) => {
	it('returns every count for the unit and ignores rows of another unit', async () => {
		const port = build(seed());

		expect(await readUnitCounts(port, UNIT_COUNT_KEYS)).toEqual(EXPECTED);
	});

	it('returns exactly the requested keys', async () => {
		const port = build(seed());

		expect(await readUnitCounts(port, ['statusTypes', 'archivedPersonnel'])).toEqual({
			statusTypes: 6,
			archivedPersonnel: 2
		});
	});

	it('returns zeros when only another unit has rows', async () => {
		const port = build(
			Object.fromEntries(
				Object.entries(seed()).map(([table, all]) => [table, all.filter((r) => r.organization_id === OTHER)])
			)
		);

		expect(await readUnitCounts(port, UNIT_COUNT_KEYS)).toEqual(
			Object.fromEntries(UNIT_COUNT_KEYS.map((key) => [key, 0]))
		);
	});
});

describe('Supabase unit counts requests', () => {
	it('runs one head request with an exact count per requested key', async () => {
		const { port, requests } = supabaseUnit(seed());

		await readUnitCounts(port, ['members', 'trainingTypes']);

		expect(
			requests
				.map(({ method, table, prefer }) => ({ method, table, exact: prefer?.includes('count=exact') }))
				.sort((a, b) => a.table.localeCompare(b.table))
		).toEqual([
			{ method: 'HEAD', table: 'organization_memberships', exact: true },
			{ method: 'HEAD', table: 'training_types', exact: true }
		]);
	});

	it('runs the Rating Scheme count through its owner without a table request', async () => {
		const { port, requests } = supabaseUnit(seed());

		expect(await readUnitCounts(port, ['ratingSchemeEntries'])).toEqual({ ratingSchemeEntries: 12 });
		expect(requests).toEqual([]);
	});

	it('rejects when the provider refuses a count', async () => {
		const client = createClient('http://counts.invalid', 'ordinary-request-key', {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: { fetch: async () => Response.json({ message: 'permission denied' }, { status: 403 }) }
		});
		const port = createSupabaseOrganizationUnitCountsPort(client, ORG, inMemoryContext({}).ratingScheme);

		await expect(readUnitCounts(port, ['members'])).rejects.toThrow();
	});
});
