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
	DutyEventSeriesPreview,
	DutyTemplate
} from '../duty-roster.types';

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
				selectionReason: 'Selected by longest break in rotation pool "staff-duty-primary". Fairness confidence is low because not every eligible person has seeded or historical service data yet.',
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
				selectionReason: 'Selected by longest break in rotation pool "staff-duty-primary". Fairness confidence is low because not every eligible person has seeded or historical service data yet.',
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
			makePreview({ eventDate: '2026-04-07', coverageStart: '2026-04-07T08:00:00', coverageEnd: '2026-04-08T08:00:00' }),
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
			personnelByGroup: [] as { group: string; personnel: Personnel[] }[],
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
		expect(screen.getByText('2026-04-07T08:00:00 to 2026-04-08T08:00:00')).toBeTruthy();
		expect(screen.getByText('2026-04-09T08:00:00 to 2026-04-10T08:00:00')).toBeTruthy();
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
});
