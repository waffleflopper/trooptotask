import { describe, it, expect } from 'vitest';
import { AvailabilityEntryEntity } from './availabilityEntry';
import type { AvailabilityEntry } from '$lib/types';

describe('AvailabilityEntryEntity', () => {
	it('fromDb produces correct AvailabilityEntry shape', () => {
		const row = {
			id: 'ae-1',
			personnel_id: 'p-1',
			status_type_id: 'st-1',
			start_date: '2026-03-01',
			end_date: '2026-03-05',
			note: 'vacation'
		};
		const result = AvailabilityEntryEntity.fromDb(row) as AvailabilityEntry;

		expect(result).toEqual({
			id: 'ae-1',
			personnelId: 'p-1',
			statusTypeId: 'st-1',
			startDate: '2026-03-01',
			endDate: '2026-03-05',
			note: 'vacation'
		});
	});

	it('fromDb handles null note', () => {
		const row = {
			id: 'ae-2',
			personnel_id: 'p-2',
			status_type_id: 'st-2',
			start_date: '2026-04-01',
			end_date: '2026-04-02',
			note: null
		};
		const result = AvailabilityEntryEntity.fromDb(row) as AvailabilityEntry;

		expect(result.note).toBeNull();
	});

	it('fromDbArray transforms multiple rows', () => {
		const rows = [
			{
				id: 'ae-1',
				personnel_id: 'p-1',
				status_type_id: 'st-1',
				start_date: '2026-03-01',
				end_date: '2026-03-05',
				note: null
			},
			{
				id: 'ae-2',
				personnel_id: 'p-2',
				status_type_id: 'st-2',
				start_date: '2026-04-01',
				end_date: '2026-04-02',
				note: 'sick'
			}
		];
		const results = AvailabilityEntryEntity.fromDbArray(rows) as AvailabilityEntry[];

		expect(results).toHaveLength(2);
		expect(results[0].personnelId).toBe('p-1');
		expect(results[1].note).toBe('sick');
	});

	it('toDbInsert maps camelCase to snake_case and adds organization_id', () => {
		const result = AvailabilityEntryEntity.toDbInsert(
			{
				personnelId: 'p-1',
				statusTypeId: 'st-1',
				startDate: '2026-03-01',
				endDate: '2026-03-05',
				note: 'test'
			},
			'org-1'
		);

		expect(result).toEqual({
			organization_id: 'org-1',
			personnel_id: 'p-1',
			status_type_id: 'st-1',
			start_date: '2026-03-01',
			end_date: '2026-03-05',
			note: 'test'
		});
	});

	it('toDbInsert applies note default when omitted', () => {
		const result = AvailabilityEntryEntity.toDbInsert(
			{
				personnelId: 'p-1',
				statusTypeId: 'st-1',
				startDate: '2026-03-01',
				endDate: '2026-03-05'
			},
			'org-1'
		);

		expect(result.note).toBeNull();
	});

	it('toDbUpdate maps camelCase to snake_case', () => {
		const result = AvailabilityEntryEntity.toDbUpdate({
			id: 'ae-1',
			note: 'updated'
		});

		expect(result).toEqual({ note: 'updated' });
		expect(result).not.toHaveProperty('id');
	});

	it('createSchema requires personnelId, statusTypeId, startDate, endDate', () => {
		const valid = AvailabilityEntryEntity.createSchema.safeParse({
			personnelId: 'p-1',
			statusTypeId: 'st-1',
			startDate: '2026-03-01',
			endDate: '2026-03-05'
		});
		expect(valid.success).toBe(true);

		const missing = AvailabilityEntryEntity.createSchema.safeParse({
			personnelId: 'p-1'
		});
		expect(missing.success).toBe(false);
	});

	it('createSchema makes note optional', () => {
		const withNote = AvailabilityEntryEntity.createSchema.safeParse({
			personnelId: 'p-1',
			statusTypeId: 'st-1',
			startDate: '2026-03-01',
			endDate: '2026-03-05',
			note: 'test'
		});
		expect(withNote.success).toBe(true);

		const withoutNote = AvailabilityEntryEntity.createSchema.safeParse({
			personnelId: 'p-1',
			statusTypeId: 'st-1',
			startDate: '2026-03-01',
			endDate: '2026-03-05'
		});
		expect(withoutNote.success).toBe(true);
	});

	it('has group scope with personnelColumn', () => {
		expect(AvailabilityEntryEntity.groupScope).toEqual({ personnelColumn: 'personnel_id' });
	});

	it('has personnelIdField set', () => {
		expect(AvailabilityEntryEntity.personnelIdField).toBe('personnelId');
	});

	it('has correct table name', () => {
		expect(AvailabilityEntryEntity.table).toBe('availability_entries');
	});

	it('only allows POST and DELETE methods', () => {
		expect(AvailabilityEntryEntity.methods).toEqual(['POST', 'DELETE']);
	});

	it('has repo', () => {
		expect(AvailabilityEntryEntity.repo).toBeDefined();
		expect(AvailabilityEntryEntity.repo.list).toBeDefined();
		expect(AvailabilityEntryEntity.repo.query).toBeDefined();
	});
});
