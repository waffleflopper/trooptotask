import { describe, it, expect } from 'vitest';
import { AssignmentTypeEntity } from './assignmentType';
import type { AssignmentType } from '$lib/types';

describe('AssignmentTypeEntity', () => {
	it('fromDb produces correct AssignmentType shape', () => {
		const row = {
			id: 'at-1',
			name: 'Fire Guard',
			short_name: 'FG',
			assign_to: 'personnel',
			color: '#ff0000',
			sort_order: 3,
			exempt_personnel_ids: ['p-1', 'p-2']
		};
		const result = AssignmentTypeEntity.fromDb(row) as AssignmentType & { sortOrder: number };

		expect(result).toEqual({
			id: 'at-1',
			name: 'Fire Guard',
			shortName: 'FG',
			assignTo: 'personnel',
			color: '#ff0000',
			sortOrder: 3,
			exemptPersonnelIds: ['p-1', 'p-2']
		});
	});

	it('fromDb applies nullDefault [] for null exempt_personnel_ids', () => {
		const row = {
			id: 'at-2',
			name: 'CQ',
			short_name: 'CQ',
			assign_to: 'group',
			color: '#00ff00',
			exempt_personnel_ids: null
		};
		const result = AssignmentTypeEntity.fromDb(row) as AssignmentType;

		expect(result.exemptPersonnelIds).toEqual([]);
	});

	it('fromDbArray transforms multiple rows', () => {
		const rows = [
			{
				id: 'at-1',
				name: 'Fire Guard',
				short_name: 'FG',
				assign_to: 'personnel',
				color: '#ff0000',
				exempt_personnel_ids: ['p-1']
			},
			{
				id: 'at-2',
				name: 'CQ',
				short_name: 'CQ',
				assign_to: 'group',
				color: '#00ff00',
				exempt_personnel_ids: null
			}
		];
		const results = AssignmentTypeEntity.fromDbArray(rows) as AssignmentType[];

		expect(results).toHaveLength(2);
		expect(results[0].shortName).toBe('FG');
		expect(results[1].exemptPersonnelIds).toEqual([]);
	});

	it('toDbInsert applies defaults and adds organization_id', () => {
		const result = AssignmentTypeEntity.toDbInsert(
			{ name: 'Staff Duty', shortName: 'SD', assignTo: 'personnel' },
			'org-1'
		);

		expect(result).toEqual({
			organization_id: 'org-1',
			name: 'Staff Duty',
			short_name: 'SD',
			assign_to: 'personnel',
			color: '#6b7280',
			sort_order: 0,
			exempt_personnel_ids: []
		});
	});

	it('toDbInsert allows explicit values to override defaults', () => {
		const result = AssignmentTypeEntity.toDbInsert(
			{
				name: 'Staff Duty',
				shortName: 'SD',
				assignTo: 'group',
				color: '#123456',
				sortOrder: 5,
				exemptPersonnelIds: ['p-1']
			},
			'org-1'
		);

		expect(result).toEqual({
			organization_id: 'org-1',
			name: 'Staff Duty',
			short_name: 'SD',
			assign_to: 'group',
			color: '#123456',
			sort_order: 5,
			exempt_personnel_ids: ['p-1']
		});
	});

	it('toDbUpdate maps camelCase to snake_case correctly', () => {
		const result = AssignmentTypeEntity.toDbUpdate({
			name: 'Updated',
			shortName: 'UPD',
			assignTo: 'group'
		});

		expect(result).toEqual({
			name: 'Updated',
			short_name: 'UPD',
			assign_to: 'group'
		});
	});

	it('createSchema requires name, shortName, assignTo; makes color/sortOrder optional', () => {
		const valid = AssignmentTypeEntity.createSchema.safeParse({
			name: 'Test',
			shortName: 'T',
			assignTo: 'personnel'
		});
		expect(valid.success).toBe(true);

		const missing = AssignmentTypeEntity.createSchema.safeParse({});
		expect(missing.success).toBe(false);

		const missingAssignTo = AssignmentTypeEntity.createSchema.safeParse({
			name: 'Test',
			shortName: 'T'
		});
		expect(missingAssignTo.success).toBe(false);

		const withOptionals = AssignmentTypeEntity.createSchema.safeParse({
			name: 'Test',
			shortName: 'T',
			assignTo: 'group',
			color: '#abcdef',
			sortOrder: 3
		});
		expect(withOptionals.success).toBe(true);
	});

	it('has groupScope none', () => {
		expect(AssignmentTypeEntity.groupScope).toBe('none');
	});

	it('has table assignment_types', () => {
		expect(AssignmentTypeEntity.table).toBe('assignment_types');
	});
});
