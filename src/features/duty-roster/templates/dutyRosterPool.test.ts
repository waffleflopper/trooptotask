import { describe, expect, it } from 'vitest';
import { buildDutyRosterBaselineRows, findInvalidDutyRosterSetupIds, resolveDutyRosterPool } from './dutyRosterPool';
import type { DutyRosterPoolPersonnel, DutyRosterTemplate } from './dutyRosterTemplates';

const personnel: DutyRosterPoolPersonnel[] = [
	{
		id: 'p1',
		rank: 'SGT',
		lastName: 'Able',
		firstName: 'Ann',
		mos: '11B',
		dutyRole: 'Team Leader',
		groupId: 'alpha',
		groupName: 'Alpha'
	},
	{
		id: 'p2',
		rank: 'CPL',
		lastName: 'Baker',
		firstName: 'Ben',
		mos: '11B',
		dutyRole: 'Rifleman',
		groupId: 'alpha',
		groupName: 'Alpha'
	},
	{
		id: 'p3',
		rank: 'SGT',
		lastName: 'Charlie',
		firstName: 'Cam',
		mos: '25U',
		dutyRole: 'Team Leader',
		groupId: 'bravo',
		groupName: 'Bravo'
	},
	{
		id: 'p4',
		rank: 'SGT',
		lastName: 'Archived',
		firstName: 'Art',
		mos: '11B',
		dutyRole: 'Team Leader',
		groupId: 'alpha',
		groupName: 'Alpha',
		archivedAt: '2026-05-01T00:00:00Z'
	}
];

const template: Pick<DutyRosterTemplate, 'exemptPersonnelIds' | 'manualBaselineCounts'> = {
	exemptPersonnelIds: ['p1'],
	manualBaselineCounts: {
		p2: 3,
		p3: 7
	}
};

describe('Duty Roster pool setup rules', () => {
	it('uses OR within each category and AND across categories', () => {
		const resolved = resolveDutyRosterPool({
			personnel,
			criteria: {
				rankValues: ['SGT', 'CPL'],
				groupIds: ['alpha'],
				mosValues: ['11B'],
				dutyRoleValues: ['Team Leader', 'Rifleman']
			}
		});

		expect(resolved.map((person) => person.id)).toEqual(['p1', 'p2']);
	});

	it('does not introduce archived Personnel Records through pool resolution', () => {
		const resolved = resolveDutyRosterPool({
			personnel,
			criteria: {
				rankValues: ['SGT'],
				groupIds: ['alpha'],
				mosValues: ['11B'],
				dutyRoleValues: ['Team Leader']
			}
		});

		expect(resolved.map((person) => person.id)).toEqual(['p1']);
	});

	it('builds baseline rows only from resolved non-exempt pool members', () => {
		const baselineRows = buildDutyRosterBaselineRows({
			template,
			resolvedPool: personnel.slice(0, 3)
		});

		expect(baselineRows.map((row) => [row.personnel.id, row.startingCount])).toEqual([
			['p2', 3],
			['p3', 7]
		]);
	});

	it('reports exemptions and baseline counts outside the resolved pool', () => {
		const invalid = findInvalidDutyRosterSetupIds({
			exemptPersonnelIds: ['p1', 'missing-person'],
			manualBaselineCounts: {
				p2: 3,
				p1: 2,
				'missing-person': 9
			},
			resolvedPool: personnel.slice(0, 2)
		});

		expect(invalid).toEqual({
			invalidExemptionIds: ['missing-person'],
			invalidBaselineIds: ['missing-person', 'p1']
		});
	});
});
