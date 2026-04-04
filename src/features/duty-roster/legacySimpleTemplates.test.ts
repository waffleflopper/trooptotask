import { describe, expect, it } from 'vitest';
import type { AssignmentType } from '$lib/types';
import { getLegacySimpleTemplates } from './legacySimpleTemplates';

function makeAssignmentType(overrides: Partial<AssignmentType> = {}): AssignmentType {
	return {
		id: 'at-1',
		name: 'Staff Duty',
		shortName: 'SD',
		assignTo: 'personnel',
		color: '#334155',
		exemptPersonnelIds: [],
		showInDateHeader: false,
		...overrides
	};
}

describe('getLegacySimpleTemplates', () => {
	it('surfaces existing one-person duty types as simple-template options', () => {
		const results = getLegacySimpleTemplates([
			makeAssignmentType({ id: 'at-sd', name: 'Staff Duty', shortName: 'SD' }),
			makeAssignmentType({ id: 'at-cq', name: 'Charge of Quarters', shortName: 'CQ' }),
			makeAssignmentType({ id: 'at-group', name: 'Manager on Duty', assignTo: 'group', shortName: 'MOD' })
		]);

		expect(results).toEqual([
			expect.objectContaining({
				id: 'legacy-simple-at-cq',
				assignmentTypeId: 'at-cq',
				name: 'Charge of Quarters',
				shortName: 'CQ',
				templateKind: 'legacy-simple'
			}),
			expect.objectContaining({
				id: 'legacy-simple-at-sd',
				assignmentTypeId: 'at-sd',
				name: 'Staff Duty',
				shortName: 'SD',
				templateKind: 'legacy-simple'
			})
		]);
	});

	it('preserves legacy compatibility details for the simple lane review', () => {
		const [result] = getLegacySimpleTemplates([
			makeAssignmentType({
				id: 'at-fireguard',
				name: 'Fire Guard',
				shortName: 'FG',
				exemptPersonnelIds: ['p-1', 'p-2']
			})
		]);

		expect(result).toMatchObject({
			assignmentTypeId: 'at-fireguard',
			legacyRecordMode: 'assignment-type',
			exemptPersonnelCount: 2,
			description: 'Uses the existing one-person duty roster rules and current calendar records.'
		});
	});
});
