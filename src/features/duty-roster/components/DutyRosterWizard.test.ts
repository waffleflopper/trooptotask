// @vitest-environment happy-dom
import type { ComponentProps } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import DutyRosterWizard from './DutyRosterWizard.svelte';
import type { AssignmentType, AvailabilityEntry, DailyAssignment, Personnel, SpecialDay, StatusType } from '$lib/types';
import type { RosterHistoryItem } from '../stores/dutyRosterHistory.svelte';
import type {
	DutyEvent,
	DutyEventPreview,
	DutyEventSeriesApplyResult,
	DutyEventSeriesInput,
	DutyEventSeriesPreview,
	DutyTemplate,
	ExistingDutyEventInput,
	ExistingDutyEventUpdateInput
} from '../duty-roster.types';

function makePersonnel(overrides: Partial<Personnel> = {}): Personnel {
	return {
		id: 'person-nco',
		firstName: 'Casey',
		lastName: 'Nolan',
		rank: 'SGT',
		groupId: 'group-hq',
		groupName: 'Headquarters',
		mos: '11B',
		clinicRole: 'Squad Leader',
		archivedAt: null,
		...overrides
	};
}

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

function makeAdvancedTemplate(overrides: Partial<DutyTemplate> = {}): DutyTemplate {
	return {
		id: 'tmpl-staff-duty',
		orgId: 'test-org',
		mode: 'advanced',
		status: 'active',
		name: 'Battalion Staff Duty',
		description: 'Overnight command coverage',
		scopeType: 'groups',
		scopeGroupIds: ['group-hq'],
		coverageMode: 'timed',
		startTime: '08:00',
		endTime: '08:00',
		isBlocking: true,
		cooldownHours: 24,
		createdAt: '2026-04-04T00:00:00.000Z',
		updatedAt: '2026-04-04T00:00:00.000Z',
		slots: [
			{
				id: 'slot-1',
				templateId: 'tmpl-staff-duty',
				roleLabel: 'NCO',
				quantity: 1,
				allowedRanks: ['SGT'],
				allowedGroupIds: ['group-hq'],
				preferredGroupIds: ['group-hq'],
				allowedMosValues: ['11B'],
				allowedRoleValues: ['Squad Leader'],
				rotationPoolKey: 'staff-duty-primary',
				sortOrder: 0
			}
		],
		rotationBaselines: [],
		...overrides
	};
}

function makePreview(overrides: Partial<DutyEventPreview> = {}): DutyEventPreview {
	return {
		templateId: 'tmpl-staff-duty',
		templateName: 'Battalion Staff Duty',
		eventDate: '2026-04-10',
		coverageMode: 'timed',
		coverageStart: '2026-04-10T08:00:00',
		coverageEnd: '2026-04-11T08:00:00',
		isBlocking: true,
		cooldownHours: 24,
		rulesSnapshot: {
			templateId: 'tmpl-staff-duty',
			templateName: 'Battalion Staff Duty',
			templateStatus: 'active',
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			isBlocking: true,
			cooldownHours: 24,
			slots: [
				{
					templateSlotId: 'slot-1',
					roleLabel: 'NCO',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					preferredGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'staff-duty-primary',
					sortOrder: 0
				}
			]
		},
		fillSummary: {
			totalSlots: 1,
			filledSlots: 1,
			unfilledSlots: 0
		},
		collisionSummary: {
			hasConflicts: false,
			conflicts: []
		},
		slotInstances: [
			{
				templateSlotId: 'slot-1',
				roleLabel: 'NCO',
				slotIndex: 0,
				assigneeId: 'person-nco',
				assignmentSource: 'generated',
				warningState: 'warning',
				fairnessConfidence: 'low',
				selectionReason:
					'Selected by longest break in rotation pool "staff-duty-primary". Fairness confidence is low because not every eligible person has seeded or historical service data yet.',
				unfilledReason: null,
				sortOrder: 0
			}
		],
		...overrides
	};
}

function makeAppliedEvent(overrides: Partial<DutyEvent> = {}): DutyEvent {
	return {
		id: 'event-1',
		orgId: 'test-org',
		templateId: 'tmpl-staff-duty',
		templateName: 'Battalion Staff Duty',
		eventDate: '2026-04-10',
		coverageMode: 'timed',
		coverageStart: '2026-04-10T08:00:00',
		coverageEnd: '2026-04-11T08:00:00',
		isBlocking: true,
		cooldownHours: 24,
		rulesSnapshot: makePreview().rulesSnapshot,
		fillSummary: {
			totalSlots: 1,
			filledSlots: 1,
			unfilledSlots: 0
		},
		collisionSummary: {
			hasConflicts: false,
			conflicts: []
		},
		originalProposal: null,
		createdAt: '2026-04-04T12:00:00.000Z',
		updatedAt: '2026-04-04T12:00:00.000Z',
		slotInstances: [
			{
				id: 'event-slot-1',
				dutyEventId: 'event-1',
				templateSlotId: 'slot-1',
				roleLabel: 'NCO',
				slotIndex: 0,
				assigneeId: 'person-nco',
				assignmentSource: 'generated',
				warningState: 'warning',
				fairnessConfidence: 'low',
				selectionReason:
					'Selected by longest break in rotation pool "staff-duty-primary". Fairness confidence is low because not every eligible person has seeded or historical service data yet.',
				unfilledReason: null,
				sortOrder: 0
			}
		],
		...overrides
	};
}

function makeSeriesPreview(overrides: Partial<DutyEventSeriesPreview> = {}): DutyEventSeriesPreview {
	return {
		templateId: 'tmpl-staff-duty',
		templateName: 'Battalion Staff Duty',
		pattern: 'selected-weekdays',
		eventDates: ['2026-04-07', '2026-04-09'],
		events: [
			makePreview({
				eventDate: '2026-04-07',
				coverageStart: '2026-04-07T08:00:00',
				coverageEnd: '2026-04-08T08:00:00'
			}),
			makePreview({ eventDate: '2026-04-09', coverageStart: '2026-04-09T08:00:00', coverageEnd: '2026-04-10T08:00:00' })
		],
		...overrides
	};
}

function makeSeriesApplyResult(overrides: Partial<DutyEventSeriesApplyResult> = {}): DutyEventSeriesApplyResult {
	return {
		templateId: 'tmpl-staff-duty',
		templateName: 'Battalion Staff Duty',
		pattern: 'selected-weekdays',
		eventDates: ['2026-04-07', '2026-04-09'],
		events: [
			makeAppliedEvent({
				id: 'event-1',
				eventDate: '2026-04-07',
				coverageStart: '2026-04-07T08:00:00',
				coverageEnd: '2026-04-08T08:00:00'
			}),
			makeAppliedEvent({
				id: 'event-2',
				eventDate: '2026-04-09',
				coverageStart: '2026-04-09T08:00:00',
				coverageEnd: '2026-04-10T08:00:00'
			})
		],
		...overrides
	};
}

function renderWizard(overrides: Partial<ComponentProps<typeof DutyRosterWizard>> = {}) {
	return render(DutyRosterWizard, {
		props: {
			assignmentTypes: [
				makeAssignmentType({ id: 'at-sd', name: 'Staff Duty', shortName: 'SD' }),
				makeAssignmentType({ id: 'at-cq', name: 'Charge of Quarters', shortName: 'CQ' }),
				makeAssignmentType({ id: 'at-group', name: 'Manager on Duty', shortName: 'MOD', assignTo: 'group' })
			],
			assignments: [] as DailyAssignment[],
			personnelByGroup: [
				{
					group: 'Headquarters',
					personnel: [
						makePersonnel(),
						makePersonnel({
							id: 'person-alt',
							firstName: 'Blake',
							lastName: 'Zimmer'
						}),
						makePersonnel({
							id: 'person-conflict',
							firstName: 'Jordan',
							lastName: 'Hayes'
						})
					]
				}
			] as { group: string; personnel: Personnel[] }[],
			groups: [],
			availabilityEntries: [] as AvailabilityEntry[],
			statusTypes: [] as StatusType[],
			specialDays: [] as SpecialDay[],
			rosterHistory: [] as RosterHistoryItem[],
			advancedDutyTemplates: [makeAdvancedTemplate()],
			advancedDutyEvents: [] as DutyEvent[],
			onApplyRoster: vi.fn(async () => true),
			onSaveRoster: vi.fn(async () => null),
			onDeleteRoster: vi.fn(async () => {}),
			onUpdateExemptions: vi.fn(async () => {}),
			onPreviewAdvancedEvent: vi.fn(async () => makePreview()),
			onApplyAdvancedEvent: vi.fn(async () => makeAppliedEvent()),
			onPreviewAdvancedSeries: vi.fn(async () => makeSeriesPreview()),
			onApplyAdvancedSeries: vi.fn(async () => makeSeriesApplyResult()),
			onPreviewExistingAdvancedEvent: vi.fn(async () => makePreview()),
			onUpdateExistingAdvancedEvent: vi.fn(async () => makeAppliedEvent()),
			canManageAdvancedTemplates: true,
			onManageAdvancedTemplates: vi.fn(),
			...overrides
		}
	});
}

describe('DutyRosterWizard', () => {
	beforeEach(() => {
		cleanup();
	});

	it('surfaces legacy one-person duties as simple template options in the wizard', async () => {
		renderWizard();

		await fireEvent.click(screen.getByRole('button', { name: 'Use Simple Duty' }));

		expect(screen.getByRole('button', { name: 'Continue with Charge of Quarters' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Continue with Staff Duty' })).toBeTruthy();
		expect(screen.queryByText('Manager on Duty')).toBeNull();
	});

	it('opens the existing simple generator with the selected legacy duty preselected', async () => {
		renderWizard();

		await fireEvent.click(screen.getByRole('button', { name: 'Use Simple Duty' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Continue with Staff Duty' }));

		await waitFor(() => {
			expect(screen.getByText('Duty planning')).toBeTruthy();
		});

		const select = screen.getByLabelText('Assignment Type') as HTMLSelectElement;
		expect(select.value).toBe('at-sd');
	});

	it('keeps existing simple-duty roster history visible through the simple lane bridge', async () => {
		const applyRoster = vi.fn(async () => true);

		renderWizard({
			onApplyRoster: applyRoster,
			rosterHistory: [
				{
					id: 'history-1',
					assignmentTypeId: 'at-sd',
					name: 'Staff Duty - Apr 1, 2026 to Apr 7, 2026',
					startDate: '2026-04-01',
					endDate: '2026-04-07',
					roster: [
						{
							date: '2026-04-01',
							assigneeId: 'person-nco',
							assigneeName: 'Nolan, Casey',
							assigneeRank: 'SGT',
							assigneeGroup: 'Headquarters'
						}
					],
					da6: {
						personnel: [{ id: 'person-nco', name: 'Nolan, Casey', rank: 'SGT', group: 'Headquarters' }],
						dates: [{ date: '2026-04-01', positions: [1] }]
					},
					config: {},
					createdAt: '2026-04-04T12:00:00.000Z'
				}
			]
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Use Simple Duty' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Continue with Staff Duty' }));
		await fireEvent.click(screen.getByRole('button', { name: /History/ }));

		expect(screen.getAllByText('Roster History').length).toBeGreaterThan(0);
		expect(screen.getByText('Staff Duty - Apr 1, 2026 to Apr 7, 2026')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Re-apply' })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Re-apply' }));

		expect(screen.getByText(/overwrite any existing assignments for those dates/i)).toBeTruthy();

		await fireEvent.click(screen.getAllByRole('button', { name: 'Re-apply' }).at(-1)!);

		await waitFor(() => {
			expect(applyRoster).toHaveBeenCalledWith([
				{
					date: '2026-04-01',
					assignmentTypeId: 'at-sd',
					assigneeId: 'person-nco'
				}
			]);
		});
	});

	it('keeps DA Form 6 style preview and export available through the simple lane bridge', async () => {
		const createObjectUrl = vi.fn(() => 'blob:test-roster');
		const revokeObjectUrl = vi.fn();
		const anchorClick = vi.fn();
		const originalCreateObjectURL = URL.createObjectURL;
		const originalRevokeObjectURL = URL.revokeObjectURL;
		const originalAnchorClick = HTMLAnchorElement.prototype.click;

		URL.createObjectURL = createObjectUrl;
		URL.revokeObjectURL = revokeObjectUrl;
		HTMLAnchorElement.prototype.click = anchorClick;

		try {
			renderWizard();

			await fireEvent.click(screen.getByRole('button', { name: 'Use Simple Duty' }));
			await fireEvent.click(screen.getByRole('button', { name: 'Continue with Staff Duty' }));
			await fireEvent.click(screen.getByRole('button', { name: 'Generate Roster' }));

			await waitFor(() => {
				expect(screen.getByRole('button', { name: 'Export to Excel' })).toBeTruthy();
			});

			await fireEvent.click(screen.getByRole('button', { name: 'DA6 Order' }));

			expect(screen.getByText(/Queue positions reflect each person's priority/)).toBeTruthy();

			await fireEvent.click(screen.getByRole('button', { name: 'Export to Excel' }));

			expect(createObjectUrl).toHaveBeenCalled();
			expect(anchorClick).toHaveBeenCalled();
			expect(revokeObjectUrl).toHaveBeenCalledWith('blob:test-roster');
		} finally {
			URL.createObjectURL = originalCreateObjectURL;
			URL.revokeObjectURL = originalRevokeObjectURL;
			HTMLAnchorElement.prototype.click = originalAnchorClick;
		}
	});

	it('generates and applies a recurring advanced duty series from a saved template', async () => {
		const previewHandler = vi.fn(async () => makeSeriesPreview());
		const applyHandler = vi.fn(async () => makeSeriesApplyResult());
		renderWizard({
			onPreviewAdvancedSeries: previewHandler,
			onApplyAdvancedSeries: applyHandler
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Use Advanced Duty' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Generate Series' }));

		await fireEvent.input(screen.getByLabelText('Start Date'), {
			target: { value: '2026-04-07' }
		});
		await fireEvent.input(screen.getByLabelText('End Date'), {
			target: { value: '2026-04-10' }
		});
		await fireEvent.change(screen.getByLabelText('Date Pattern'), {
			target: { value: 'selected-weekdays' }
		});
		await waitFor(() => {
			expect(screen.getByLabelText('Tuesday')).toBeTruthy();
		});
		await fireEvent.click(screen.getByLabelText('Tuesday'));
		await fireEvent.click(screen.getByLabelText('Thursday'));
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Series' }));

		await waitFor(() => {
			expect(previewHandler).toHaveBeenCalledWith(
				expect.objectContaining({
					templateId: 'tmpl-staff-duty',
					startDate: '2026-04-07',
					endDate: '2026-04-10',
					pattern: 'selected-weekdays',
					selectedWeekdays: [2, 4]
				})
			);
		});

		expect(screen.getByText('Series preview ready')).toBeTruthy();
		expect(screen.getAllByText(/Fairness confidence:/).length).toBeGreaterThan(0);
		expect(screen.getByText('2026-04-07T08:00:00 to 2026-04-08T08:00:00')).toBeTruthy();
		expect(screen.getByText('2026-04-09T08:00:00 to 2026-04-10T08:00:00')).toBeTruthy();
		expect(
			screen.getAllByText(
				'Selected by longest break in rotation pool "staff-duty-primary". Fairness confidence is low because not every eligible person has seeded or historical service data yet.'
			).length
		).toBeGreaterThan(0);

		await fireEvent.click(screen.getByRole('button', { name: 'Apply Series' }));

		await waitFor(() => {
			expect(applyHandler).toHaveBeenCalledWith(
				expect.objectContaining({
					templateId: 'tmpl-staff-duty',
					startDate: '2026-04-07',
					endDate: '2026-04-10',
					pattern: 'selected-weekdays',
					selectedWeekdays: [2, 4]
				})
			);
		});

		expect(screen.getByText('Applied advanced duty events')).toBeTruthy();
		expect(screen.getAllByText('Battalion Staff Duty').length).toBeGreaterThan(0);
		expect(screen.getByText('2 applied events · Apr 7, 2026 to Apr 9, 2026')).toBeTruthy();
		expect(screen.getByText('Apr 7, 2026')).toBeTruthy();
		expect(screen.getAllByText('0800-0800 next day · 1/1 filled').length).toBeGreaterThan(0);
		expect(screen.queryByText('2026-04-07T08:00:00 to 2026-04-08T08:00:00')).toBeNull();
	});

	it('supports a daily recurring pattern for advanced duty series', async () => {
		const previewHandler = vi.fn(async () =>
			makeSeriesPreview({
				pattern: 'daily',
				eventDates: ['2026-04-07', '2026-04-08', '2026-04-09'],
				events: [
					makePreview({
						eventDate: '2026-04-07',
						coverageStart: '2026-04-07T08:00:00',
						coverageEnd: '2026-04-08T08:00:00'
					}),
					makePreview({
						eventDate: '2026-04-08',
						coverageStart: '2026-04-08T08:00:00',
						coverageEnd: '2026-04-09T08:00:00'
					}),
					makePreview({
						eventDate: '2026-04-09',
						coverageStart: '2026-04-09T08:00:00',
						coverageEnd: '2026-04-10T08:00:00'
					})
				]
			})
		);

		renderWizard({
			onPreviewAdvancedSeries: previewHandler
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Use Advanced Duty' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Generate Series' }));

		await fireEvent.input(screen.getByLabelText('Start Date'), {
			target: { value: '2026-04-07' }
		});
		await fireEvent.input(screen.getByLabelText('End Date'), {
			target: { value: '2026-04-09' }
		});
		await fireEvent.change(screen.getByLabelText('Date Pattern'), {
			target: { value: 'daily' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Series' }));

		await waitFor(() => {
			expect(previewHandler).toHaveBeenCalledWith(
				expect.objectContaining({
					templateId: 'tmpl-staff-duty',
					startDate: '2026-04-07',
					endDate: '2026-04-09',
					pattern: 'daily'
				})
			);
		});

		expect(screen.getByText('2026-04-08T08:00:00 to 2026-04-09T08:00:00')).toBeTruthy();
	});

	it('requires explicit collision review before applying an advanced series preview', async () => {
		const previewHandler = vi.fn(async () =>
			makeSeriesPreview({
				eventDates: ['2026-04-07'],
				events: [
					makePreview({
						eventDate: '2026-04-07',
						coverageStart: '2026-04-07T08:00:00',
						coverageEnd: '2026-04-08T08:00:00',
						collisionSummary: {
							hasConflicts: true,
							conflicts: ['SGT Nolan already has a daily assignment on 2026-04-07. Review this collision before apply.']
						}
					})
				]
			})
		);
		const applyHandler = vi.fn(async () => makeSeriesApplyResult());

		renderWizard({
			onPreviewAdvancedSeries: previewHandler,
			onApplyAdvancedSeries: applyHandler
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Use Advanced Duty' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Generate Series' }));

		await fireEvent.input(screen.getByLabelText('Start Date'), {
			target: { value: '2026-04-07' }
		});
		await fireEvent.input(screen.getByLabelText('End Date'), {
			target: { value: '2026-04-07' }
		});
		await fireEvent.change(screen.getByLabelText('Date Pattern'), {
			target: { value: 'daily' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Series' }));

		await waitFor(() => {
			expect(
				screen.getByText('SGT Nolan already has a daily assignment on 2026-04-07. Review this collision before apply.')
			).toBeTruthy();
		});

		const applyButton = screen.getByRole('button', { name: 'Apply Series' }) as HTMLButtonElement;
		expect(applyButton.disabled).toBe(true);

		await fireEvent.click(screen.getByLabelText('I reviewed the conflicts for this run'));

		expect(applyButton.disabled).toBe(false);

		await fireEvent.click(applyButton);

		await waitFor(() => {
			expect(applyHandler).toHaveBeenCalledWith(
				expect.objectContaining({
					templateId: 'tmpl-staff-duty',
					startDate: '2026-04-07',
					endDate: '2026-04-07',
					pattern: 'daily',
					collisionReviewConfirmed: true
				})
			);
		});
	});

	it('lets users lock and clear previewed assignments before applying an advanced series', async () => {
		const previewHandler = vi.fn(async (input: DutyEventSeriesInput) => {
			const override = input.eventOverrides?.[0]?.slotOverrides?.[0];
			const baseSlot = makePreview().slotInstances[0];

			if (!override) {
				return makeSeriesPreview({
					eventDates: ['2026-04-07'],
					events: [
						makePreview({
							eventDate: '2026-04-07',
							coverageStart: '2026-04-07T08:00:00',
							coverageEnd: '2026-04-08T08:00:00'
						})
					]
				});
			}

			return makeSeriesPreview({
				eventDates: ['2026-04-07'],
				events: [
					makePreview({
						eventDate: '2026-04-07',
						coverageStart: '2026-04-07T08:00:00',
						coverageEnd: '2026-04-08T08:00:00',
						slotInstances: [
							{
								...baseSlot,
								assigneeId: override.assigneeId ?? null,
								assignmentSource: override.assignmentSource ?? 'manual',
								selectionReason:
									override.assigneeId == null
										? override.assignmentSource === 'locked'
											? 'Assignment was locked open in preview.'
											: 'Assignment was cleared in preview.'
										: override.assignmentSource === 'locked'
											? 'Assignment was locked in preview.'
											: 'Assignment was manually overridden in preview.',
								unfilledReason: override.assigneeId == null ? 'Assignment was cleared in preview.' : null,
								overrideMessages: [],
								warningState: 'none'
							}
						]
					})
				]
			});
		});
		const applyHandler = vi.fn(async () => makeSeriesApplyResult());

		renderWizard({
			onPreviewAdvancedSeries: previewHandler,
			onApplyAdvancedSeries: applyHandler
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Use Advanced Duty' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Generate Series' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Series' }));

		await waitFor(() => {
			expect(screen.getByLabelText('Assignee for 2026-04-07 NCO #1')).toBeTruthy();
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Lock 2026-04-07 NCO #1' }));

		await waitFor(() => {
			expect(previewHandler).toHaveBeenLastCalledWith(
				expect.objectContaining({
					eventOverrides: [
						{
							eventDate: '2026-04-07',
							slotOverrides: [
								{
									templateSlotId: 'slot-1',
									slotIndex: 0,
									assigneeId: 'person-nco',
									assignmentSource: 'locked'
								}
							]
						}
					]
				})
			);
		});

		expect(screen.getByText('Assignment was locked in preview.')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Clear 2026-04-07 NCO #1' }));

		await waitFor(() => {
			expect(previewHandler).toHaveBeenLastCalledWith(
				expect.objectContaining({
					eventOverrides: [
						{
							eventDate: '2026-04-07',
							slotOverrides: [
								{
									templateSlotId: 'slot-1',
									slotIndex: 0,
									assigneeId: null,
									assignmentSource: 'locked'
								}
							]
						}
					]
				})
			);
		});

		expect(screen.getByText('Assignment was cleared in preview.')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Apply Series' }));

		await waitFor(() => {
			expect(applyHandler).toHaveBeenCalledWith(
				expect.objectContaining({
					eventOverrides: [
						{
							eventDate: '2026-04-07',
							slotOverrides: [
								{
									templateSlotId: 'slot-1',
									slotIndex: 0,
									assigneeId: null,
									assignmentSource: 'locked'
								}
							]
						}
					]
				})
			);
		});
	});

	it('shows soft warnings and hard conflicts when preview overrides change slot assignments', async () => {
		const previewHandler = vi.fn(async (input: DutyEventSeriesInput) => {
			const override = input.eventOverrides?.[0]?.slotOverrides?.[0];
			const baseSlot = makePreview().slotInstances[0];

			if (!override) {
				return makeSeriesPreview({
					eventDates: ['2026-04-07'],
					events: [
						makePreview({
							eventDate: '2026-04-07',
							coverageStart: '2026-04-07T08:00:00',
							coverageEnd: '2026-04-08T08:00:00',
							slotInstances: [{ ...baseSlot, overrideMessages: [] }]
						})
					]
				});
			}

			if (override.assigneeId === 'person-conflict') {
				return makeSeriesPreview({
					eventDates: ['2026-04-07'],
					events: [
						makePreview({
							eventDate: '2026-04-07',
							coverageStart: '2026-04-07T08:00:00',
							coverageEnd: '2026-04-08T08:00:00',
							collisionSummary: {
								hasConflicts: true,
								conflicts: ['SGT Hayes is still in cooldown until 2026-04-07T20:00:00. Review this collision before apply.']
							},
							slotInstances: [
								{
									...baseSlot,
									assigneeId: 'person-conflict',
									assignmentSource: 'manual',
									warningState: 'conflict',
									selectionReason: 'Assignment was manually overridden in preview.',
									overrideMessages: [
										'SGT Hayes is still in cooldown until 2026-04-07T20:00:00. Review this collision before apply.'
									]
								}
							]
						})
					]
				});
			}

			return makeSeriesPreview({
				eventDates: ['2026-04-07'],
				events: [
					makePreview({
						eventDate: '2026-04-07',
						coverageStart: '2026-04-07T08:00:00',
						coverageEnd: '2026-04-08T08:00:00',
						slotInstances: [
							{
								...baseSlot,
								assigneeId: 'person-alt',
								assignmentSource: 'manual',
								warningState: 'warning',
								selectionReason: 'Assignment was manually overridden in preview.',
								overrideMessages: ['Manual override bypasses the generator fairness order for this slot.']
							}
						]
					})
				]
			});
		});
		const applyHandler = vi.fn(async () => makeSeriesApplyResult());

		renderWizard({
			onPreviewAdvancedSeries: previewHandler,
			onApplyAdvancedSeries: applyHandler
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Use Advanced Duty' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Generate Series' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Series' }));

		await waitFor(() => {
			expect(screen.getByLabelText('Assignee for 2026-04-07 NCO #1')).toBeTruthy();
		});

		await fireEvent.change(screen.getByLabelText('Assignee for 2026-04-07 NCO #1'), {
			target: { value: 'person-alt' }
		});

		await waitFor(() => {
			expect(previewHandler).toHaveBeenLastCalledWith(
				expect.objectContaining({
					eventOverrides: [
						{
							eventDate: '2026-04-07',
							slotOverrides: [
								{
									templateSlotId: 'slot-1',
									slotIndex: 0,
									assigneeId: 'person-alt',
									assignmentSource: 'manual'
								}
							]
						}
					]
				})
			);
		});

		expect(screen.getByText('Soft warning')).toBeTruthy();
		expect(screen.getByText('Manual override bypasses the generator fairness order for this slot.')).toBeTruthy();

		await fireEvent.change(screen.getByLabelText('Assignee for 2026-04-07 NCO #1'), {
			target: { value: 'person-conflict' }
		});

		await waitFor(() => {
			expect(previewHandler).toHaveBeenLastCalledWith(
				expect.objectContaining({
					eventOverrides: [
						{
							eventDate: '2026-04-07',
							slotOverrides: [
								{
									templateSlotId: 'slot-1',
									slotIndex: 0,
									assigneeId: 'person-conflict',
									assignmentSource: 'manual'
								}
							]
						}
					]
				})
			);
		});

		expect(screen.getByText('Hard conflict')).toBeTruthy();
		expect(
			screen.getAllByText('SGT Hayes is still in cooldown until 2026-04-07T20:00:00. Review this collision before apply.')
				.length
		).toBeGreaterThan(0);

		await fireEvent.click(screen.getByLabelText('I reviewed the conflicts for this run'));
		await fireEvent.click(screen.getByRole('button', { name: 'Apply Series' }));

		await waitFor(() => {
			expect(applyHandler).toHaveBeenCalledWith(
				expect.objectContaining({
					collisionReviewConfirmed: true,
					eventOverrides: [
						{
							eventDate: '2026-04-07',
							slotOverrides: [
								{
									templateSlotId: 'slot-1',
									slotIndex: 0,
									assigneeId: 'person-conflict',
									assignmentSource: 'manual'
								}
							]
						}
					]
				})
			);
		});
	});

	it('groups applied advanced duty events into compact duty ledgers with readable coverage labels', async () => {
		renderWizard({
			advancedDutyEvents: [
				makeAppliedEvent({
					id: 'cq-event-1',
					templateId: 'tmpl-cq',
					templateName: 'CQ',
					eventDate: '2026-04-10',
					coverageMode: 'all-day',
					coverageStart: '2026-04-10T00:00:00',
					coverageEnd: '2026-04-10T23:59:59'
				}),
				makeAppliedEvent({
					id: 'cq-event-2',
					templateId: 'tmpl-cq',
					templateName: 'CQ',
					eventDate: '2026-04-09',
					coverageMode: 'all-day',
					coverageStart: '2026-04-09T00:00:00',
					coverageEnd: '2026-04-09T23:59:59'
				}),
				makeAppliedEvent({
					id: 'staff-duty-1',
					templateId: 'tmpl-sd',
					templateName: 'Staff Duty',
					eventDate: '2026-04-08',
					coverageMode: 'timed',
					coverageStart: '2026-04-08T08:00:00',
					coverageEnd: '2026-04-09T08:00:00'
				})
			]
		});

		expect(screen.getByText('CQ')).toBeTruthy();
		expect(screen.getByText('2 applied events · Apr 9, 2026 to Apr 10, 2026')).toBeTruthy();
		expect(screen.getByText('Apr 10, 2026')).toBeTruthy();
		expect(screen.getAllByText('All day · 1/1 filled')).toHaveLength(2);
		expect(screen.getByText('Staff Duty')).toBeTruthy();
		expect(screen.getByText('1 applied event · Apr 8, 2026')).toBeTruthy();
		expect(screen.getByText('0800-0800 next day · 1/1 filled')).toBeTruthy();
		expect(screen.queryByText(/T00:00:00/)).toBeNull();
	});

	it('reopens an applied duty event and lets the user regenerate and save that one event', async () => {
		const previewExistingHandler = vi.fn(async (input: ExistingDutyEventInput) => {
			if (input.slotOverrides?.length === 0) {
				return makePreview({
					slotInstances: [
						{
							...makePreview().slotInstances[0],
							assigneeId: 'person-alt',
							assignmentSource: 'generated',
							warningState: 'none',
							fairnessConfidence: 'high',
							selectionReason: 'Selected by longest break in rotation pool "staff-duty-primary".',
							overrideMessages: []
						}
					]
				});
			}

			return makePreview();
		});
		const updateExistingHandler = vi.fn(async (input: ExistingDutyEventUpdateInput) =>
			makeAppliedEvent({
				id: input.dutyEventId,
				slotInstances: [
					{
						...makeAppliedEvent().slotInstances[0],
						assigneeId: input.slotOverrides?.length === 0 ? 'person-alt' : 'person-nco',
						assignmentSource: 'generated'
					}
				]
			})
		);

		renderWizard({
			advancedDutyEvents: [makeAppliedEvent()],
			onPreviewExistingAdvancedEvent: previewExistingHandler,
			onUpdateExistingAdvancedEvent: updateExistingHandler
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Open Event Apr 10, 2026' }));

		await waitFor(() => {
			expect(previewExistingHandler).toHaveBeenCalledWith({
				dutyEventId: 'event-1'
			});
		});

		expect(screen.getByText('Edit applied duty event')).toBeTruthy();
		expect(screen.getAllByText('SGT Nolan').length).toBeGreaterThan(0);

		await fireEvent.click(screen.getByRole('button', { name: 'Regenerate Event' }));

		await waitFor(() => {
			expect(previewExistingHandler).toHaveBeenLastCalledWith({
				dutyEventId: 'event-1',
				slotOverrides: []
			});
		});

		expect(screen.getAllByText('SGT Zimmer').length).toBeGreaterThan(0);

		await fireEvent.click(screen.getByRole('button', { name: 'Save Event' }));

		await waitFor(() => {
			expect(updateExistingHandler).toHaveBeenCalledWith({
				dutyEventId: 'event-1',
				slotOverrides: []
			});
		});

		expect(screen.getByText('NCO #1: SGT Zimmer')).toBeTruthy();
	});
});
