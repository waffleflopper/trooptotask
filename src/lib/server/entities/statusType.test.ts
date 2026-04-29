import { describe, it, expect } from 'vitest';
import { StatusTypeEntity } from './statusType';
import type { StatusType } from '$lib/types';

describe('StatusTypeEntity', () => {
	it('fromDb produces correct StatusType shape (snake_case → camelCase)', () => {
		const row = {
			id: 'st-1',
			name: 'Leave',
			color: '#22c55e',
			text_color: '#ffffff',
			da6_availability_treatment: 'authorized-absence',
			sort_order: 2
		};
		const result = StatusTypeEntity.fromDb(row) as StatusType & { sortOrder: number };

		expect(result).toEqual({
			id: 'st-1',
			name: 'Leave',
			color: '#22c55e',
			textColor: '#ffffff',
			da6AvailabilityTreatment: 'authorized-absence',
			sortOrder: 2
		});
	});

	it('fromDbArray transforms multiple rows', () => {
		const rows = [
			{ id: 'st-1', name: 'Leave', color: '#22c55e', text_color: '#ffffff' },
			{ id: 'st-2', name: 'TDY', color: '#3b82f6', text_color: '#000000' }
		];
		const results = StatusTypeEntity.fromDbArray(rows) as StatusType[];

		expect(results).toEqual([
			{ id: 'st-1', name: 'Leave', color: '#22c55e', textColor: '#ffffff' },
			{ id: 'st-2', name: 'TDY', color: '#3b82f6', textColor: '#000000' }
		]);
	});

	it('toDbInsert applies defaults and adds organization_id', () => {
		const result = StatusTypeEntity.toDbInsert({ name: 'Sick Call' }, 'org-1');

		expect(result).toEqual({
			organization_id: 'org-1',
			name: 'Sick Call',
			color: '#6b7280',
			text_color: '#ffffff',
			da6_availability_treatment: null,
			sort_order: 0
		});
	});

	it('toDbInsert allows explicit values to override defaults', () => {
		const result = StatusTypeEntity.toDbInsert(
			{
				name: 'Leave',
				color: '#22c55e',
				textColor: '#000000',
				da6AvailabilityTreatment: 'authorized-absence',
				sortOrder: 5
			},
			'org-1'
		);

		expect(result).toEqual({
			organization_id: 'org-1',
			name: 'Leave',
			color: '#22c55e',
			text_color: '#000000',
			da6_availability_treatment: 'authorized-absence',
			sort_order: 5
		});
	});

	it('toDbUpdate maps camelCase to snake_case correctly', () => {
		const result = StatusTypeEntity.toDbUpdate({
			id: 'st-1',
			textColor: '#000000',
			name: 'Updated',
			da6AvailabilityTreatment: 'other-duty'
		});

		expect(result).toEqual({
			text_color: '#000000',
			name: 'Updated',
			da6_availability_treatment: 'other-duty'
		});
	});

	it('createSchema requires name, makes color/textColor/treatment/sortOrder optional', () => {
		const valid = StatusTypeEntity.createSchema.safeParse({ name: 'Leave' });
		expect(valid.success).toBe(true);

		const missing = StatusTypeEntity.createSchema.safeParse({});
		expect(missing.success).toBe(false);

		const withOptionals = StatusTypeEntity.createSchema.safeParse({
			name: 'TDY',
			color: '#3b82f6',
			textColor: '#000000',
			da6AvailabilityTreatment: 'authorized-absence',
			sortOrder: 2
		});
		expect(withOptionals.success).toBe(true);

		const invalidTreatment = StatusTypeEntity.createSchema.safeParse({
			name: 'Mystery',
			da6AvailabilityTreatment: 'chargeable-maybe'
		});
		expect(invalidTreatment.success).toBe(false);
	});

	it('has groupScope set to none', () => {
		expect(StatusTypeEntity.groupScope).toBe('none');
	});

	it('has table set to status_types', () => {
		expect(StatusTypeEntity.table).toBe('status_types');
	});
});
