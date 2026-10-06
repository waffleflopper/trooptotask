import { describe, expect, it } from 'vitest';
import { ratingSchemeEntryCreateSchema, ratingSchemeEntryUpdateSchema } from './ratingSchemeEntryOperations.server';

const input = {
	ratedPersonId: 'person-1',
	evalType: 'OER',
	ratingPeriodStart: '2026-01-01',
	ratingPeriodEnd: '2026-12-31',
	status: 'active'
};

describe('Rating Scheme entry validation', () => {
	it.each(['ratedPersonId', 'evalType', 'ratingPeriodStart', 'ratingPeriodEnd', 'status'])(
		'requires %s on create',
		(field) => {
			const values: Record<string, unknown> = { ...input };
			delete values[field];
			expect(ratingSchemeEntryCreateSchema.safeParse(values).success).toBe(false);
		}
	);

	it('accepts omitted and nullable optional values and retained string report/workflow values', () => {
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
				reportType: 'historical-report-code',
				workflowStatus: 'historical-workflow-code'
			})
		).toMatchObject({ reportType: 'historical-report-code', workflowStatus: 'historical-workflow-code' });
	});

	it.each(['OER', 'NCOER', 'WOER'])('retains %s evaluation type', (evalType) => {
		expect(ratingSchemeEntryCreateSchema.safeParse({ ...input, evalType }).success).toBe(true);
	});

	it.each(['active', 'completed', 'change-of-rater'])('retains %s record status', (status) => {
		expect(ratingSchemeEntryCreateSchema.safeParse({ ...input, status }).success).toBe(true);
		expect(ratingSchemeEntryUpdateSchema.safeParse({ id: 'entry', status }).success).toBe(true);
	});

	it.each([{ evalType: 'unsupported' }, { status: 'inactive' }, { notes: 123 }, { ratedPersonId: null }])(
		'rejects unsupported field values %j',
		(values) => {
			expect(ratingSchemeEntryCreateSchema.safeParse({ ...input, ...values }).success).toBe(false);
			expect(ratingSchemeEntryUpdateSchema.safeParse({ id: 'entry', ...values }).success).toBe(false);
		}
	);

	it('requires update identity and excludes supplied protected and unknown fields', () => {
		expect(ratingSchemeEntryUpdateSchema.safeParse({ notes: 'changed' }).success).toBe(false);
		expect(
			ratingSchemeEntryUpdateSchema.parse({
				id: 'entry',
				notes: null,
				organization_id: 'foreign',
				created_at: 'must not change',
				updated_at: 'must not change',
				extra_saved_field: 'must not change'
			})
		).toEqual({ id: 'entry', notes: null });
	});
});
