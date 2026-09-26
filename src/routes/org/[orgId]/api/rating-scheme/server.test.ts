import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _deleteConfig, _postConfig, _putConfig } from './+server';

const validInput = {
	ratedPersonId: 'person-1',
	evalType: 'OER',
	ratingPeriodStart: '2026-01-01',
	ratingPeriodEnd: '2026-06-30',
	status: 'active'
};

describe('POST /api/rating-scheme', () => {
	it('uses policy-first route configs for Rating Scheme writes', () => {
		expect('permission' in _postConfig).toBe(false);
		expect('permission' in _putConfig).toBe(false);
		expect('permission' in _deleteConfig).toBe(false);
		expect(_postConfig.policyAction).toBe(POLICY_ACTION_CATALOG.ratingScheme.updateEntries);
		expect(_putConfig.policyAction).toBe(POLICY_ACTION_CATALOG.ratingScheme.updateEntries);
		expect(_deleteConfig.policyAction).toBe(POLICY_ACTION_CATALOG.ratingScheme.requestEntryDeletion);
	});

	it('rejects an unsupported status before a database mutation', async () => {
		const ctx = createTestContext();
		await expect(handleUseCaseRequest(_postConfig, ctx, { ...validInput, status: 'draft' })).rejects.toMatchObject({
			status: 400
		});
		expect(await ctx.store.findMany('rating_scheme_entries', ctx.auth.orgId)).toEqual([]);
	});

	it('authorizes through Rating Scheme policy decisions instead of legacy route permissions', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				requireEdit() {
					throw new Error('legacy requireEdit should not authorize Rating Scheme writes');
				},
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'operate'
				}
			}
		});
		ctx.store.seed('personnel', [
			{
				id: 'person-1',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				group_id: null
			}
		]);

		const result = (await handleUseCaseRequest(_postConfig, ctx, validInput)) as Record<string, unknown>;

		expect(result).toMatchObject({
			ratedPersonId: 'person-1',
			evalType: 'OER'
		});
	});

	it('lets a Rating-only Group operator write an in-Group entry and denies other and unassigned People', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: { kind: 'groups', groupIds: ['group-alpha'] },
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'operate'
				}
			}
		});
		ctx.store.seed('personnel', [
			{ id: 'person-1', organization_id: ctx.auth.orgId, group_id: 'group-alpha' },
			{ id: 'person-2', organization_id: ctx.auth.orgId, group_id: 'group-bravo' },
			{ id: 'person-3', organization_id: ctx.auth.orgId, group_id: null }
		]);

		const created = (await handleUseCaseRequest(_postConfig, ctx, validInput)) as { id: string; ratedPersonId: string };
		expect(created.ratedPersonId).toBe('person-1');
		for (const ratedPersonId of ['person-2', 'person-3']) {
			await expect(handleUseCaseRequest(_postConfig, ctx, { ...validInput, ratedPersonId })).rejects.toMatchObject({
				status: 403
			});
			await expect(handleUseCaseRequest(_putConfig, ctx, { id: created.id, ratedPersonId })).rejects.toMatchObject({
				status: 403
			});
		}
		await expect(handleUseCaseRequest(_putConfig, ctx, { id: created.id, status: 'completed' })).resolves.toMatchObject(
			{
				status: 'completed'
			}
		);
		await expect(handleUseCaseRequest(_deleteConfig, ctx, { id: created.id })).resolves.toEqual({
			requiresApproval: true
		});
		expect(await ctx.store.findMany('rating_scheme_entries', ctx.auth.orgId)).toHaveLength(1);
	});
});
