// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import AppliedEventManager from './AppliedEventManager.svelte';
import type {
	AdvancedDutyRevisionHistoryEntry,
	AdvancedDutyRevisionDraftRecord,
	AdvancedDutyRevisionDraftSession,
	AdvancedDutyRevisionReapplyResult,
	DutyEvent,
	DutyEventPreview
} from '../duty-roster.types';
import type { Personnel } from '$lib/types';

afterEach(() => {
	cleanup();
});

function makeEvent(overrides: Partial<DutyEvent> = {}): DutyEvent {
	const id = overrides.id ?? 'event-1';
	const eventDate = overrides.eventDate ?? '2026-04-10';
	return {
		id,
		orgId: 'test-org',
		runId: 'run-1',
		templateId: 'template-1',
		templateName: 'Battalion Staff Duty',
		eventDate,
		coverageMode: 'timed',
		coverageStart: overrides.coverageStart ?? `${eventDate}T08:00:00.000Z`,
		coverageEnd: overrides.coverageEnd ?? `${eventDate}T20:00:00.000Z`,
		isBlocking: true,
		cooldownHours: 24,
		rulesSnapshot: {
			templateId: 'template-1',
			templateName: 'Battalion Staff Duty',
			templateStatus: 'active',
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			spansMidnight: true,
			scopeType: 'groups',
			scopeGroupIds: ['group-hq'],
			exemptPersonnelIds: [],
			exemptStatusTypeIds: [],
			isBlocking: true,
			cooldownHours: 24,
			slots: []
		},
		fillSummary: { totalSlots: 1, filledSlots: 1, unfilledSlots: 0 },
		collisionSummary: { hasConflicts: false, conflicts: [] },
		originalProposal: null,
		createdAt: '2026-04-10T00:00:00.000Z',
		updatedAt: '2026-04-10T00:00:00.000Z',
		slotInstances: [
			{
				id: 'event-slot-1',
				dutyEventId: id,
				templateSlotId: 'slot-nco',
				roleLabel: 'NCO',
				slotIndex: 0,
				assigneeId: 'person-alpha',
				assignmentSource: 'generated',
				warningState: 'none',
				fairnessConfidence: 'high',
				selectionReason: 'Generated from rotation.',
				unfilledReason: null,
				sortOrder: 0
			}
		],
		run: null,
		...overrides
	};
}

function makePersonnel(id: string, lastName: string): Personnel {
	return {
		id,
		rank: 'SGT',
		firstName: 'Test',
		lastName,
		mos: '11B',
		clinicRole: 'Squad Leader',
		groupId: 'group-hq',
		groupName: 'Headquarters'
	};
}

function makePreview(assigneeId: string, conflicts: string[] = []): DutyEventPreview {
	return {
		templateId: 'template-1',
		templateName: 'Battalion Staff Duty',
		eventDate: '2026-04-10',
		coverageMode: 'timed',
		coverageStart: '2026-04-10T08:00:00.000Z',
		coverageEnd: '2026-04-11T08:00:00.000Z',
		isBlocking: true,
		cooldownHours: 24,
		rulesSnapshot: makeEvent().rulesSnapshot,
		fillSummary: { totalSlots: 1, filledSlots: assigneeId ? 1 : 0, unfilledSlots: assigneeId ? 0 : 1 },
		collisionSummary: { hasConflicts: conflicts.length > 0, conflicts },
		slotInstances: [
			{
				templateSlotId: 'slot-nco',
				roleLabel: 'NCO',
				slotIndex: 0,
				assigneeId,
				assignmentSource: assigneeId === 'person-alpha' ? 'generated' : 'manual',
				warningState: 'none',
				fairnessConfidence: 'high',
				selectionReason: 'Selected for revision.',
				unfilledReason: null,
				sortOrder: 0
			}
		]
	};
}

function makeDraft(overrides: Partial<AdvancedDutyRevisionDraftRecord> = {}): AdvancedDutyRevisionDraftRecord {
	return {
		id: 'draft-1',
		orgId: 'test-org',
		appliedRunId: 'run-1',
		sourceSnapshotId: 'snapshot-1',
		sourceSnapshotFingerprint: 'fingerprint-1',
		sourceRunCreatedAt: '2026-04-10T00:00:00.000Z',
		sourceRunUpdatedAt: '2026-04-10T00:00:00.000Z',
		status: 'draft',
		slotChanges: [],
		reason: null,
		latestValidation: null,
		latestError: null,
		conflictSummary: null,
		draftVersion: 1,
		createdByUserId: 'user-1',
		updatedByUserId: 'user-1',
		appliedByUserId: null,
		discardedByUserId: null,
		expiresAt: '2026-04-17T00:00:00.000Z',
		discardCleanupAfter: null,
		appliedAt: null,
		discardedAt: null,
		createdAt: '2026-04-10T00:00:00.000Z',
		updatedAt: '2026-04-10T00:00:00.000Z',
		...overrides
	};
}

function makeSession(overrides: {
	action?: AdvancedDutyRevisionDraftSession['action'];
	assigneeId?: string;
	draft?: Partial<AdvancedDutyRevisionDraftRecord>;
	conflicts?: string[];
}): AdvancedDutyRevisionDraftSession {
	return {
		action: overrides.action,
		draft: makeDraft(overrides.draft),
		preview: makePreview(overrides.assigneeId ?? 'person-alpha', overrides.conflicts)
	};
}

function makeReapplyResult(
	overrides: Partial<AdvancedDutyRevisionReapplyResult> = {}
): AdvancedDutyRevisionReapplyResult {
	return {
		draft: makeDraft({ status: 'applied', appliedAt: '2026-04-11T18:30:00.000Z' }),
		changeSet: {
			id: 'change-set-1',
			orgId: 'test-org',
			appliedRunId: 'run-1',
			sourceDraftId: 'draft-1',
			sourceSnapshotId: 'snapshot-1',
			sourceSnapshotFingerprint: 'fingerprint-1',
			actorUserId: 'user-1',
			reason: 'Leader reviewed the change.',
			reviewableConflictsConfirmed: false,
			conflictSummary: null,
			warningSummary: null,
			appliedAt: '2026-04-11T18:30:00.000Z',
			createdAt: '2026-04-11T18:30:00.000Z'
		},
		slotChanges: [],
		updatedEvents: [makeEvent()],
		...overrides
	};
}

function makeRevisionHistory(): AdvancedDutyRevisionHistoryEntry[] {
	return [
		{
			id: 'change-set-1',
			appliedRunId: 'run-1',
			appliedAt: '2026-04-11T18:30:00.000Z',
			actorUserId: 'user-1',
			reason: 'Leader reviewed staff duty conflict.',
			changeCount: 1,
			changes: [
				{
					id: 'slot-change-1',
					orgId: 'test-org',
					changeSetId: 'change-set-1',
					dutyEventId: 'event-1',
					eventDate: '2026-04-10',
					slotKey: 'slot-nco:0',
					templateSlotId: 'slot-nco',
					roleLabel: 'NCO',
					slotIndex: 0,
					previousPersonnelId: 'person-alpha',
					newPersonnelId: 'person-bravo',
					previousPersonnelSnapshot: { rank: 'SGT', firstName: 'Alex', lastName: 'Alpha' },
					newPersonnelSnapshot: { rank: 'SSG', firstName: 'Blake', lastName: 'Bravo' },
					previousAssignmentSource: 'generated',
					newAssignmentSource: 'manual',
					previousWarningState: 'none',
					newWarningState: 'warning',
					changeIntent: 'assign',
					warningMetadata: null,
					conflictMetadata: null,
					createdAt: '2026-04-11T18:30:00.000Z'
				}
			]
		}
	];
}

describe('AppliedEventManager revision draft workflow', () => {
	it('renders compact revision history for applied runs without raw snapshot payloads', () => {
		const personnel = [makePersonnel('person-alpha', 'Alpha'), makePersonnel('person-bravo', 'Bravo')];

		const { container } = render(AppliedEventManager, {
			advancedDutyEvents: [makeEvent()],
			advancedDutySnapshots: [],
			advancedDutyRevisionHistory: makeRevisionHistory(),
			personnelById: new Map(personnel.map((person) => [person.id, person] as const)),
			previewPersonnelOptions: personnel,
			onStartAdvancedRevisionDraft: vi.fn(async () => makeSession({ action: 'created' })),
			onUpdateAdvancedRevisionDraft: vi.fn(async () => makeSession({ action: 'updated' })),
			onDiscardAdvancedRevisionDraft: vi.fn(async () => makeDraft({ status: 'discarded' })),
			onReapplyAdvancedRevisionDraft: vi.fn(async () => makeReapplyResult()),
			onDeleteAdvancedEvent: vi.fn(async () => true),
			onDeleteAdvancedRun: vi.fn(async () => null),
			onDeleteLegacyAdvancedGroup: vi.fn(async () => null)
		});

		expect(screen.getByText('Generated original')).not.toBeNull();
		expect(screen.getByText('Current applied state')).not.toBeNull();
		expect(screen.getByText('Leader reviewed staff duty conflict.')).not.toBeNull();
		expect(screen.getByText(/SGT Alex Alpha/i)).not.toBeNull();
		expect(screen.getByText(/SSG Blake Bravo/i)).not.toBeNull();
		expect(container.textContent).not.toContain('snapshotPayload');
		expect(container.textContent).not.toContain('fingerprint');
	});

	it('renders a clear empty revision history state while keeping pending drafts visible', async () => {
		const onStartAdvancedRevisionDraft = vi.fn(async () =>
			makeSession({
				action: 'reopened',
				draft: {
					draftVersion: 3,
					slotChanges: [{ eventDate: '2026-04-10', slotKey: 'slot-nco:0', newPersonnelId: 'person-bravo' }]
				}
			})
		);
		const personnel = [makePersonnel('person-alpha', 'Alpha'), makePersonnel('person-bravo', 'Bravo')];

		render(AppliedEventManager, {
			advancedDutyEvents: [makeEvent()],
			advancedDutySnapshots: [],
			advancedDutyRevisionHistory: [],
			personnelById: new Map(personnel.map((person) => [person.id, person] as const)),
			previewPersonnelOptions: personnel,
			onStartAdvancedRevisionDraft,
			onUpdateAdvancedRevisionDraft: vi.fn(async () => makeSession({ action: 'updated' })),
			onDiscardAdvancedRevisionDraft: vi.fn(async () => makeDraft({ status: 'discarded' })),
			onReapplyAdvancedRevisionDraft: vi.fn(async () => makeReapplyResult()),
			onDeleteAdvancedEvent: vi.fn(async () => true),
			onDeleteAdvancedRun: vi.fn(async () => null),
			onDeleteLegacyAdvancedGroup: vi.fn(async () => null)
		});

		expect(screen.getByText('No manual revisions recorded')).not.toBeNull();

		await fireEvent.click(screen.getAllByRole('button', { name: /open event/i })[0]);

		await waitFor(() => expect(onStartAdvancedRevisionDraft).toHaveBeenCalledWith({ dutyEventId: 'event-1' }));
		expect(screen.getAllByText(/Draft v3 pending/i).length).toBeGreaterThan(0);
	});

	it('shows pending draft state across an applied run and can open a changed date', async () => {
		const personnel = [makePersonnel('person-alpha', 'Alpha'), makePersonnel('person-bravo', 'Bravo')];
		const runDraft = makeDraft({
			draftVersion: 4,
			slotChanges: [
				{
					eventDate: '2026-04-10',
					slotKey: 'slot-nco:0',
					roleLabel: 'NCO',
					slotIndex: 0,
					newPersonnelId: 'person-bravo'
				},
				{
					eventDate: '2026-04-11',
					slotKey: 'slot-nco:0',
					roleLabel: 'NCO',
					slotIndex: 0,
					newPersonnelId: null
				}
			]
		});
		const onStartAdvancedRevisionDraft = vi.fn(async () =>
			makeSession({
				action: 'reopened',
				draft: runDraft
			})
		);

		render(AppliedEventManager, {
			advancedDutyEvents: [
				makeEvent(),
				makeEvent({
					id: 'event-2',
					eventDate: '2026-04-11',
					coverageStart: '2026-04-11T08:00:00.000Z',
					coverageEnd: '2026-04-11T20:00:00.000Z'
				})
			],
			advancedDutySnapshots: [],
			advancedDutyRevisionDrafts: [runDraft],
			personnelById: new Map(personnel.map((person) => [person.id, person] as const)),
			previewPersonnelOptions: personnel,
			onStartAdvancedRevisionDraft,
			onUpdateAdvancedRevisionDraft: vi.fn(async () => makeSession({ action: 'updated' })),
			onDiscardAdvancedRevisionDraft: vi.fn(async () => makeDraft({ status: 'discarded' })),
			onReapplyAdvancedRevisionDraft: vi.fn(async () => makeReapplyResult()),
			onDeleteAdvancedEvent: vi.fn(async () => true),
			onDeleteAdvancedRun: vi.fn(async () => null),
			onDeleteLegacyAdvancedGroup: vi.fn(async () => null)
		});

		expect(screen.getByText('Draft pending')).not.toBeNull();
		expect(screen.getByText(/Revision draft v4 pending/i)).not.toBeNull();
		expect(screen.getByText(/2 staged changes/i)).not.toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: /Open Event Apr 10, 2026/i }));

		await waitFor(() => expect(screen.getAllByText(/Draft v4 pending/i).length).toBeGreaterThan(0));
		expect(screen.getByRole('button', { name: /Apr 10, 2026 NCO #1 SGT Bravo/i })).not.toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: /Apr 11, 2026 NCO #1 Unfilled/i }));

		await waitFor(() => expect(onStartAdvancedRevisionDraft).toHaveBeenLastCalledWith({ dutyEventId: 'event-2' }));
	});

	it('opens, updates, and discards a revision draft without calling direct event update handlers', async () => {
		const onStartAdvancedRevisionDraft = vi.fn(async () => makeSession({ action: 'created' }));
		const onUpdateAdvancedRevisionDraft = vi.fn(async () =>
			makeSession({
				action: 'updated',
				assigneeId: 'person-bravo',
				draft: {
					draftVersion: 2,
					slotChanges: [{ eventDate: '2026-04-10', slotKey: 'slot-nco:0', newPersonnelId: 'person-bravo' }]
				}
			})
		);
		const onDiscardAdvancedRevisionDraft = vi.fn(async () =>
			makeDraft({ status: 'discarded', discardedAt: '2026-04-10T02:00:00.000Z' })
		);
		const personnel = [makePersonnel('person-alpha', 'Alpha'), makePersonnel('person-bravo', 'Bravo')];

		render(AppliedEventManager, {
			advancedDutyEvents: [makeEvent()],
			advancedDutySnapshots: [],
			personnelById: new Map(personnel.map((person) => [person.id, person] as const)),
			previewPersonnelOptions: personnel,
			onStartAdvancedRevisionDraft,
			onUpdateAdvancedRevisionDraft,
			onDiscardAdvancedRevisionDraft,
			onReapplyAdvancedRevisionDraft: vi.fn(async () => makeReapplyResult()),
			onDeleteAdvancedEvent: vi.fn(async () => true),
			onDeleteAdvancedRun: vi.fn(async () => null),
			onDeleteLegacyAdvancedGroup: vi.fn(async () => null)
		});

		await fireEvent.click(screen.getAllByRole('button', { name: /open event/i })[0]);

		await waitFor(() => expect(onStartAdvancedRevisionDraft).toHaveBeenCalledWith({ dutyEventId: 'event-1' }));
		expect(screen.getAllByText(/Draft v1 pending/i).length).toBeGreaterThan(0);
		expect(screen.getByRole<HTMLButtonElement>('button', { name: /Draft Autosaved/i }).disabled).toBe(true);

		await fireEvent.change(screen.getByLabelText(/Assignee for/i), { target: { value: 'person-bravo' } });

		await waitFor(() =>
			expect(onUpdateAdvancedRevisionDraft).toHaveBeenCalledWith({
				dutyEventId: 'event-1',
				slotOverrides: [
					{
						templateSlotId: 'slot-nco',
						slotIndex: 0,
						assigneeId: 'person-bravo',
						assignmentSource: 'manual'
					}
				]
			})
		);
		expect(screen.getAllByText(/Draft v2 pending/i).length).toBeGreaterThan(0);

		await fireEvent.click(screen.getByRole('button', { name: /Discard Draft/i }));

		await waitFor(() => expect(onDiscardAdvancedRevisionDraft).toHaveBeenCalledWith({ dutyEventId: 'event-1' }));
		expect(screen.queryByText(/Draft v2 pending/i)).toBeNull();
	});

	it('clears the run-level draft indicator when discarding a pending draft', async () => {
		const onDiscardAdvancedRevisionDraft = vi.fn(async () =>
			makeDraft({ status: 'discarded', discardedAt: '2026-04-10T02:00:00.000Z' })
		);
		const personnel = [makePersonnel('person-alpha', 'Alpha'), makePersonnel('person-bravo', 'Bravo')];

		render(AppliedEventManager, {
			advancedDutyEvents: [makeEvent()],
			advancedDutySnapshots: [],
			advancedDutyRevisionDrafts: [
				makeDraft({
					slotChanges: [{ eventDate: '2026-04-10', slotKey: 'slot-nco:0', newPersonnelId: 'person-bravo' }]
				})
			],
			personnelById: new Map(personnel.map((person) => [person.id, person] as const)),
			previewPersonnelOptions: personnel,
			onStartAdvancedRevisionDraft: vi.fn(async () =>
				makeSession({
					action: 'reopened',
					draft: {
						slotChanges: [{ eventDate: '2026-04-10', slotKey: 'slot-nco:0', newPersonnelId: 'person-bravo' }]
					}
				})
			),
			onUpdateAdvancedRevisionDraft: vi.fn(async () => makeSession({ action: 'updated' })),
			onDiscardAdvancedRevisionDraft,
			onReapplyAdvancedRevisionDraft: vi.fn(async () => makeReapplyResult()),
			onDeleteAdvancedEvent: vi.fn(async () => true),
			onDeleteAdvancedRun: vi.fn(async () => null),
			onDeleteLegacyAdvancedGroup: vi.fn(async () => null)
		});

		expect(screen.getByText('Draft pending')).not.toBeNull();

		await fireEvent.click(screen.getAllByRole('button', { name: /open event/i })[0]);
		await fireEvent.click(await screen.findByRole('button', { name: /Discard Draft/i }));

		await waitFor(() => expect(onDiscardAdvancedRevisionDraft).toHaveBeenCalledWith({ dutyEventId: 'event-1' }));
		expect(screen.queryByText('Draft pending')).toBeNull();
	});

	it('requires a reason before reapplying a staged revision draft', async () => {
		const onReapplyAdvancedRevisionDraft = vi.fn(async () => makeReapplyResult());
		const personnel = [makePersonnel('person-alpha', 'Alpha'), makePersonnel('person-bravo', 'Bravo')];

		render(AppliedEventManager, {
			advancedDutyEvents: [makeEvent()],
			advancedDutySnapshots: [],
			personnelById: new Map(personnel.map((person) => [person.id, person] as const)),
			previewPersonnelOptions: personnel,
			onStartAdvancedRevisionDraft: vi.fn(async () =>
				makeSession({
					action: 'reopened',
					draft: {
						draftVersion: 2,
						slotChanges: [{ eventDate: '2026-04-10', slotKey: 'slot-nco:0', newPersonnelId: 'person-bravo' }]
					}
				})
			),
			onUpdateAdvancedRevisionDraft: vi.fn(async () => makeSession({ action: 'updated' })),
			onDiscardAdvancedRevisionDraft: vi.fn(async () => makeDraft({ status: 'discarded' })),
			onReapplyAdvancedRevisionDraft,
			onDeleteAdvancedEvent: vi.fn(async () => true),
			onDeleteAdvancedRun: vi.fn(async () => null),
			onDeleteLegacyAdvancedGroup: vi.fn(async () => null)
		});

		await fireEvent.click(screen.getAllByRole('button', { name: /open event/i })[0]);
		await fireEvent.click(await screen.findByRole('button', { name: /Reapply Revision/i }));

		expect(onReapplyAdvancedRevisionDraft).not.toHaveBeenCalled();
		expect(screen.getByRole('alert').textContent).toContain('Enter a reason');
	});

	it('requires reviewable-conflict confirmation before reapplying', async () => {
		const onReapplyAdvancedRevisionDraft = vi.fn(async () => makeReapplyResult());
		const personnel = [makePersonnel('person-alpha', 'Alpha'), makePersonnel('person-bravo', 'Bravo')];

		render(AppliedEventManager, {
			advancedDutyEvents: [makeEvent()],
			advancedDutySnapshots: [],
			personnelById: new Map(personnel.map((person) => [person.id, person] as const)),
			previewPersonnelOptions: personnel,
			onStartAdvancedRevisionDraft: vi.fn(async () =>
				makeSession({
					action: 'reopened',
					conflicts: ['SPC Bravo has an overlapping advanced duty.'],
					draft: {
						slotChanges: [{ eventDate: '2026-04-10', slotKey: 'slot-nco:0', newPersonnelId: 'person-bravo' }]
					}
				})
			),
			onUpdateAdvancedRevisionDraft: vi.fn(async () => makeSession({ action: 'updated' })),
			onDiscardAdvancedRevisionDraft: vi.fn(async () => makeDraft({ status: 'discarded' })),
			onReapplyAdvancedRevisionDraft,
			onDeleteAdvancedEvent: vi.fn(async () => true),
			onDeleteAdvancedRun: vi.fn(async () => null),
			onDeleteLegacyAdvancedGroup: vi.fn(async () => null)
		});

		await fireEvent.click(screen.getAllByRole('button', { name: /open event/i })[0]);
		await fireEvent.input(await screen.findByLabelText('Reason'), {
			target: { value: 'Leader reviewed the conflict.' }
		});
		await fireEvent.click(screen.getByRole('button', { name: /Reapply Revision/i }));

		expect(onReapplyAdvancedRevisionDraft).not.toHaveBeenCalled();
		expect(screen.getByRole('alert').textContent).toContain('Confirm reviewable conflicts');

		await fireEvent.click(screen.getByRole('checkbox', { name: /I reviewed the conflicts/i }));
		await fireEvent.click(screen.getByRole('button', { name: /Reapply Revision/i }));

		await waitFor(() =>
			expect(onReapplyAdvancedRevisionDraft).toHaveBeenCalledWith({
				dutyEventId: 'event-1',
				reason: 'Leader reviewed the conflict.',
				reviewableConflictsConfirmed: true
			})
		);
	});

	it('reapplies a staged draft and closes the editor on success', async () => {
		const onReapplyAdvancedRevisionDraft = vi.fn(async () => makeReapplyResult());
		const personnel = [makePersonnel('person-alpha', 'Alpha'), makePersonnel('person-bravo', 'Bravo')];

		render(AppliedEventManager, {
			advancedDutyEvents: [makeEvent()],
			advancedDutySnapshots: [],
			personnelById: new Map(personnel.map((person) => [person.id, person] as const)),
			previewPersonnelOptions: personnel,
			onStartAdvancedRevisionDraft: vi.fn(async () =>
				makeSession({
					action: 'reopened',
					draft: {
						slotChanges: [{ eventDate: '2026-04-10', slotKey: 'slot-nco:0', newPersonnelId: 'person-bravo' }]
					}
				})
			),
			onUpdateAdvancedRevisionDraft: vi.fn(async () => makeSession({ action: 'updated' })),
			onDiscardAdvancedRevisionDraft: vi.fn(async () => makeDraft({ status: 'discarded' })),
			onReapplyAdvancedRevisionDraft,
			onDeleteAdvancedEvent: vi.fn(async () => true),
			onDeleteAdvancedRun: vi.fn(async () => null),
			onDeleteLegacyAdvancedGroup: vi.fn(async () => null)
		});

		await fireEvent.click(screen.getAllByRole('button', { name: /open event/i })[0]);
		await fireEvent.input(await screen.findByLabelText('Reason'), {
			target: { value: 'Leader reviewed the change.' }
		});
		await fireEvent.click(screen.getByRole('button', { name: /Reapply Revision/i }));

		await waitFor(() => expect(onReapplyAdvancedRevisionDraft).toHaveBeenCalled());
		await waitFor(() => expect(screen.queryByText(/Draft v/i)).toBeNull());
	});

	it('shows backend hard-conflict errors inside the editor', async () => {
		const onReapplyAdvancedRevisionDraft = vi.fn(async () => {
			throw new Error('Draft slot has a hard conflict.');
		});
		const personnel = [makePersonnel('person-alpha', 'Alpha'), makePersonnel('person-bravo', 'Bravo')];

		render(AppliedEventManager, {
			advancedDutyEvents: [makeEvent()],
			advancedDutySnapshots: [],
			personnelById: new Map(personnel.map((person) => [person.id, person] as const)),
			previewPersonnelOptions: personnel,
			onStartAdvancedRevisionDraft: vi.fn(async () =>
				makeSession({
					action: 'reopened',
					draft: {
						slotChanges: [{ eventDate: '2026-04-10', slotKey: 'slot-nco:0', newPersonnelId: 'person-bravo' }]
					}
				})
			),
			onUpdateAdvancedRevisionDraft: vi.fn(async () => makeSession({ action: 'updated' })),
			onDiscardAdvancedRevisionDraft: vi.fn(async () => makeDraft({ status: 'discarded' })),
			onReapplyAdvancedRevisionDraft,
			onDeleteAdvancedEvent: vi.fn(async () => true),
			onDeleteAdvancedRun: vi.fn(async () => null),
			onDeleteLegacyAdvancedGroup: vi.fn(async () => null)
		});

		await fireEvent.click(screen.getAllByRole('button', { name: /open event/i })[0]);
		await fireEvent.input(await screen.findByLabelText('Reason'), {
			target: { value: 'Leader reviewed the change.' }
		});
		await fireEvent.click(screen.getByRole('button', { name: /Reapply Revision/i }));

		await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Draft slot has a hard conflict.'));
	});
});
