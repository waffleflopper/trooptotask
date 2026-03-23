import { describe, it, expect } from 'vitest';
import { RatingSchemeEntryEntity } from './ratingSchemeEntry';
import type { RatingSchemeEntry } from '$features/rating-scheme/rating-scheme.types';

describe('RatingSchemeEntryEntity', () => {
	const fullRow = {
		id: 'rse-1',
		rated_person_id: 'p-1',
		eval_type: 'OER',
		rater_person_id: 'p-2',
		rater_name: 'CPT Smith',
		senior_rater_person_id: 'p-3',
		senior_rater_name: 'MAJ Jones',
		intermediate_rater_person_id: 'p-4',
		intermediate_rater_name: 'LTC Brown',
		reviewer_person_id: 'p-5',
		reviewer_name: 'COL White',
		rating_period_start: '2026-01-01',
		rating_period_end: '2026-12-31',
		status: 'active',
		notes: 'Annual eval',
		report_type: 'AN',
		workflow_status: 'drafting'
	};

	it('fromDb produces correct RatingSchemeEntry shape', () => {
		const result = RatingSchemeEntryEntity.fromDb(fullRow) as RatingSchemeEntry;

		expect(result).toEqual({
			id: 'rse-1',
			ratedPersonId: 'p-1',
			evalType: 'OER',
			raterPersonId: 'p-2',
			raterName: 'CPT Smith',
			seniorRaterPersonId: 'p-3',
			seniorRaterName: 'MAJ Jones',
			intermediateRaterPersonId: 'p-4',
			intermediateRaterName: 'LTC Brown',
			reviewerPersonId: 'p-5',
			reviewerName: 'COL White',
			ratingPeriodStart: '2026-01-01',
			ratingPeriodEnd: '2026-12-31',
			status: 'active',
			notes: 'Annual eval',
			reportType: 'AN',
			workflowStatus: 'drafting'
		});
	});

	it('fromDb handles null nullable fields', () => {
		const row = {
			...fullRow,
			rater_person_id: null,
			rater_name: null,
			senior_rater_person_id: null,
			senior_rater_name: null,
			intermediate_rater_person_id: null,
			intermediate_rater_name: null,
			reviewer_person_id: null,
			reviewer_name: null,
			notes: null,
			report_type: null,
			workflow_status: null
		};
		const result = RatingSchemeEntryEntity.fromDb(row) as RatingSchemeEntry;

		expect(result.raterPersonId).toBeNull();
		expect(result.raterName).toBeNull();
		expect(result.seniorRaterPersonId).toBeNull();
		expect(result.seniorRaterName).toBeNull();
		expect(result.intermediateRaterPersonId).toBeNull();
		expect(result.intermediateRaterName).toBeNull();
		expect(result.reviewerPersonId).toBeNull();
		expect(result.reviewerName).toBeNull();
		expect(result.notes).toBeNull();
		expect(result.reportType).toBeNull();
		expect(result.workflowStatus).toBeNull();
	});

	it('fromDbArray transforms multiple rows', () => {
		const rows = [fullRow, { ...fullRow, id: 'rse-2', eval_type: 'NCOER' }];
		const results = RatingSchemeEntryEntity.fromDbArray(rows) as RatingSchemeEntry[];

		expect(results).toHaveLength(2);
		expect(results[0].id).toBe('rse-1');
		expect(results[1].evalType).toBe('NCOER');
	});

	it('createSchema requires ratedPersonId, evalType, ratingPeriodStart, ratingPeriodEnd, status', () => {
		const valid = RatingSchemeEntryEntity.createSchema.safeParse({
			ratedPersonId: 'p-1',
			evalType: 'OER',
			ratingPeriodStart: '2026-01-01',
			ratingPeriodEnd: '2026-12-31',
			status: 'active'
		});
		expect(valid.success).toBe(true);

		const missing = RatingSchemeEntryEntity.createSchema.safeParse({
			ratedPersonId: 'p-1'
		});
		expect(missing.success).toBe(false);
	});

	it('createSchema makes nullable fields optional', () => {
		const withOptionals = RatingSchemeEntryEntity.createSchema.safeParse({
			ratedPersonId: 'p-1',
			evalType: 'NCOER',
			ratingPeriodStart: '2026-01-01',
			ratingPeriodEnd: '2026-12-31',
			status: 'active',
			notes: 'test note',
			raterPersonId: 'p-2'
		});
		expect(withOptionals.success).toBe(true);
	});

	it('createSchema validates evalType enum', () => {
		const invalid = RatingSchemeEntryEntity.createSchema.safeParse({
			ratedPersonId: 'p-1',
			evalType: 'INVALID',
			ratingPeriodStart: '2026-01-01',
			ratingPeriodEnd: '2026-12-31',
			status: 'active'
		});
		expect(invalid.success).toBe(false);
	});

	it('toDbInsert maps camelCase to snake_case and adds organization_id', () => {
		const result = RatingSchemeEntryEntity.toDbInsert(
			{
				ratedPersonId: 'p-1',
				evalType: 'OER',
				ratingPeriodStart: '2026-01-01',
				ratingPeriodEnd: '2026-12-31',
				status: 'active'
			},
			'org-1'
		);

		expect(result).toEqual({
			organization_id: 'org-1',
			rated_person_id: 'p-1',
			eval_type: 'OER',
			rater_person_id: null,
			rater_name: null,
			senior_rater_person_id: null,
			senior_rater_name: null,
			intermediate_rater_person_id: null,
			intermediate_rater_name: null,
			reviewer_person_id: null,
			reviewer_name: null,
			rating_period_start: '2026-01-01',
			rating_period_end: '2026-12-31',
			status: 'active',
			notes: null,
			report_type: null,
			workflow_status: null
		});
	});

	it('toDbUpdate maps camelCase to snake_case and excludes id', () => {
		const result = RatingSchemeEntryEntity.toDbUpdate({
			id: 'rse-1',
			notes: 'updated',
			status: 'completed'
		});

		expect(result).toEqual({ notes: 'updated', status: 'completed' });
		expect(result).not.toHaveProperty('id');
	});

	it('has correct table name', () => {
		expect(RatingSchemeEntryEntity.table).toBe('rating_scheme_entries');
	});

	it('has groupScope with rated_person_id personnel column', () => {
		expect(RatingSchemeEntryEntity.groupScope).toEqual({ personnelColumn: 'rated_person_id' });
	});

	it('has repo', () => {
		expect(RatingSchemeEntryEntity.repo).toBeDefined();
		expect(RatingSchemeEntryEntity.repo.list).toBeDefined();
		expect(RatingSchemeEntryEntity.repo.query).toBeDefined();
	});
});
