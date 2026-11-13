import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { describe, expect, it, vi } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$features/rating-scheme/server/ratingSchemePersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { projectOrganizationAccessGrant } from '$lib/access/memberAccessProjection';
import { _getConfig, _postConfig, _putConfig } from './+server';
import { _postConfig as _archiveConfig } from './[ratingSchemeId]/archive/+server';
import { _postConfig as _startConfig } from './[ratingSchemeId]/evaluations/+server';
import { _deleteConfig, _putConfig as _evaluationPutConfig } from '../evaluations/+server';
import { _postConfig as _changeRaterConfig } from '../evaluations/[evaluationId]/change-rater/+server';
import { _postConfig as _workflowConfig } from '../evaluations/[evaluationId]/workflow/+server';

const RATED_PERSON = '00000000-0000-4000-8000-0000000000a1';
const OTHER_GROUP_PERSON = '00000000-0000-4000-8000-0000000000a2';
const UNASSIGNED_PERSON = '00000000-0000-4000-8000-0000000000a3';

const validInput = {
	ratedPersonId: RATED_PERSON,
	evalType: 'OER'
};

const operatorCapabilities = {
	calendar: 'none',
	personnel: 'none',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'none',
	ratingScheme: 'operate'
} as const;

const period = { ratingPeriodStart: '2026-01-01', ratingPeriodEnd: '2026-06-30' };

describe('POST /api/rating-scheme', () => {
	it('uses policy-first route configs for Rating Scheme writes', () => {
		for (const config of [_postConfig, _putConfig, _evaluationPutConfig, _deleteConfig]) {
			expect('permission' in config).toBe(false);
		}
		expect(_postConfig.policyAction).toBe(POLICY_ACTION_CATALOG.ratingScheme.updateEntries);
		expect(_putConfig.policyAction).toBe(POLICY_ACTION_CATALOG.ratingScheme.updateEntries);
		expect(_evaluationPutConfig.policyAction).toBe(POLICY_ACTION_CATALOG.ratingScheme.updateEntries);
		expect(_deleteConfig.policyAction).toBe(POLICY_ACTION_CATALOG.ratingScheme.requestEntryDeletion);
	});

	it('rejects an unsupported evaluation type before a database mutation', async () => {
		const ctx = createTestContext();
		await expect(
			handleUseCaseRequest(_postConfig, ctx, { ...validInput, evalType: 'DRAFT' }, () => ctx)
		).rejects.toMatchObject({
			status: 400
		});
		expect(await ctx.store.findMany('rating_schemes', ctx.auth.orgId)).toEqual([]);
	});

	it('rejects malformed ids and dates with 400 and a missing scheme or Evaluation with 404 before writing', async () => {
		const ctx = createTestContext();
		const missing = '00000000-0000-4000-8000-0000000000a4';

		for (const [config, body, message] of [
			[_putConfig, { id: 'abc', notes: 'Changed' }, 'Invalid ID'],
			[_postConfig, { ...validInput, ratedPersonId: 'abc' }, 'Invalid ID'],
			[_evaluationPutConfig, { id: missing, ratingPeriodStart: '2026-02-30' }, 'Use a valid date (YYYY-MM-DD)'],
			[_evaluationPutConfig, { id: missing, ratingPeriodEnd: 'June' }, 'Use a valid date (YYYY-MM-DD)']
		] as const) {
			await expect(handleUseCaseRequest(config, ctx, body, () => ctx)).rejects.toMatchObject({ status: 400, message });
		}
		await expect(
			handleUseCaseRequest(_putConfig, ctx, { id: missing, notes: 'Changed' }, () => ctx)
		).rejects.toMatchObject({ status: 404, message: 'Rating scheme not found' });
		await expect(
			handleUseCaseRequest(_evaluationPutConfig, ctx, { id: missing, notes: 'Changed' }, () => ctx)
		).rejects.toMatchObject({ status: 404, message: 'Evaluation not found' });
		expect(await ctx.store.findMany('rating_schemes', ctx.auth.orgId)).toEqual([]);
		expect(await ctx.store.findMany('evaluations', ctx.auth.orgId)).toEqual([]);
	});

	it('answers 400 for an empty rated Person on create and update and leaves the scheme unchanged', async () => {
		const ctx = createTestContext({
			auth: { role: 'member', isPrivileged: false, capabilityMap: operatorCapabilities }
		});
		ctx.store.seed('personnel', [
			{ id: RATED_PERSON, organization_id: ctx.auth.orgId, rank: 'SGT', last_name: 'Smith', first_name: 'John' }
		]);
		const created = (await handleUseCaseRequest(_postConfig, ctx, validInput, () => ctx)) as { id: string };
		const before = await ctx.store.findMany('rating_schemes', ctx.auth.orgId);

		await expect(
			handleUseCaseRequest(_postConfig, ctx, { ...validInput, ratedPersonId: '' }, () => ctx)
		).rejects.toMatchObject({ status: 400 });
		await expect(
			handleUseCaseRequest(_putConfig, ctx, { id: created.id, ratedPersonId: '' }, () => ctx)
		).rejects.toMatchObject({ status: 400 });
		expect(await ctx.store.findMany('rating_schemes', ctx.auth.orgId)).toEqual(before);
	});

	it('authorizes through Rating Scheme policy decisions instead of legacy route permissions', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				requireEdit() {
					throw new Error('legacy requireEdit should not authorize Rating Scheme writes');
				},
				capabilityMap: operatorCapabilities
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
			evalType: 'OER',
			archivedAt: null
		});
	});

	it('lets a Rating-only Group operator write an in-Group scheme and Evaluation and denies other and unassigned People', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['group-alpha'] }),
				capabilityMap: operatorCapabilities
			}
		});
		const selected = { ...ctx, notifyEvaluationDeleted: vi.fn(async () => {}) };
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
		const { evaluation } = (await handleUseCaseRequest(
			_startConfig,
			ctx,
			{ id: created.id, body: period },
			() => ctx
		)) as { evaluation: { id: string } };
		await expect(
			handleUseCaseRequest(_evaluationPutConfig, ctx, { id: evaluation.id, notes: 'In-Group edit' }, () => ctx)
		).resolves.toMatchObject({
			notes: 'In-Group edit'
		});
		await expect(handleUseCaseRequest(_deleteConfig, ctx, { id: evaluation.id }, () => selected)).resolves.toEqual({
			requiresApproval: true
		});
		expect(await ctx.store.findMany('evaluations', ctx.auth.orgId)).toHaveLength(1);
		expect(await ctx.store.findMany('rating_schemes', ctx.auth.orgId)).toHaveLength(1);
	});
});

describe('Rating Scheme and Evaluation lifecycle routes', () => {
	const IN_GROUP_SCHEME = '00000000-0000-4000-8000-0000000000c1';
	const OTHER_GROUP_SCHEME = '00000000-0000-4000-8000-0000000000c2';
	const IN_GROUP_EVALUATION = '00000000-0000-4000-8000-0000000000e1';
	const OTHER_GROUP_EVALUATION = '00000000-0000-4000-8000-0000000000e2';

	function groupOperator() {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['group-alpha'] }),
				capabilityMap: operatorCapabilities
			}
		});
		ctx.store.seed('personnel', [
			{ id: RATED_PERSON, organization_id: ctx.auth.orgId, group_id: 'group-alpha' },
			{ id: OTHER_GROUP_PERSON, organization_id: ctx.auth.orgId, group_id: 'group-bravo' }
		]);
		const scheme = {
			organization_id: ctx.auth.orgId,
			eval_type: 'NCOER',
			rater_name: 'SSG Current',
			archived_at: null
		};
		ctx.store.seed('rating_schemes', [
			{ ...scheme, id: IN_GROUP_SCHEME, rated_person_id: RATED_PERSON },
			{ ...scheme, id: OTHER_GROUP_SCHEME, rated_person_id: OTHER_GROUP_PERSON }
		]);
		const evaluation = {
			organization_id: ctx.auth.orgId,
			eval_type: 'NCOER',
			rating_period_start: '2026-01-01',
			rating_period_end: '2026-12-31',
			workflow_status: 'drafting'
		};
		ctx.store.seed('evaluations', [
			{ ...evaluation, id: IN_GROUP_EVALUATION, rating_scheme_id: IN_GROUP_SCHEME, rated_person_id: RATED_PERSON },
			{
				...evaluation,
				id: OTHER_GROUP_EVALUATION,
				rating_scheme_id: OTHER_GROUP_SCHEME,
				rated_person_id: OTHER_GROUP_PERSON
			}
		]);
		return ctx;
	}

	const storedRow = (ctx: ReturnType<typeof groupOperator>, table: string, id: string) =>
		ctx.store.findOne<Record<string, unknown>>(table, ctx.auth.orgId, { id });

	it('authorizes every lifecycle route as a Rating Scheme entry update', () => {
		for (const config of [_workflowConfig, _changeRaterConfig, _archiveConfig, _startConfig]) {
			expect(config.policyAction).toBe(POLICY_ACTION_CATALOG.ratingScheme.updateEntries);
		}
	});

	it('lets a Group operator archive an in-Group scheme, keeps its open Evaluation, and denies one outside the Group', async () => {
		const ctx = groupOperator();

		await expect(
			handleUseCaseRequest(_archiveConfig, ctx, { id: IN_GROUP_SCHEME, body: { archived: true } }, () => ctx)
		).resolves.toMatchObject({ changed: true, ratingScheme: { id: IN_GROUP_SCHEME, archivedAt: expect.any(String) } });
		expect((await storedRow(ctx, 'evaluations', IN_GROUP_EVALUATION))?.workflow_status).toBe('drafting');
		await expect(
			handleUseCaseRequest(_archiveConfig, ctx, { id: OTHER_GROUP_SCHEME, body: { archived: true } }, () => ctx)
		).rejects.toMatchObject({ status: 403 });
		expect((await storedRow(ctx, 'rating_schemes', OTHER_GROUP_SCHEME))?.archived_at ?? null).toBeNull();
	});

	it('lets a Group operator start an Evaluation on an in-Group scheme and denies one outside the Group', async () => {
		const ctx = groupOperator();
		const body = { ratingPeriodStart: '2025-01-01', ratingPeriodEnd: '2025-12-31', completed: true };

		await expect(
			handleUseCaseRequest(_startConfig, ctx, { id: IN_GROUP_SCHEME, body }, () => ctx)
		).resolves.toMatchObject({
			created: true,
			evaluation: { ratingSchemeId: IN_GROUP_SCHEME, workflowStatus: 'completed', ratingPeriodEnd: '2025-12-31' }
		});
		await expect(
			handleUseCaseRequest(_startConfig, ctx, { id: OTHER_GROUP_SCHEME, body }, () => ctx)
		).rejects.toMatchObject({ status: 403 });
		expect(await ctx.store.findMany('evaluations', ctx.auth.orgId)).toHaveLength(3);
	});

	it('lets a Group operator move an in-Group Evaluation and denies one outside the Group', async () => {
		const ctx = groupOperator();
		const body = { from: 'drafting', to: 'with-rater' };

		await expect(
			handleUseCaseRequest(_workflowConfig, ctx, { id: IN_GROUP_EVALUATION, body }, () => ctx)
		).resolves.toMatchObject({ moved: true, evaluation: { workflowStatus: 'with-rater' } });
		await expect(
			handleUseCaseRequest(_workflowConfig, ctx, { id: OTHER_GROUP_EVALUATION, body }, () => ctx)
		).rejects.toMatchObject({ status: 403 });
		expect((await storedRow(ctx, 'evaluations', OTHER_GROUP_EVALUATION))?.workflow_status).toBe('drafting');
	});

	it('lets a Group operator change the rater of an in-Group Evaluation and denies one outside the Group', async () => {
		const ctx = groupOperator();
		const body = { changeDate: '2026-06-30', raterName: 'SSG Incoming' };

		await expect(
			handleUseCaseRequest(_changeRaterConfig, ctx, { id: IN_GROUP_EVALUATION, body }, () => ctx)
		).resolves.toMatchObject({
			evaluation: { workflowStatus: 'completed', reportType: 'CR' },
			ratingScheme: { id: IN_GROUP_SCHEME, raterName: 'SSG Incoming' },
			successor: { ratingSchemeId: IN_GROUP_SCHEME, ratingPeriodStart: '2026-07-01' }
		});
		await expect(
			handleUseCaseRequest(_changeRaterConfig, ctx, { id: OTHER_GROUP_EVALUATION, body }, () => ctx)
		).rejects.toMatchObject({ status: 403 });
		expect(await ctx.store.findMany('evaluations', ctx.auth.orgId)).toHaveLength(3);
		expect((await storedRow(ctx, 'rating_schemes', OTHER_GROUP_SCHEME))?.rater_name).toBe('SSG Current');
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
		ctx.store.seed('rating_schemes', [
			{
				id: '00000000-0000-4000-8000-0000000000c1',
				organization_id: ctx.auth.orgId,
				rated_person_id: RATED_PERSON,
				eval_type: 'NCOER',
				archived_at: null
			}
		]);
		ctx.store.seed('evaluations', [
			{
				id: '00000000-0000-4000-8000-0000000000e1',
				organization_id: ctx.auth.orgId,
				rating_scheme_id: '00000000-0000-4000-8000-0000000000c1',
				rated_person_id: RATED_PERSON,
				eval_type: 'NCOER',
				rating_period_start: '2025-07-01',
				rating_period_end: '2026-06-30',
				workflow_status: null
			}
		]);
		return ctx;
	}
	const read = (ctx: ReturnType<typeof seededContext>, evaluation: string) =>
		handleUseCaseRequest(_getConfig, ctx, { evaluation }, () => ctx);

	it('returns one Evaluation and its scheme with the roster references its editor offers', async () => {
		const result = await read(seededContext('view'), '00000000-0000-4000-8000-0000000000e1');
		expect(result).toMatchObject({
			ratingScheme: { id: '00000000-0000-4000-8000-0000000000c1', ratedPersonId: RATED_PERSON },
			evaluation: { id: '00000000-0000-4000-8000-0000000000e1', ratedPersonId: RATED_PERSON, evalType: 'NCOER' },
			personnelLookup: [{ id: RATED_PERSON, rank: 'SGT', lastName: 'Smith', firstName: 'John' }]
		});
	});

	it('answers 400 for a malformed id, 404 for a missing Evaluation and 403 without Rating Scheme access', async () => {
		await expect(read(seededContext('view'), 'abc')).rejects.toMatchObject({ status: 400, message: 'Invalid ID' });
		await expect(read(seededContext('view'), '00000000-0000-4000-8000-0000000000e2')).rejects.toMatchObject({
			status: 404,
			message: 'Evaluation not found'
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
			handleUseCaseRequest(_getConfig, owner, { evaluation: '00000000-0000-4000-8000-0000000000e1' }, () => owner)
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
