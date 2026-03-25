import { describe, it, expect } from 'vitest';
import { TrainingViewEntity } from './trainingView';
import type { TrainingView } from '$features/training/training.types';

describe('TrainingViewEntity', () => {
	it('table is training_views', () => {
		expect(TrainingViewEntity.table).toBe('training_views');
	});

	it('groupScope is none', () => {
		expect(TrainingViewEntity.groupScope).toBe('none');
	});

	it('fromDb produces correct TrainingView shape', () => {
		const row = {
			id: 'tv-1',
			name: 'Annual Trainings',
			column_ids: ['tt-1', 'tt-3', 'tt-2'],
			created_by: 'user-1',
			created_at: '2026-03-24T00:00:00Z',
			updated_at: '2026-03-24T00:00:00Z'
		};

		const result = TrainingViewEntity.fromDb(row) as TrainingView;

		expect(result).toEqual({
			id: 'tv-1',
			name: 'Annual Trainings',
			columnIds: ['tt-1', 'tt-3', 'tt-2'],
			createdBy: 'user-1',
			createdAt: '2026-03-24T00:00:00Z',
			updatedAt: '2026-03-24T00:00:00Z'
		});
	});

	it('fromDb applies nullDefault [] for null column_ids', () => {
		const row = {
			id: 'tv-2',
			name: 'Empty View',
			column_ids: null,
			created_by: 'user-1',
			created_at: '2026-03-24T00:00:00Z',
			updated_at: '2026-03-24T00:00:00Z'
		};

		const result = TrainingViewEntity.fromDb(row) as TrainingView;

		expect(result.columnIds).toEqual([]);
	});

	it('fromDbArray transforms multiple rows', () => {
		const rows = [
			{
				id: 'tv-1',
				name: 'Annual',
				column_ids: ['tt-1'],
				created_by: 'user-1',
				created_at: '2026-03-24T00:00:00Z',
				updated_at: '2026-03-24T00:00:00Z'
			},
			{
				id: 'tv-2',
				name: 'Clinical',
				column_ids: ['tt-2', 'tt-3'],
				created_by: 'user-2',
				created_at: '2026-03-24T00:00:00Z',
				updated_at: '2026-03-24T00:00:00Z'
			}
		];

		const results = TrainingViewEntity.fromDbArray(rows) as TrainingView[];

		expect(results).toHaveLength(2);
		expect(results[0].name).toBe('Annual');
		expect(results[1].columnIds).toEqual(['tt-2', 'tt-3']);
	});

	it('toDbInsert applies defaults and adds organization_id (createdBy is DB-defaulted)', () => {
		const result = TrainingViewEntity.toDbInsert({ name: 'New View', columnIds: ['tt-1', 'tt-2'] }, 'org-1');

		expect(result).toEqual({
			organization_id: 'org-1',
			name: 'New View',
			column_ids: ['tt-1', 'tt-2']
		});
		expect(result.created_by).toBeUndefined();
	});

	it('toDbInsert defaults columnIds to [] when not provided', () => {
		const result = TrainingViewEntity.toDbInsert({ name: 'Bare View' }, 'org-1');

		expect(result.column_ids).toEqual([]);
	});

	it('toDbUpdate maps camelCase to snake_case', () => {
		const result = TrainingViewEntity.toDbUpdate({
			id: 'tv-1',
			name: 'Renamed View',
			columnIds: ['tt-3', 'tt-1']
		});

		expect(result).toEqual({
			name: 'Renamed View',
			column_ids: ['tt-3', 'tt-1']
		});
	});

	it('createSchema requires name; createdBy is readOnly (DB-defaulted)', () => {
		const valid = TrainingViewEntity.createSchema.safeParse({
			name: 'Test View'
		});
		expect(valid.success).toBe(true);

		const missingName = TrainingViewEntity.createSchema.safeParse({});
		expect(missingName.success).toBe(false);
	});

	it('createSchema allows optional columnIds', () => {
		const withColumns = TrainingViewEntity.createSchema.safeParse({
			name: 'Full View',
			columnIds: ['tt-1', 'tt-2']
		});
		expect(withColumns.success).toBe(true);

		const withoutColumns = TrainingViewEntity.createSchema.safeParse({
			name: 'Minimal View'
		});
		expect(withoutColumns.success).toBe(true);
	});
});
