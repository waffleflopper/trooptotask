import { describe, expect, it } from 'vitest';
import {
	evaluationStartSchema,
	evaluationUpdateSchema,
	ratingSchemeCreateSchema,
	ratingSchemeUpdateSchema
} from './ratingSchemeEntryOperations.server';
import { ratingSchemeRaterChangeSchema, ratingSchemeTransitionSchema } from './ratingSchemeEntryMapping.server';

const RATED_PERSON = '00000000-0000-4000-8000-0000000000a1';
const RATER = '00000000-0000-4000-8000-0000000000b1';
const ID = '00000000-0000-4000-8000-0000000000e1';

const scheme = { ratedPersonId: RATED_PERSON, evalType: 'OER' };
const period = { ratingPeriodStart: '2026-01-01', ratingPeriodEnd: '2026-12-31' };

describe('Rating Scheme validation', () => {
	it.each(['ratedPersonId', 'evalType'])('requires %s on a new scheme', (field) => {
		const values: Record<string, unknown> = { ...scheme };
		delete values[field];
		expect(ratingSchemeCreateSchema.safeParse(values).success).toBe(false);
	});

	it.each(['ratingPeriodStart', 'ratingPeriodEnd'])('requires %s to start an Evaluation', (field) => {
		const values: Record<string, unknown> = { ...period };
		delete values[field];
		expect(evaluationStartSchema.safeParse(values).success).toBe(false);
	});

	it('accepts a nullable chain and starts an Evaluation open unless it says it is completed', () => {
		expect(ratingSchemeCreateSchema.parse({ ...scheme, raterPersonId: null, reviewerName: null, notes: null })).toEqual(
			{
				...scheme,
				raterPersonId: null,
				reviewerName: null,
				notes: null
			}
		);
		expect(evaluationStartSchema.parse({ ...period, reportType: 'historical-report-code' })).toEqual({
			...period,
			reportType: 'historical-report-code',
			completed: false,
			notes: null
		});
		expect(evaluationStartSchema.parse({ ...period, reportType: '', completed: true })).toMatchObject({
			reportType: null,
			completed: true
		});
	});

	it.each(['OER', 'NCOER', 'WOER'])('retains %s evaluation type', (evalType) => {
		expect(ratingSchemeCreateSchema.safeParse({ ...scheme, evalType }).success).toBe(true);
	});

	it.each([{ evalType: 'unsupported' }, { notes: 123 }, { ratedPersonId: null }, { ratedPersonId: '' }])(
		'rejects unsupported scheme values %j',
		(values) => {
			expect(ratingSchemeCreateSchema.safeParse({ ...scheme, ...values }).success).toBe(false);
			expect(ratingSchemeUpdateSchema.safeParse({ id: ID, ...values }).success).toBe(false);
		}
	);

	it.each([{ workflowStatus: 'with-rater' }, { status: 'active' }, { signedChain: null }, { organization_id: 'x' }])(
		'refuses a start that carries %j',
		(values) => {
			expect(evaluationStartSchema.safeParse({ ...period, ...values }).success).toBe(false);
		}
	);

	it.each([
		{ workflowStatus: 'completed' },
		{ workflowStatus: null },
		{ status: 'completed' },
		{ ratingSchemeId: ID },
		{ evalType: 'OER' },
		{ signedChain: { raterName: 'Forged' } }
	])('refuses an Evaluation save that carries %j', (values) => {
		expect(evaluationUpdateSchema.safeParse({ id: ID, notes: 'n', ...values }).success).toBe(false);
	});

	it('refuses a scheme save that carries an archive time', () => {
		expect(ratingSchemeUpdateSchema.safeParse({ id: ID, archivedAt: '2026-05-01T00:00:00Z' }).success).toBe(false);
		expect(ratingSchemeCreateSchema.safeParse({ ...scheme, archivedAt: '2026-05-01T00:00:00Z' }).success).toBe(false);
	});

	it('requires update identity and excludes supplied protected and unknown fields', () => {
		expect(ratingSchemeUpdateSchema.safeParse({ notes: 'changed' }).success).toBe(false);
		expect(evaluationUpdateSchema.safeParse({ notes: 'changed' }).success).toBe(false);
		const protectedFields = {
			organization_id: 'foreign',
			archived_by: 'must not change',
			chain_snapshot_at: 'must not change',
			created_at: 'must not change'
		};
		expect(ratingSchemeUpdateSchema.parse({ id: ID, notes: null, ...protectedFields })).toEqual({
			id: ID,
			notes: null
		});
		expect(evaluationUpdateSchema.parse({ id: ID, notes: null, ...protectedFields })).toEqual({ id: ID, notes: null });
	});

	it('accepts a lifecycle step or not tracked as the observed step and the target and nothing else', () => {
		expect(ratingSchemeTransitionSchema.parse({ from: 'drafting', to: 'with-rater' })).toEqual({
			from: 'drafting',
			to: 'with-rater'
		});
		expect(ratingSchemeTransitionSchema.parse({ from: 'drafting', to: null })).toEqual({ from: 'drafting', to: null });
		expect(ratingSchemeTransitionSchema.safeParse({ from: null, to: 'active' }).success).toBe(false);
		expect(ratingSchemeTransitionSchema.safeParse({ from: 'active', to: 'drafting' }).success).toBe(false);
		expect(ratingSchemeTransitionSchema.safeParse({ to: 'drafting' }).success).toBe(false);
		expect(ratingSchemeTransitionSchema.safeParse({}).success).toBe(false);
	});

	it('requires exactly one new rater and a valid date for a change of rater', () => {
		expect(ratingSchemeRaterChangeSchema.parse({ changeDate: '2026-06-30', raterPersonId: RATER })).toEqual({
			changeDate: '2026-06-30',
			raterPersonId: RATER,
			raterName: null
		});
		expect(ratingSchemeRaterChangeSchema.parse({ changeDate: '2026-06-30', raterName: '  SSG New  ' })).toEqual({
			changeDate: '2026-06-30',
			raterPersonId: null,
			raterName: 'SSG New'
		});
		expect(ratingSchemeRaterChangeSchema.safeParse({ changeDate: '2026-06-30' }).success).toBe(false);
		expect(ratingSchemeRaterChangeSchema.safeParse({ changeDate: '2026-06-30', raterName: '   ' }).success).toBe(false);
		expect(
			ratingSchemeRaterChangeSchema.safeParse({ changeDate: '2026-06-30', raterPersonId: RATER, raterName: 'Both' })
				.success
		).toBe(false);
		expect(ratingSchemeRaterChangeSchema.safeParse({ changeDate: 'June', raterName: 'SSG New' }).success).toBe(false);
	});
});
