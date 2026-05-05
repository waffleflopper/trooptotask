import { describe, expect, it } from 'vitest';
import {
	acceptedHistoryRows,
	acceptedSnapshot,
	buildDutyRosterWorkspaceReadModel
} from './dutyRosterWorkspaceReadModel';
import type {
	DutyRosterTemplate,
	DutyRosterTemplateAcceptedRun
} from '$features/duty-roster/templates/dutyRosterTemplates';
import type { DutyRosterTemplateAcceptedSnapshot } from '$features/duty-roster/templates/dutyRosterTemplatePreview';

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

	it('builds accepted history rows from the saved snapshot and latest correction', () => {
		const run = acceptedRun();
		const snapshot = acceptedSnapshot(run);

		expect(snapshot.finalRows[0]?.finalAssigneeId).toBe('person-1');
		expect(acceptedHistoryRows(run, snapshot, false)).toMatchObject([
			{
				id: 'run-1:2026-06-01',
				correction: {
					replacementAssigneeId: 'person-2',
					reason: 'Duty swap memo'
				},
				isInvalidated: false
			}
		]);
	});
});

function acceptedRun(): DutyRosterTemplateAcceptedRun {
	return {
		id: 'run-1',
		templateId: 'template-1',
		templateName: 'CQ NCO',
		status: 'accepted',
		startDate: '2026-06-01',
		endDate: '2026-06-01',
		acceptedAt: '2026-05-04T00:00:00Z',
		acceptedByUserId: 'user-1',
		appliedAt: null,
		appliedByUserId: null,
		invalidatedAt: null,
		invalidatedByUserId: null,
		linkedCalendarAssignmentCount: 0,
		calendarAssignmentsEdited: false,
		corrections: [
			{
				id: 'correction-1',
				runId: 'run-1',
				runRowDate: '2026-06-01',
				originalAssigneeId: 'person-1',
				originalDisplay: display('person-1', 'Able'),
				replacementAssigneeId: 'person-2',
				replacementDisplay: display('person-2', 'Baker'),
				reason: 'Duty swap memo',
				correctedByUserId: 'user-1',
				correctedAt: '2026-05-04T01:00:00Z',
				countsTowardFuture: true
			}
		],
		snapshotPayload: acceptedSnapshotPayload() as unknown as Record<string, unknown>,
		createdAt: '2026-05-04T00:00:00Z'
	};
}

function acceptedSnapshotPayload(): DutyRosterTemplateAcceptedSnapshot {
	return {
		snapshotVersion: 1,
		template: {
			id: 'template-1',
			name: 'CQ NCO',
			shortCode: 'CQ'
		},
		generatedAt: '2026-05-04T00:00:00Z',
		acceptedAt: '2026-05-04T00:00:00Z',
		acceptedByUserId: 'user-1',
		config: {
			startDate: '2026-06-01',
			endDate: '2026-06-01',
			dutyDuration: 'daily',
			excludedStatusIds: [],
			excludeWeekends: false,
			excludeHolidays: false,
			excludeOrgClosures: false,
			exemptPersonnelIds: [],
			numberingMode: 'single-sequence',
			misconductUnavailablePersonnelDates: {}
		},
		resolvedPool: [],
		selectionPersonnel: [],
		generatedRows: [],
		finalRows: [
			{
				date: '2026-06-01',
				generatedAssigneeId: 'person-1',
				finalAssigneeId: 'person-1',
				assignmentSource: 'generated',
				generatedDisplay: display('person-1', 'Able'),
				finalDisplay: display('person-1', 'Able'),
				reason: null,
				warnings: []
			}
		],
		manualSelections: [],
		da6: {
			numberingMode: 'single-sequence',
			columns: [],
			rows: []
		},
		exportModel: {
			assignmentType: {
				id: 'template-1',
				name: 'CQ NCO',
				shortName: 'CQ',
				color: '#c47f00'
			},
			startDate: '2026-06-01',
			endDate: '2026-06-01',
			numberingMode: 'single-sequence',
			rosterRows: [],
			da6: {
				numberingMode: 'single-sequence',
				columns: [],
				rows: []
			},
			sequencePeriods: []
		},
		warnings: []
	};
}

function display(id: string, lastName: string) {
	return {
		id,
		rank: 'SGT',
		lastName,
		firstName: id === 'person-1' ? 'Ann' : 'Ben',
		groupId: 'alpha',
		groupName: 'Alpha',
		archivedAt: null
	};
}
