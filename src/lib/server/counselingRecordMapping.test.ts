import { describe, it, expect } from 'vitest';
import { CounselingRecordEntity } from './entities/counselingRecord';
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
