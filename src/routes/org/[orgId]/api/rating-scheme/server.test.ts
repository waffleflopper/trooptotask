import { describe, expect, it, vi } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$features/rating-scheme/server/ratingSchemePersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { projectOrganizationAccessGrant } from '$lib/access/memberAccessProjection';
import { _deleteConfig, _getConfig, _postConfig, _putConfig } from './+server';

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

describe('GET /api/rating-scheme', () => {
	function seededContext(capability: 'view' | 'none') {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: capability
				}
			}
		});
		ctx.store.seed('personnel', [
			{ id: RATED_PERSON, organization_id: ctx.auth.orgId, rank: 'SGT', last_name: 'Smith', first_name: 'John' }
		]);
		ctx.store.seed('rating_scheme_entries', [
			{
				id: '00000000-0000-4000-8000-0000000000e1',
				organization_id: ctx.auth.orgId,
				rated_person_id: RATED_PERSON,
				eval_type: 'NCOER',
				rating_period_start: '2025-07-01',
				rating_period_end: '2026-06-30',
				status: 'active'
			}
		]);
		return ctx;
	}
	const read = (ctx: ReturnType<typeof seededContext>, entry: string) =>
		handleUseCaseRequest(_getConfig, ctx, { entry }, () => ctx);

	it('returns one entry with the roster references its editor offers', async () => {
		const result = await read(seededContext('view'), '00000000-0000-4000-8000-0000000000e1');
		expect(result).toMatchObject({
			entry: { id: '00000000-0000-4000-8000-0000000000e1', ratedPersonId: RATED_PERSON, evalType: 'NCOER' },
			personnelLookup: [{ id: RATED_PERSON, rank: 'SGT', lastName: 'Smith', firstName: 'John' }]
		});
	});

	it('answers 400 for a malformed id, 404 for a missing entry and 403 without Rating Scheme access', async () => {
		await expect(read(seededContext('view'), 'abc')).rejects.toMatchObject({ status: 400, message: 'Invalid ID' });
		await expect(read(seededContext('view'), '00000000-0000-4000-8000-0000000000e2')).rejects.toMatchObject({
			status: 404,
			message: 'Rating Scheme entry not found'
		});
		await expect(read(seededContext('none'), '00000000-0000-4000-8000-0000000000e1')).rejects.toMatchObject({
			status: 403
		});
	});

	it('refuses an owner while the unit has Evaluations turned off, before any read', async () => {
		const auth = projectOrganizationAccessGrant({ role: 'owner' }, 'owner-1', 'test-org', {
			disabledFeatures: ['evaluations']
		});
		const owner = createTestContext({ auth: { ...auth } });
		const findMany = vi.spyOn(owner.store, 'findMany').mockRejectedValue(new Error('Evaluations must not be read'));

		await expect(
			handleUseCaseRequest(_getConfig, owner, { entry: '00000000-0000-4000-8000-0000000000e1' }, () => owner)
		).rejects.toMatchObject({
			status: 403
		});
		expect(findMany).not.toHaveBeenCalled();
	});

	it('marks the read private and non-cacheable', () => {
		const response = _getConfig.formatOutput!({} as never);

		expect(response.headers.get('Cache-Control')).toBe('private, no-store');
	});
});
