import { describe, expect, it } from 'vitest';
import { ratingSchemeEntryCreateSchema, ratingSchemeEntryUpdateSchema } from './ratingSchemeEntryOperations.server';
import { ratingSchemeRaterChangeSchema, ratingSchemeTransitionSchema } from './ratingSchemeEntryMapping.server';

const RATED_PERSON = '00000000-0000-4000-8000-0000000000a1';
const RATER = '00000000-0000-4000-8000-0000000000b1';
const ENTRY = '00000000-0000-4000-8000-0000000000e1';

const input = {
	ratedPersonId: RATED_PERSON,
	evalType: 'OER',
	ratingPeriodStart: '2026-01-01',
	ratingPeriodEnd: '2026-12-31'
};

describe('Rating Scheme entry validation', () => {
	it.each(['ratedPersonId', 'evalType', 'ratingPeriodStart', 'ratingPeriodEnd'])('requires %s on create', (field) => {
		const values: Record<string, unknown> = { ...input };
		delete values[field];
		expect(ratingSchemeEntryCreateSchema.safeParse(values).success).toBe(false);
	});

	it('accepts omitted and nullable optional values and a retained string report type', () => {
		expect(ratingSchemeEntryCreateSchema.parse(input)).toEqual(input);
		expect(
			ratingSchemeEntryCreateSchema.parse({
				...input,
				raterPersonId: null,
				raterName: null,
				seniorRaterPersonId: null,
				seniorRaterName: null,
				intermediateRaterPersonId: null,
				intermediateRaterName: null,
				reviewerPersonId: null,
				reviewerName: null,
				notes: null,
				reportType: 'historical-report-code'
			})
		).toMatchObject({ reportType: 'historical-report-code' });
	});

	it.each(['OER', 'NCOER', 'WOER'])('retains %s evaluation type', (evalType) => {
		expect(ratingSchemeEntryCreateSchema.safeParse({ ...input, evalType }).success).toBe(true);
	});

	it.each([{ evalType: 'unsupported' }, { notes: 123 }, { ratedPersonId: null }, { ratedPersonId: '' }])(
		'rejects unsupported field values %j',
		(values) => {
			expect(ratingSchemeEntryCreateSchema.safeParse({ ...input, ...values }).success).toBe(false);
			expect(ratingSchemeEntryUpdateSchema.safeParse({ id: ENTRY, ...values }).success).toBe(false);
		}
	);

	it('starts a new entry not tracked and refuses any other step or a record status', () => {
		expect(ratingSchemeEntryCreateSchema.safeParse({ ...input, workflowStatus: null }).success).toBe(true);
		expect(ratingSchemeEntryCreateSchema.safeParse({ ...input, workflowStatus: 'drafting' }).success).toBe(false);
		expect(ratingSchemeEntryCreateSchema.safeParse({ ...input, status: 'active' }).success).toBe(false);
	});

	it.each([{ workflowStatus: 'completed' }, { workflowStatus: null }, { status: 'completed' }])(
		'refuses an edit that carries %j',
		(values) => {
			expect(ratingSchemeEntryUpdateSchema.safeParse({ id: ENTRY, notes: 'n', ...values }).success).toBe(false);
		}
	);

	it('requires update identity and excludes supplied protected and unknown fields', () => {
		expect(ratingSchemeEntryUpdateSchema.safeParse({ notes: 'changed' }).success).toBe(false);
		expect(
			ratingSchemeEntryUpdateSchema.parse({
				id: ENTRY,
				notes: null,
				organization_id: 'foreign',
				created_at: 'must not change',
				updated_at: 'must not change',
				extra_saved_field: 'must not change'
			})
		).toEqual({ id: ENTRY, notes: null });
	});

	it('accepts a lifecycle step or not tracked as a move target and nothing else', () => {
		expect(ratingSchemeTransitionSchema.parse({ to: 'with-rater' })).toEqual({ to: 'with-rater' });
		expect(ratingSchemeTransitionSchema.parse({ to: null })).toEqual({ to: null });
		expect(ratingSchemeTransitionSchema.safeParse({ to: 'active' }).success).toBe(false);
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
