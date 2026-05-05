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
		expect(model.settingsAction).toBe('/org/org-1/duty-rosters/cq-nco/settings?/updateSettings');
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
		expect(model.rankOptions).toEqual(['CPL', 'SGT']);
		expect(model.groupOptions).toEqual([{ id: 'alpha', label: 'Alpha' }]);
		expect(model.mosOptions).toEqual(['11B']);
		expect(model.dutyRoleOptions).toEqual(['Rifleman']);
	});
});
