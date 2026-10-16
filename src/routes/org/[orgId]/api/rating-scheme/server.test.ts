import { describe, expect, it, vi } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$features/rating-scheme/server/ratingSchemePersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _deleteConfig, _postConfig, _putConfig } from './+server';

const RATED_PERSON = '00000000-0000-4000-8000-0000000000a1';
const OTHER_GROUP_PERSON = '00000000-0000-4000-8000-0000000000a2';
const UNASSIGNED_PERSON = '00000000-0000-4000-8000-0000000000a3';

const validInput = {
	ratedPersonId: RATED_PERSON,
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
		await expect(
			handleUseCaseRequest(_postConfig, ctx, { ...validInput, status: 'draft' }, () => ctx)
		).rejects.toMatchObject({
			status: 400
		});
		expect(await ctx.store.findMany('rating_scheme_entries', ctx.auth.orgId)).toEqual([]);
	});

	it('rejects malformed ids and dates with 400 and a missing entry with 404 before writing', async () => {
		const ctx = createTestContext();

		for (const [config, body, message] of [
			[_putConfig, { id: 'abc', notes: 'Changed' }, 'Invalid ID'],
			[_postConfig, { ...validInput, ratedPersonId: 'abc' }, 'Invalid ID'],
			[_postConfig, { ...validInput, ratingPeriodStart: '2026-02-30' }, 'Use a valid date (YYYY-MM-DD)'],
			[
				_putConfig,
				{ id: '00000000-0000-4000-8000-0000000000a4', ratingPeriodEnd: 'June' },
				'Use a valid date (YYYY-MM-DD)'
			]
		] as const) {
			await expect(handleUseCaseRequest(config, ctx, body, () => ctx)).rejects.toMatchObject({ status: 400, message });
		}
		await expect(
			handleUseCaseRequest(_putConfig, ctx, { id: '00000000-0000-4000-8000-0000000000a4', notes: 'Changed' }, () => ctx)
		).rejects.toMatchObject({ status: 404, message: 'Rating Scheme entry not found' });
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
				id: RATED_PERSON,
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				group_id: null
			}
		]);

		const result = (await handleUseCaseRequest(_postConfig, ctx, validInput, () => ctx)) as Record<string, unknown>;

		expect(result).toMatchObject({
			ratedPersonId: RATED_PERSON,
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
		const selected = { ...ctx, notifyRatingSchemeEntryDeleted: vi.fn(async () => {}) };
		ctx.store.seed('personnel', [
			{ id: RATED_PERSON, organization_id: ctx.auth.orgId, group_id: 'group-alpha' },
			{ id: OTHER_GROUP_PERSON, organization_id: ctx.auth.orgId, group_id: 'group-bravo' },
			{ id: UNASSIGNED_PERSON, organization_id: ctx.auth.orgId, group_id: null }
		]);

		const created = (await handleUseCaseRequest(_postConfig, ctx, validInput, () => ctx)) as {
			id: string;
			ratedPersonId: string;
		};
		expect(created.ratedPersonId).toBe(RATED_PERSON);
		for (const ratedPersonId of [OTHER_GROUP_PERSON, UNASSIGNED_PERSON]) {
			await expect(
				handleUseCaseRequest(_postConfig, ctx, { ...validInput, ratedPersonId }, () => ctx)
			).rejects.toMatchObject({
				status: 403
			});
			await expect(
				handleUseCaseRequest(_putConfig, ctx, { id: created.id, ratedPersonId }, () => ctx)
			).rejects.toMatchObject({
				status: 403
			});
		}
		await expect(
			handleUseCaseRequest(_putConfig, ctx, { id: created.id, status: 'completed' }, () => ctx)
		).resolves.toMatchObject({
			status: 'completed'
		});
		await expect(handleUseCaseRequest(_deleteConfig, ctx, { id: created.id }, () => selected)).resolves.toEqual({
			requiresApproval: true
		});
		expect(await ctx.store.findMany('rating_scheme_entries', ctx.auth.orgId)).toHaveLength(1);
	});
});
