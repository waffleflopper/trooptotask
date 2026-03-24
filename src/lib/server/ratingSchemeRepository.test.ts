import { describe, it, expect } from 'vitest';
import { CounselingRecordEntity } from './entities/counselingRecord';
import { DevelopmentGoalEntity } from './entities/developmentGoal';
import { RatingSchemeEntryEntity } from './entities/ratingSchemeEntry';

describe('RatingSchemeEntryEntity.fromDbArray', () => {
	it('maps all snake_case DB fields to camelCase RatingSchemeEntry', () => {
		const dbRows = [
			{
				id: 'rs-1',
				rated_person_id: 'p-1',
				eval_type: 'OER',
				rater_person_id: 'p-2',
				rater_name: 'CPT Smith',
				senior_rater_person_id: 'p-3',
				senior_rater_name: 'MAJ Jones',
				intermediate_rater_person_id: 'p-4',
				intermediate_rater_name: 'LTC Brown',
				reviewer_person_id: 'p-5',
				reviewer_name: 'COL Davis',
				rating_period_start: '2025-01-01',
				rating_period_end: '2025-12-31',
				status: 'active',
				notes: 'Annual review',
				report_type: 'AN',
				workflow_status: 'with-rater'
			}
		];

		const result = RatingSchemeEntryEntity.fromDbArray(dbRows);

		expect(result).toEqual([
			{
				id: 'rs-1',
				ratedPersonId: 'p-1',
				evalType: 'OER',
				raterPersonId: 'p-2',
				raterName: 'CPT Smith',
				seniorRaterPersonId: 'p-3',
				seniorRaterName: 'MAJ Jones',
				intermediateRaterPersonId: 'p-4',
				intermediateRaterName: 'LTC Brown',
				reviewerPersonId: 'p-5',
				reviewerName: 'COL Davis',
				ratingPeriodStart: '2025-01-01',
				ratingPeriodEnd: '2025-12-31',
				status: 'active',
				notes: 'Annual review',
				reportType: 'AN',
				workflowStatus: 'with-rater'
			}
		]);
	});

	it('handles null optional fields correctly', () => {
		const dbRows = [
			{
				id: 'rs-2',
				rated_person_id: 'p-1',
				eval_type: 'NCOER',
				rater_person_id: null,
				rater_name: null,
				senior_rater_person_id: null,
				senior_rater_name: null,
				intermediate_rater_person_id: null,
				intermediate_rater_name: null,
				reviewer_person_id: null,
				reviewer_name: null,
				rating_period_start: '2025-06-01',
				rating_period_end: '2026-05-31',
				status: 'active',
				notes: null,
				report_type: null,
				workflow_status: null
			}
		];

		const result = RatingSchemeEntryEntity.fromDbArray(dbRows);

		expect(result[0].raterPersonId).toBeNull();
		expect(result[0].raterName).toBeNull();
		expect(result[0].seniorRaterPersonId).toBeNull();
		expect(result[0].seniorRaterName).toBeNull();
		expect(result[0].intermediateRaterPersonId).toBeNull();
		expect(result[0].intermediateRaterName).toBeNull();
		expect(result[0].reviewerPersonId).toBeNull();
		expect(result[0].reviewerName).toBeNull();
		expect(result[0].notes).toBeNull();
		expect(result[0].reportType).toBeNull();
		expect(result[0].workflowStatus).toBeNull();
	});

	it('returns empty array for empty input', () => {
		expect(RatingSchemeEntryEntity.fromDbArray([])).toEqual([]);
	});
});

describe('CounselingRecordEntity.fromDbArray', () => {
	it('maps simplified counseling record fields', () => {
		const dbRows = [
			{
				id: 'cr-1',
				personnel_id: 'p-1',
				organization_id: 'org-1',
				date_conducted: '2025-06-15',
				subject: 'Initial: Duties & Expectations',
				notes: 'Discussed standards and expectations',
				file_path: '/org-1/counseling/doc.pdf',
				created_at: '2025-06-15T10:00:00Z',
				updated_at: '2025-06-15T10:00:00Z'
			}
		];

		const result = CounselingRecordEntity.fromDbArray(dbRows);

		expect(result).toMatchObject([
			{
				id: 'cr-1',
				personnelId: 'p-1',
				dateConducted: '2025-06-15',
				subject: 'Initial: Duties & Expectations',
				notes: 'Discussed standards and expectations',
				filePath: '/org-1/counseling/doc.pdf'
			}
		]);
	});

	it('handles null optional fields', () => {
		const dbRows = [
			{
				id: 'cr-2',
				personnel_id: 'p-1',
				organization_id: 'org-1',
				date_conducted: '2025-07-01',
				subject: 'Event-Oriented: Late to PT',
				notes: null,
				file_path: null,
				created_at: '2025-07-01T08:00:00Z',
				updated_at: '2025-07-01T08:00:00Z'
			}
		];

		const result = CounselingRecordEntity.fromDbArray(dbRows);

		expect(result[0].notes).toBeNull();
		expect(result[0].filePath).toBeNull();
	});

	it('returns empty array for empty input', () => {
		expect(CounselingRecordEntity.fromDbArray([])).toEqual([]);
	});
});

describe('DevelopmentGoalEntity.fromDbArray', () => {
	it('maps simplified development goal fields', () => {
		const dbRows = [
			{
				id: 'dg-1',
				personnel_id: 'p-1',
				organization_id: 'org-1',
				title: 'Complete BLC',
				term_type: 'short',
				is_completed: false,
				notes: 'Target next FY quarter',
				created_at: '2025-01-15T10:00:00Z',
				updated_at: '2025-01-15T10:00:00Z'
			}
		];

		const result = DevelopmentGoalEntity.fromDbArray(dbRows);

		expect(result).toMatchObject([
			{
				id: 'dg-1',
				personnelId: 'p-1',
				title: 'Complete BLC',
				termType: 'short',
				isCompleted: false,
				notes: 'Target next FY quarter'
			}
		]);
	});

	it('handles completed goal with null notes', () => {
		const dbRows = [
			{
				id: 'dg-2',
				personnel_id: 'p-1',
				organization_id: 'org-1',
				title: 'Earn college degree',
				term_type: 'long',
				is_completed: true,
				notes: null,
				created_at: '2025-01-15T10:00:00Z',
				updated_at: '2025-06-15T10:00:00Z'
			}
		];

		const result = DevelopmentGoalEntity.fromDbArray(dbRows);

		expect(result[0].isCompleted).toBe(true);
		expect(result[0].termType).toBe('long');
		expect(result[0].notes).toBeNull();
	});

	it('returns empty array for empty input', () => {
		expect(DevelopmentGoalEntity.fromDbArray([])).toEqual([]);
	});
});
