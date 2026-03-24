import { describe, it, expect } from 'vitest';
import { PersonnelTrainingEntity } from './personnelTraining';
import type { PersonnelTraining } from '$features/training/training.types';

describe('PersonnelTrainingEntity', () => {
	it('fromDb produces correct PersonnelTraining shape', () => {
		const row = {
			id: 'pt-1',
			personnel_id: 'p-1',
			training_type_id: 'tt-1',
			completion_date: '2026-03-01',
			expiration_date: '2027-03-01',
			notes: 'Completed online',
			certificate_url: 'https://example.com/cert.pdf'
		};
		const result = PersonnelTrainingEntity.fromDb(row) as PersonnelTraining;

		expect(result).toEqual({
			id: 'pt-1',
			personnelId: 'p-1',
			trainingTypeId: 'tt-1',
			completionDate: '2026-03-01',
			expirationDate: '2027-03-01',
			notes: 'Completed online',
			certificateUrl: 'https://example.com/cert.pdf'
		});
	});

	it('fromDb handles null values for nullable fields', () => {
		const row = {
			id: 'pt-2',
			personnel_id: 'p-2',
			training_type_id: 'tt-2',
			completion_date: null,
			expiration_date: null,
			notes: null,
			certificate_url: null
		};
		const result = PersonnelTrainingEntity.fromDb(row) as PersonnelTraining;

		expect(result.completionDate).toBeNull();
		expect(result.expirationDate).toBeNull();
		expect(result.notes).toBeNull();
		expect(result.certificateUrl).toBeNull();
	});

	it('fromDbArray transforms multiple rows', () => {
		const rows = [
			{
				id: 'pt-1',
				personnel_id: 'p-1',
				training_type_id: 'tt-1',
				completion_date: '2026-03-01',
				expiration_date: '2027-03-01',
				notes: null,
				certificate_url: null
			},
			{
				id: 'pt-2',
				personnel_id: 'p-2',
				training_type_id: 'tt-2',
				completion_date: '2026-04-01',
				expiration_date: null,
				notes: 'Refresher',
				certificate_url: null
			}
		];
		const results = PersonnelTrainingEntity.fromDbArray(rows) as PersonnelTraining[];

		expect(results).toHaveLength(2);
		expect(results[0].personnelId).toBe('p-1');
		expect(results[1].notes).toBe('Refresher');
	});

	it('toDbInsert maps camelCase to snake_case and adds organization_id', () => {
		const result = PersonnelTrainingEntity.toDbInsert(
			{
				personnelId: 'p-1',
				trainingTypeId: 'tt-1',
				completionDate: '2026-03-01',
				expirationDate: '2027-03-01',
				notes: 'test',
				certificateUrl: 'https://example.com/cert.pdf'
			},
			'org-1'
		);

		expect(result).toEqual({
			organization_id: 'org-1',
			personnel_id: 'p-1',
			training_type_id: 'tt-1',
			completion_date: '2026-03-01',
			expiration_date: '2027-03-01',
			notes: 'test',
			certificate_url: 'https://example.com/cert.pdf'
		});
	});

	it('toDbInsert applies defaults for nullable fields when omitted', () => {
		const result = PersonnelTrainingEntity.toDbInsert(
			{
				personnelId: 'p-1',
				trainingTypeId: 'tt-1'
			},
			'org-1'
		);

		expect(result.completion_date).toBeNull();
		expect(result.expiration_date).toBeNull();
		expect(result.notes).toBeNull();
		expect(result.certificate_url).toBeNull();
	});

	it('toDbUpdate maps camelCase to snake_case', () => {
		const result = PersonnelTrainingEntity.toDbUpdate({
			id: 'pt-1',
			notes: 'updated'
		});

		expect(result).toEqual({ notes: 'updated' });
		expect(result).not.toHaveProperty('id');
	});

	it('createSchema requires personnelId and trainingTypeId', () => {
		const valid = PersonnelTrainingEntity.createSchema.safeParse({
			personnelId: 'p-1',
			trainingTypeId: 'tt-1'
		});
		expect(valid.success).toBe(true);

		const missing = PersonnelTrainingEntity.createSchema.safeParse({
			personnelId: 'p-1'
		});
		expect(missing.success).toBe(false);
	});

	it('createSchema makes nullable fields optional', () => {
		const withFields = PersonnelTrainingEntity.createSchema.safeParse({
			personnelId: 'p-1',
			trainingTypeId: 'tt-1',
			completionDate: '2026-03-01',
			expirationDate: '2027-03-01',
			notes: 'test',
			certificateUrl: 'https://example.com/cert.pdf'
		});
		expect(withFields.success).toBe(true);

		const withoutFields = PersonnelTrainingEntity.createSchema.safeParse({
			personnelId: 'p-1',
			trainingTypeId: 'tt-1'
		});
		expect(withoutFields.success).toBe(true);
	});

	it('has correct table name', () => {
		expect(PersonnelTrainingEntity.table).toBe('personnel_trainings');
	});

	it('has groupScope none', () => {
		expect(PersonnelTrainingEntity.groupScope).toBe('none');
	});
});
