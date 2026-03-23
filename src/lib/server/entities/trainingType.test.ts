import { describe, it, expect } from 'vitest';
import { TrainingTypeEntity } from './trainingType';
import type { TrainingType } from '$features/training/training.types';

describe('TrainingTypeEntity', () => {
	it('table is training_types', () => {
		expect(TrainingTypeEntity.table).toBe('training_types');
	});

	it('groupScope is none', () => {
		expect(TrainingTypeEntity.groupScope).toBe('none');
	});

	it('fromDb produces correct TrainingType shape with all 11 fields', () => {
		const row = {
			id: 'tt-1',
			name: 'CPR',
			description: 'CPR certification',
			expiration_months: 12,
			warning_days_yellow: 60,
			warning_days_orange: 30,
			required_for_roles: ['medic', 'nurse'],
			color: '#22c55e',
			sort_order: 1,
			expiration_date_only: true,
			can_be_exempted: true,
			exempt_personnel_ids: ['p1', 'p2']
		};

		const result = TrainingTypeEntity.fromDb(row) as TrainingType;

		expect(result).toEqual({
			id: 'tt-1',
			name: 'CPR',
			description: 'CPR certification',
			expirationMonths: 12,
			warningDaysYellow: 60,
			warningDaysOrange: 30,
			requiredForRoles: ['medic', 'nurse'],
			color: '#22c55e',
			sortOrder: 1,
			expirationDateOnly: true,
			canBeExempted: true,
			exemptPersonnelIds: ['p1', 'p2']
		});
	});

	it('fromDb applies nullDefault [] for null required_for_roles and exempt_personnel_ids', () => {
		const row = {
			id: 'tt-2',
			name: 'First Aid',
			description: null,
			expiration_months: null,
			warning_days_yellow: 60,
			warning_days_orange: 30,
			required_for_roles: null,
			color: '#6b7280',
			sort_order: 0,
			expiration_date_only: false,
			can_be_exempted: false,
			exempt_personnel_ids: null
		};

		const result = TrainingTypeEntity.fromDb(row) as TrainingType;

		expect(result.requiredForRoles).toEqual([]);
		expect(result.exemptPersonnelIds).toEqual([]);
	});

	it('fromDb applies nullDefault false for null expiration_date_only and can_be_exempted', () => {
		const row = {
			id: 'tt-3',
			name: 'Safety',
			description: null,
			expiration_months: null,
			warning_days_yellow: 60,
			warning_days_orange: 30,
			required_for_roles: [],
			color: '#6b7280',
			sort_order: 0,
			expiration_date_only: null,
			can_be_exempted: null,
			exempt_personnel_ids: []
		};

		const result = TrainingTypeEntity.fromDb(row) as TrainingType;

		expect(result.expirationDateOnly).toBe(false);
		expect(result.canBeExempted).toBe(false);
	});

	it('fromDbArray transforms multiple rows', () => {
		const rows = [
			{
				id: 'tt-1',
				name: 'CPR',
				description: null,
				expiration_months: 12,
				warning_days_yellow: 60,
				warning_days_orange: 30,
				required_for_roles: [],
				color: '#22c55e',
				sort_order: 0,
				expiration_date_only: false,
				can_be_exempted: false,
				exempt_personnel_ids: []
			},
			{
				id: 'tt-2',
				name: 'First Aid',
				description: 'Basic first aid',
				expiration_months: 24,
				warning_days_yellow: 90,
				warning_days_orange: 45,
				required_for_roles: ['medic'],
				color: '#3b82f6',
				sort_order: 1,
				expiration_date_only: true,
				can_be_exempted: true,
				exempt_personnel_ids: ['p1']
			}
		];

		const results = TrainingTypeEntity.fromDbArray(rows) as TrainingType[];

		expect(results).toHaveLength(2);
		expect(results[0].name).toBe('CPR');
		expect(results[0].sortOrder).toBe(0);
		expect(results[1].name).toBe('First Aid');
		expect(results[1].expirationMonths).toBe(24);
		expect(results[1].expirationDateOnly).toBe(true);
	});

	it('toDbInsert applies ALL defaults and adds organization_id', () => {
		const result = TrainingTypeEntity.toDbInsert({ name: 'New Type' }, 'org-1');

		expect(result).toEqual({
			organization_id: 'org-1',
			name: 'New Type',
			description: null,
			expiration_months: null,
			warning_days_yellow: 60,
			warning_days_orange: 30,
			required_for_roles: [],
			color: '#6b7280',
			sort_order: 0,
			expiration_date_only: false,
			can_be_exempted: false,
			exempt_personnel_ids: []
		});
	});

	it('toDbInsert allows explicit values to override defaults', () => {
		const result = TrainingTypeEntity.toDbInsert(
			{
				name: 'Custom',
				description: 'Custom training',
				expirationMonths: 6,
				warningDaysYellow: 90,
				warningDaysOrange: 45,
				requiredForRoles: ['medic'],
				color: '#ff0000',
				sortOrder: 5,
				expirationDateOnly: true,
				canBeExempted: true,
				exemptPersonnelIds: ['p1']
			},
			'org-2'
		);

		expect(result).toEqual({
			organization_id: 'org-2',
			name: 'Custom',
			description: 'Custom training',
			expiration_months: 6,
			warning_days_yellow: 90,
			warning_days_orange: 45,
			required_for_roles: ['medic'],
			color: '#ff0000',
			sort_order: 5,
			expiration_date_only: true,
			can_be_exempted: true,
			exempt_personnel_ids: ['p1']
		});
	});

	it('toDbUpdate maps camelCase to snake_case correctly for all fields', () => {
		const result = TrainingTypeEntity.toDbUpdate({
			id: 'tt-1',
			name: 'Updated',
			description: 'Updated desc',
			expirationMonths: 18,
			warningDaysYellow: 45,
			warningDaysOrange: 15,
			requiredForRoles: ['admin'],
			color: '#000000',
			sortOrder: 3,
			expirationDateOnly: true,
			canBeExempted: true,
			exemptPersonnelIds: ['p3']
		});

		expect(result).toEqual({
			name: 'Updated',
			description: 'Updated desc',
			expiration_months: 18,
			warning_days_yellow: 45,
			warning_days_orange: 15,
			required_for_roles: ['admin'],
			color: '#000000',
			sort_order: 3,
			expiration_date_only: true,
			can_be_exempted: true,
			exempt_personnel_ids: ['p3']
		});
	});

	it('createSchema requires name; makes all defaulted fields optional', () => {
		const valid = TrainingTypeEntity.createSchema.safeParse({ name: 'Minimal' });
		expect(valid.success).toBe(true);

		const missing = TrainingTypeEntity.createSchema.safeParse({});
		expect(missing.success).toBe(false);

		const withAll = TrainingTypeEntity.createSchema.safeParse({
			name: 'Full',
			description: 'desc',
			expirationMonths: 12,
			warningDaysYellow: 60,
			warningDaysOrange: 30,
			requiredForRoles: ['medic'],
			color: '#fff',
			sortOrder: 1,
			expirationDateOnly: true,
			canBeExempted: true,
			exemptPersonnelIds: ['p1']
		});
		expect(withAll.success).toBe(true);
	});
});
