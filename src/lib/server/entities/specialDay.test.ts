import { describe, it, expect } from 'vitest';
import { SpecialDayEntity } from './specialDay';
import type { SpecialDay } from '$lib/types';

describe('SpecialDayEntity', () => {
	it('fromDb produces correct SpecialDay shape', () => {
		const row = {
			id: 'sd-1',
			date: '2026-01-01',
			name: "New Year's Day",
			type: 'federal-holiday'
		};
		const result = SpecialDayEntity.fromDb(row) as SpecialDay;

		expect(result).toEqual({
			id: 'sd-1',
			date: '2026-01-01',
			name: "New Year's Day",
			type: 'federal-holiday'
		});
	});

	it('fromDbArray transforms multiple rows', () => {
		const rows = [
			{ id: 'sd-1', date: '2026-01-01', name: "New Year's Day", type: 'federal-holiday' },
			{ id: 'sd-2', date: '2026-07-04', name: 'Independence Day', type: 'federal-holiday' }
		];
		const results = SpecialDayEntity.fromDbArray(rows) as SpecialDay[];

		expect(results).toHaveLength(2);
		expect(results[0].name).toBe("New Year's Day");
		expect(results[1].date).toBe('2026-07-04');
	});

	it('toDbInsert maps correctly', () => {
		const result = SpecialDayEntity.toDbInsert(
			{
				date: '2026-01-01',
				name: "New Year's Day",
				type: 'federal-holiday'
			},
			'org-1'
		);

		expect(result).toEqual({
			organization_id: 'org-1',
			date: '2026-01-01',
			name: "New Year's Day",
			type: 'federal-holiday'
		});
	});

	it('createSchema validates', () => {
		const valid = SpecialDayEntity.createSchema.safeParse({
			date: '2026-01-01',
			name: "New Year's Day",
			type: 'federal-holiday'
		});
		expect(valid.success).toBe(true);

		const missing = SpecialDayEntity.createSchema.safeParse({
			date: '2026-01-01'
		});
		expect(missing.success).toBe(false);
	});

	it('createSchema rejects invalid type values', () => {
		const invalid = SpecialDayEntity.createSchema.safeParse({
			date: '2026-01-01',
			name: 'Test',
			type: 'invalid-type'
		});
		expect(invalid.success).toBe(false);
	});

	it('createSchema accepts org-closure type', () => {
		const valid = SpecialDayEntity.createSchema.safeParse({
			date: '2026-01-01',
			name: 'Org Closure',
			type: 'org-closure'
		});
		expect(valid.success).toBe(true);
	});

	it('has correct table name', () => {
		expect(SpecialDayEntity.table).toBe('special_days');
	});

	it('has groupScope none', () => {
		expect(SpecialDayEntity.groupScope).toBe('none');
	});

	it('has permission calendar', () => {
		expect(SpecialDayEntity.permission).toBe('calendar');
	});

	it('has audit config for special_day', () => {
		expect(SpecialDayEntity.audit).toEqual({
			resourceType: 'special_day'
		});
	});
});
