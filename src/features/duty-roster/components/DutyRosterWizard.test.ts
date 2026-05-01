// @vitest-environment happy-dom
import type { ComponentProps } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import DutyRosterWizard from './DutyRosterWizard.svelte';
import AppliedEventManager from './AppliedEventManager.svelte';
import type { AssignmentType, AvailabilityEntry, DailyAssignment, Personnel, SpecialDay, StatusType } from '$lib/types';
import type { RosterHistoryItem } from '../stores/dutyRosterHistory.svelte';
import {
	cloneDefaultSoftPreferences,
	type AdvancedDutyRunSnapshotRecord,
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
		snapshotId: 'snapshot-single-1',
		snapshotFingerprint: 'fingerprint-single-1',
		snapshotVersion: 1,
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
		snapshotId: 'snapshot-series-1',
		snapshotFingerprint: 'fingerprint-series-1',
		snapshotVersion: 1,
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

function makeDraftSnapshot(overrides: Partial<AdvancedDutyRunSnapshotRecord> = {}): AdvancedDutyRunSnapshotRecord {
	const preview = makeSeriesPreview();
	return {
		id: 'snapshot-series-1',
		orgId: 'test-org',
		templateId: 'tmpl-staff-duty',
		templateName: 'Battalion Staff Duty',
		pattern: 'selected-weekdays',
		startDate: '2026-04-07',
		endDate: '2026-04-09',
		eventCount: 2,
		eventDates: ['2026-04-07', '2026-04-09'],
		candidatePersonnelIds: ['person-nco', 'person-alt'],
		snapshotFingerprint: 'fingerprint-series-1',
		snapshotVersion: 1,
		status: 'draft',
		inputPayload: {
			templateId: 'tmpl-staff-duty',
			startDate: '2026-04-07',
			endDate: '2026-04-09',
			pattern: 'selected-weekdays',
			selectedWeekdays: [2, 4],
			candidatePersonnelIds: ['person-nco', 'person-alt']
		},
		snapshotPayload: {},
		previewPayload: preview as unknown as Record<string, unknown>,
		exportModel: null,
		createdByUserId: 'user-1',
		appliedRunId: null,
		applyError: null,
		expiresAt: '2026-04-08T12:00:00.000Z',
		appliedAt: null,
		createdAt: '2026-04-07T12:00:00.000Z',
		updatedAt: '2026-04-07T12:00:00.000Z',
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

function renderAppliedEventManager(overrides: Partial<ComponentProps<typeof AppliedEventManager>> = {}) {
	const personnel = [
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
	];

	return render(AppliedEventManager, {
		props: {
			advancedDutyEvents: [makeAppliedEvent()],
			personnelById: new Map(personnel.map((person) => [person.id, person] as const)),
			previewPersonnelOptions: personnel,
			onPreviewExistingAdvancedEvent: vi.fn(async () => makePreview()),
			onUpdateExistingAdvancedEvent: vi.fn(async () => makeAppliedEvent()),
			onDeleteAdvancedEvent: vi.fn(async () => true),
			onDeleteAdvancedRun: vi.fn(async () => ({ deletedEvents: 1 })),
			onDeleteLegacyAdvancedGroup: vi.fn(async () => ({ deletedEvents: 1 })),
			...overrides
		}
	});
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

async function openAdvancedPolicyReview() {
	await fireEvent.click(screen.getByRole('button', { name: 'Use Advanced Duty' }));
	await fireEvent.click(screen.getByRole('button', { name: 'Use Battalion Staff Duty' }));
	await waitFor(() => {
		expect(screen.getByText('Template policy')).toBeTruthy();
	});
}

async function openAdvancedDatePattern() {
	await openAdvancedPolicyReview();
	await fireEvent.click(screen.getByRole('button', { name: 'Set Date Pattern' }));
	await waitFor(() => {
		expect(screen.getByText('Run dates')).toBeTruthy();
	});
}

async function openAdvancedCandidateReview() {
	await openAdvancedDatePattern();
	await fireEvent.click(screen.getByRole('button', { name: 'Edit Candidate Pool' }));
	await waitFor(() => {
		expect(screen.getAllByText('Candidate pool').length).toBeGreaterThan(0);
	});
}

describe('DutyRosterWizard', () => {
	beforeEach(() => {
		cleanup();
	});

	it('surfaces legacy one-person duties as simple template options in the wizard', async () => {
		renderWizard();

		await fireEvent.click(screen.getByRole('button', { name: 'Use Automatic Assignment Generator' }));

		expect(screen.getByRole('button', { name: 'Use Charge of Quarters' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Use Staff Duty' })).toBeTruthy();
		expect(screen.queryByText('Manager on Duty')).toBeNull();
	});

	it('opens the existing simple generator with the selected legacy duty preselected', async () => {
		renderWizard();

		await fireEvent.click(screen.getByRole('button', { name: 'Use Automatic Assignment Generator' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Use Staff Duty' }));

		await waitFor(() => {
			expect(screen.getByText('Assignments / Taskings')).toBeTruthy();
		});

		const select = screen.getByLabelText('Assignment Type') as HTMLSelectElement;
		expect(select.value).toBe('at-sd');
	});

	it('shows a plain-language policy summary before previewing an advanced run', async () => {
		renderWizard();

		await openAdvancedPolicyReview();

		expect(screen.getByText('Template policy')).toBeTruthy();
		expect(screen.getByText(/Blocking/)).toBeTruthy();
		expect(screen.getByText(/Cooldown/)).toBeTruthy();
		expect(screen.getByText(/Slots/)).toBeTruthy();
		expect(screen.getByText(/staff-duty-primary/)).toBeTruthy();
		expect(screen.getByText(/24 hours/)).toBeTruthy();
	});

	it('shows existing templates plus a build-from-scratch entry on advanced step one', async () => {
		const manageTemplates = vi.fn();

		renderWizard({
			onManageAdvancedTemplates: manageTemplates
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Use Advanced Duty' }));

		expect(screen.getByText('Advanced')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Use Battalion Staff Duty' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'New' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Use Company CQ' })).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'New' }));

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
		await fireEvent.click(screen.getByRole('button', { name: 'Use Staff Duty' }));
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
			await fireEvent.click(screen.getByRole('button', { name: 'Use Staff Duty' }));
			await fireEvent.click(screen.getByRole('button', { name: 'Preview Roster' }));

			await waitFor(() => {
				expect(screen.getByRole('button', { name: 'Export to Excel' })).toBeTruthy();
			});

			await fireEvent.click(screen.getByRole('button', { name: 'DA6 Order' }));

			expect(screen.getByText(/Queue positions reflect each person's priority/)).toBeTruthy();

			await fireEvent.click(screen.getByRole('button', { name: 'Export to Excel' }));

			expect(createObjectUrl).toHaveBeenCalled();
			expect(anchorClick).toHaveBeenCalled();
			await waitFor(() => {
				expect(revokeObjectUrl).toHaveBeenCalledWith('blob:test-roster');
			});
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
		await fireEvent.click(screen.getAllByRole('button', { name: 'Edit Candidate Pool' }).at(-1)!);
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Run' }));

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

		expect(screen.getByText('Use a template')).toBeTruthy();
		expect(screen.getByText('Battalion Staff Duty')).toBeTruthy();
		expect(screen.queryByText('2026-04-07T08:00:00 to 2026-04-08T08:00:00')).toBeNull();
	});

	it('groups active advanced-duty setup controls in a rail while keeping preview and apply reachable', async () => {
		const previewHandler = vi.fn(async () => makeSeriesPreview());
		const applyHandler = vi.fn(async () => makeSeriesApplyResult());
		renderWizard({
			onPreviewAdvancedSeries: previewHandler,
			onApplyAdvancedSeries: applyHandler
		});

		await openAdvancedDatePattern();

		const setupRail = screen.getByRole('complementary', { name: 'Advanced duty setup rail' });
		expect(setupRail.textContent).toContain('Battalion Staff Duty');
		expect(setupRail.textContent).toContain('Date pattern');
		expect(setupRail.textContent).toContain('Candidate pool');
		expect(setupRail.textContent).toContain('Policy');
		expect(screen.getByRole('region', { name: 'Advanced duty review workspace' })).toBeTruthy();

		await fireEvent.input(screen.getByLabelText('Start Date'), {
			target: { value: '2026-04-07' }
		});
		await fireEvent.input(screen.getByLabelText('End Date'), {
			target: { value: '2026-04-10' }
		});
		await fireEvent.click(screen.getAllByRole('button', { name: 'Edit Candidate Pool' }).at(-1)!);
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Run' }));

		await waitFor(() => {
			expect(previewHandler).toHaveBeenCalledWith(
				expect.objectContaining({
					templateId: 'tmpl-staff-duty',
					startDate: '2026-04-07',
					endDate: '2026-04-10'
				})
			);
		});

		const previewRail = screen.getByRole('complementary', { name: 'Advanced duty setup rail' });
		expect(previewRail.textContent).toContain('Regenerate');
		expect(screen.getByText('Series preview ready')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Apply Series' }));

		await waitFor(() => {
			expect(applyHandler).toHaveBeenCalledWith(
				expect.objectContaining({
					snapshotId: 'snapshot-series-1',
					snapshotFingerprint: 'fingerprint-series-1'
				})
			);
		});
	});

	it('exports the active advanced preview as not-applied output without changing snapshot apply metadata', async () => {
		let exportedBlob: Blob | undefined;
		const createObjectUrl = vi.fn((object: Blob | MediaSource) => {
			exportedBlob = object as Blob;
			return 'blob:advanced-preview';
		});
		const revokeObjectUrl = vi.fn((url: string) => {
			void url;
		});
		const anchorClick = vi.fn();
		const originalCreateObjectURL = URL.createObjectURL;
		const originalRevokeObjectURL = URL.revokeObjectURL;
		const originalAnchorClick = HTMLAnchorElement.prototype.click;
		const previewHandler = vi.fn(async () => makeSeriesPreview());
		const applyHandler = vi.fn(async () => makeSeriesApplyResult());

		URL.createObjectURL = createObjectUrl;
		URL.revokeObjectURL = revokeObjectUrl;
		HTMLAnchorElement.prototype.click = anchorClick;

		try {
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
			await fireEvent.click(screen.getAllByRole('button', { name: 'Edit Candidate Pool' }).at(-1)!);
			await fireEvent.click(screen.getByRole('button', { name: 'Preview Run' }));

			const actionBar = await screen.findByRole('region', { name: 'Advanced run actions and snapshot state' });
			await fireEvent.click(within(actionBar).getByRole('button', { name: 'Export preview, not applied output' }));

			if (!exportedBlob) {
				throw new Error('Expected preview export to create a duty packet blob.');
			}
			const packetText = await exportedBlob.text();
			expect(packetText).toContain('Preview-only export');
			expect(packetText).toContain('Preview - not applied');
			expect(packetText).toContain('Battalion Staff Duty Team Duty Packet');
			expect(anchorClick).toHaveBeenCalled();
			expect(revokeObjectUrl).toHaveBeenCalledWith('blob:advanced-preview');

			await fireEvent.click(within(actionBar).getByRole('button', { name: 'Apply Series' }));
			await waitFor(() => {
				expect(applyHandler).toHaveBeenCalledWith(
					expect.objectContaining({
						snapshotId: 'snapshot-series-1',
						snapshotFingerprint: 'fingerprint-series-1'
					})
				);
			});
		} finally {
			URL.createObjectURL = originalCreateObjectURL;
			URL.revokeObjectURL = originalRevokeObjectURL;
			HTMLAnchorElement.prototype.click = originalAnchorClick;
		}
	});

	it('shows progress feedback while advanced series generation is running', async () => {
		const pendingPreview = deferred<DutyEventSeriesPreview>();
		const previewHandler = vi.fn(() => pendingPreview.promise);
		renderWizard({
			onPreviewAdvancedSeries: previewHandler
		});

		await openAdvancedDatePattern();
		await fireEvent.click(screen.getByRole('button', { name: 'Edit Candidate Pool' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Run' }));

		expect(screen.getByRole('dialog', { name: 'Generating duty roster' })).toBeTruthy();
		expect(screen.getByText('Building the duty roster.')).toBeTruthy();
		expect(screen.getAllByText(/Collecting eligible personnel/).length).toBeGreaterThan(0);

		pendingPreview.resolve(makeSeriesPreview());

		await waitFor(() => {
			expect(screen.queryByRole('dialog', { name: 'Generating duty roster' })).toBeNull();
			expect(screen.getByText('Series preview ready')).toBeTruthy();
		});
	});

	it('shows progress feedback while an advanced series is being applied', async () => {
		const pendingApply = deferred<DutyEventSeriesApplyResult>();
		const applyHandler = vi.fn(() => pendingApply.promise);
		renderWizard({
			onPreviewAdvancedSeries: vi.fn(async () => makeSeriesPreview()),
			onApplyAdvancedSeries: applyHandler
		});

		await openAdvancedDatePattern();
		await fireEvent.click(screen.getByRole('button', { name: 'Edit Candidate Pool' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Run' }));
		await waitFor(() => {
			expect(screen.getByText('Series preview ready')).toBeTruthy();
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Apply Series' }));

		expect(screen.getByRole('dialog', { name: 'Applying duty roster' })).toBeTruthy();
		expect(screen.getByText('Saving 2 duty events.')).toBeTruthy();
		expect(screen.getAllByText(/Checking coverage conflicts/).length).toBeGreaterThan(0);

		pendingApply.resolve(makeSeriesApplyResult());

		await waitFor(() => {
			expect(screen.queryByRole('dialog', { name: 'Applying duty roster' })).toBeNull();
			expect(screen.getByText('Use a template')).toBeTruthy();
		});
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
		await fireEvent.click(screen.getByRole('button', { name: 'Edit Candidate Pool' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Run' }));

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
		await fireEvent.click(screen.getByRole('button', { name: 'Edit Candidate Pool' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Run' }));

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
		await fireEvent.click(screen.getByRole('button', { name: 'Edit Candidate Pool' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Run' }));

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
		await fireEvent.click(screen.getByRole('button', { name: 'Edit Candidate Pool' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Run' }));

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

		await fireEvent.click(screen.getByRole('button', { name: 'Edit Candidate Pool' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Preview One Date' }));

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

		await fireEvent.click(screen.getByRole('button', { name: 'Edit Candidate Pool' }));

		await waitFor(() => {
			expect(screen.getAllByText('Candidate pool').length).toBeGreaterThan(0);
		});

		await fireEvent.click(screen.getByLabelText('Include SGT Nolan, Casey in this run'));
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Run' }));

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
		await fireEvent.click(screen.getByRole('button', { name: 'Edit Candidate Pool' }));

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

		await fireEvent.click(screen.getByRole('button', { name: 'Edit Candidate Pool' }));
		await fireEvent.click(screen.getByLabelText('Include SGT Nolan, Casey in this run'));
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Run' }));

		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'Assignee for 2026-04-07 NCO #1' })).toBeTruthy();
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Assignee for 2026-04-07 NCO #1' }));

		expect(screen.getByRole('option', { name: 'Leave Unfilled' })).toBeTruthy();
		expect(screen.queryByRole('option', { name: 'SGT Nolan' })).toBeNull();
		expect(screen.getByRole('option', { name: 'SGT Hayes' })).toBeTruthy();
		expect(screen.getByRole('option', { name: 'SGT Zimmer' })).toBeTruthy();
	});

	it('previews an advanced series from the date-pattern step without forcing candidate review', async () => {
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

		await fireEvent.click(screen.getByRole('button', { name: 'Preview Run' }));

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

		expect(screen.queryByRole('table', { name: 'Candidate review table' })).toBeNull();
		expect(screen.getByText('Series preview ready')).toBeTruthy();
	});

	it('resumes a draft snapshot into the advanced preview workspace', async () => {
		renderWizard({
			initialView: 'advanced-template-list',
			resumeSnapshot: makeDraftSnapshot()
		});

		await waitFor(() => {
			expect(screen.getByText('Series preview ready')).toBeTruthy();
		});
		expect(screen.getByRole('region', { name: 'Advanced run actions and snapshot state' })).toBeTruthy();
		expect(screen.getByText('2026-04-07')).toBeTruthy();
	});

	it('maps resumed snapshot lifecycle states into the advanced preview action bar', async () => {
		const onRecoverPartialApply = vi.fn();
		const { rerender } = renderWizard({
			initialView: 'advanced-template-list',
			resumeSnapshot: makeDraftSnapshot({
				status: 'apply-failed',
				updatedAt: '2026-04-07T12:05:00.000Z'
			}),
			onRecoverPartialApply
		});

		await waitFor(() => {
			expect(screen.getByText('Failed before persistence')).toBeTruthy();
		});
		expect(screen.getByRole('button', { name: 'Retry apply' })).toHaveProperty('disabled', false);

		rerender({
			initialView: 'advanced-template-list',
			resumeSnapshot: makeDraftSnapshot({
				status: 'partial-failure',
				updatedAt: '2026-04-07T12:10:00.000Z'
			}),
			onRecoverPartialApply
		});

		await waitFor(() => {
			expect(screen.getByText('Partial recovery')).toBeTruthy();
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Recover partial apply' }));
		expect(onRecoverPartialApply).toHaveBeenCalledTimes(1);

		rerender({
			initialView: 'advanced-template-list',
			resumeSnapshot: makeDraftSnapshot({
				expiresAt: '2026-04-01T00:00:00.000Z',
				updatedAt: '2026-04-07T12:15:00.000Z'
			}),
			onRecoverPartialApply
		});

		await waitFor(() => {
			expect(screen.getByText('Expired preview')).toBeTruthy();
		});
		expect(screen.getByRole('button', { name: 'Apply Series' })).toHaveProperty('disabled', true);
	});

	it('keeps the preview open when advanced series apply fails', async () => {
		const applyHandler = vi.fn(async () => null);
		renderWizard({
			onApplyAdvancedSeries: applyHandler
		});

		await openAdvancedDatePattern();

		await fireEvent.input(screen.getByLabelText('Start Date'), {
			target: { value: '2026-04-07' }
		});
		await fireEvent.input(screen.getByLabelText('End Date'), {
			target: { value: '2026-04-10' }
		});
		await fireEvent.click(screen.getAllByRole('button', { name: 'Edit Candidate Pool' }).at(-1)!);
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Run' }));

		await waitFor(() => {
			expect(screen.getByText('Series preview ready')).toBeTruthy();
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Apply Series' }));

		await waitFor(() => {
			expect(applyHandler).toHaveBeenCalledTimes(1);
		});
		expect(screen.getByText('Series preview ready')).toBeTruthy();
		expect(screen.queryByText('Use a template')).toBeNull();
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
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Run' }));

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
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Run' }));

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
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Run' }));

		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'Assignee for 2026-04-07 NCO #1' })).toBeTruthy();
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Assignee for 2026-04-07 NCO #1' }));
		await fireEvent.mouseDown(screen.getByRole('option', { name: 'SGT Zimmer' }));

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

		await fireEvent.click(screen.getByRole('button', { name: 'Assignee for 2026-04-07 NCO #1' }));
		await fireEvent.mouseDown(screen.getByRole('option', { name: 'SGT Hayes' }));

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

		renderAppliedEventManager({
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

	it('opens the applied run DA6 viewer from the run ledger when snapshot audit data exists', async () => {
		renderAppliedEventManager({
			advancedDutyEvents: [makeAppliedEvent()],
			advancedDutySnapshots: [
				{
					...makeDraftSnapshot({
						status: 'applied',
						appliedRunId: 'run-event-1'
					}),
					snapshotPayload: {
						da6Matrices: [
							{
								templateSlotId: 'slot-1',
								roleLabel: 'NCO',
								rotationPoolKey: 'staff-duty-primary',
								sequenceKey: 'weekday',
								sequenceLabel: 'weekday DA6 sequence',
								numberingMode: 'single-sequence',
								columns: [
									{
										eventDate: '2026-04-10',
										coverageStart: '2026-04-10T08:00:00',
										coverageEnd: '2026-04-11T08:00:00',
										sequenceKey: 'weekday',
										sequenceLabel: 'weekday DA6 sequence',
										chargeSequenceStart: 1,
										chargeableCount: 1
									}
								],
								rows: [
									{
										personnelId: 'person-nco',
										display: {
											id: 'person-nco',
											rank: 'SGT',
											firstName: 'Casey',
											lastName: 'Nolan',
											groupName: 'HQ'
										},
										cells: [
											{
												eventDate: '2026-04-10',
												personnelId: 'person-nco',
												code: 'assigned',
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
							}
						]
					}
				}
			]
		});

		await fireEvent.click(screen.getByRole('button', { name: 'View DA6 Battalion Staff Duty' }));

		expect(screen.getByText(/weekday DA6 sequence/)).toBeTruthy();
		expect(screen.getByRole('table', { name: 'DA6 matrix NCO weekday DA6 sequence' })).toBeTruthy();
	});

	it('keeps the applied run DA6 action disabled when snapshot audit data is unavailable', () => {
		renderAppliedEventManager({
			advancedDutyEvents: [makeAppliedEvent()],
			advancedDutySnapshots: []
		});

		const viewDa6 = screen.getByRole('button', { name: 'View DA6 Battalion Staff Duty' });
		expect(viewDa6.hasAttribute('disabled')).toBe(true);
		expect(viewDa6.getAttribute('title')).toBe('DA6 audit data is not available for this applied run.');
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

		renderAppliedEventManager({
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
			renderAppliedEventManager({
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
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Run' }));

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

		expect(screen.queryByRole('button', { name: 'Open Event Apr 10, 2026' })).toBeNull();
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
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Run' }));

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
		await fireEvent.click(screen.getByRole('button', { name: 'Preview Run' }));

		await waitFor(() => {
			expect(screen.getByText('Series preview ready')).toBeTruthy();
		});

		expect(screen.getAllByText('Why this Soldier was selected').length).toBeGreaterThan(0);
		expect(screen.queryByText('Why this pick')).toBeNull();
	});

	it('renders the active DA6 ranking policy in the policy summary step', async () => {
		renderWizard({
			advancedDutyTemplates: [
				makeAdvancedTemplate({
					softPreferences: [
						{ type: 'longest-break', enabled: true },
						{ type: 'separate-weekend-da6', enabled: true },
						{ type: 'include-holiday-donsa-da6', enabled: false }
					]
				})
			]
		});

		await openAdvancedPolicyReview();

		expect(screen.getByText(/DA6 ranking: Separate weekend DA6 sequence/)).toBeTruthy();
		expect(screen.queryByText(/preferred group/i)).toBeNull();
	});

	it('shows a fairness baseline notice when the template has no rotation baselines', async () => {
		renderWizard({
			advancedDutyTemplates: [makeAdvancedTemplate({ rotationBaselines: [] })]
		});

		await openAdvancedPolicyReview();

		expect(screen.getByText(/No baseline history yet/i)).toBeTruthy();
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

		expect(screen.queryByText(/No baseline history yet/i)).toBeNull();
	});

	it('shows candidate review as a distinct labeled workspace panel', async () => {
		renderWizard();

		await openAdvancedCandidateReview();

		const workspace = screen.getByRole('region', { name: 'Advanced duty review workspace' });
		expect(within(workspace).getByText('Candidate pool')).toBeTruthy();
		expect(within(workspace).getByRole('table', { name: 'Candidate review table' })).toBeTruthy();
	});

	it('leaves applied event inspection outside the wizard lanes', async () => {
		renderWizard();

		expect(screen.queryByText('Applied advanced duty events')).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Use Automatic Assignment Generator' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Use Staff Duty' }));
		await waitFor(() => {
			expect(screen.getByText('Assignments / Taskings')).toBeTruthy();
		});

		expect(screen.queryByText('Applied advanced duty events')).toBeNull();
	});
});
