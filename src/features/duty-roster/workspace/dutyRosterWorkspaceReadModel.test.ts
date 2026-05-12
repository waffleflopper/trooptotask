import { describe, expect, it } from 'vitest';
import { buildDutyRosterWorkspaceReadModel } from './dutyRosterWorkspaceReadModel';
import type { DutyRosterTemplate } from '$features/duty-roster/templates/dutyRosterTemplates';

const template: DutyRosterTemplate = {
	id: 'template-1',
	assignmentTypeId: 'template-1',
	name: 'CQ NCO',
	slug: 'cq-nco',
	shortCode: 'CQ',
	status: 'active',
	poolCriteria: {
		rankValues: ['SGT'],
		groupIds: ['alpha'],
		mosValues: [],
		dutyRoleValues: []
	},
	exemptPersonnelIds: [],
	manualBaselineCounts: {},
	createdAt: '2026-05-04T00:00:00Z',
	updatedAt: '2026-05-04T00:00:00Z'
};

describe('dutyRosterWorkspaceReadModel', () => {
	it('prepares URL actions and default generate state for a selected template', () => {
		const model = buildDutyRosterWorkspaceReadModel(
			{
				orgId: 'org-1',
				orgName: 'Able Company',
				templates: [template],
				selectedTemplate: template,
				view: 'generate'
			},
			null,
			new Date(2026, 4, 4)
		);

		expect(model.basePath).toBe('/org/org-1/duty-rosters');
		expect(model.generateAction).toBe('/org/org-1/duty-rosters/cq-nco/generate?/generatePreview');
		expect(model.acceptPreviewAction).toBe('/org/org-1/duty-rosters/cq-nco/generate?/acceptPreview');
		expect(model.settingsWorkspace?.settingsAction).toBe('/org/org-1/duty-rosters/cq-nco/settings?/updateSettings');
		expect(model.generateWorkspace).toMatchObject({
			selectedTemplate: template,
			generateAction: '/org/org-1/duty-rosters/cq-nco/generate?/generatePreview',
			acceptPreviewAction: '/org/org-1/duty-rosters/cq-nco/generate?/acceptPreview',
			generateStartDate: '2026-06-01',
			generateEndDate: '2026-06-30',
			canGenerate: true
		});
		expect(model.generateStartDate).toBe('2026-06-01');
		expect(model.generateEndDate).toBe('2026-06-30');
		expect(model.canGenerate).toBe(true);
	});

	it('keeps submitted generate dates and validates past ranges for the view', () => {
		const model = buildDutyRosterWorkspaceReadModel(
			{
				orgId: 'org-1',
				orgName: 'Able Company',
				templates: [template],
				selectedTemplate: template,
				view: 'generate'
			},
			{
				generateValues: {
					startDate: '2026-05-01',
					endDate: '2026-05-05'
				}
			},
			new Date(2026, 4, 4)
		);

		expect(model.generateStartDate).toBe('2026-05-01');
		expect(model.generateEndDate).toBe('2026-05-05');
		expect(model.canGenerate).toBe(false);
	});

	it('uses UTC today for Generate input minimums across server timezones', () => {
		const model = withTimezone('America/Anchorage', () =>
			buildDutyRosterWorkspaceReadModel(
				{
					orgId: 'org-1',
					orgName: 'Able Company',
					templates: [template],
					selectedTemplate: template,
					view: 'generate'
				},
				{
					generateValues: {
						startDate: '2026-05-04',
						endDate: '2026-05-04'
					}
				},
				new Date('2026-05-05T00:30:00.000Z')
			)
		);

		expect(model.todayDate).toBe('2026-05-05');
		expect(model.canGenerate).toBe(false);
	});

	it('normalizes setup option values for template setup screens', () => {
		const model = buildDutyRosterWorkspaceReadModel(
			{
				orgId: 'org-1',
				orgName: 'Able Company',
				templates: [],
				view: 'new',
				setupOptions: {
					personnel: [
						{
							id: 'person-1',
							rank: 'SGT',
							firstName: 'Ann',
							lastName: 'Able',
							mos: '11B',
							dutyRole: 'Rifleman',
							groupId: 'alpha',
							groupName: 'Alpha'
						},
						{
							id: 'person-2',
							rank: 'CPL',
							firstName: 'Ben',
							lastName: 'Baker',
							mos: '11B',
							dutyRole: 'Rifleman',
							groupId: 'alpha',
							groupName: 'Alpha'
						}
					]
				}
			},
			null
		);

		expect(model.isNewTemplate).toBe(true);
		expect(model.rankOptions).toEqual([
			'GEN',
			'LTG',
			'MG',
			'BG',
			'COL',
			'LTC',
			'MAJ',
			'CPT',
			'1LT',
			'2LT',
			'CW5',
			'CW4',
			'CW3',
			'CW2',
			'WO1',
			'CSM',
			'SGM',
			'1SG',
			'MSG',
			'SFC',
			'SSG',
			'SGT',
			'CPL',
			'SPC',
			'PFC',
			'PV2',
			'PV1',
			'CIV'
		]);
		expect(model.groupOptions).toEqual([{ id: 'alpha', label: 'Alpha' }]);
		expect(model.mosOptions).toEqual(['11B']);
		expect(model.dutyRoleOptions).toEqual(['Rifleman']);
	});
});

function withTimezone<T>(timezone: string, callback: () => T): T {
	const previousTimezone = process.env.TZ;
	process.env.TZ = timezone;
	try {
		return callback();
	} finally {
		if (previousTimezone === undefined) {
			delete process.env.TZ;
		} else {
			process.env.TZ = previousTimezone;
		}
	}
}
