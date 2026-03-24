import { describe, it, expect } from 'vitest';
import { CounselingRecordEntity } from './counselingRecord';
import type { CounselingRecord } from './counselingRecord';

describe('CounselingRecordEntity', () => {
	it('fromDb produces correct shape', () => {
		const row = {
			id: 'cr-1',
			personnel_id: 'p-1',
			date_conducted: '2026-03-01',
			subject: 'Performance Review',
			notes: 'Good progress',
			file_path: '/files/review.pdf'
		};
		const result = CounselingRecordEntity.fromDb(row) as CounselingRecord;

		expect(result).toEqual({
			id: 'cr-1',
			personnelId: 'p-1',
			dateConducted: '2026-03-01',
			subject: 'Performance Review',
			notes: 'Good progress',
			filePath: '/files/review.pdf'
		});
	});

	it('fromDb handles null notes and filePath', () => {
		const row = {
			id: 'cr-2',
			personnel_id: 'p-2',
			date_conducted: '2026-03-05',
			subject: 'Initial Counseling',
			notes: null,
			file_path: null
		};
		const result = CounselingRecordEntity.fromDb(row) as CounselingRecord;

		expect(result.notes).toBeNull();
		expect(result.filePath).toBeNull();
	});

	it('fromDbArray transforms multiple rows', () => {
		const rows = [
			{
				id: 'cr-1',
				personnel_id: 'p-1',
				date_conducted: '2026-03-01',
				subject: 'Review 1',
				notes: null,
				file_path: null
			},
			{
				id: 'cr-2',
				personnel_id: 'p-2',
				date_conducted: '2026-03-10',
				subject: 'Review 2',
				notes: 'Some notes',
				file_path: '/files/doc.pdf'
			}
		];
		const results = CounselingRecordEntity.fromDbArray(rows) as CounselingRecord[];

		expect(results).toHaveLength(2);
		expect(results[0].personnelId).toBe('p-1');
		expect(results[1].notes).toBe('Some notes');
	});

	it('toDbInsert maps correctly', () => {
		const result = CounselingRecordEntity.toDbInsert(
			{
				personnelId: 'p-1',
				dateConducted: '2026-03-01',
				subject: 'Performance Review',
				notes: 'Good progress',
				filePath: '/files/review.pdf'
			},
			'org-1'
		);

		expect(result).toEqual({
			organization_id: 'org-1',
			personnel_id: 'p-1',
			date_conducted: '2026-03-01',
			subject: 'Performance Review',
			notes: 'Good progress',
			file_path: '/files/review.pdf'
		});
	});

	it('toDbInsert applies defaults for optional fields', () => {
		const result = CounselingRecordEntity.toDbInsert(
			{
				personnelId: 'p-1',
				dateConducted: '2026-03-01',
				subject: 'Initial Counseling'
			},
			'org-1'
		);

		expect(result.notes).toBeNull();
		expect(result.file_path).toBeNull();
	});

	it('createSchema validates required fields', () => {
		const valid = CounselingRecordEntity.createSchema.safeParse({
			personnelId: 'p-1',
			dateConducted: '2026-03-01',
			subject: 'Review'
		});
		expect(valid.success).toBe(true);

		const missing = CounselingRecordEntity.createSchema.safeParse({
			personnelId: 'p-1'
		});
		expect(missing.success).toBe(false);
	});

	it('has group scope with personnelColumn', () => {
		expect(CounselingRecordEntity.groupScope).toEqual({ personnelColumn: 'personnel_id' });
	});

	it('has personnelIdField set', () => {
		expect(CounselingRecordEntity.personnelIdField).toBe('personnelId');
	});

	it('has correct table name', () => {
		expect(CounselingRecordEntity.table).toBe('counseling_records');
	});
});
