import { describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { CapabilityMap } from '$lib/access/memberAccessShape';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$features/training/server/trainingPersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import type { AdmittedOrganizationRequest } from '$lib/server/adapters/requestContexts.server';
import { _postConfig } from './+server';

const { getAdminClient } = vi.hoisted(() => ({ getAdminClient: vi.fn() }));
vi.mock('$lib/server/supabase', () => ({ getAdminClient }));

function buildRequest(ctx: ReturnType<typeof createTestContext>): AdmittedOrganizationRequest {
	const supabase = createClient('http://127.0.0.1:9', 'synthetic-starter-pack-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const request = new Request(input, init);
				const url = new URL(input instanceof Request ? input.url : String(input));
				if (
					url.pathname !== '/rest/v1/training_types' ||
					(request.method !== 'POST' && url.searchParams.get('organization_id') !== `eq.${ctx.auth.orgId}`)
				) {
					throw new Error('Unexpected starter-pack reference read');
				}
				if (request.method === 'POST') {
					const body = await request.json();
					if (body.organization_id !== ctx.auth.orgId) throw new Error('Foreign starter write');
					const row = await ctx.rawStore.insert('training_types', ctx.auth.orgId, body);
					return Response.json(row);
				}
				const name = url.searchParams.get('name');
				const rows = await ctx.rawStore.findMany(
					'training_types',
					ctx.auth.orgId,
					name ? { name: name.slice(3) } : undefined
				);
				if (request.headers.get('accept')?.includes('application/vnd.pgrst.object+json')) {
					return rows.length === 1
						? Response.json(rows[0])
						: Response.json({ code: 'PGRST116', message: 'Expected one row' }, { status: 406 });
				}
				return Response.json(rows);
			}
		}
	});
	getAdminClient.mockClear();
	getAdminClient.mockReturnValue(supabase);
	return {
		auth: ctx.auth,
		audit: ctx.audit,
		store: ctx.store,
		rawStore: ctx.rawStore,
		scope: ctx.scope,
		supabase,
		session: null
	};
}

const NO_TRAINING_CONFIGURE: CapabilityMap = {
	calendar: 'configure',
	personnel: 'none',
	training: 'operate',
	criticalTasks: 'none',
	onboarding: 'configure',
	ratingScheme: 'none'
};

const NO_ONBOARDING_CONFIGURE: CapabilityMap = {
	calendar: 'none',
	personnel: 'none',
	training: 'configure',
	criticalTasks: 'none',
	onboarding: 'operate',
	ratingScheme: 'none'
};

describe('POST /api/starter-configuration-packs/[packId]/apply', () => {
	it('uses a policy-first mutation route config', () => {
		expect('permission' in _postConfig).toBe(false);
		expect(_postConfig.mutation).toBe(true);
		expect(_postConfig.policyAction).toBe(POLICY_ACTION_CATALOG.training.configureRequirements);
		expect(_postConfig.policyResource).toEqual({ kind: 'organization' });
	});

	it('uses the route pack id as the apply input', async () => {
		const input = await _postConfig.parseInput?.({
			params: { packId: 'first-week-operations' }
		} as Parameters<NonNullable<typeof _postConfig.parseInput>>[0]);

		expect(input).toEqual({ packId: 'first-week-operations' });
	});

	it('persists the orientation Training step through the selected request context', async () => {
		const ctx = createTestContext();
		const request = buildRequest(ctx);

		const result = await handleUseCaseRequest(_postConfig, request, { packId: 'first-week-operations' }, () =>
			_postConfig.context(request)
		);

		expect(result.failed).toEqual([]);
		expect(result.created).toContainEqual({ family: 'training-types', name: 'Unit Orientation' });
		expect(await ctx.store.findMany('training_types', ctx.auth.orgId)).toHaveLength(2);
		expect(await ctx.store.findMany('onboarding_template_steps', ctx.auth.orgId)).toHaveLength(4);
		const orientation = await ctx.store.findOne<Record<string, unknown>>('training_types', ctx.auth.orgId, {
			name: 'Unit Orientation'
		});
		expect(
			await ctx.store.findOne('onboarding_template_steps', ctx.auth.orgId, { name: 'Complete unit orientation' })
		).toMatchObject({ step_type: 'training', training_type_id: orientation?.id });
	});

	it('allows Training and onboarding configurators without Calendar access', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: { ...NO_ONBOARDING_CONFIGURE, onboarding: 'configure' }
			}
		});
		const request = buildRequest(ctx);

		const result = await handleUseCaseRequest(_postConfig, request, { packId: 'first-week-operations' }, () =>
			_postConfig.context(request)
		);

		expect(result.failed).toEqual([]);
		expect(await ctx.store.findMany('training_types', ctx.auth.orgId)).toHaveLength(2);
		expect(await ctx.store.findMany('onboarding_template_steps', ctx.auth.orgId)).toHaveLength(4);
		expect(await ctx.store.findMany('assignment_types', ctx.auth.orgId)).toEqual([]);
	});

	it('denies at the route policy before mutation when Training configure is missing', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: NO_TRAINING_CONFIGURE
			}
		});
		const request = buildRequest(ctx);
		const insertSpy = vi.spyOn(ctx.store, 'insert');

		await expect(
			handleUseCaseRequest(_postConfig, request, { packId: 'first-week-operations' }, () =>
				_postConfig.context(request)
			)
		).rejects.toMatchObject({
			status: 403
		});

		expect(insertSpy).not.toHaveBeenCalled();
		expect(getAdminClient).not.toHaveBeenCalled();
	});

	it('denies from the starter-pack preflight before writes when another configure action is missing', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: NO_ONBOARDING_CONFIGURE
			}
		});
		const request = buildRequest(ctx);
		const insertSpy = vi.spyOn(ctx.store, 'insert');

		await expect(
			handleUseCaseRequest(_postConfig, request, { packId: 'first-week-operations' }, () =>
				_postConfig.context(request)
			)
		).rejects.toMatchObject({
			status: 403
		});

		expect(insertSpy).not.toHaveBeenCalled();
		expect(getAdminClient).not.toHaveBeenCalled();
	});
});
