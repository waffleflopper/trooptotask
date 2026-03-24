import { describe, it, expect } from 'vitest';
import { PersonnelEntity } from './personnel';
import type { Personnel } from '$lib/types';

describe('PersonnelEntity', () => {
	it('fromDb produces correct Personnel shape with groups join', () => {
		const row = {
			id: 'p-1',
			rank: 'SGT',
			last_name: 'Smith',
			first_name: 'John',
			mos: '68W',
			clinic_role: 'Medic',
			group_id: 'g-1',
			groups: { name: 'Alpha' },
			archived_at: null
		};
		const result = PersonnelEntity.fromDb(row) as Personnel;

		expect(result).toEqual({
			id: 'p-1',
			rank: 'SGT',
			lastName: 'Smith',
			firstName: 'John',
			mos: '68W',
			clinicRole: 'Medic',
			groupId: 'g-1',
			groupName: 'Alpha',
			archivedAt: null
		});
	});

	it('fromDb handles null groups', () => {
		const row = {
			id: 'p-2',
			rank: 'PV2',
			last_name: 'Doe',
			first_name: 'Jane',
			mos: '92Y',
			clinic_role: 'Cook',
			group_id: null,
			groups: null,
			archived_at: null
		};
		const result = PersonnelEntity.fromDb(row) as Personnel;

		expect(result.groupName).toBe('');
		expect(result.groupId).toBeNull();
	});

	it('fromDb handles null mos', () => {
		const row = {
			id: 'p-3',
			rank: 'SPC',
			last_name: 'Test',
			first_name: 'User',
			mos: null,
			clinic_role: 'Driver',
			group_id: null,
			groups: null,
			archived_at: null
		};
		const result = PersonnelEntity.fromDb(row) as Personnel;

		expect(result.mos).toBe('');
	});

	it('fromDbArray transforms multiple rows', () => {
		const rows = [
			{
				id: 'p-1',
				rank: 'SGT',
				last_name: 'Alpha',
				first_name: 'A',
				mos: '11B',
				clinic_role: 'Infantry',
				group_id: 'g-1',
				groups: { name: 'Bravo' },
				archived_at: null
			},
			{
				id: 'p-2',
				rank: 'CPL',
				last_name: 'Charlie',
				first_name: 'C',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: null,
				groups: null,
				archived_at: '2026-01-01'
			}
		];
		const results = PersonnelEntity.fromDbArray(rows) as Personnel[];

		expect(results).toHaveLength(2);
		expect(results[0].lastName).toBe('Alpha');
		expect(results[0].groupName).toBe('Bravo');
		expect(results[1].groupName).toBe('');
		expect(results[1].archivedAt).toBe('2026-01-01');
	});

	it('toDbInsert maps correctly (no groupName)', () => {
		const result = PersonnelEntity.toDbInsert(
			{
				rank: 'SGT',
				lastName: 'Smith',
				firstName: 'John',
				mos: '68W',
				clinicRole: 'Medic',
				groupId: 'g-1'
			},
			'org-1'
		);

		expect(result).toEqual({
			organization_id: 'org-1',
			rank: 'SGT',
			last_name: 'Smith',
			first_name: 'John',
			mos: '68W',
			clinic_role: 'Medic',
			group_id: 'g-1'
		});
		// groupName is derived from join, not a column
		expect(result).not.toHaveProperty('group_name');
		// archivedAt is readOnly, should not be in insert
		expect(result).not.toHaveProperty('archived_at');
	});

	it('toDbInsert applies defaults for mos and groupId when omitted', () => {
		const result = PersonnelEntity.toDbInsert(
			{
				rank: 'PVT',
				lastName: 'Doe',
				firstName: 'Jane',
				clinicRole: 'Driver'
			},
			'org-1'
		);

		expect(result.mos).toBe('');
		expect(result.group_id).toBeNull();
	});

	it('createSchema does not include groupName or archivedAt', () => {
		const shape = PersonnelEntity.createSchema.shape;

		expect(shape).not.toHaveProperty('groupName');
		expect(shape).not.toHaveProperty('archivedAt');
		expect(shape).not.toHaveProperty('id');
		expect(shape).toHaveProperty('rank');
		expect(shape).toHaveProperty('lastName');
		expect(shape).toHaveProperty('firstName');
		expect(shape).toHaveProperty('clinicRole');
	});

	it('createSchema validates correctly', () => {
		const valid = PersonnelEntity.createSchema.safeParse({
			rank: 'SGT',
			lastName: 'Smith',
			firstName: 'John',
			clinicRole: 'Medic'
		});
		expect(valid.success).toBe(true);

		const missing = PersonnelEntity.createSchema.safeParse({
			rank: 'SGT'
		});
		expect(missing.success).toBe(false);
	});

	it('has correct table and select', () => {
		expect(PersonnelEntity.table).toBe('personnel');
	});

	it('has groupScope none', () => {
		expect(PersonnelEntity.groupScope).toBe('none');
	});
});
