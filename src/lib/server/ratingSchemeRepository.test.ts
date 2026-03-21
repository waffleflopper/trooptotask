import { describe, it, expect, vi, beforeEach } from 'vitest';
import { transformCounselingRecords, transformDevelopmentGoals } from './transforms';
import { RatingSchemeEntryEntity } from './entities/ratingSchemeEntry';

const ORG_ID = '00000000-0000-0000-0000-000000000001';

function createMockSupabase(
	responseData: Record<string, unknown>[] | null = [],
	responseError: null | { message: string } = null
) {
	const calls: Record<string, unknown[][]> = {};

	const record = (method: string) => {
		return (...args: unknown[]) => {
			if (!calls[method]) calls[method] = [];
			calls[method].push(args);
			return builder;
		};
	};

	const builder: Record<string, unknown> = {
		select: record('select'),
		eq: record('eq'),
		neq: record('neq'),
		order: record('order'),
		in: record('in'),
		gte: record('gte'),
		lte: record('lte'),
		ilike: record('ilike')
	};

	Object.defineProperty(builder, 'then', {
		value: (resolve: (val: unknown) => void) => {
			resolve({ data: responseData, error: responseError, count: responseData?.length ?? 0 });
		}
	});

	const supabase = {
		from: (table: string) => {
			calls['from'] = [[table]];
			return builder;
		},
		_calls: calls
	};

	return { supabase, calls };
}

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

describe('transformCounselingRecords', () => {
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

		const result = transformCounselingRecords(dbRows);

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

		const result = transformCounselingRecords(dbRows);

		expect(result[0].notes).toBeNull();
		expect(result[0].filePath).toBeNull();
	});

	it('returns empty array for empty input', () => {
		expect(transformCounselingRecords([])).toEqual([]);
	});
});

describe('transformDevelopmentGoals', () => {
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

		const result = transformDevelopmentGoals(dbRows);

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

		const result = transformDevelopmentGoals(dbRows);

		expect(result[0].isCompleted).toBe(true);
		expect(result[0].termType).toBe('long');
		expect(result[0].notes).toBeNull();
	});

	it('returns empty array for empty input', () => {
		expect(transformDevelopmentGoals([])).toEqual([]);
	});
});

describe('RatingSchemeEntryEntity.repo', () => {
	it('queries rating_scheme_entries table with org scoping and correct ordering', async () => {
		const rows = [
			{
				id: 'rs-1',
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
				rating_period_start: '2025-01-01',
				rating_period_end: '2025-12-31',
				status: 'active',
				notes: null,
				report_type: null,
				workflow_status: null
			}
		];
		const { supabase, calls } = createMockSupabase(rows);

		const result = await RatingSchemeEntryEntity.repo.list(supabase, ORG_ID);

		expect(calls['from']![0]).toEqual(['rating_scheme_entries']);
		expect(calls['eq']![0]).toEqual(['organization_id', ORG_ID]);
		expect(calls['order']![0]).toEqual(['rating_period_end', { ascending: true }]);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('rs-1');
		expect(result[0].ratedPersonId).toBe('p-1');
	});

	it('applies status filter via query options', async () => {
		const { supabase, calls } = createMockSupabase([]);

		await RatingSchemeEntryEntity.repo.list(supabase, ORG_ID, {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock query builder
			filters: [(q: any) => q.neq('status', 'completed')]
		});

		expect(calls['neq']![0]).toEqual(['status', 'completed']);
	});
});
