// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import DutyRosterTemplateWorkspace from './DutyRosterTemplateWorkspace.svelte';
import type { DutyRosterTemplate } from '$features/duty-roster/templates/dutyRosterTemplates';
import type { DutyRosterTemplatePreview } from '$features/duty-roster/templates/dutyRosterTemplatePreview';

const template: DutyRosterTemplate = {
	id: 'template-1',
	name: 'CQ NCO',
	slug: 'cq-nco',
	shortCode: 'CQ',
	status: 'active',
	poolCriteria: {
		rankValues: [],
		groupIds: [],
		mosValues: [],
		dutyRoleValues: []
	},
	exemptPersonnelIds: [],
	manualBaselineCounts: {},
	createdAt: '2026-05-04T00:00:00Z',
	updatedAt: '2026-05-04T00:00:00Z'
};

afterEach(() => {
	cleanup();
});

describe('DutyRosterTemplateWorkspace', () => {
	it('renders a useful empty state and create form', () => {
		render(DutyRosterTemplateWorkspace, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Able Company',
					templates: [],
					selectedTemplate: null,
					view: 'generate'
				}
			}
		});

		expect(screen.getByRole('heading', { name: 'Duty Rosters' })).toBeTruthy();
		expect(screen.getByText('No templates yet')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Create template' })).toBeTruthy();
		expect(screen.getByLabelText('Name')).toBeTruthy();
		expect(screen.getByLabelText('Short code')).toBeTruthy();
	});

	it('renders template links and durable Generate, History, and Settings URLs', () => {
		render(DutyRosterTemplateWorkspace, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Able Company',
					templates: [template],
					selectedTemplate: template,
					view: 'history'
				}
			}
		});

		const templateList = screen.getByRole('navigation', { name: 'Open Duty Roster Template' });
		expect(
			within(templateList)
				.getByRole('link', { name: /CQ NCO/ })
				.getAttribute('href')
		).toBe('/org/org-1/duty-rosters/cq-nco/generate');

		const viewTabs = screen.getByRole('navigation', { name: 'Duty Roster Template views' });
		expect(
			within(viewTabs)
				.getByRole('link', { name: /Generate/ })
				.getAttribute('href')
		).toBe('/org/org-1/duty-rosters/cq-nco/generate');
		expect(
			within(viewTabs)
				.getByRole('link', { name: /History/ })
				.getAttribute('href')
		).toBe('/org/org-1/duty-rosters/cq-nco/history');
		expect(
			within(viewTabs)
				.getByRole('link', { name: /Settings/ })
				.getAttribute('href')
		).toBe('/org/org-1/duty-rosters/cq-nco/settings');
		expect(screen.getByRole('heading', { name: 'Accepted runs' })).toBeTruthy();
	});

	it('shows validation errors without dropping entered values', () => {
		render(DutyRosterTemplateWorkspace, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Able Company',
					templates: [],
					selectedTemplate: null,
					view: 'generate'
				},
				form: {
					error: 'Name is required',
					values: { name: ' ', shortCode: 'CQ' }
				}
			}
		});

		expect(screen.getByRole('alert').textContent).toBe('Name is required');
		expect(screen.getByLabelText<HTMLInputElement>('Short code').value).toBe('CQ');
	});

	it('renders generated preview list and DA6 matrix without official actions', () => {
		render(DutyRosterTemplateWorkspace, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Able Company',
					templates: [template],
					selectedTemplate: template,
					view: 'generate'
				},
				form: {
					preview: preview(),
					generateValues: {
						startDate: '2026-06-01',
						endDate: '2026-06-01'
					}
				}
			}
		});

		expect(screen.getByRole('button', { name: 'Generate preview' })).toBeTruthy();
		const list = screen.getByRole('table', { name: 'Generated Duty Roster preview' });
		expect(list).toBeTruthy();
		expect(within(list).getAllByText('SGT Able, Ann').length).toBeGreaterThan(0);
		expect(screen.getByRole('table', { name: 'DA6 preview matrix' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Accept run' })).toBeTruthy();
	});

	it('renders manual preview selections with warnings while keeping MANUAL out of the DA6 matrix', () => {
		render(DutyRosterTemplateWorkspace, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Able Company',
					templates: [template],
					selectedTemplate: template,
					view: 'generate'
				},
				form: {
					preview: preview({ manual: true }),
					generateValues: {
						startDate: '2026-06-01',
						endDate: '2026-06-01'
					}
				}
			}
		});

		const list = screen.getByRole('table', { name: 'Generated Duty Roster preview' });
		expect(within(list).getByText('MANUAL')).toBeTruthy();
		expect(within(list).getByText('Generated: SGT Able, Ann')).toBeTruthy();
		expect(within(list).getByText('Selected Soldier is outside this template pool.')).toBeTruthy();
		expect(screen.getByDisplayValue('Commander approved outside-pool replacement.')).toBeTruthy();

		const matrix = screen.getByRole('table', { name: 'DA6 preview matrix' });
		expect(within(matrix).queryByText('MANUAL')).toBeNull();
	});

	it('renders manual preview errors without dropping the preview', () => {
		render(DutyRosterTemplateWorkspace, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Able Company',
					templates: [template],
					selectedTemplate: template,
					view: 'generate'
				},
				form: {
					manualError: 'A reason is required for this manual selection.',
					preview: preview(),
					generateValues: {
						startDate: '2026-06-01',
						endDate: '2026-06-01'
					}
				}
			}
		});

		expect(screen.getByRole('alert').textContent).toContain('A reason is required for this manual selection.');
		expect(screen.getByRole('table', { name: 'Generated Duty Roster preview' })).toBeTruthy();
	});

	it('renders accepted History from the saved snapshot list and matrix', () => {
		render(DutyRosterTemplateWorkspace, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Able Company',
					templates: [template],
					selectedTemplate: template,
					view: 'history',
					acceptedRuns: [acceptedRun()]
				}
			}
		});

		expect(screen.getByText('Official')).toBeTruthy();
		const list = screen.getByRole('table', { name: 'Accepted Duty Roster list' });
		expect(within(list).getByText('MANUAL')).toBeTruthy();
		expect(within(list).getByText('Generated: SGT Able, Ann')).toBeTruthy();
		expect(within(list).getByText('Selected Soldier is outside this template pool.')).toBeTruthy();
		expect(screen.getByRole('table', { name: 'Accepted DA6 matrix' })).toBeTruthy();
	});

	it('renders scan-friendly settings for pool, exemptions, and baseline setup', () => {
		render(DutyRosterTemplateWorkspace, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Able Company',
					templates: [
						{
							...template,
							poolCriteria: {
								rankValues: ['SGT'],
								groupIds: ['alpha'],
								mosValues: ['11B'],
								dutyRoleValues: ['Rifleman']
							},
							exemptPersonnelIds: ['person-1'],
							manualBaselineCounts: { 'person-2': 4 }
						}
					],
					selectedTemplate: {
						...template,
						poolCriteria: {
							rankValues: ['SGT'],
							groupIds: ['alpha'],
							mosValues: ['11B'],
							dutyRoleValues: ['Rifleman']
						},
						exemptPersonnelIds: ['person-1'],
						manualBaselineCounts: { 'person-2': 4 }
					},
					settings: {
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
						],
						resolvedPool: [
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
						],
						baselineRows: [
							{
								personnel: {
									id: 'person-2',
									rank: 'CPL',
									firstName: 'Ben',
									lastName: 'Baker',
									mos: '11B',
									dutyRole: 'Rifleman',
									groupId: 'alpha',
									groupName: 'Alpha'
								},
								startingCount: 4
							}
						]
					},
					view: 'settings'
				}
			}
		});

		expect(screen.getByRole('heading', { name: 'Pool criteria' })).toBeTruthy();
		expect(screen.getByRole('table', { name: 'Resolved Duty Roster pool' })).toBeTruthy();
		expect(screen.getByDisplayValue('4')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Save settings' })).toBeTruthy();
	});
});

function preview(options: { manual?: boolean } = {}): DutyRosterTemplatePreview {
	const da6 = {
		numberingMode: 'single-sequence' as const,
		columns: [
			{
				date: '2026-06-01',
				sequenceKind: 'weekday' as const,
				sequenceKey: 'single' as const,
				specialDayIds: [],
				chargeSequenceStart: 1,
				chargeableCount: 1
			}
		],
		rows: [
			{
				personnelId: 'person-1',
				display: {
					id: 'person-1',
					rank: 'SGT',
					lastName: 'Able',
					firstName: 'Ann',
					groupId: 'alpha',
					groupName: 'Alpha'
				},
				cells: [
					{
						date: '2026-06-01',
						personnelId: 'person-1',
						code: 'assigned' as const,
						da6Code: null,
						chargeable: true,
						queuePosition: 1,
						sequenceNumber: 1,
						assigned: true,
						reason: null,
						reasonCode: null
					}
				]
			}
		]
	};

	const manualSelections = options.manual
		? [
				{
					date: '2026-06-01',
					originalAssigneeId: 'person-1',
					assigneeId: 'person-2',
					reason: 'Commander approved outside-pool replacement.',
					warnings: [
						{
							code: 'outside-pool' as const,
							message: 'Selected Soldier is outside this template pool.'
						}
					]
				}
			]
		: [];

	return {
		generatedAt: '2026-05-04T00:00:00.000Z',
		assignmentType: { id: 'template-1', name: 'CQ NCO', shortName: 'CQ', color: '#8a5a22' },
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
		personnel: [
			{ id: 'person-1', rank: 'SGT', lastName: 'Able', firstName: 'Ann', groupId: 'alpha', groupName: 'Alpha' }
		],
		selectionPersonnel: [
			{
				id: 'person-1',
				rank: 'SGT',
				lastName: 'Able',
				firstName: 'Ann',
				groupId: 'alpha',
				groupName: 'Alpha',
				archivedAt: null
			},
			{
				id: 'person-2',
				rank: 'SGT',
				lastName: 'Baker',
				firstName: 'Ben',
				groupId: 'bravo',
				groupName: 'Bravo',
				archivedAt: null
			}
		],
		manualSelections,
		rosterRows: [{ date: '2026-06-01', assigneeId: 'person-1' }],
		da6,
		exportModel: {
			assignmentType: { id: 'template-1', name: 'CQ NCO', shortName: 'CQ', color: '#8a5a22' },
			startDate: '2026-06-01',
			endDate: '2026-06-01',
			numberingMode: 'single-sequence',
			rosterRows: [{ date: '2026-06-01', assigneeId: 'person-1' }],
			da6,
			sequencePeriods: []
		},
		warnings: []
	};
}

function acceptedRun() {
	return {
		id: 'run-1',
		templateId: 'template-1',
		templateName: 'CQ NCO',
		status: 'accepted' as const,
		startDate: '2026-06-01',
		endDate: '2026-06-01',
		acceptedAt: '2026-06-01T00:00:00.000Z',
		acceptedByUserId: 'user-1',
		snapshotPayload: {
			snapshotVersion: 1,
			template: { id: 'template-1', name: 'CQ NCO', shortCode: 'CQ' },
			generatedAt: '2026-05-04T00:00:00.000Z',
			acceptedAt: '2026-06-01T00:00:00.000Z',
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
			resolvedPool: [
				{ id: 'person-1', rank: 'SGT', lastName: 'Able', firstName: 'Ann', groupId: 'alpha', groupName: 'Alpha' }
			],
			selectionPersonnel: [
				{
					id: 'person-1',
					rank: 'SGT',
					lastName: 'Able',
					firstName: 'Ann',
					groupId: 'alpha',
					groupName: 'Alpha',
					archivedAt: null
				},
				{
					id: 'person-2',
					rank: 'SGT',
					lastName: 'Baker',
					firstName: 'Ben',
					groupId: 'bravo',
					groupName: 'Bravo',
					archivedAt: null
				}
			],
			generatedRows: [{ date: '2026-06-01', assigneeId: 'person-1' }],
			finalRows: [
				{
					date: '2026-06-01',
					generatedAssigneeId: 'person-1',
					finalAssigneeId: 'person-2',
					assignmentSource: 'manual',
					generatedDisplay: {
						id: 'person-1',
						rank: 'SGT',
						lastName: 'Able',
						firstName: 'Ann',
						groupId: 'alpha',
						groupName: 'Alpha',
						archivedAt: null
					},
					finalDisplay: {
						id: 'person-2',
						rank: 'SGT',
						lastName: 'Baker',
						firstName: 'Ben',
						groupId: 'bravo',
						groupName: 'Bravo',
						archivedAt: null
					},
					reason: 'Commander approved outside-pool replacement.',
					warnings: [
						{
							code: 'outside-pool',
							message: 'Selected Soldier is outside this template pool.'
						}
					]
				}
			],
			manualSelections: [],
			da6: preview().da6,
			exportModel: preview().exportModel,
			warnings: []
		},
		createdAt: '2026-06-01T00:00:00.000Z'
	};
}
