import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createPlatformActivationHealthStore } from './activationHealth.server';
import { createOrganizationSupportReader } from '$features/organization/index.server';
import { createPersonnelSupportReader } from '$features/personnel/index.server';
import { createCalendarSupportReader } from '$features/calendar/index.server';
import { createOnboardingSupportReader } from '$features/onboarding/index.server';
import { createTrainingSupportReader } from '$features/training/index.server';
import { createRatingSchemeSupportReader } from '$features/rating-scheme/index.server';

type Row = Record<string, string | number | null>;
const countTables = [
	'organization_memberships',
	'status_types',
	'assignment_types',
	'onboarding_template_steps',
	'training_types',
	'rating_scheme_entries'
];

function storeWithFetch(fetch: typeof globalThis.fetch) {
	const client = createClient('http://localhost:9', 'synthetic-service-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: { fetch }
	});
	return createPlatformActivationHealthStore({
		organizations: createOrganizationSupportReader(client),
		personnel: createPersonnelSupportReader(client),
		calendar: createCalendarSupportReader(client),
		onboarding: createOnboardingSupportReader(client),
		training: createTrainingSupportReader(client),
		ratingScheme: createRatingSchemeSupportReader(client)
	});
}

function organization(id: string, created_at = '2026-09-01'): Row {
	return { id, name: `${id} Company`, created_at };
}

// The provider exposes only retained tables/columns. The real Supabase client
// performs request serialization; provider filtering, ordering and pagination
// determine observable facts, instead of assertions on a query-builder mock.
function providerStore(tables: Record<string, Row[]>, failedResource?: string) {
	return storeWithFetch(async (input, init) => {
		const request = new Request(input, init);
		const url = new URL(request.url);
		const resource = url.pathname.replace('/rest/v1/', '');
		if (resource === failedResource || resource.startsWith('duty_'))
			return Response.json({ message: 'Read denied', code: '42501' }, { status: 403 });
		if (resource.startsWith('rpc/')) {
			const rpc = resource.slice(4);
			if (!['count_personnel_by_organization', 'count_memberships_by_organization'].includes(rpc)) {
				return Response.json({ message: 'Unknown RPC' }, { status: 404 });
			}
			const { p_org_ids: ids } = (await request.json()) as { p_org_ids: string[] };
			const personnel = rpc === 'count_personnel_by_organization';
			const rows = tables[personnel ? 'personnel' : 'organization_memberships'] ?? [];
			return Response.json(
				ids.map((id) => ({
					organization_id: id,
					[personnel ? 'personnel_count' : 'membership_count']: String(
						rows.filter((row) => row.organization_id === id && (!personnel || row.archived_at == null)).length
					)
				}))
			);
		}
		const allowedColumns = resource === 'organizations' ? ['id', 'name', 'created_at'] : ['id', 'organization_id'];
		const query = url.searchParams;
		const columns = (query.get('select') ?? '').split(',').map((column) => column.trim());
		if (
			(resource !== 'organizations' && !countTables.includes(resource)) ||
			columns.some((column) => !allowedColumns.includes(column)) ||
			[...query.keys()].some(
				(key) => !['select', 'order', 'offset', 'limit', 'organization_id', 'role', 'status'].includes(key)
			)
		) {
			return Response.json({ message: 'Unknown retained resource or column' }, { status: 400 });
		}
		let rows = [...(tables[resource] ?? [])];
		for (const field of ['organization_id', 'role', 'status']) {
			const filter = query.get(field);
			if (filter?.startsWith('in.(')) {
				const accepted = filter
					.slice(4, -1)
					.split(',')
					.map((value) => value.replaceAll('"', ''));
				rows = rows.filter((row) => accepted.includes(String(row[field])));
			} else if (filter?.startsWith('eq.')) rows = rows.filter((row) => row[field] === filter.slice(3));
		}
		const order = query.get('order')?.split(',') ?? [];
		rows.sort((left, right) => {
			for (const specification of order) {
				const [column, direction] = specification.split('.');
				const difference = String(left[column] ?? '').localeCompare(String(right[column] ?? ''));
				if (difference) return direction === 'desc' ? -difference : difference;
			}
			return 0;
		});
		const offset = Number(query.get('offset') ?? 0);
		const limit = Number(query.get('limit') ?? 1000);
		return Response.json(
			rows
				.slice(offset, offset + limit)
				.map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? null])))
		);
	});
}

describe('noncommercial activation provider boundary', () => {
	it('maps scoped aggregate facts with no commercial tables or columns available', async () => {
		const store = providerStore({
			organizations: [organization('able'), organization('empty')],
			personnel: [
				{ organization_id: 'able', archived_at: null },
				{ organization_id: 'able', archived_at: null },
				{ organization_id: 'able', archived_at: '2026-09-01' },
				{ organization_id: 'outside', archived_at: null }
			],
			organization_memberships: [
				{ id: '1', organization_id: 'able', role: 'owner' },
				{ id: '2', organization_id: 'able', role: 'admin' },
				{ id: '3', organization_id: 'able', role: 'member' },
				{ id: '4', organization_id: 'outside', role: 'admin' }
			],
			status_types: [{ id: '1', organization_id: 'able' }],
			assignment_types: [{ id: '1', organization_id: 'able' }],
			onboarding_template_steps: [{ id: '1', organization_id: 'able' }],
			training_types: [
				{ id: '1', organization_id: 'able' },
				{ id: '2', organization_id: 'able' },
				{ id: '3', organization_id: 'outside' }
			],
			rating_scheme_entries: [{ id: '1', organization_id: 'able' }]
		});
		const facts = await store.listActivationOrganizationFacts({ limit: 10 });
		expect(facts).toHaveLength(2);
		expect(facts.find((row) => row.organizationId === 'able')).toEqual({
			organizationId: 'able',
			organizationName: 'able Company',
			organizationCreatedAt: '2026-09-01',
			counts: {
				activePersonnel: 2,
				members: 3,
				leaderMembers: 2,
				statusTypes: 1,
				assignmentTypes: 1,
				onboardingTemplateSteps: 1,
				trainingTypes: 2,
				ratingSchemeEntries: 1
			}
		});
		expect(facts.find((row) => row.organizationId === 'empty')?.counts).toEqual({
			activePersonnel: 0,
			members: 0,
			leaderMembers: 0,
			statusTypes: 0,
			assignmentTypes: 0,
			onboardingTemplateSteps: 0,
			trainingTypes: 0,
			ratingSchemeEntries: 0
		});
	});

	it('selects the newest Organizations with a deterministic tie-break at the candidate limit', async () => {
		const store = providerStore({
			organizations: [organization('old', '2026-01-01'), organization('new-a'), organization('new-z')]
		});
		expect((await store.listActivationOrganizationFacts({ limit: 2 })).map((row) => row.organizationId)).toEqual([
			'new-z',
			'new-a'
		]);
	});

	it.each([
		['organization_memberships', 'leaderMembers'],
		['status_types', 'statusTypes'],
		['assignment_types', 'assignmentTypes'],
		['onboarding_template_steps', 'onboardingTemplateSteps'],
		['training_types', 'trainingTypes'],
		['rating_scheme_entries', 'ratingSchemeEntries']
	] as const)('finishes %s pages without counting another Organization', async (table, field) => {
		const rows = [
			...Array.from({ length: 1005 }, (_, index) => ({
				id: `setup-${String(index).padStart(4, '0')}`,
				organization_id: 'large',
				role: 'admin'
			})),
			{ id: 'outside', organization_id: 'outside', role: 'admin' },
			...(table === 'organization_memberships' ? [{ id: 'nonleader', organization_id: 'large', role: 'member' }] : [])
		].reverse();
		const store = providerStore({ organizations: [organization('large')], [table]: rows });
		const facts = await store.listActivationOrganizationFacts({ limit: 1 });
		expect(facts[0].counts[field]).toBe(1005);
	});

	it('returns an empty scan without attempting aggregate reads when no Organizations exist', async () => {
		const store = providerStore({}, 'rpc/count_personnel_by_organization');
		await expect(store.listActivationOrganizationFacts({ limit: 100 })).resolves.toEqual([]);
	});

	it.each([
		'organizations',
		'organization_memberships',
		'status_types',
		'assignment_types',
		'onboarding_template_steps',
		'training_types',
		'rating_scheme_entries',
		'rpc/count_personnel_by_organization',
		'rpc/count_memberships_by_organization'
	])('propagates a failed %s read instead of returning misleading health', async (resource) => {
		const store = providerStore({ organizations: [organization('able')] }, resource);
		await expect(store.listActivationOrganizationFacts({ limit: 1 })).rejects.toMatchObject({ code: '42501' });
	});
});
