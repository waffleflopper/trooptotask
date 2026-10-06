import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { createSupabaseOrganizationProfilePort } from './profileProvider.server';
import { clearOrganizationUrlSlug, renameOrganization, updateOrganizationUrlSlug } from './profile.server';

const ORG = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
const FOREIGN = '22222222-2222-4222-8222-222222222222';
type Outcome = 'saved' | 'empty' | 'foreign' | 'stale-value' | 'error' | 'empty-error';

function fixture(outcome: Outcome, uppercaseId = false) {
	const rows = [
		{ id: ORG, name: 'Alpha', url_slug: 'alpha' },
		{ id: FOREIGN, name: 'Bravo', url_slug: 'bravo' }
	];
	const before = structuredClone(rows);
	const supabase = createClient('http://profile.invalid', 'synthetic-user-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const url = new URL(String(input));
				if (url.pathname !== '/rest/v1/organizations') throw new Error('Unexpected provider request');
				let selected = rows.filter((row) =>
					(['id', 'url_slug'] as const).every(
						(field) => !url.searchParams.has(field) || url.searchParams.get(field) === `eq.${row[field]}`
					)
				);
				if (init?.method === 'PATCH') {
					if (outcome === 'error' || outcome === 'empty-error')
						return Response.json({ message: outcome === 'error' ? 'save unavailable' : '' }, { status: 500 });
					const values = JSON.parse(String(init.body));
					if (outcome === 'saved') for (const row of selected) Object.assign(row, values);
					if (outcome === 'empty') selected = [];
					if (outcome === 'foreign') selected = [{ ...rows[1], ...values }];
				} else if (init?.method !== 'GET') throw new Error('Unexpected provider method');
				return Response.json(selected);
			}
		}
	});
	const ctx = createTestContext({ auth: { orgId: uppercaseId ? ORG.toUpperCase() : ORG } });
	return {
		rows,
		before,
		ctx,
		ports: { auth: ctx.auth, audit: ctx.audit, administration: createSupabaseOrganizationProfilePort({ supabase }) }
	};
}

const operations = [
	{
		name: 'name',
		run: (ports: ReturnType<typeof fixture>['ports']) => renameOrganization(ports, { name: '  Alpha   Company  ' }),
		saved: { name: 'Alpha Company', url_slug: 'alpha' },
		result: { nameSuccess: true },
		audit: 'org.renamed'
	},
	{
		name: 'slug',
		run: (ports: ReturnType<typeof fixture>['ports']) => updateOrganizationUrlSlug(ports, { urlSlug: ' ALPHA-UNIT ' }),
		saved: { name: 'Alpha', url_slug: 'alpha-unit' },
		result: { slugSuccess: true, orgUrlSlug: 'alpha-unit' },
		audit: 'org.url_slug_updated'
	},
	{
		name: 'reset',
		run: (ports: ReturnType<typeof fixture>['ports']) => clearOrganizationUrlSlug(ports),
		saved: { name: 'Alpha', url_slug: null },
		result: { slugSuccess: true, orgUrlSlug: null },
		audit: 'org.url_slug_cleared'
	}
];

describe('Organization profile save acknowledgements with the real SDK', () => {
	for (const operation of operations) {
		it(`saves the canonical Organization ${operation.name} and leaves its neighbor unchanged`, async () => {
			const { ports, rows, before, ctx } = fixture('saved');
			expect(await operation.run(ports)).toEqual(operation.result);
			expect(rows[0]).toEqual({ id: ORG, ...operation.saved });
			expect(rows[1]).toEqual(before[1]);
			expect(ctx.auditPort.events).toMatchObject([{ action: operation.audit }]);
		});
		it.each(['empty', 'foreign', 'stale-value', 'error', 'empty-error'] as const)(
			`does not report ${operation.name} success or audit an unacknowledged save (%s)`,
			async (outcome) => {
				const { ports, rows, before, ctx } = fixture(outcome);
				await expect(operation.run(ports)).rejects.toMatchObject({ status: 500 });
				expect(rows).toEqual(before);
				expect(ctx.auditPort.events).toEqual([]);
			}
		);
	}
	it('preserves valid UUID URL spelling while acknowledging the stored canonical lowercase Organization', async () => {
		const { ports, rows, ctx } = fixture('saved', true);
		expect(await renameOrganization(ports, { name: 'Alpha Company' })).toEqual({ nameSuccess: true });
		expect(await updateOrganizationUrlSlug(ports, { urlSlug: 'alpha' })).toEqual({
			slugSuccess: true,
			orgUrlSlug: 'alpha'
		});
		expect(rows[0]).toEqual({ id: ORG, name: 'Alpha Company', url_slug: 'alpha' });
		expect(ctx.auditPort.events).toMatchObject([{ action: 'org.renamed' }, { action: 'org.url_slug_updated' }]);
	});
});
