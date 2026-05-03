// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import AppliedEventManager from './AppliedEventManager.svelte';
import type {
	AdvancedDutyRevisionHistoryEntry,
	AdvancedDutyRevisionDraftRecord,
	AdvancedDutyRevisionDraftSession,
	DutyEvent,
	DutyEventPreview
} from '../duty-roster.types';
import type { Personnel } from '$lib/types';

afterEach(() => {
	cleanup();
});

function makeEvent(): DutyEvent {
	return {
		id: 'event-1',
		orgId: 'test-org',
		runId: 'run-1',
		templateId: 'template-1',
		templateName: 'Battalion Staff Duty',
		eventDate: '2026-04-10',
		coverageMode: 'timed',
		coverageStart: '2026-04-10T08:00:00.000Z',
		coverageEnd: '2026-04-11T08:00:00.000Z',
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
				dutyEventId: 'event-1',
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
		run: null
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

function makePreview(assigneeId: string): DutyEventPreview {
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
		collisionSummary: { hasConflicts: false, conflicts: [] },
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
}): AdvancedDutyRevisionDraftSession {
	return {
		action: overrides.action,
		draft: makeDraft(overrides.draft),
		preview: makePreview(overrides.assigneeId ?? 'person-alpha')
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
			onDeleteAdvancedEvent: vi.fn(async () => true),
			onDeleteAdvancedRun: vi.fn(async () => null),
			onDeleteLegacyAdvancedGroup: vi.fn(async () => null)
		});

		expect(screen.getByText('No manual revisions recorded')).not.toBeNull();

		await fireEvent.click(screen.getAllByRole('button', { name: /open event/i })[0]);

		await waitFor(() => expect(onStartAdvancedRevisionDraft).toHaveBeenCalledWith({ dutyEventId: 'event-1' }));
		expect(screen.getByText(/Draft v3 pending/i)).not.toBeNull();
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
			onDeleteAdvancedEvent: vi.fn(async () => true),
			onDeleteAdvancedRun: vi.fn(async () => null),
			onDeleteLegacyAdvancedGroup: vi.fn(async () => null)
		});

		await fireEvent.click(screen.getAllByRole('button', { name: /open event/i })[0]);

		await waitFor(() => expect(onStartAdvancedRevisionDraft).toHaveBeenCalledWith({ dutyEventId: 'event-1' }));
		expect(screen.getByText(/Draft v1 pending/i)).not.toBeNull();
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
		expect(screen.getByText(/Draft v2 pending/i)).not.toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: /Discard Draft/i }));

		await waitFor(() => expect(onDiscardAdvancedRevisionDraft).toHaveBeenCalledWith({ dutyEventId: 'event-1' }));
		expect(screen.queryByText(/Draft v2 pending/i)).toBeNull();
	});
});
