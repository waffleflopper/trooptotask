import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { describe, expect, it, vi } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$features/rating-scheme/server/ratingSchemePersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { projectOrganizationAccessGrant } from '$lib/access/memberAccessProjection';
import { _deleteConfig, _getConfig, _postConfig, _putConfig } from './+server';
import { _postConfig as _changeRaterConfig } from './[entryId]/change-rater/+server';
import { _postConfig as _workflowConfig } from './[entryId]/workflow/+server';

const RATED_PERSON = '00000000-0000-4000-8000-0000000000a1';
const OTHER_GROUP_PERSON = '00000000-0000-4000-8000-0000000000a2';
const UNASSIGNED_PERSON = '00000000-0000-4000-8000-0000000000a3';

const validInput = {
	ratedPersonId: RATED_PERSON,
	evalType: 'OER',
	ratingPeriodStart: '2026-01-01',
	ratingPeriodEnd: '2026-06-30'
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

	it('rejects an unsupported evaluation type before a database mutation', async () => {
		const ctx = createTestContext();
		await expect(
			handleUseCaseRequest(_postConfig, ctx, { ...validInput, evalType: 'DRAFT' }, () => ctx)
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

	it('answers 400 for an empty rated Person on create and update and leaves the entry unchanged', async () => {
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
					ratingScheme: 'operate'
				}
			}
		});
		ctx.store.seed('personnel', [
			{ id: RATED_PERSON, organization_id: ctx.auth.orgId, rank: 'SGT', last_name: 'Smith', first_name: 'John' }
		]);
		const created = (await handleUseCaseRequest(_postConfig, ctx, validInput, () => ctx)) as { id: string };
		const before = await ctx.store.findMany('rating_scheme_entries', ctx.auth.orgId);

		await expect(
			handleUseCaseRequest(_postConfig, ctx, { ...validInput, ratedPersonId: '' }, () => ctx)
		).rejects.toMatchObject({ status: 400 });
		await expect(
			handleUseCaseRequest(_putConfig, ctx, { id: created.id, ratedPersonId: '' }, () => ctx)
		).rejects.toMatchObject({ status: 400 });
		expect(await ctx.store.findMany('rating_scheme_entries', ctx.auth.orgId)).toEqual(before);
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
				scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['group-alpha'] }),
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
			handleUseCaseRequest(_putConfig, ctx, { id: created.id, notes: 'In-Group edit' }, () => ctx)
		).resolves.toMatchObject({
			notes: 'In-Group edit'
		});
		await expect(handleUseCaseRequest(_deleteConfig, ctx, { id: created.id }, () => selected)).resolves.toEqual({
			requiresApproval: true
		});
		expect(await ctx.store.findMany('rating_scheme_entries', ctx.auth.orgId)).toHaveLength(1);
	});
});

describe('POST /api/rating-scheme/[entryId] lifecycle', () => {
	const IN_GROUP_ENTRY = '00000000-0000-4000-8000-0000000000e1';
	const OTHER_GROUP_ENTRY = '00000000-0000-4000-8000-0000000000e2';

	function groupOperator() {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['group-alpha'] }),
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
			{ id: RATED_PERSON, organization_id: ctx.auth.orgId, group_id: 'group-alpha' },
			{ id: OTHER_GROUP_PERSON, organization_id: ctx.auth.orgId, group_id: 'group-bravo' }
		]);
		const evaluation = {
			organization_id: ctx.auth.orgId,
			eval_type: 'NCOER',
			rater_name: 'SSG Current',
			rating_period_start: '2026-01-01',
			rating_period_end: '2026-12-31',
			workflow_status: 'drafting'
		};
		ctx.store.seed('rating_scheme_entries', [
			{ ...evaluation, id: IN_GROUP_ENTRY, rated_person_id: RATED_PERSON },
			{ ...evaluation, id: OTHER_GROUP_ENTRY, rated_person_id: OTHER_GROUP_PERSON }
		]);
		return ctx;
	}

	it('authorizes both lifecycle routes as Rating Scheme entry updates', () => {
		expect(_workflowConfig.policyAction).toBe(POLICY_ACTION_CATALOG.ratingScheme.updateEntries);
		expect(_changeRaterConfig.policyAction).toBe(POLICY_ACTION_CATALOG.ratingScheme.updateEntries);
	});

	it('lets a Group operator move an in-Group evaluation and denies one outside the Group', async () => {
		const ctx = groupOperator();

		await expect(
			handleUseCaseRequest(_workflowConfig, ctx, { id: IN_GROUP_ENTRY, body: { to: 'with-rater' } }, () => ctx)
		).resolves.toMatchObject({ moved: true, entry: { workflowStatus: 'with-rater' } });
		await expect(
			handleUseCaseRequest(_workflowConfig, ctx, { id: OTHER_GROUP_ENTRY, body: { to: 'with-rater' } }, () => ctx)
		).rejects.toMatchObject({ status: 403 });
		const other = await ctx.store.findOne<Record<string, unknown>>('rating_scheme_entries', ctx.auth.orgId, {
			id: OTHER_GROUP_ENTRY
		});
		expect(other?.workflow_status).toBe('drafting');
	});

	it('lets a Group operator change the rater of an in-Group evaluation and denies one outside the Group', async () => {
		const ctx = groupOperator();
		const body = { changeDate: '2026-06-30', raterName: 'SSG Incoming' };

		await expect(
			handleUseCaseRequest(_changeRaterConfig, ctx, { id: IN_GROUP_ENTRY, body }, () => ctx)
		).resolves.toMatchObject({
			entry: { workflowStatus: 'completed', reportType: 'CR' },
			successor: { ratedPersonId: RATED_PERSON, raterName: 'SSG Incoming', ratingPeriodStart: '2026-07-01' }
		});
		await expect(
			handleUseCaseRequest(_changeRaterConfig, ctx, { id: OTHER_GROUP_ENTRY, body }, () => ctx)
		).rejects.toMatchObject({ status: 403 });
		expect(await ctx.store.findMany('rating_scheme_entries', ctx.auth.orgId)).toHaveLength(3);
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
				rating_period_end: '2026-06-30'
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
