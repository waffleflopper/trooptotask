// @vitest-environment happy-dom
import type { ComponentProps } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import DutyRosterWizard from './DutyRosterWizard.svelte';
import type { AssignmentType, AvailabilityEntry, DailyAssignment, Personnel, SpecialDay, StatusType } from '$lib/types';
import type { RosterHistoryItem } from '../stores/dutyRosterHistory.svelte';
import {
	cloneDefaultSoftPreferences,
	type DutyEvent,
	type DutyEventPreview,
	type DutyEventSeriesApplyResult,
	type DutyEventSeriesInput,
	type DutyEventSeriesPreview,
	type DutyTemplate,
	type ExistingDutyEventInput,
	type ExistingDutyEventUpdateInput
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
		exemptPersonnelIds: [],
		coverageMode: 'timed',
		startTime: '08:00',
		endTime: '08:00',
		spansMidnight: false,
		isBlocking: true,
		cooldownHours: 24,
		softPreferences: cloneDefaultSoftPreferences(),
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
			softPreferences: cloneDefaultSoftPreferences(),
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
	const eventId = overrides.id ?? 'event-1';
	const eventDate = overrides.eventDate ?? '2026-04-10';
	const templateId = overrides.templateId ?? 'tmpl-staff-duty';
	const templateName = overrides.templateName ?? 'Battalion Staff Duty';
	const runId = overrides.runId ?? `run-${eventId}`;
	const defaultRun = {
		id: runId,
		orgId: 'test-org',
		templateId,
		templateName,
		pattern: 'selected-weekdays' as const,
		startDate: eventDate,
		endDate: eventDate,
		eventCount: 1,
		isLegacy: false,
		createdAt: '2026-04-04T12:00:00.000Z',
		updatedAt: '2026-04-04T12:00:00.000Z'
	};

	return {
		id: eventId,
		orgId: 'test-org',
		runId,
		templateId,
		templateName,
		eventDate,
		coverageMode: 'timed',
		coverageStart: `${eventDate}T08:00:00`,
		coverageEnd: `${eventDate}T08:00:00`,
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
		run: overrides.run ?? defaultRun,
		slotInstances: [
			{
				id: 'event-slot-1',
				dutyEventId: eventId,
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
	const run = overrides.run ?? {
		id: 'run-series-1',
		orgId: 'test-org',
		templateId: 'tmpl-staff-duty',
		templateName: 'Battalion Staff Duty',
		pattern: 'selected-weekdays',
		startDate: '2026-04-07',
		endDate: '2026-04-09',
		eventCount: 2,
		isLegacy: false,
		createdAt: '2026-04-04T12:00:00.000Z',
		updatedAt: '2026-04-04T12:00:00.000Z'
	};
	const events = overrides.events ?? [
		makeAppliedEvent({
			id: 'event-1',
			eventDate: '2026-04-07',
			coverageStart: '2026-04-07T08:00:00',
			coverageEnd: '2026-04-08T08:00:00',
			runId: run.id,
			run
		}),
		makeAppliedEvent({
			id: 'event-2',
			eventDate: '2026-04-09',
			coverageStart: '2026-04-09T08:00:00',
			coverageEnd: '2026-04-10T08:00:00',
			runId: run.id,
			run
		})
	];

	return {
		run,
		templateId: 'tmpl-staff-duty',
		templateName: 'Battalion Staff Duty',
		pattern: 'selected-weekdays',
		eventDates: ['2026-04-07', '2026-04-09'],
		events,
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
			onDeleteAdvancedEvent: vi.fn(async () => true),
			onDeleteAdvancedRun: vi.fn(async () => ({ deletedEvents: 1 })),
			onDeleteLegacyAdvancedGroup: vi.fn(async () => ({ deletedEvents: 1 })),
			onCreateAdvancedTemplate: vi.fn(async () => makeAdvancedTemplate()),
			canManageAdvancedTemplates: true,
			onManageAdvancedTemplates: vi.fn(),
			...overrides
		}
	});
}

async function openAdvancedPolicyReview() {
	await fireEvent.click(screen.getByRole('button', { name: 'Use Advanced Duty' }));
	await fireEvent.click(screen.getByRole('button', { name: 'Use This Template' }));
	await waitFor(() => {
		expect(screen.getByText('Step 2 of 4 · Review policy')).toBeTruthy();
	});
}

async function openAdvancedDatePattern() {
	await openAdvancedPolicyReview();
	await fireEvent.click(screen.getByRole('button', { name: 'Looks Good — Set Date Pattern' }));
	await waitFor(() => {
		expect(screen.getByText('Step 3 of 4 · Date pattern')).toBeTruthy();
	});
}

async function openAdvancedCandidateReview() {
	await openAdvancedDatePattern();
	await fireEvent.click(screen.getByRole('button', { name: 'Review Candidates' }));
	await waitFor(() => {
		expect(screen.getByText('Choose who can be considered for this run.')).toBeTruthy();
	});
}

describe('DutyRosterWizard', () => {
	beforeEach(() => {
		cleanup();
	});

	it('surfaces legacy one-person duties as simple template options in the wizard', async () => {
		renderWizard();

		await fireEvent.click(screen.getByRole('button', { name: 'Use Automatic Assignment Generator' }));

		expect(screen.getByRole('button', { name: 'Continue with Charge of Quarters' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Continue with Staff Duty' })).toBeTruthy();
		expect(screen.queryByText('Manager on Duty')).toBeNull();
	});

	it('opens the existing simple generator with the selected legacy duty preselected', async () => {
		renderWizard();

		await fireEvent.click(screen.getByRole('button', { name: 'Use Automatic Assignment Generator' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Continue with Staff Duty' }));

		await waitFor(() => {
			expect(screen.getByText('Duty planning')).toBeTruthy();
		});

		const select = screen.getByLabelText('Assignment Type') as HTMLSelectElement;
		expect(select.value).toBe('at-sd');
	});

	it('shows a plain-language policy summary before previewing an advanced run', async () => {
		renderWizard();

		await openAdvancedPolicyReview();

		expect(screen.getByText('Step 2 of 4 · Review policy')).toBeTruthy();
		expect(screen.getByText(/Blocking duty/)).toBeTruthy();
		expect(screen.getByText(/Cooldown/)).toBeTruthy();
		expect(screen.getByText(/Positions to fill/)).toBeTruthy();
		expect(screen.getByText(/Pool: staff-duty-primary/)).toBeTruthy();
		expect(screen.getByText(/24 hours after the shift ends\./)).toBeTruthy();
	});

	it('shows existing templates plus a build-from-scratch entry on advanced step one', async () => {
		const manageTemplates = vi.fn();

		renderWizard({
			onManageAdvancedTemplates: manageTemplates
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Use Advanced Duty' }));

		expect(screen.getByText('Step 1 of 4 · Choose template')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Use This Template' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Build from scratch' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Use Battalion Staff Duty' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Use Company CQ' })).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Build from scratch' }));

		expect(manageTemplates).toHaveBeenCalledTimes(1);
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

		await fireEvent.click(screen.getByRole('button', { name: 'Use Automatic Assignment Generator' }));
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
		const createObjectUrl = vi.fn((object: Blob | MediaSource) => {
			void object;
			return 'blob:test-roster';
		});
		const revokeObjectUrl = vi.fn((url: string) => {
			void url;
		});
		const anchorClick = vi.fn();
		const originalCreateObjectURL = URL.createObjectURL;
		const originalRevokeObjectURL = URL.revokeObjectURL;
		const originalAnchorClick = HTMLAnchorElement.prototype.click;

		URL.createObjectURL = createObjectUrl;
		URL.revokeObjectURL = revokeObjectUrl;
		HTMLAnchorElement.prototype.click = anchorClick;

		try {
			renderWizard();

			await fireEvent.click(screen.getByRole('button', { name: 'Use Automatic Assignment Generator' }));
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

		await openAdvancedDatePattern();

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
		await fireEvent.click(screen.getByRole('button', { name: 'Review Candidates' }));
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
		expect(screen.getAllByText('Fairness confidence').length).toBeGreaterThan(0);
		expect(screen.getByText('2026-04-07')).toBeTruthy();
		expect(screen.getByText('2026-04-09')).toBeTruthy();
		expect(screen.getAllByText('0800-0800 next day').length).toBeGreaterThan(0);
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

		await openAdvancedDatePattern();

		await fireEvent.input(screen.getByLabelText('Start Date'), {
			target: { value: '2026-04-07' }
		});
		await fireEvent.input(screen.getByLabelText('End Date'), {
			target: { value: '2026-04-09' }
		});
		await fireEvent.change(screen.getByLabelText('Date Pattern'), {
			target: { value: 'daily' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Review Candidates' }));
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

		expect(screen.getByText('2026-04-08')).toBeTruthy();
	});

	it('shows plain-language pattern labels in the advanced series preview header', async () => {
		const previewHandler = vi.fn(async () =>
			makeSeriesPreview({
				pattern: 'selected-weekdays',
				eventDates: ['2026-04-07', '2026-04-09']
			})
		);

		renderWizard({
			onPreviewAdvancedSeries: previewHandler
		});

		await openAdvancedDatePattern();

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
		await fireEvent.click(screen.getByRole('button', { name: 'Review Candidates' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Series' }));

		await waitFor(() => {
			expect(screen.getByText('2 events · Selected weekdays')).toBeTruthy();
		});
		expect(screen.queryByText('2 events · selected-weekdays')).toBeNull();
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

		await openAdvancedDatePattern();

		await fireEvent.input(screen.getByLabelText('Start Date'), {
			target: { value: '2026-04-07' }
		});
		await fireEvent.input(screen.getByLabelText('End Date'), {
			target: { value: '2026-04-07' }
		});
		await fireEvent.change(screen.getByLabelText('Date Pattern'), {
			target: { value: 'daily' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Review Candidates' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Series' }));

		await waitFor(() => {
			expect(
				screen.getByText('SGT Nolan already has a daily assignment on 2026-04-07. Review this collision before apply.')
			).toBeTruthy();
		});

		const applyButton = screen.getByRole('button', { name: 'Apply Series' }) as HTMLButtonElement;
		expect(applyButton.disabled).toBe(true);

		await fireEvent.click(screen.getByLabelText('I reviewed the conflicts for applying the run'));

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

	it('requires explicit shortfall acknowledgement before applying a partially unfilled advanced series preview', async () => {
		const previewHandler = vi.fn(async () =>
			makeSeriesPreview({
				eventDates: ['2026-04-07'],
				events: [
					makePreview({
						eventDate: '2026-04-07',
						coverageStart: '2026-04-07T08:00:00',
						coverageEnd: '2026-04-08T08:00:00',
						fillSummary: {
							totalSlots: 2,
							filledSlots: 1,
							unfilledSlots: 1
						},
						slotInstances: [
							{
								...makePreview().slotInstances[0],
								assigneeId: 'person-nco',
								unfilledReason: null
							},
							{
								...makePreview().slotInstances[0],
								roleLabel: 'Runner',
								slotIndex: 1,
								assigneeId: null,
								unfilledReason: 'No personnel matched this slot eligibility rules.'
							}
						]
					})
				]
			})
		);
		const applyHandler = vi.fn(async () => makeSeriesApplyResult());

		renderWizard({
			onPreviewAdvancedSeries: previewHandler,
			onApplyAdvancedSeries: applyHandler
		});

		await openAdvancedDatePattern();

		await fireEvent.input(screen.getByLabelText('Start Date'), {
			target: { value: '2026-04-07' }
		});
		await fireEvent.input(screen.getByLabelText('End Date'), {
			target: { value: '2026-04-07' }
		});
		await fireEvent.change(screen.getByLabelText('Date Pattern'), {
			target: { value: 'daily' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Review Candidates' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Series' }));

		await waitFor(() => {
			expect(screen.getByText('Fill:')).toBeTruthy();
			expect(screen.getByText('1/2')).toBeTruthy();
		});

		const applyButton = screen.getByRole('button', { name: 'Apply Series' }) as HTMLButtonElement;
		expect(applyButton.disabled).toBe(true);

		await fireEvent.click(screen.getByLabelText('I understand this run still has unfilled duty slots'));

		expect(applyButton.disabled).toBe(false);

		await fireEvent.click(applyButton);

		await waitFor(() => {
			expect(applyHandler).toHaveBeenCalledWith(
				expect.objectContaining({
					templateId: 'tmpl-staff-duty',
					startDate: '2026-04-07',
					endDate: '2026-04-07',
					pattern: 'daily'
				})
			);
		});
	});

	it('previews and applies a one-time advanced duty event without using the series handlers', async () => {
		const previewEventHandler = vi.fn(async () =>
			makePreview({
				eventDate: '2026-04-07',
				coverageStart: '2026-04-07T08:00:00',
				coverageEnd: '2026-04-08T08:00:00'
			})
		);
		const applyEventHandler = vi.fn(async () =>
			makeAppliedEvent({
				id: 'event-single-1',
				eventDate: '2026-04-07',
				coverageStart: '2026-04-07T08:00:00',
				coverageEnd: '2026-04-08T08:00:00'
			})
		);
		const previewSeriesHandler = vi.fn(async () => makeSeriesPreview());
		const applySeriesHandler = vi.fn(async () => makeSeriesApplyResult());

		renderWizard({
			onPreviewAdvancedEvent: previewEventHandler,
			onApplyAdvancedEvent: applyEventHandler,
			onPreviewAdvancedSeries: previewSeriesHandler,
			onApplyAdvancedSeries: applySeriesHandler
		});

		await openAdvancedDatePattern();

		await fireEvent.input(screen.getByLabelText('Start Date'), {
			target: { value: '2026-04-07' }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Review Candidates' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Preview One-Time Event' }));

		await waitFor(() => {
			expect(previewEventHandler).toHaveBeenCalledWith(
				expect.objectContaining({
					templateId: 'tmpl-staff-duty',
					eventDate: '2026-04-07'
				})
			);
		});

		expect(previewSeriesHandler).not.toHaveBeenCalled();
		expect(screen.getByText('One-time preview ready')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Apply Event' }));

		await waitFor(() => {
			expect(applyEventHandler).toHaveBeenCalledWith(
				expect.objectContaining({
					templateId: 'tmpl-staff-duty',
					eventDate: '2026-04-07'
				})
			);
		});

		expect(applySeriesHandler).not.toHaveBeenCalled();
	});

	it('lets users exclude candidates for a run before previewing an advanced series', async () => {
		const previewHandler = vi.fn(async () => makeSeriesPreview());

		renderWizard({
			onPreviewAdvancedSeries: previewHandler
		});

		await openAdvancedDatePattern();

		await fireEvent.input(screen.getByLabelText('Start Date'), {
			target: { value: '2026-04-07' }
		});
		await fireEvent.input(screen.getByLabelText('End Date'), {
			target: { value: '2026-04-07' }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Review Candidates' }));

		await waitFor(() => {
			expect(screen.getByText('Step 3 of 4 · Candidate review')).toBeTruthy();
		});

		await fireEvent.click(screen.getByLabelText('Include SGT Nolan, Casey in this run'));
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Series' }));

		await waitFor(() => {
			expect(previewHandler).toHaveBeenCalledWith(
				expect.objectContaining({
					templateId: 'tmpl-staff-duty',
					startDate: '2026-04-07',
					endDate: '2026-04-07',
					pattern: 'daily',
					candidatePersonnelIds: ['person-conflict', 'person-alt']
				})
			);
		});
	});

	it('renders candidate review in a searchable table with checkbox selection', async () => {
		renderWizard();

		await openAdvancedDatePattern();
		await fireEvent.click(screen.getByRole('button', { name: 'Review Candidates' }));

		await waitFor(() => {
			expect(screen.getByText('3 of 3 candidates included')).toBeTruthy();
		});

		expect(screen.getByRole('table', { name: 'Candidate review table' })).toBeTruthy();
		expect(screen.getByPlaceholderText('Search candidates by name, group, MOS, or role...')).toBeTruthy();
		const caseyToggle = screen.getByLabelText('Include SGT Nolan, Casey in this run') as HTMLInputElement;
		expect(caseyToggle.checked).toBe(true);
		expect(screen.getAllByText('Headquarters · 11B · Squad Leader').length).toBeGreaterThan(0);

		await fireEvent.click(caseyToggle);

		await waitFor(() => {
			expect(screen.getByText('2 of 3 candidates included')).toBeTruthy();
		});

		expect(caseyToggle.checked).toBe(false);
	});

	it('limits preview assignee choices to the reviewed candidate set', async () => {
		renderWizard();

		await openAdvancedDatePattern();

		await fireEvent.input(screen.getByLabelText('Start Date'), {
			target: { value: '2026-04-07' }
		});
		await fireEvent.input(screen.getByLabelText('End Date'), {
			target: { value: '2026-04-07' }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Review Candidates' }));
		await fireEvent.click(screen.getByLabelText('Include SGT Nolan, Casey in this run'));
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Series' }));

		await waitFor(() => {
			expect(screen.getByLabelText('Assignee for 2026-04-07 NCO #1')).toBeTruthy();
		});

		const assigneeSelect = screen.getByLabelText('Assignee for 2026-04-07 NCO #1') as HTMLSelectElement;
		const optionLabels = Array.from(assigneeSelect.options).map((option) => option.textContent ?? '');

		expect(optionLabels).toContain('Leave Unfilled');
		expect(optionLabels).not.toContain('SGT Nolan');
		expect(optionLabels).toContain('SGT Hayes');
		expect(optionLabels).toContain('SGT Zimmer');
	});

	it('requires candidate review before previewing an advanced series from the date-pattern step', async () => {
		const previewHandler = vi.fn(async () => makeSeriesPreview());

		renderWizard({
			onPreviewAdvancedSeries: previewHandler
		});

		await openAdvancedDatePattern();

		await fireEvent.input(screen.getByLabelText('Start Date'), {
			target: { value: '2026-04-07' }
		});
		await fireEvent.input(screen.getByLabelText('End Date'), {
			target: { value: '2026-04-07' }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Preview Series' }));

		expect(previewHandler).not.toHaveBeenCalled();

		await waitFor(() => {
			expect(screen.getByText('Choose who can be considered for this run.')).toBeTruthy();
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Preview Series' }));

		await waitFor(() => {
			expect(previewHandler).toHaveBeenCalledWith(
				expect.objectContaining({
					templateId: 'tmpl-staff-duty',
					startDate: '2026-04-07',
					endDate: '2026-04-07',
					pattern: 'daily'
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

		await openAdvancedCandidateReview();
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

	it('does not show preview swap controls for advanced event assignments', async () => {
		const advancedTemplate = makeAdvancedTemplate({
			slots: [
				makeAdvancedTemplate().slots[0],
				{
					id: 'slot-2',
					templateId: 'tmpl-staff-duty',
					roleLabel: 'Runner',
					quantity: 1,
					allowedRanks: ['SGT'],
					allowedGroupIds: ['group-hq'],
					preferredGroupIds: ['group-hq'],
					allowedMosValues: ['11B'],
					allowedRoleValues: ['Squad Leader'],
					rotationPoolKey: 'staff-duty-runner',
					sortOrder: 1
				}
			]
		});
		const basePreview = makePreview({
			eventDate: '2026-04-07',
			coverageStart: '2026-04-07T08:00:00',
			coverageEnd: '2026-04-08T08:00:00',
			rulesSnapshot: {
				...makePreview().rulesSnapshot,
				slots: [
					makePreview().rulesSnapshot.slots[0],
					{
						templateSlotId: 'slot-2',
						roleLabel: 'Runner',
						quantity: 1,
						allowedRanks: ['SGT'],
						allowedGroupIds: ['group-hq'],
						preferredGroupIds: ['group-hq'],
						allowedMosValues: ['11B'],
						allowedRoleValues: ['Squad Leader'],
						rotationPoolKey: 'staff-duty-runner',
						sortOrder: 1
					}
				]
			},
			fillSummary: {
				totalSlots: 2,
				filledSlots: 2,
				unfilledSlots: 0
			},
			slotInstances: [
				{
					...makePreview().slotInstances[0],
					templateSlotId: 'slot-1',
					roleLabel: 'NCO',
					slotIndex: 0,
					assigneeId: 'person-nco',
					assignmentSource: 'generated',
					sortOrder: 0
				},
				{
					...makePreview().slotInstances[0],
					templateSlotId: 'slot-2',
					roleLabel: 'Runner',
					slotIndex: 0,
					assigneeId: 'person-alt',
					assignmentSource: 'generated',
					sortOrder: 1
				}
			]
		});
		const previewHandler = vi.fn(async () => {
			return makeSeriesPreview({
				eventDates: ['2026-04-07'],
				events: [
					makePreview({
						...basePreview,
						slotInstances: basePreview.slotInstances
					})
				]
			});
		});

		renderWizard({
			advancedDutyTemplates: [advancedTemplate],
			onPreviewAdvancedSeries: previewHandler
		});

		await openAdvancedCandidateReview();
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Series' }));

		await waitFor(() => {
			expect(screen.getByLabelText('Assignee for 2026-04-07 NCO #1')).toBeTruthy();
		});

		expect(screen.queryByLabelText('Swap target for 2026-04-07 NCO #1')).toBeNull();
		expect(screen.queryByText('Swap with...')).toBeNull();
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
								conflicts: [
									'SGT Hayes is still in cooldown until 2026-04-07T20:00:00. Review this collision before apply.'
								]
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

		await openAdvancedCandidateReview();
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
			screen.getAllByText(
				'SGT Hayes is still in cooldown until 2026-04-07T20:00:00. Review this collision before apply.'
			).length
		).toBeGreaterThan(0);

		await fireEvent.click(screen.getByLabelText('I reviewed the conflicts for applying the run'));
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
		const cqRun = {
			id: 'run-cq-1',
			orgId: 'test-org',
			templateId: 'tmpl-cq',
			templateName: 'CQ',
			pattern: 'selected-weekdays' as const,
			startDate: '2026-04-09',
			endDate: '2026-04-10',
			eventCount: 2,
			isLegacy: false,
			createdAt: '2026-04-04T12:00:00.000Z',
			updatedAt: '2026-04-04T12:00:00.000Z'
		};
		const staffRun = {
			id: 'run-sd-1',
			orgId: 'test-org',
			templateId: 'tmpl-sd',
			templateName: 'Staff Duty',
			pattern: 'selected-weekdays' as const,
			startDate: '2026-04-08',
			endDate: '2026-04-08',
			eventCount: 1,
			isLegacy: false,
			createdAt: '2026-04-04T12:00:00.000Z',
			updatedAt: '2026-04-04T12:00:00.000Z'
		};

		renderWizard({
			advancedDutyEvents: [
				makeAppliedEvent({
					id: 'cq-event-1',
					templateId: 'tmpl-cq',
					templateName: 'CQ',
					eventDate: '2026-04-10',
					coverageMode: 'all-day',
					coverageStart: '2026-04-10T00:00:00',
					coverageEnd: '2026-04-10T23:59:59',
					runId: cqRun.id,
					run: cqRun
				}),
				makeAppliedEvent({
					id: 'cq-event-2',
					templateId: 'tmpl-cq',
					templateName: 'CQ',
					eventDate: '2026-04-09',
					coverageMode: 'all-day',
					coverageStart: '2026-04-09T00:00:00',
					coverageEnd: '2026-04-09T23:59:59',
					runId: cqRun.id,
					run: cqRun
				}),
				makeAppliedEvent({
					id: 'staff-duty-1',
					templateId: 'tmpl-sd',
					templateName: 'Staff Duty',
					eventDate: '2026-04-08',
					coverageMode: 'timed',
					coverageStart: '2026-04-08T08:00:00',
					coverageEnd: '2026-04-09T08:00:00',
					runId: staffRun.id,
					run: staffRun
				})
			]
		});

		expect(screen.getAllByText('CQ').length).toBeGreaterThan(0);
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

	it('exports a reopened applied duty event as a team duty packet', async () => {
		const createObjectUrl = vi.fn((object: Blob | MediaSource) => {
			void object;
			return 'blob:advanced-duty-packet';
		});
		const revokeObjectUrl = vi.fn((url: string) => {
			void url;
		});
		const anchorClick = vi.fn();
		const originalCreateObjectURL = URL.createObjectURL;
		const originalRevokeObjectURL = URL.revokeObjectURL;
		const originalAnchorClick = HTMLAnchorElement.prototype.click;

		URL.createObjectURL = createObjectUrl;
		URL.revokeObjectURL = revokeObjectUrl;
		HTMLAnchorElement.prototype.click = anchorClick;

		try {
			renderWizard({
				advancedDutyEvents: [
					makeAppliedEvent({
						templateName: 'CQ',
						coverageMode: 'all-day',
						coverageStart: '2026-04-10T00:00:00',
						coverageEnd: '2026-04-10T23:59:59',
						fillSummary: {
							totalSlots: 2,
							filledSlots: 1,
							unfilledSlots: 1
						},
						slotInstances: [
							{
								...makeAppliedEvent().slotInstances[0],
								roleLabel: 'Runner',
								assigneeId: 'person-nco',
								selectionReason: 'Selected by longest break in the CQ runner queue.'
							},
							{
								...makeAppliedEvent().slotInstances[0],
								id: 'event-slot-2',
								templateSlotId: 'slot-2',
								roleLabel: 'NCO',
								slotIndex: 1,
								assigneeId: null,
								assignmentSource: 'manual',
								warningState: 'conflict',
								selectionReason: null,
								unfilledReason: 'No eligible Soldier remained after overlap and cooldown checks.'
							}
						]
					})
				],
				onPreviewExistingAdvancedEvent: vi.fn(async () =>
					makePreview({
						templateName: 'CQ',
						coverageMode: 'all-day',
						coverageStart: '2026-04-10T00:00:00',
						coverageEnd: '2026-04-10T23:59:59',
						fillSummary: {
							totalSlots: 2,
							filledSlots: 1,
							unfilledSlots: 1
						},
						slotInstances: [
							{
								...makePreview().slotInstances[0],
								roleLabel: 'Runner',
								selectionReason: 'Selected by longest break in the CQ runner queue.',
								overrideMessages: ['Manual override bypassed the normal fairness pick.']
							},
							{
								...makePreview().slotInstances[0],
								templateSlotId: 'slot-2',
								roleLabel: 'NCO',
								slotIndex: 1,
								assigneeId: null,
								assignmentSource: 'manual',
								warningState: 'conflict',
								selectionReason: null,
								unfilledReason: 'No eligible Soldier remained after overlap and cooldown checks.',
								overrideMessages: ['SSG Hartney is already covering Staff Duty during this window.']
							}
						]
					})
				)
			});

			await fireEvent.click(screen.getByRole('button', { name: 'Open Event Apr 10, 2026' }));

			await waitFor(() => {
				expect(screen.getByText('Edit applied duty event')).toBeTruthy();
			});

			await fireEvent.click(screen.getByRole('button', { name: 'Export Duty Packet' }));

			await waitFor(async () => {
				expect(createObjectUrl).toHaveBeenCalledTimes(1);
				const firstCall = createObjectUrl.mock.calls[0];
				expect(firstCall).toBeTruthy();
				if (!firstCall) {
					throw new Error('Expected export to create a packet blob.');
				}
				const packetBlob = firstCall[0] as unknown as Blob;
				expect(packetBlob).toBeInstanceOf(Blob);
				const packetText = await packetBlob.text();
				expect(packetText).toContain('Team Duty Packet');
				expect(packetText).toContain('CQ');
				expect(packetText).toContain('Apr 10, 2026');
				expect(packetText).toContain('All day');
				expect(packetText).toContain('Runner #1');
				expect(packetText).toContain('SGT Nolan');
				expect(packetText).toContain('Selected by longest break in the CQ runner queue.');
				expect(packetText).toContain('No eligible Soldier remained after overlap and cooldown checks.');
				expect(packetText).toContain('SSG Hartney is already covering Staff Duty during this window.');
			});

			expect(anchorClick).toHaveBeenCalled();
			expect(revokeObjectUrl).toHaveBeenCalledWith('blob:advanced-duty-packet');
		} finally {
			URL.createObjectURL = originalCreateObjectURL;
			URL.revokeObjectURL = originalRevokeObjectURL;
			HTMLAnchorElement.prototype.click = originalAnchorClick;
		}
	});

	it('renders structured explanation sections for generated, warning, and unfilled advanced slots', async () => {
		renderWizard({
			onPreviewAdvancedSeries: vi.fn(async () =>
				makeSeriesPreview({
					eventDates: ['2026-04-07'],
					events: [
						makePreview({
							eventDate: '2026-04-07',
							coverageStart: '2026-04-07T08:00:00',
							coverageEnd: '2026-04-08T08:00:00',
							fillSummary: {
								totalSlots: 2,
								filledSlots: 1,
								unfilledSlots: 1
							},
							slotInstances: [
								{
									...makePreview().slotInstances[0],
									roleLabel: 'Runner',
									fairnessConfidence: 'low',
									selectionReason: 'Selected by longest break in the runner rotation group.',
									overrideMessages: ['SPC Foley was skipped because he already covered CQ yesterday.']
								},
								{
									...makePreview().slotInstances[0],
									templateSlotId: 'slot-2',
									roleLabel: 'NCO',
									slotIndex: 1,
									assigneeId: null,
									assignmentSource: 'manual',
									warningState: 'conflict',
									fairnessConfidence: 'low',
									selectionReason: null,
									unfilledReason: 'No eligible NCO remained after overlap and cooldown checks.',
									overrideMessages: ['SSG Hartney is already covering Staff Duty during this window.']
								}
							]
						})
					]
				})
			),
			advancedDutyEvents: [
				makeAppliedEvent({
					slotInstances: [
						{
							...makeAppliedEvent().slotInstances[0],
							roleLabel: 'Runner',
							fairnessConfidence: 'low',
							selectionReason: 'Selected by longest break in the runner rotation group.'
						},
						{
							...makeAppliedEvent().slotInstances[0],
							id: 'event-slot-2',
							templateSlotId: 'slot-2',
							roleLabel: 'NCO',
							slotIndex: 1,
							assigneeId: null,
							assignmentSource: 'manual',
							warningState: 'conflict',
							fairnessConfidence: 'low',
							selectionReason: null,
							unfilledReason: 'No eligible NCO remained after overlap and cooldown checks.'
						}
					]
				})
			],
			onPreviewExistingAdvancedEvent: vi.fn(async () =>
				makePreview({
					fillSummary: {
						totalSlots: 2,
						filledSlots: 1,
						unfilledSlots: 1
					},
					slotInstances: [
						{
							...makePreview().slotInstances[0],
							roleLabel: 'Runner',
							fairnessConfidence: 'low',
							selectionReason: 'Selected by longest break in the runner rotation group.',
							overrideMessages: ['SPC Foley was skipped because he already covered CQ yesterday.']
						},
						{
							...makePreview().slotInstances[0],
							templateSlotId: 'slot-2',
							roleLabel: 'NCO',
							slotIndex: 1,
							assigneeId: null,
							assignmentSource: 'manual',
							warningState: 'conflict',
							fairnessConfidence: 'low',
							selectionReason: null,
							unfilledReason: 'No eligible NCO remained after overlap and cooldown checks.',
							overrideMessages: ['SSG Hartney is already covering Staff Duty during this window.']
						}
					]
				})
			)
		});

		await openAdvancedCandidateReview();
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Series' }));

		await waitFor(() => {
			expect(screen.getByText('Series preview ready')).toBeTruthy();
		});

		expect(screen.getAllByText('Why this Soldier was selected').length).toBeGreaterThan(0);
		expect(screen.getAllByText('Why others were skipped').length).toBeGreaterThan(0);
		expect(screen.getAllByText('Why this slot stayed unfilled').length).toBeGreaterThan(0);
		expect(screen.getAllByText('Fairness confidence').length).toBeGreaterThan(0);
		expect(screen.getAllByText('Selected by longest break in the runner rotation group.').length).toBeGreaterThan(0);
		expect(
			screen.getAllByText('SPC Foley was skipped because he already covered CQ yesterday.').length
		).toBeGreaterThan(0);
		expect(screen.getAllByText('No eligible NCO remained after overlap and cooldown checks.').length).toBeGreaterThan(
			0
		);
		expect(
			screen.getAllByText('SSG Hartney is already covering Staff Duty during this window.').length
		).toBeGreaterThan(0);

		await fireEvent.click(screen.getByRole('button', { name: 'Open Event Apr 10, 2026' }));

		await waitFor(() => {
			expect(screen.getByText('Edit applied duty event')).toBeTruthy();
		});

		expect(screen.getAllByText('Why this Soldier was selected').length).toBeGreaterThan(1);
		expect(screen.getAllByText('Why others were skipped').length).toBeGreaterThan(1);
		expect(screen.getAllByText('Why this slot stayed unfilled').length).toBeGreaterThan(1);
	});

	it('uses clearer explanation labels for skipped candidates and unfilled slots', async () => {
		renderWizard({
			onPreviewAdvancedSeries: vi.fn(async () =>
				makeSeriesPreview({
					eventDates: ['2026-04-07'],
					events: [
						makePreview({
							eventDate: '2026-04-07',
							coverageStart: '2026-04-07T08:00:00',
							coverageEnd: '2026-04-08T08:00:00',
							fillSummary: {
								totalSlots: 2,
								filledSlots: 1,
								unfilledSlots: 1
							},
							slotInstances: [
								{
									...makePreview().slotInstances[0],
									roleLabel: 'Runner',
									overrideMessages: ['SPC Foley was skipped because he already covered CQ yesterday.']
								},
								{
									...makePreview().slotInstances[0],
									templateSlotId: 'slot-2',
									roleLabel: 'NCO',
									slotIndex: 1,
									assigneeId: null,
									assignmentSource: 'manual',
									warningState: 'conflict',
									selectionReason: null,
									unfilledReason: 'No eligible NCO remained after overlap and cooldown checks.',
									overrideMessages: ['SSG Hartney is already covering Staff Duty during this window.']
								}
							]
						})
					]
				})
			)
		});

		await openAdvancedCandidateReview();
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Series' }));

		await waitFor(() => {
			expect(screen.getByText('Series preview ready')).toBeTruthy();
		});

		expect(screen.getAllByText('Why others were skipped').length).toBeGreaterThan(0);
		expect(screen.getAllByText('Why this slot stayed unfilled').length).toBeGreaterThan(0);
		expect(screen.queryByText('Warnings and skips')).toBeNull();
		expect(screen.queryByText('Unfilled outcome')).toBeNull();
	});

	it('uses a clearer label for the selection explanation section', async () => {
		renderWizard({
			onPreviewAdvancedSeries: vi.fn(async () =>
				makeSeriesPreview({
					eventDates: ['2026-04-07'],
					events: [
						makePreview({
							eventDate: '2026-04-07',
							coverageStart: '2026-04-07T08:00:00',
							coverageEnd: '2026-04-08T08:00:00',
							slotInstances: [
								{
									...makePreview().slotInstances[0],
									selectionReason: 'Selected by longest break in the runner rotation group.'
								}
							]
						})
					]
				})
			)
		});

		await openAdvancedCandidateReview();
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Series' }));

		await waitFor(() => {
			expect(screen.getByText('Series preview ready')).toBeTruthy();
		});

		expect(screen.getAllByText('Why this Soldier was selected').length).toBeGreaterThan(0);
		expect(screen.queryByText('Why this pick')).toBeNull();
	});

	it('renders the active soft-preference order as a numbered list in the policy summary step', async () => {
		renderWizard({
			advancedDutyTemplates: [
				makeAdvancedTemplate({
					softPreferences: [
						{ type: 'longest-break', enabled: true },
						{ type: 'holiday-closure', enabled: false },
						{ type: 'weekend', enabled: true },
						{ type: 'preferred-group', enabled: false }
					]
				})
			]
		});

		await openAdvancedPolicyReview();

		// Only enabled preferences should appear, in order
		expect(screen.getByText(/Longest break since last duty/)).toBeTruthy();
		expect(screen.getByText(/Weekend volunteers preferred/)).toBeTruthy();
		// Disabled preferences should not appear
		expect(screen.queryByText(/Holiday or closure/)).toBeNull();
		expect(screen.queryByText(/Preferred group/)).toBeNull();
	});

	it('shows a fairness baseline notice when the template has no rotation baselines', async () => {
		renderWizard({
			advancedDutyTemplates: [makeAdvancedTemplate({ rotationBaselines: [] })]
		});

		await openAdvancedPolicyReview();

		expect(screen.getByText(/No baseline duty history/i)).toBeTruthy();
	});

	it('does not show a fairness baseline notice when the template has rotation baselines', async () => {
		renderWizard({
			advancedDutyTemplates: [
				makeAdvancedTemplate({
					rotationBaselines: [
						{
							id: 'bl-1',
							templateId: 'tmpl-staff-duty',
							rotationPoolKey: 'staff-duty-primary',
							personId: 'person-nco',
							lastServedDate: '2026-03-01'
						}
					]
				})
			]
		});

		await openAdvancedPolicyReview();

		expect(screen.queryByText(/No baseline duty history/i)).toBeNull();
	});

	it('shows candidate review as a distinct labeled step in the wizard stepper', async () => {
		renderWizard();

		await openAdvancedCandidateReview();

		// The stepper should have a "Candidate Review" step and it should be active
		const activeStepLabel = document.querySelector('.step-label[aria-current="step"]');
		expect(activeStepLabel?.textContent).toContain('Candidate Review');
	});

	it('hides the applied events ledger when the simple generator lane is active', async () => {
		renderWizard();

		// Before entering any lane, applied events section is visible
		expect(screen.getByText('Applied advanced duty events')).toBeTruthy();

		// Enter the simple generator lane
		await fireEvent.click(screen.getByRole('button', { name: 'Use Automatic Assignment Generator' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Continue with Staff Duty' }));
		await waitFor(() => {
			expect(screen.getByText('Duty planning')).toBeTruthy();
		});

		// Applied events section should be hidden
		expect(screen.queryByText('Applied advanced duty events')).toBeNull();
	});
});
