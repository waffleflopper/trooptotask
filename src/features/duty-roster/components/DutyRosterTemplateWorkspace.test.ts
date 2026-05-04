// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { stringify } from 'devalue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DutyRosterTemplateWorkspace from './DutyRosterTemplateWorkspace.svelte';
import type { DutyRosterTemplate } from '$features/duty-roster/templates/dutyRosterTemplates';
import type { DutyRosterTemplatePreview } from '$features/duty-roster/templates/dutyRosterTemplatePreview';

const template: DutyRosterTemplate = {
	id: 'template-1',
	assignmentTypeId: 'template-1',
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
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
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
					view: 'generate',
					countReadModel: countReadModel({ source: 'manual-da6-baseline' })
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
		expect(screen.getByLabelText('Duty Roster count source')).toBeTruthy();
		expect(screen.getByText('Manual DA6 Baseline')).toBeTruthy();
		expect(screen.getByText('1 Soldier with counts')).toBeTruthy();
		const list = screen.getByRole('table', { name: 'Generated Duty Roster preview' });
		expect(list).toBeTruthy();
		expect(within(list).getAllByText('SGT Able, Ann').length).toBeGreaterThan(0);
		expect(screen.getByRole('table', { name: 'DA6 preview matrix' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Print Draft' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Export Draft' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Accept run' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Accept and Apply to Calendar' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Accept and Print' })).toBeTruthy();
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

	it('accepts then prints official output from the server-returned accepted snapshot', async () => {
		const print = vi.fn();
		const focus = vi.fn();
		const documentMock = {
			open: vi.fn(),
			write: vi.fn(),
			close: vi.fn()
		};
		vi.spyOn(window, 'open').mockReturnValue({
			opener: null,
			document: documentMock,
			focus,
			print
		} as unknown as Window);
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					type: 'success',
					status: 200,
					data: stringify({ acceptedRun: acceptedRun(), printAcceptedRun: true })
				})
			)
		);
		vi.stubGlobal('fetch', fetchMock);

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

		await fireEvent.click(screen.getByRole('button', { name: 'Accept and Print' }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
		expect(fetchMock).toHaveBeenCalledWith(
			'/org/org-1/duty-rosters/cq-nco/generate?/acceptPreview',
			expect.objectContaining({ method: 'POST', body: expect.any(FormData) })
		);
		const submitted = fetchMock.mock.calls[0][1].body as FormData;
		expect(submitted.get('intent')).toBe('print');
		expect(JSON.parse(String(submitted.get('preview'))).config.startDate).toBe('2026-06-01');
		await waitFor(() =>
			expect(documentMock.write).toHaveBeenCalledWith(expect.stringContaining('Official CQ NCO Roster'))
		);
		expect(print).toHaveBeenCalledOnce();
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
					acceptedRuns: [acceptedRun()],
					countReadModel: countReadModel({ source: 'accepted-history', corrected: true })
				}
			}
		});

		expect(screen.getByText('Official')).toBeTruthy();
		expect(screen.getByText('Accepted history')).toBeTruthy();
		expect(screen.getByText('1 counting corrections')).toBeTruthy();
		expect(screen.getAllByText('SGT Baker, Ben').length).toBeGreaterThan(0);
		const list = screen.getByRole('table', { name: 'Accepted Duty Roster list' });
		expect(within(list).getByText('MANUAL')).toBeTruthy();
		expect(within(list).getByText('Generated: SGT Able, Ann')).toBeTruthy();
		expect(within(list).getByText('Selected Soldier is outside this template pool.')).toBeTruthy();
		expect(screen.getByRole('table', { name: 'Accepted DA6 matrix' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Print official' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Export official' })).toBeTruthy();
		expect(screen.getByText('Apply later')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Apply to Calendar' })).toBeTruthy();
	});

	it('renders correction history and an inline correction form for accepted rows', () => {
		render(DutyRosterTemplateWorkspace, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Able Company',
					templates: [template],
					selectedTemplate: template,
					view: 'history',
					acceptedRuns: [acceptedRun({ corrected: true })]
				}
			}
		});

		expect(screen.getByText('CORRECTED')).toBeTruthy();
		expect(screen.getByText('Actual: SGT Able, Ann')).toBeTruthy();
		expect(screen.getByText(/performed duty for/)).toBeTruthy();
		expect(screen.getByText('Counts toward future DA6 runs.')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Record correction' })).toBeTruthy();
		const form = screen.getByRole('button', { name: 'Record correction' }).closest('form') as HTMLFormElement;
		expect(form.action).toContain('/org/org-1/duty-rosters/cq-nco/history?/recordCorrection');
		expect(within(form).getByLabelText('Actual Soldier')).toBeTruthy();
		expect(within(form).getByLabelText('Reason')).toBeTruthy();
	});

	it('renders invalidation warnings and uses the required confirmation copy', async () => {
		const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
		render(DutyRosterTemplateWorkspace, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Able Company',
					templates: [template],
					selectedTemplate: template,
					view: 'history',
					acceptedRuns: [acceptedRun({ applied: true, calendarAssignmentsEdited: true })]
				}
			}
		});

		expect(screen.getByText(/Calendar assignments linked to this run changed after apply/)).toBeTruthy();
		const invalidateButton = screen.getByRole('button', { name: 'Invalidate run' });
		await fireEvent.submit(invalidateButton.closest('form') as HTMLFormElement);

		expect(confirm).toHaveBeenCalledWith(
			'Invalidating this run will remove the assignments from the calendar. Are you sure?'
		);
	});

	it('keeps invalidated History visible but locked from normal actions', () => {
		render(DutyRosterTemplateWorkspace, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Able Company',
					templates: [template],
					selectedTemplate: template,
					view: 'history',
					acceptedRuns: [acceptedRun({ invalidated: true, corrected: true })]
				}
			}
		});

		expect(screen.getByText('Invalidated')).toBeTruthy();
		expect(screen.getByText('Non-counting because this run is invalidated.')).toBeTruthy();
		expect(screen.getByRole('table', { name: 'Accepted Duty Roster list' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Print official' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Export official' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Apply to Calendar' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Invalidate run' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Record correction' })).toBeNull();
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
		expect(screen.getByLabelText('Template name')).toBeTruthy();
		expect(screen.getByLabelText('Route slug')).toBeTruthy();
		expect(screen.getAllByLabelText('Short code')).toHaveLength(2);
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

function countReadModel(options: { source: 'manual-da6-baseline' | 'accepted-history'; corrected?: boolean }) {
	return {
		templateId: 'template-1',
		source: options.source,
		sourceLabel: options.source === 'accepted-history' ? 'Accepted history' : 'Manual DA6 Baseline',
		sourceDescription:
			options.source === 'accepted-history'
				? 'Future previews use accepted, non-invalidated Duty Roster history. Manual accepted selections are treated as the final selection. Latest counting corrections use the Soldier who actually served.'
				: 'Future previews use Manual DA6 Baseline until this template has its first accepted Duty Roster Run.',
		rows: [
			{
				personnelId: 'person-1',
				display: {
					id: 'person-1',
					rank: 'SGT',
					lastName: 'Able',
					firstName: 'Ann',
					groupName: 'Alpha'
				},
				count: options.source === 'manual-da6-baseline' ? 1 : 0,
				lastDutyDate: null
			},
			{
				personnelId: 'person-2',
				display: {
					id: 'person-2',
					rank: 'SGT',
					lastName: 'Baker',
					firstName: 'Ben',
					groupName: 'Bravo'
				},
				count: options.source === 'accepted-history' ? 1 : 0,
				lastDutyDate: options.source === 'accepted-history' ? '2026-06-01' : null
			}
		],
		acceptedRunCount: options.source === 'accepted-history' ? 1 : 0,
		invalidatedRunCount: 0,
		countingCorrectionCount: options.corrected ? 1 : 0,
		nonCountingCorrectionCount: 0
	};
}

function acceptedRun(
	options: { applied?: boolean; invalidated?: boolean; calendarAssignmentsEdited?: boolean; corrected?: boolean } = {}
) {
	return {
		id: 'run-1',
		templateId: 'template-1',
		templateName: 'CQ NCO',
		status: options.invalidated ? ('invalidated' as const) : ('accepted' as const),
		startDate: '2026-06-01',
		endDate: '2026-06-01',
		acceptedAt: '2026-06-01T00:00:00.000Z',
		acceptedByUserId: 'user-1',
		appliedAt: options.applied ? '2026-06-01T00:10:00.000Z' : null,
		appliedByUserId: options.applied ? 'user-1' : null,
		invalidatedAt: options.invalidated ? '2026-06-01T00:20:00.000Z' : null,
		invalidatedByUserId: options.invalidated ? 'user-1' : null,
		linkedCalendarAssignmentCount: options.applied ? 1 : 0,
		calendarAssignmentsEdited: Boolean(options.calendarAssignmentsEdited),
		corrections: options.corrected
			? [
					{
						id: 'correction-1',
						runId: 'run-1',
						runRowDate: '2026-06-01',
						originalAssigneeId: 'person-2',
						originalDisplay: {
							id: 'person-2',
							rank: 'SGT',
							lastName: 'Baker',
							firstName: 'Ben',
							groupName: 'Bravo'
						},
						replacementAssigneeId: 'person-1',
						replacementDisplay: {
							id: 'person-1',
							rank: 'SGT',
							lastName: 'Able',
							firstName: 'Ann',
							groupName: 'Alpha'
						},
						reason: 'Emergency leave swap.',
						correctedByUserId: 'user-1',
						correctedAt: '2026-06-01T12:00:00.000Z',
						countsTowardFuture: !options.invalidated
					}
				]
			: [],
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
