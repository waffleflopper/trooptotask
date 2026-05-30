import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _deleteConfig, _patchConfig, _postConfig, _putConfig } from './+server';

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
		ctx.store.seed('personnel_follow_ups', [
			{
				id: 'follow-up-restored',
				organization_id: ctx.auth.orgId,
				personnel_id: '11111111-1111-4111-8111-111111111111',
				status: 'archived',
				archived_at: '2026-04-01T00:00:00Z'
			},
			{
				id: 'follow-up-still-archived',
				organization_id: ctx.auth.orgId,
				personnel_id: '11111111-1111-4111-8111-111111111111',
				status: 'archived',
				archived_at: '2026-03-01T00:00:00Z'
			}
		]);
		ctx.store.seed('counseling_records', [
			{
				id: 'counseling-restored',
				organization_id: ctx.auth.orgId,
				personnel_id: '11111111-1111-4111-8111-111111111111',
				archived_at: '2026-04-01T00:00:00Z'
			}
		]);
		ctx.store.seed('personnel_documents', [
			{
				id: 'document-restored',
				organization_id: ctx.auth.orgId,
				personnel_id: '11111111-1111-4111-8111-111111111111',
				archived_at: '2026-04-01T00:00:00Z'
			}
		]);
		ctx.store.seed('leader_notes', [
			{
				id: 'note-restored',
				organization_id: ctx.auth.orgId,
				personnel_id: '11111111-1111-4111-8111-111111111111',
				archived_at: '2026-04-01T00:00:00Z'
			}
		]);

		const result = await handleUseCaseRequest(_patchConfig, ctx, {
			action: 'restore',
			id: '11111111-1111-4111-8111-111111111111'
		});

		expect(result).toEqual({ success: true });
		await expect(
			ctx.store.findOne('personnel_follow_ups', ctx.auth.orgId, { id: 'follow-up-restored' })
		).resolves.toMatchObject({ status: 'open', archived_at: null });
		await expect(
			ctx.store.findOne('personnel_follow_ups', ctx.auth.orgId, { id: 'follow-up-still-archived' })
		).resolves.toMatchObject({ status: 'archived', archived_at: '2026-03-01T00:00:00Z' });
		await expect(
			ctx.store.findOne('counseling_records', ctx.auth.orgId, { id: 'counseling-restored' })
		).resolves.toMatchObject({ archived_at: null });
		await expect(
			ctx.store.findOne('personnel_documents', ctx.auth.orgId, { id: 'document-restored' })
		).resolves.toMatchObject({
			archived_at: null
		});
		await expect(ctx.store.findOne('leader_notes', ctx.auth.orgId, { id: 'note-restored' })).resolves.toMatchObject({
			archived_at: null
		});
	});
});
