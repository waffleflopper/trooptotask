import { describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest, rethrowOrWrap } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

function seedRankCatalog(ctx: ReturnType<typeof createTestContext>) {
	ctx.store.seed('organization_rank_catalog', [
		{
			organization_id: ctx.auth.orgId,
			code: 'SGT',
			label: 'Sergeant',
			service: 'army',
			category: 'enlisted',
			pay_grade: 'E-5',
			state: 'active',
			source: 'built-in',
			sort_order: 0
		}
	]);
}

describe('POST /api/personnel/batch', () => {
	it('conceals provider slug candidates in a failed HTTP response', async () => {
		const providerError = {
			code: '23505',
			message: 'duplicate key value violates unique constraint "personnel_org_slug_key"',
			details: 'Key (organization_id, slug)=(test-org, smith-jamie) already exists.'
		};
		const client = createClient('http://127.0.0.1:1', 'synthetic-anon-key', {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: {
				fetch: async () =>
					new Response(JSON.stringify(providerError), {
						status: 409,
						headers: { 'Content-Type': 'application/json' }
					})
			}
		});
		const caught = await createSupabaseDataStore(client)
			.insertMany('personnel', 'test-org', [{ slug: 'smith-jamie', group_id: 'group-alpha' }])
			.catch((error: unknown) => error);
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const wrapped = (() => {
				try {
					rethrowOrWrap(caught);
				} catch (error) {
					return error;
				}
			})();
			expect(wrapped).toMatchObject({ status: 500, body: { message: 'Internal server error' } });
			expect(JSON.stringify(wrapped)).not.toContain('smith-jamie');
			expect(JSON.stringify(wrapped)).not.toContain('personnel_org_slug_key');
		} finally {
			log.mockRestore();
		}
	});

	it('declares policy-first authorization for Personnel import', () => {
		expect(_postConfig).toMatchObject({
			mutation: true,
			policyAction: POLICY_ACTION_CATALOG.personnel.importRecords,
			policyResource: { kind: 'unscoped' }
		});
		expect('permission' in _postConfig).toBe(false);
	});

	it('allows Personnel operate access to submit an import batch', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'operate',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		seedRankCatalog(ctx);

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			records: [{ rank: 'SGT', lastName: 'Smith', firstName: 'Jordan' }]
		});

		expect(result).toMatchObject({
			errors: [],
			inserted: [expect.objectContaining({ rank: 'SGT', lastName: 'Smith', firstName: 'Jordan' })]
		});
	});

	it('imports valid personnel through the route without paid capacity checks', async () => {
		const ctx = createTestContext();
		seedRankCatalog(ctx);

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			records: [{ rank: 'SGT', lastName: 'Smith', firstName: 'Jordan' }]
		});

		expect(result).toMatchObject({
			inserted: [expect.objectContaining({ rank: 'SGT', lastName: 'Smith', firstName: 'Jordan' })],
			errors: []
		});
	});

	it('preserves importer per-row errors when required Personnel cells are omitted', async () => {
		const ctx = createTestContext();
		seedRankCatalog(ctx);

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			records: [
				{ lastName: 'Missing', firstName: 'Rank' },
				{ rank: 'SGT', lastName: 'Smith', firstName: 'Jordan' }
			]
		});

		expect(result).toMatchObject({
			errors: [{ index: 0, message: 'Rank, Last Name, and First Name are required' }],
			inserted: [expect.objectContaining({ rank: 'SGT', lastName: 'Smith', firstName: 'Jordan' })]
		});
	});

	it('accepts structurally valid Personnel batch records', () => {
		const result = _postConfig.input.safeParse({
			records: [
				{
					rank: 'SGT',
					lastName: 'Smith',
					firstName: 'Jordan',
					mos: '68W',
					clinicRole: null,
					groupName: 'Alpha Team',
					ets: '2027-05-01',
					deros: '2026-11-30'
				}
			]
		});

		expect(result.success).toBe(true);
	});

	it('rejects non-array Personnel batch records', () => {
		const result = _postConfig.input.safeParse({ records: {} });

		expect(result.success).toBe(false);
	});

	it('strips unknown Personnel batch record fields', () => {
		const result = _postConfig.input.safeParse({
			records: [
				{
					rank: 'SGT',
					lastName: 'Smith',
					firstName: 'Jordan',
					isAdmin: true
				}
			]
		});

		expect(result.success).toBe(true);
		if (!result.success) throw new Error('expected valid Personnel batch payload');
		expect(result.data.records[0]).not.toHaveProperty('isAdmin');
	});
});
