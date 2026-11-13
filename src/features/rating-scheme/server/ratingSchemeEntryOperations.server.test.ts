import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { describe, it, expect, vi } from 'vitest';
import { createTestContext } from './ratingSchemePersistence.test-support.server';
import {
	changeEvaluationRater,
	createRatingScheme,
	removeEvaluation,
	setRatingSchemeArchived,
	startEvaluation,
	transitionEvaluation,
	updateEvaluation,
	updateRatingScheme
} from './ratingSchemeEntryOperations.server';

const RATED_PERSON = '00000000-0000-4000-8000-0000000000a1';
const SCHEME = '00000000-0000-4000-8000-0000000000c1';
const EVALUATION = '00000000-0000-4000-8000-0000000000e1';
const FOREIGN = '00000000-0000-4000-8000-0000000000f1';

function buildContext(overrides?: Parameters<typeof createTestContext>[0]) {
	const ctx = createTestContext(overrides);
	return {
		...ctx,
		notifyEvaluationDeleted: vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
	};
}

function seedRatedPerson(ctx: ReturnType<typeof buildContext>, groupId: string | null = null) {
	ctx.store.seed('personnel', [
		{
			id: RATED_PERSON,
			organization_id: ctx.auth.orgId,
			rank: 'SGT',
			last_name: 'Smith',
			first_name: 'John',
			group_id: groupId
		}
	]);
}

const validInput = { ratedPersonId: RATED_PERSON, evalType: 'OER' };
const period = { ratingPeriodStart: '2026-01-01', ratingPeriodEnd: '2026-12-31' };

describe('Rating scheme — create', () => {
	it('uses Rating Scheme policy decisions instead of the legacy edit lane before mutating', async () => {
		const ctx = buildContext({
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
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				group_id: null
			}
		]);
		const create = createRatingScheme;

		await create(ctx, { ...validInput });
	});

	it('lists a rating scheme for the person', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		const create = createRatingScheme;

		const result = await create(ctx, { ...validInput });

		expect(result).toMatchObject({
			ratedPersonId: RATED_PERSON,
			evalType: 'OER'
		});

		expect(await ctx.store.findMany('rating_schemes', 'test-org')).toHaveLength(1);
		await expect(create(ctx, { ...validInput })).rejects.toMatchObject({ status: 409 });
	});

	it('coerces empty strings to null on create', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		const create = createRatingScheme;

		await create(ctx, { ...validInput, raterName: '', seniorRaterName: '' });

		const stored = (await ctx.store.findMany('rating_schemes', 'test-org')) as Record<string, unknown>[];
		expect(stored[0].rater_name).toBeNull();
		expect(stored[0].senior_rater_name).toBeNull();
	});

	it('denies create through an authoritative Rating Scheme policy decision and audits the attempt', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'configure',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'view'
				}
			}
		});
		const create = createRatingScheme;

		await expect(create(ctx, { ...validInput })).rejects.toMatchObject({ status: 403 });
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'rating_scheme',
				details: expect.objectContaining({
					policyAction: 'ratingScheme.updateEntries',
					reasonCode: 'denied:missing-capability'
				}),
				severity: 'warning'
			})
		);
	});

	it('honors multi-Group scope when listing a scoped rating scheme', async () => {
		const ctx = buildContext({
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
				},
				scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['group-a', 'group-c'] })
			}
		});
		ctx.store.seed('personnel', [
			{
				id: RATED_PERSON,
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				group_id: 'group-c'
			}
		]);
		const create = createRatingScheme;

		const result = await create(ctx, { ...validInput });

		expect(result.ratedPersonId).toBe(RATED_PERSON);
	});

	it('denies a Group member write for an unassigned rated Person', async () => {
		const ctx = buildContext({
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
				},
				scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['group-a'] })
			}
		});
		ctx.store.seed('personnel', [
			{
				id: RATED_PERSON,
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				group_id: null
			}
		]);
		const create = createRatingScheme;

		await expect(create(ctx, { ...validInput })).rejects.toMatchObject({ status: 403 });
		expect(await ctx.store.findMany('rating_schemes', ctx.auth.orgId)).toEqual([]);
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				details: expect.objectContaining({ reasonCode: 'denied:out-of-scope' })
			})
		);
	});

	it('denies create outside the member multi-Group scope set', async () => {
		const ctx = buildContext({
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
				},
				scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['group-a', 'group-c'] })
			}
		});
		ctx.store.seed('personnel', [
			{
				id: RATED_PERSON,
				organization_id: 'test-org',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				group_id: 'group-b'
			}
		]);
		const create = createRatingScheme;

		await expect(create(ctx, { ...validInput })).rejects.toMatchObject({ status: 403 });
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'rating_scheme',
				details: expect.objectContaining({
					policyAction: 'ratingScheme.updateEntries',
					reasonCode: 'denied:out-of-scope'
				})
			})
		);
	});
});

function seedScheme(ctx: ReturnType<typeof buildContext>, values: Record<string, unknown> = {}) {
	ctx.store.seed('rating_schemes', [
		{
			id: SCHEME,
			organization_id: ctx.auth.orgId,
			rated_person_id: RATED_PERSON,
			eval_type: 'NCOER',
			rater_person_id: null,
			rater_name: 'SSG Current',
			senior_rater_person_id: null,
			senior_rater_name: 'MSG Senior',
			intermediate_rater_person_id: null,
			intermediate_rater_name: null,
			reviewer_person_id: null,
			reviewer_name: null,
			notes: null,
			archived_at: null,
			...values
		}
	]);
}

function seedEvaluation(ctx: ReturnType<typeof buildContext>, values: Record<string, unknown> = {}) {
	ctx.store.seed('evaluations', [
		{
			id: EVALUATION,
			organization_id: ctx.auth.orgId,
			rating_scheme_id: SCHEME,
			rated_person_id: RATED_PERSON,
			eval_type: 'NCOER',
			report_type: 'AN',
			rating_period_start: '2026-01-01',
			rating_period_end: '2026-12-31',
			workflow_status: null,
			notes: 'Keep with the closed report',
			chain_snapshot_at: null,
			snapshot_rater_person_id: null,
			snapshot_rater_name: null,
			snapshot_senior_rater_person_id: null,
			snapshot_senior_rater_name: null,
			snapshot_intermediate_rater_person_id: null,
			snapshot_intermediate_rater_name: null,
			snapshot_reviewer_person_id: null,
			snapshot_reviewer_name: null,
			...values
		}
	]);
}

function seedAll(ctx: ReturnType<typeof buildContext>, evaluation: Record<string, unknown> = {}, scheme = {}) {
	seedRatedPerson(ctx);
	seedScheme(ctx, scheme);
	seedEvaluation(ctx, evaluation);
}

async function storedEvaluation(ctx: ReturnType<typeof buildContext>, id = EVALUATION) {
	return ctx.store.findOne<Record<string, unknown>>('evaluations', ctx.auth.orgId, { id });
}

async function storedScheme(ctx: ReturnType<typeof buildContext>) {
	return ctx.store.findOne<Record<string, unknown>>('rating_schemes', ctx.auth.orgId, { id: SCHEME });
}

const viewOnly = {
	auth: {
		role: 'member' as const,
		isPrivileged: false,
		capabilityMap: {
			calendar: 'none' as const,
			personnel: 'none' as const,
			training: 'none' as const,
			criticalTasks: 'none' as const,
			onboarding: 'none' as const,
			ratingScheme: 'view' as const
		}
	}
};

describe('Rating scheme — update', () => {
	it('changes the chain and blanks empty names', async () => {
		const ctx = buildContext();
		seedAll(ctx);

		const result = await updateRatingScheme(ctx, { id: SCHEME, seniorRaterName: 'MSG Next', notes: '' });
		expect(result).toMatchObject({ seniorRaterName: 'MSG Next', notes: null });
	});

	it('refuses an edit that carries an archive time and keeps the scheme listed', async () => {
		const ctx = buildContext();
		seedAll(ctx);

		await expect(updateRatingScheme(ctx, { id: SCHEME, archivedAt: '2026-05-01T00:00:00Z' })).rejects.toMatchObject({
			status: 400
		});
		await expect(createRatingScheme(ctx, { ...validInput, archivedAt: '2026-05-01T00:00:00Z' })).rejects.toMatchObject({
			status: 400
		});
		expect((await storedScheme(ctx))?.archived_at).toBeNull();
	});

	it('keeps the rater of an open Evaluation for Change rater', async () => {
		const ctx = buildContext();
		seedAll(ctx, { workflow_status: 'with-rater' });

		await expect(updateRatingScheme(ctx, { id: SCHEME, raterName: 'SSG Other' })).rejects.toMatchObject({
			status: 409,
			message: 'Change the rater of an open evaluation with Change rater'
		});
		expect((await storedScheme(ctx))?.rater_name).toBe('SSG Current');
	});
});

describe('Evaluation — start and update', () => {
	it('opens the next Evaluation at drafting with the scheme’s chain', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		seedScheme(ctx);

		const { evaluation, created } = await startEvaluation(ctx, SCHEME, { ...period, reportType: 'AN' });
		expect(created).toBe(true);
		expect(evaluation).toMatchObject({ ratingSchemeId: SCHEME, workflowStatus: 'drafting', signedChain: null });
	});

	it('answers a repeated start with the Evaluation it opened and refuses a second open one', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		seedScheme(ctx);

		const first = await startEvaluation(ctx, SCHEME, { ...period, reportType: 'AN' });
		const again = await startEvaluation(ctx, SCHEME, { ...period, reportType: 'AN' });
		expect(again).toEqual({ evaluation: first.evaluation, created: false });
		await expect(
			startEvaluation(ctx, SCHEME, { ...period, ratingPeriodStart: '2026-02-01', reportType: 'AN' })
		).rejects.toMatchObject({ status: 409, message: 'Another evaluation is already open on this rating scheme' });
		expect(await ctx.store.findMany('evaluations', ctx.auth.orgId)).toHaveLength(1);
	});

	it('records a completed Evaluation with the chain that signed it', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		seedScheme(ctx);

		const { evaluation } = await startEvaluation(ctx, SCHEME, { ...period, completed: true });
		expect(evaluation).toMatchObject({ workflowStatus: 'completed', signedChain: { raterName: 'SSG Current' } });
	});

	it('refuses an unknown start field and a start on an archived scheme', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);
		seedScheme(ctx, { archived_at: '2026-05-01T00:00:00.000Z' });

		await expect(startEvaluation(ctx, SCHEME, { ...period, workflowStatus: 'with-rater' })).rejects.toMatchObject({
			status: 400
		});
		await expect(startEvaluation(ctx, SCHEME, period)).rejects.toMatchObject({
			status: 409,
			message: 'The rating scheme is archived'
		});
	});

	it('saves an Evaluation’s period and notes', async () => {
		const ctx = buildContext();
		seedAll(ctx);

		const result = await updateEvaluation(ctx, { id: EVALUATION, ratingPeriodEnd: '2026-11-30', notes: 'Counseling' });
		expect(result).toMatchObject({ ratingPeriodEnd: '2026-11-30', notes: 'Counseling' });
	});

	it('gives an unfinished Evaluation its scheme’s new type and keeps a completed one as rated', async () => {
		const ctx = buildContext();
		seedAll(ctx, { workflow_status: 'with-rater' });
		ctx.store.seed('evaluations', [
			{
				...(await storedEvaluation(ctx)),
				id: '00000000-0000-4000-8000-0000000000e2',
				workflow_status: 'completed'
			}
		]);

		await updateRatingScheme(ctx, { id: SCHEME, evalType: 'OER' });
		expect((await storedEvaluation(ctx))?.eval_type).toBe('OER');
		expect((await storedEvaluation(ctx, '00000000-0000-4000-8000-0000000000e2'))?.eval_type).toBe('NCOER');
	});

	it.each([
		['workflowStatus', 'completed'],
		['ratingSchemeId', SCHEME],
		['evalType', 'OER'],
		['signedChain', { raterName: 'Forged' }]
	])('refuses a save that carries %s and keeps the stored Evaluation', async (field, value) => {
		const ctx = buildContext();
		seedAll(ctx);
		const before = await storedEvaluation(ctx);

		await expect(updateEvaluation(ctx, { id: EVALUATION, notes: 'n', [field]: value })).rejects.toMatchObject({
			status: 400
		});
		expect(await storedEvaluation(ctx)).toEqual(before);
	});
});

describe('Evaluation — workflow', () => {
	it('moves forward past an absent intermediate rater and back again', async () => {
		const ctx = buildContext();
		seedAll(ctx, { workflow_status: 'rater-signed' });

		const forward = await transitionEvaluation(ctx, EVALUATION, { from: 'rater-signed', to: 'with-senior-rater' });
		expect(forward).toMatchObject({ moved: true, evaluation: { workflowStatus: 'with-senior-rater' } });
		const back = await transitionEvaluation(ctx, EVALUATION, { from: 'with-senior-rater', to: 'rater-signed' });
		expect(back).toMatchObject({ moved: true, evaluation: { workflowStatus: 'rater-signed' } });
	});

	it('jumps back several steps at once and into Command Review', async () => {
		const ctx = buildContext();
		seedAll(ctx, { workflow_status: 'sm-signed' });

		const back = await transitionEvaluation(ctx, EVALUATION, { from: 'sm-signed', to: 'drafting' });
		expect(back).toMatchObject({ moved: true, evaluation: { workflowStatus: 'drafting' } });
		const review = await transitionEvaluation(ctx, EVALUATION, { from: 'drafting', to: 'command-review' });
		expect(review).toMatchObject({ moved: true, evaluation: { workflowStatus: 'command-review' } });
	});

	it('refuses a jump to a reviewer step the chain has no reviewer for', async () => {
		const ctx = buildContext();
		seedAll(ctx, { workflow_status: 'sr-signed' });

		await expect(
			transitionEvaluation(ctx, EVALUATION, { from: 'sr-signed', to: 'with-reviewer' })
		).rejects.toMatchObject({ status: 409 });
		expect((await storedEvaluation(ctx))?.workflow_status).toBe('sr-signed');
	});

	it('jumps to a reviewer step when the scheme has a reviewer', async () => {
		const ctx = buildContext();
		seedAll(ctx, { workflow_status: 'drafting' }, { reviewer_name: 'COL Reviewer' });

		await expect(
			transitionEvaluation(ctx, EVALUATION, { from: 'drafting', to: 'reviewer-signed' })
		).resolves.toMatchObject({ moved: true, evaluation: { workflowStatus: 'reviewer-signed' } });
	});

	it('signs the chain on completion and keeps it when the scheme changes', async () => {
		const ctx = buildContext();
		seedAll(ctx, { workflow_status: 'submitted-to-hrc' });

		const { evaluation } = await transitionEvaluation(ctx, EVALUATION, { from: 'submitted-to-hrc', to: 'completed' });
		expect(evaluation.signedChain).toMatchObject({ raterName: 'SSG Current', seniorRaterName: 'MSG Senior' });
		await updateRatingScheme(ctx, { id: SCHEME, raterName: 'SSG Later' });
		expect(await storedEvaluation(ctx)).toMatchObject({ snapshot_rater_name: 'SSG Current' });
	});

	it('reopens a completed Evaluation only while no other one is open', async () => {
		const ctx = buildContext();
		seedAll(ctx, { workflow_status: 'completed', chain_snapshot_at: '2026-06-01T00:00:00Z' });
		seedEvaluation(ctx, {
			id: FOREIGN,
			workflow_status: 'drafting',
			rating_period_start: '2027-01-01',
			rating_period_end: '2027-12-31'
		});

		await expect(transitionEvaluation(ctx, EVALUATION, { from: 'completed', to: 'sm-signed' })).rejects.toMatchObject({
			status: 409,
			message: 'Another evaluation is already open on this rating scheme'
		});
		expect((await storedEvaluation(ctx))?.workflow_status).toBe('completed');
	});

	it('stops tracking only from drafting or completed', async () => {
		const ctx = buildContext();
		seedAll(ctx, { workflow_status: 'with-rater' });

		await expect(transitionEvaluation(ctx, EVALUATION, { from: 'with-rater', to: null })).rejects.toMatchObject({
			status: 409
		});
		expect((await storedEvaluation(ctx))?.workflow_status).toBe('with-rater');
	});

	it('answers a repeated move to the current step without moving it again', async () => {
		const ctx = buildContext();
		seedAll(ctx, { workflow_status: 'completed' });

		await expect(transitionEvaluation(ctx, EVALUATION, { from: 'completed', to: 'completed' })).resolves.toMatchObject({
			moved: false,
			evaluation: { workflowStatus: 'completed' }
		});
	});

	it('rejects an unknown step before reading the Evaluation', async () => {
		const ctx = buildContext();
		seedAll(ctx);

		await expect(transitionEvaluation(ctx, EVALUATION, { from: null, to: 'active' })).rejects.toMatchObject({
			status: 400
		});
	});

	it('denies a move without Rating Scheme operate access', async () => {
		const ctx = buildContext(viewOnly);
		seedAll(ctx);

		await expect(transitionEvaluation(ctx, EVALUATION, { from: null, to: 'drafting' })).rejects.toMatchObject({
			status: 403
		});
		expect((await storedEvaluation(ctx))?.workflow_status).toBeNull();
	});

	it('answers 404 for an Evaluation outside the Organization', async () => {
		const ctx = buildContext();
		seedRatedPerson(ctx);

		await expect(transitionEvaluation(ctx, FOREIGN, { from: null, to: 'drafting' })).rejects.toMatchObject({
			status: 404
		});
	});
});

describe('Evaluation — change of rater', () => {
	it('completes the current Evaluation, gives the scheme the new rater and opens the next one', async () => {
		const ctx = buildContext();
		seedAll(ctx, { workflow_status: 'with-rater' });

		const result = await changeEvaluationRater(ctx, EVALUATION, { changeDate: '2026-06-30', raterName: 'SSG New' });

		expect(result.evaluation).toMatchObject({
			ratingPeriodEnd: '2026-06-30',
			reportType: 'CR',
			workflowStatus: 'completed',
			notes: 'Keep with the closed report',
			signedChain: { raterName: 'SSG Current' }
		});
		expect(result.ratingScheme).toMatchObject({ raterName: 'SSG New', seniorRaterName: 'MSG Senior' });
		expect(result.successor).toMatchObject({
			ratingSchemeId: SCHEME,
			ratingPeriodStart: '2026-07-01',
			ratingPeriodEnd: '2027-06-30',
			reportType: 'AN',
			workflowStatus: 'drafting',
			notes: null,
			signedChain: null
		});
	});

	it('refuses to change the rater on an archived scheme', async () => {
		const ctx = buildContext();
		seedAll(ctx, { workflow_status: 'with-rater' }, { archived_at: '2026-05-01T00:00:00.000Z' });

		await expect(
			changeEvaluationRater(ctx, EVALUATION, { changeDate: '2026-06-30', raterName: 'SSG New' })
		).rejects.toMatchObject({ status: 409 });
		expect(await storedEvaluation(ctx)).toMatchObject({ workflow_status: 'with-rater', report_type: 'AN' });
	});

	it('returns the successor it opened when the change is sent again, and opens no second one', async () => {
		const ctx = buildContext();
		seedAll(ctx);
		const change = { changeDate: '2026-06-30', raterName: 'SSG New' };

		const first = await changeEvaluationRater(ctx, EVALUATION, change);
		const repeated = await changeEvaluationRater(ctx, EVALUATION, { changeDate: '2026-06-30', raterName: ' ssg new ' });
		const different = await changeEvaluationRater(ctx, EVALUATION, {
			changeDate: '2026-06-30',
			raterName: 'SSG Other'
		});

		expect(repeated.successor).toEqual(first.successor);
		expect(different.successor).toBeNull();
		expect(await ctx.store.findMany('evaluations', ctx.auth.orgId)).toHaveLength(2);
	});

	it('refuses a change date outside the rating period and changes nothing', async () => {
		const ctx = buildContext();
		seedAll(ctx);

		await expect(
			changeEvaluationRater(ctx, EVALUATION, { changeDate: '2027-01-01', raterName: 'SSG New' })
		).rejects.toMatchObject({ status: 400 });
		expect(await ctx.store.findMany('evaluations', ctx.auth.orgId)).toHaveLength(1);
	});

	it('requires a new rater who belongs to the Organization', async () => {
		const ctx = buildContext();
		seedAll(ctx);

		await expect(
			changeEvaluationRater(ctx, EVALUATION, { changeDate: '2026-06-30', raterPersonId: FOREIGN })
		).rejects.toMatchObject({ status: 400 });
		expect(await ctx.store.findMany('evaluations', ctx.auth.orgId)).toHaveLength(1);
	});

	it('denies a change of rater without Rating Scheme operate access', async () => {
		const ctx = buildContext(viewOnly);
		seedAll(ctx);

		await expect(
			changeEvaluationRater(ctx, EVALUATION, { changeDate: '2026-06-30', raterName: 'SSG New' })
		).rejects.toMatchObject({ status: 403 });
		expect(await ctx.store.findMany('evaluations', ctx.auth.orgId)).toHaveLength(1);
	});
});

describe('Rating scheme — archive', () => {
	it('archives and restores the scheme whatever step its Evaluation has reached', async () => {
		const ctx = buildContext();
		seedAll(ctx, { workflow_status: 'with-rater' });

		const archived = await setRatingSchemeArchived(ctx, SCHEME, { archived: true });
		expect(archived.changed).toBe(true);
		expect(archived.ratingScheme.archivedAt).toEqual(expect.any(String));
		expect((await storedEvaluation(ctx))?.workflow_status).toBe('with-rater');
		const restored = await setRatingSchemeArchived(ctx, SCHEME, { archived: false });
		expect(restored).toMatchObject({ changed: true, ratingScheme: { archivedAt: null } });
	});

	it('answers a repeated request without changing the scheme again', async () => {
		const ctx = buildContext();
		seedAll(ctx);

		const first = await setRatingSchemeArchived(ctx, SCHEME, { archived: true });
		const repeated = await setRatingSchemeArchived(ctx, SCHEME, { archived: true });
		const foreign = await setRatingSchemeArchived(ctx, FOREIGN, { archived: false }).catch((error: unknown) => error);

		expect(repeated).toEqual({ changed: false, ratingScheme: first.ratingScheme });
		expect(foreign).toMatchObject({ status: 404 });
	});

	it('keeps an open Evaluation movable after its scheme is archived', async () => {
		const ctx = buildContext();
		seedAll(ctx, { workflow_status: 'drafting' }, { archived_at: '2026-05-01T00:00:00.000Z' });

		const edited = await updateEvaluation(ctx, { id: EVALUATION, notes: 'Still tracked' });
		const moved = await transitionEvaluation(ctx, EVALUATION, { from: 'drafting', to: 'with-rater' });

		expect(edited).toMatchObject({ notes: 'Still tracked' });
		expect(moved.evaluation).toMatchObject({ workflowStatus: 'with-rater' });
	});

	it('restores a scheme only while the person has no other listed one', async () => {
		const ctx = buildContext();
		seedAll(ctx, {}, { archived_at: '2026-05-01T00:00:00.000Z' });
		await createRatingScheme(ctx, validInput);

		await expect(setRatingSchemeArchived(ctx, SCHEME, { archived: false })).rejects.toMatchObject({ status: 409 });
	});

	it('refuses a body that does not say whether to archive or restore', async () => {
		const ctx = buildContext();
		seedAll(ctx);

		await expect(setRatingSchemeArchived(ctx, SCHEME, {})).rejects.toMatchObject({ status: 400 });
		await expect(setRatingSchemeArchived(ctx, SCHEME, { archived: 'yes' })).rejects.toMatchObject({ status: 400 });
	});

	it('denies archiving without Rating Scheme operate access', async () => {
		const ctx = buildContext(viewOnly);
		seedAll(ctx);

		await expect(setRatingSchemeArchived(ctx, SCHEME, { archived: true })).rejects.toMatchObject({ status: 403 });
		expect((await storedScheme(ctx))?.archived_at).toBeNull();
	});
});

const configureMember = (all: boolean) => ({
	auth: {
		isPrivileged: false,
		role: 'member' as const,
		capabilityMap: {
			calendar: all ? ('configure' as const) : ('none' as const),
			personnel: all ? ('configure' as const) : ('none' as const),
			training: all ? ('configure' as const) : ('none' as const),
			criticalTasks: all ? ('configure' as const) : ('none' as const),
			onboarding: all ? ('configure' as const) : ('none' as const),
			ratingScheme: 'configure' as const
		}
	}
});

describe('Evaluation — delete', () => {
	it('deletes the Evaluation, keeps its scheme and notifies admins', async () => {
		const ctx = buildContext();
		seedAll(ctx);

		await removeEvaluation(ctx, EVALUATION);

		expect(await storedEvaluation(ctx)).toBeNull();
		expect(await storedScheme(ctx)).not.toBeNull();
		expect(ctx.notifyEvaluationDeleted).toHaveBeenCalledOnce();
	});

	it.each([false, true])(
		'returns requiresApproval for a non-governance member (configure everywhere: %s)',
		async (all) => {
			const ctx = buildContext(configureMember(all));
			seedAll(ctx);

			expect(await removeEvaluation(ctx, EVALUATION)).toMatchObject({ requiresApproval: true });
			expect(await storedEvaluation(ctx)).not.toBeNull();
		}
	);

	it('preserves the Evaluation and skips success effects when deletion fails', async () => {
		const ctx = buildContext();
		seedAll(ctx);
		const before = structuredClone(await storedEvaluation(ctx));
		vi.spyOn(ctx.rawStore, 'deleteWhere').mockRejectedValueOnce(new Error('Synthetic deletion failure'));

		await expect(removeEvaluation(ctx, EVALUATION)).rejects.toThrow('Synthetic deletion failure');
		expect(await storedEvaluation(ctx)).toEqual(before);
		expect(ctx.notifyEvaluationDeleted).not.toHaveBeenCalled();
	});

	it('awaits the delivery notification after successful deletion', async () => {
		const ctx = buildContext();
		seedAll(ctx);
		let releaseNotification!: () => void;
		let notificationStarted!: () => void;
		const pendingNotification = new Promise<void>((resolve) => {
			releaseNotification = resolve;
		});
		const started = new Promise<void>((resolve) => {
			notificationStarted = resolve;
		});
		ctx.notifyEvaluationDeleted.mockImplementation(() => {
			notificationStarted();
			return pendingNotification;
		});
		let settled = false;
		const removal = removeEvaluation(ctx, EVALUATION).then(() => {
			settled = true;
		});
		await started;

		expect(await storedEvaluation(ctx)).toBeNull();
		expect(settled).toBe(false);
		releaseNotification();
		await removal;
		expect(settled).toBe(true);
	});
});

const evaluatorFields = [
	['raterPersonId', 'rater_person_id'],
	['seniorRaterPersonId', 'senior_rater_person_id'],
	['intermediateRaterPersonId', 'intermediate_rater_person_id'],
	['reviewerPersonId', 'reviewer_person_id']
] as const;
const localEvaluator = 'd1600000-0000-4000-8000-00000000000a';
const foreignEvaluator = 'd1600000-0000-4000-8000-00000000000b';
const missingEvaluator = 'd1600000-0000-4000-8000-00000000000c';
const OTHER_RATED = 'd1600000-0000-4000-8000-00000000000d';

function evaluatorContext() {
	const ctx = buildContext({
		auth: {
			role: 'member',
			isPrivileged: false,
			scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['alpha'] }),
			capabilityMap: {
				ratingScheme: 'operate',
				personnel: 'none',
				calendar: 'none',
				training: 'none',
				criticalTasks: 'none',
				onboarding: 'none'
			}
		}
	});
	ctx.store.seed('personnel', [
		{ id: RATED_PERSON, organization_id: 'test-org', group_id: 'alpha' },
		{ id: OTHER_RATED, organization_id: 'test-org', group_id: 'alpha' },
		{ id: localEvaluator, organization_id: 'test-org', group_id: 'bravo', archived_at: '2026-01-01' },
		{ id: foreignEvaluator, organization_id: 'foreign-org', group_id: 'alpha' }
	]);
	seedScheme(ctx, { eval_type: 'OER', rater_name: null, senior_rater_name: null, notes: 'Retained note' });
	return ctx;
}

describe('Rating Scheme evaluator integrity', () => {
	it.each(evaluatorFields)(
		'rejects foreign/missing %s on create and update without mutation or success audit',
		async (field) => {
			const ctx = evaluatorContext();
			const before = structuredClone(await ctx.rawStore.findMany('rating_schemes', 'test-org'));
			for (const id of [foreignEvaluator, missingEvaluator, 'not-a-person-id']) {
				await expect(
					createRatingScheme(ctx, { ratedPersonId: OTHER_RATED, evalType: 'OER', [field]: id })
				).rejects.toMatchObject({ status: 400 });
				await expect(
					updateRatingScheme(ctx, { id: SCHEME, [field]: id, notes: 'Must not persist' })
				).rejects.toMatchObject({ status: 400 });
			}
			expect(await ctx.rawStore.findMany('rating_schemes', 'test-org')).toEqual(before);
			expect(ctx.auditPort.events).toEqual([]);
		}
	);

	it.each(evaluatorFields)('allows local archived cross-Group %s, then explicit clearing', async (field, column) => {
		const ctx = evaluatorContext();
		await createRatingScheme(ctx, {
			ratedPersonId: OTHER_RATED,
			evalType: 'OER',
			[field]: localEvaluator.toUpperCase()
		});
		await updateRatingScheme(ctx, { id: SCHEME, [field]: localEvaluator });
		expect(await storedScheme(ctx)).toMatchObject({ [column]: localEvaluator });
		await updateRatingScheme(ctx, { id: SCHEME, [field]: '' });
		expect(await storedScheme(ctx)).toMatchObject({ [column]: null });
	});

	it('preserves resubmitted historical foreign relationships during unrelated edits', async () => {
		const ctx = evaluatorContext();
		await ctx.rawStore.update('rating_schemes', 'test-org', SCHEME, {
			rater_person_id: foreignEvaluator,
			senior_rater_person_id: foreignEvaluator,
			intermediate_rater_person_id: foreignEvaluator,
			reviewer_person_id: foreignEvaluator,
			rater_name: 'Historical external name'
		});
		await updateRatingScheme(ctx, {
			id: SCHEME,
			raterPersonId: foreignEvaluator.toUpperCase(),
			seniorRaterPersonId: foreignEvaluator,
			intermediateRaterPersonId: foreignEvaluator,
			reviewerPersonId: foreignEvaluator,
			notes: 'Unrelated historical edit'
		});
		expect(await storedScheme(ctx)).toMatchObject({
			rater_person_id: foreignEvaluator.toUpperCase(),
			senior_rater_person_id: foreignEvaluator,
			rater_name: 'Historical external name',
			notes: 'Unrelated historical edit'
		});
	});

	it('does not mutate when evaluator validation is unavailable', async () => {
		const ctx = evaluatorContext();
		ctx.personnelRatingSchemeRoster!.hasEvaluatorReferences = async () => {
			throw new Error('Synthetic provider failure');
		};
		const before = structuredClone(await storedScheme(ctx));
		await expect(updateRatingScheme(ctx, { id: SCHEME, raterPersonId: localEvaluator })).rejects.toThrow(
			'Synthetic provider failure'
		);
		expect(await storedScheme(ctx)).toEqual(before);
		expect(ctx.auditPort.events).toEqual([]);
	});

	it('rejects retargeting an accessible scheme to a Person outside the rated Group scope', async () => {
		const ctx = evaluatorContext();
		const before = structuredClone(await storedScheme(ctx));

		await expect(
			updateRatingScheme(ctx, { id: SCHEME, ratedPersonId: localEvaluator, notes: 'Must not persist' })
		).rejects.toMatchObject({ status: 403 });
		expect(await storedScheme(ctx)).toEqual(before);
		expect(ctx.auditPort.events.map((event) => event.action)).toEqual(['policy.denied']);
	});

	it('hides another unit’s scheme and Evaluation from writes without success effects', async () => {
		const ctx = evaluatorContext();
		ctx.store.seed('rating_schemes', [
			{
				id: FOREIGN,
				organization_id: 'foreign-org',
				rated_person_id: foreignEvaluator,
				eval_type: 'OER',
				archived_at: null
			}
		]);
		ctx.store.seed('evaluations', [
			{
				id: FOREIGN,
				organization_id: 'foreign-org',
				rating_scheme_id: FOREIGN,
				rated_person_id: foreignEvaluator,
				eval_type: 'OER'
			}
		]);
		const before = structuredClone(await ctx.rawStore.findMany('evaluations', 'foreign-org'));

		await expect(updateRatingScheme(ctx, { id: FOREIGN, notes: 'Must not persist' })).rejects.toMatchObject({
			status: 404
		});
		await expect(updateEvaluation(ctx, { id: FOREIGN, notes: 'Must not persist' })).rejects.toMatchObject({
			status: 404
		});
		await expect(removeEvaluation(ctx, FOREIGN)).rejects.toMatchObject({ status: 404 });
		expect(await ctx.rawStore.findMany('evaluations', 'foreign-org')).toEqual(before);
		expect(ctx.auditPort.events).toEqual([]);
		expect(ctx.notifyEvaluationDeleted).not.toHaveBeenCalled();
	});
});
