import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _deleteConfig, _patchConfig, _postConfig, _putConfig } from './+server';

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
		},
		{
			organization_id: ctx.auth.orgId,
			code: 'SSG',
			label: 'Staff Sergeant',
			service: 'army',
			category: 'enlisted',
			pay_grade: 'E-6',
			state: 'active',
			source: 'built-in',
			sort_order: 1
		}
	]);
}

describe('/api/personnel route authorization', () => {
	it('declares policy-first route authorization for personnel roster lifecycle writes', () => {
		expect(_postConfig).toMatchObject({
			mutation: true,
			policyAction: POLICY_ACTION_CATALOG.personnel.createRecords,
			policyResource: { kind: 'unscoped' }
		});
		expect(_putConfig).toMatchObject({
			mutation: true,
			policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
			policyResource: { kind: 'unscoped' }
		});
		expect(_deleteConfig).toMatchObject({
			mutation: true,
			policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
			policyResource: { kind: 'unscoped' }
		});
		expect(_patchConfig).toMatchObject({
			mutation: true,
			policyAction: POLICY_ACTION_CATALOG.personnel.restoreRecords,
			policyResource: { kind: 'unscoped' }
		});
		for (const config of [_postConfig, _putConfig, _deleteConfig, _patchConfig]) {
			expect('permission' in config).toBe(false);
		}
	});

	it('creates personnel through configure-level use-case Policy Decisions without route-level legacy edit gates', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		seedRankCatalog(ctx);

		const result = (await handleUseCaseRequest(_postConfig, ctx, {
			rank: 'SGT',
			lastName: 'Smith',
			firstName: 'Jamie',
			mos: '11B',
			clinicRole: 'Team Leader',
			groupId: null
		})) as Record<string, unknown>;

		expect(result).toMatchObject({ rank: 'SGT', lastName: 'Smith' });
	});

	it('updates personnel through use-case Policy Decisions without route-level legacy edit gates', async () => {
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
		ctx.store.seed('personnel', [
			{
				id: '11111111-1111-4111-8111-111111111111',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				mos: '11B',
				clinic_role: 'Team Leader',
				group_id: null,
				archived_at: null
			}
		]);

		const result = (await handleUseCaseRequest(_putConfig, ctx, {
			id: '11111111-1111-4111-8111-111111111111',
			rank: 'SSG'
		})) as Record<string, unknown>;

		expect(result).toMatchObject({ id: '11111111-1111-4111-8111-111111111111', rank: 'SSG' });
	});

	it('archives personnel through use-case Policy Decisions without route-level legacy edit gates', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		ctx.store.seed('personnel', [
			{
				id: '11111111-1111-4111-8111-111111111111',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				mos: '11B',
				clinic_role: 'Team Leader',
				group_id: null,
				archived_at: null
			}
		]);

		const result = await handleUseCaseRequest(_deleteConfig, ctx, { id: '11111111-1111-4111-8111-111111111111' });

		expect(result).toEqual({ success: true });
	});

	it('lets personnel managers request archive approval instead of failing route authorization', async () => {
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
		ctx.store.seed('personnel', [
			{
				id: '11111111-1111-4111-8111-111111111111',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				mos: '11B',
				clinic_role: 'Team Leader',
				group_id: null,
				archived_at: null
			}
		]);

		const result = await handleUseCaseRequest(_deleteConfig, ctx, { id: '11111111-1111-4111-8111-111111111111' });

		expect(result).toEqual({ requiresApproval: true });
		const stored = (await ctx.store.findOne('personnel', ctx.auth.orgId, {
			id: '11111111-1111-4111-8111-111111111111'
		})) as Record<string, unknown>;
		expect(stored.archived_at).toBeNull();
	});

	it('formats single archive approval requests as accepted responses for the client approval flow', async () => {
		const response = _deleteConfig.formatOutput?.({ requiresApproval: true });

		expect(response?.status).toBe(202);
		await expect(response?.json()).resolves.toEqual({ requiresApproval: true });
	});

	it('restores personnel through Personnel policy decisions without route-level privileged gates', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		ctx.store.seed('personnel', [
			{
				id: '11111111-1111-4111-8111-111111111111',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				archived_at: '2026-04-01T00:00:00Z'
			}
		]);

		const result = await handleUseCaseRequest(_patchConfig, ctx, {
			action: 'restore',
			id: '11111111-1111-4111-8111-111111111111'
		});

		expect(result).toEqual({ success: true });
	});

	it('formats restore cap rejections as validation responses', async () => {
		const response = _patchConfig.formatOutput?.({ message: 'Personnel limit reached' });

		expect(response?.status).toBe(422);
		await expect(response?.json()).resolves.toEqual({ message: 'Personnel limit reached' });
	});
});

describe('Personnel route denied-write safety', () => {
	const alpha = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
	const bravo = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
	const charlie = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
	const personId = '11111111-1111-4111-8111-111111111111';
	const otherOrg = 'other-organization';

	function fixture(
		overrides: Parameters<typeof createTestContext>[0] = {},
		rowOverrides: Record<string, unknown> = {}
	) {
		const ctx = createTestContext({
			...overrides,
			auth: {
				role: 'member',
				isPrivileged: false,
				canManageMembers: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'configure',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'groups', groupIds: [alpha, bravo] },
				...overrides.auth
			}
		});
		const row = {
			id: personId,
			organization_id: ctx.auth.orgId,
			rank: 'SGT',
			last_name: 'Example',
			first_name: 'Synthetic',
			group_id: bravo,
			clinic_role: 'Original duty role',
			archived_at: null,
			...rowOverrides
		};
		ctx.store.seed('personnel', [structuredClone(row)]);
		return { ctx, row };
	}

	async function expectUnchanged(ctx: ReturnType<typeof createTestContext>, rows: Record<string, unknown>[]) {
		for (const orgId of [ctx.auth.orgId, otherOrg]) {
			expect(await ctx.rawStore.findMany('personnel', orgId)).toEqual(
				rows.filter((row) => row.organization_id === orgId)
			);
			expect(await ctx.rawStore.findMany('deletion_requests', orgId)).toEqual([]);
		}
		expect(ctx.notificationPort.notifications).toEqual([]);
		expect(ctx.auditPort.events.every((event) => event.action === 'policy.denied')).toBe(true);
	}

	it('updates a record in the second assigned Group and preserves its Organization', async () => {
		const { ctx, row } = fixture();
		await handleUseCaseRequest(_putConfig, ctx, { id: personId, clinicRole: 'Updated duty role' });
		expect(await ctx.rawStore.findMany('personnel', ctx.auth.orgId)).toEqual([
			{ ...row, clinic_role: 'Updated duty role' }
		]);
	});

	it.each([
		{
			name: 'POST',
			run: (ctx: ReturnType<typeof createTestContext>) =>
				handleUseCaseRequest(_postConfig, ctx, { rank: 'SGT', lastName: 'New', firstName: 'Person', groupId: bravo })
		},
		{
			name: 'PUT',
			run: (ctx: ReturnType<typeof createTestContext>) =>
				handleUseCaseRequest(_putConfig, ctx, { id: personId, clinicRole: 'Changed' })
		},
		{
			name: 'DELETE',
			run: (ctx: ReturnType<typeof createTestContext>) => handleUseCaseRequest(_deleteConfig, ctx, { id: personId })
		},
		{
			name: 'PATCH',
			run: (ctx: ReturnType<typeof createTestContext>) =>
				handleUseCaseRequest(_patchConfig, ctx, { id: personId, action: 'restore' })
		}
	])('rejects $name for a viewer without changing records or creating approval requests', async ({ run }) => {
		const { ctx, row } = fixture({
			auth: {
				capabilityMap: {
					calendar: 'configure',
					personnel: 'view',
					training: 'configure',
					criticalTasks: 'configure',
					onboarding: 'configure',
					ratingScheme: 'configure'
				}
			}
		});
		await expect(run(ctx)).rejects.toMatchObject({ status: 403 });
		await expectUnchanged(ctx, [row]);
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'policy.denied',
				details: expect.objectContaining({ reasonCode: 'denied:missing-capability' })
			})
		]);
	});

	it.each([
		{ name: 'another Group', groupId: charlie },
		{ name: 'ungrouped personnel', groupId: null }
	])('rejects updates to $name without changing stored data', async ({ groupId }) => {
		const { ctx, row: outside } = fixture({}, { group_id: groupId });
		await expect(handleUseCaseRequest(_putConfig, ctx, { id: personId, clinicRole: 'Changed' })).rejects.toMatchObject({
			status: 403
		});
		await expectUnchanged(ctx, [outside]);
	});

	it.each([
		{ name: 'an unassigned Group', groupId: charlie },
		{ name: 'organization-wide ungrouped scope', groupId: null }
	])('rejects moving an accessible record to $name before mutation', async ({ groupId }) => {
		const { ctx, row } = fixture();
		await expect(
			handleUseCaseRequest(_putConfig, ctx, { id: personId, groupId, clinicRole: 'Changed' })
		).rejects.toMatchObject({ status: 403 });
		await expectUnchanged(ctx, [row]);
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'policy.denied',
				details: expect.objectContaining({ reasonCode: 'denied:out-of-scope' })
			})
		]);
	});

	it('rejects restoring another Organization record even for an Organization owner', async () => {
		const { ctx, row: foreign } = fixture(
			{ auth: { role: 'owner', isPrivileged: true, scopeSet: { kind: 'organization' } } },
			{ organization_id: otherOrg, archived_at: '2026-01-01T00:00:00Z' }
		);
		await expect(handleUseCaseRequest(_patchConfig, ctx, { id: personId, action: 'restore' })).rejects.toMatchObject({
			status: 404
		});
		await expectUnchanged(ctx, [foreign]);
	});
});
