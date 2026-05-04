import { describe, expect, it } from 'vitest';
import type { AdvancedDutyRevisionDraftRecord, DutyEvent, DutyEventPreview } from '../duty-roster.types';
import {
	advancedDutyRevisionDraftSlotChangesToOverrides,
	advancedDutyRevisionSlotIdentity,
	buildAdvancedDutyRevisionDraftChangeFromOverride,
	buildAdvancedDutyRevisionHistoryModel,
	deriveAdvancedDutyRevisionChangeSet,
	discardAdvancedDutyRevisionDraft,
	startAdvancedDutyRevisionDraft,
	updateAdvancedDutyRevisionDraftSlotChange,
	validateAdvancedDutyRevisionReapply
} from './advancedDutyRevision';

function createDraft(overrides: Partial<AdvancedDutyRevisionDraftRecord> = {}): AdvancedDutyRevisionDraftRecord {
	return {
		id: 'draft-1',
		orgId: 'org-1',
		appliedRunId: 'run-1',
		sourceSnapshotId: 'snapshot-1',
		sourceSnapshotFingerprint: 'fingerprint-1',
		sourceRunCreatedAt: '2026-05-01T00:00:00.000Z',
		sourceRunUpdatedAt: '2026-05-01T01:00:00.000Z',
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
		expiresAt: '2026-05-09T00:00:00.000Z',
		discardCleanupAfter: null,
		appliedAt: null,
		discardedAt: null,
		createdAt: '2026-05-02T00:00:00.000Z',
		updatedAt: '2026-05-02T00:00:00.000Z',
		...overrides
	};
}

function createRulesSnapshot() {
	return {
		templateId: 'template-1',
		templateName: 'Staff Duty',
		templateStatus: 'active',
		coverageMode: 'all-day',
		startTime: null,
		endTime: null,
		scopeType: 'organization',
		scopeGroupIds: [],
		exemptPersonnelIds: [],
		exemptStatusTypeIds: [],
		isBlocking: true,
		cooldownHours: 24,
		slots: [
			{
				templateSlotId: 'template-slot-1',
				roleLabel: 'Staff Duty',
				quantity: 1,
				allowedRanks: [],
				allowedGroupIds: [],
				preferredGroupIds: [],
				allowedMosValues: [],
				allowedRoleValues: [],
				rotationPoolKey: 'staff-duty',
				sortOrder: 0
			}
		]
	} satisfies DutyEventPreview['rulesSnapshot'];
}

function createDutyEvent(): DutyEvent {
	return {
		id: 'event-1',
		orgId: 'org-1',
		runId: 'run-1',
		templateId: 'template-1',
		templateName: 'Staff Duty',
		eventDate: '2026-05-04',
		coverageMode: 'all-day',
		coverageStart: '2026-05-04T00:00:00.000Z',
		coverageEnd: '2026-05-05T00:00:00.000Z',
		isBlocking: true,
		cooldownHours: 24,
		rulesSnapshot: createRulesSnapshot(),
		fillSummary: { totalSlots: 1, filledSlots: 1, unfilledSlots: 0 },
		collisionSummary: { hasConflicts: false, conflicts: [] },
		originalProposal: null,
		createdAt: '2026-05-02T00:00:00.000Z',
		updatedAt: '2026-05-02T00:00:00.000Z',
		slotInstances: []
	};
}

function createPreview(): DutyEventPreview {
	return {
		templateId: 'template-1',
		templateName: 'Staff Duty',
		eventDate: '2026-05-04',
		coverageMode: 'all-day',
		coverageStart: '2026-05-04T00:00:00.000Z',
		coverageEnd: '2026-05-05T00:00:00.000Z',
		isBlocking: true,
		cooldownHours: 24,
		rulesSnapshot: createRulesSnapshot(),
		fillSummary: { totalSlots: 1, filledSlots: 1, unfilledSlots: 0 },
		collisionSummary: { hasConflicts: false, conflicts: [] },
		slotInstances: [
			{
				templateSlotId: 'template-slot-1',
				roleLabel: 'Staff Duty',
				slotIndex: 0,
				assigneeId: 'person-2',
				assignmentSource: 'manual',
				warningState: 'warning',
				fairnessConfidence: 'medium',
				selectionReason: 'Manual override',
				unfilledReason: null,
				sortOrder: 0
			}
		]
	};
}

describe('advanced duty revision drafts', () => {
	it('reopens the active draft for an applied run instead of creating a parallel draft', () => {
		const first = startAdvancedDutyRevisionDraft({
			appliedRun: {
				id: 'run-1',
				orgId: 'org-1',
				sourceSnapshotId: 'snapshot-1',
				sourceSnapshotFingerprint: 'fingerprint-1',
				createdAt: '2026-05-01T00:00:00.000Z',
				updatedAt: '2026-05-01T01:00:00.000Z'
			},
			existingDrafts: [],
			actorUserId: 'user-1',
			now: '2026-05-02T00:00:00.000Z',
			makeId: () => 'draft-1'
		});

		const reopened = startAdvancedDutyRevisionDraft({
			appliedRun: {
				id: 'run-1',
				orgId: 'org-1',
				sourceSnapshotId: 'snapshot-1',
				sourceSnapshotFingerprint: 'fingerprint-1',
				createdAt: '2026-05-01T00:00:00.000Z',
				updatedAt: '2026-05-01T01:00:00.000Z'
			},
			existingDrafts: [first.draft],
			actorUserId: 'user-2',
			now: '2026-05-02T00:05:00.000Z',
			makeId: () => 'draft-2'
		});

		expect(first.action).toBe('created');
		expect(reopened.action).toBe('reopened');
		expect(reopened.draft.id).toBe('draft-1');
		expect(reopened.draft.updatedByUserId).toBe('user-2');
		expect(reopened.draft.draftVersion).toBe(1);
	});

	it('stores only the latest desired slot change per event date and slot key across a multi-date run', () => {
		const draft = createDraft();
		const firstDate = updateAdvancedDutyRevisionDraftSlotChange({
			draft,
			actorUserId: 'user-2',
			now: '2026-05-02T00:10:00.000Z',
			change: {
				eventDate: '2026-05-04',
				slotKey: 'staff-duty:0',
				dutyEventId: 'event-1',
				templateSlotId: 'template-slot-1',
				roleLabel: 'Staff Duty',
				slotIndex: 0,
				newPersonnelId: 'person-2',
				assignmentSource: 'manual',
				warningState: 'warning',
				changeIntent: 'assign'
			}
		});

		const secondDate = updateAdvancedDutyRevisionDraftSlotChange({
			draft: firstDate,
			actorUserId: 'user-2',
			now: '2026-05-02T00:15:00.000Z',
			change: {
				eventDate: '2026-05-05',
				slotKey: 'staff-duty:0',
				dutyEventId: 'event-2',
				templateSlotId: 'template-slot-1',
				roleLabel: 'Staff Duty',
				slotIndex: 0,
				newPersonnelId: 'person-3',
				assignmentSource: 'manual',
				warningState: 'none',
				changeIntent: 'assign'
			}
		});

		const replacedFirstDate = updateAdvancedDutyRevisionDraftSlotChange({
			draft: secondDate,
			actorUserId: 'user-3',
			now: '2026-05-02T00:20:00.000Z',
			change: {
				eventDate: '2026-05-04',
				slotKey: 'staff-duty:0',
				dutyEventId: 'event-1',
				templateSlotId: 'template-slot-1',
				roleLabel: 'Staff Duty',
				slotIndex: 0,
				newPersonnelId: null,
				assignmentSource: null,
				warningState: 'none',
				changeIntent: 'clear'
			}
		});

		expect(replacedFirstDate.slotChanges).toEqual([
			expect.objectContaining({
				eventDate: '2026-05-04',
				slotKey: 'staff-duty:0',
				newPersonnelId: null,
				changeIntent: 'clear'
			}),
			expect.objectContaining({
				eventDate: '2026-05-05',
				slotKey: 'staff-duty:0',
				newPersonnelId: 'person-3',
				changeIntent: 'assign'
			})
		]);
		expect(replacedFirstDate.draftVersion).toBe(4);
		expect(replacedFirstDate.updatedByUserId).toBe('user-3');
	});

	it('converts revision draft slot changes into editor overrides inside the revision module', () => {
		const draft = createDraft({
			slotChanges: [
				{
					eventDate: '2026-05-04',
					slotKey: 'staff-duty:0',
					templateSlotId: 'template-slot-1',
					slotIndex: 0,
					newPersonnelId: 'person-2',
					assignmentSource: 'manual',
					warningState: 'none',
					changeIntent: 'assign'
				},
				{
					eventDate: '2026-05-04',
					slotKey: 'staff-duty:1',
					templateSlotId: 'template-slot-2',
					slotIndex: 1,
					newPersonnelId: null,
					assignmentSource: 'locked',
					warningState: 'none',
					changeIntent: 'lock-open'
				}
			]
		});

		expect(advancedDutyRevisionDraftSlotChangesToOverrides(draft)).toEqual([
			{
				templateSlotId: 'template-slot-1',
				slotIndex: 0,
				assigneeId: 'person-2',
				assignmentSource: 'manual'
			},
			{
				templateSlotId: 'template-slot-2',
				slotIndex: 1,
				assigneeId: null,
				assignmentSource: 'locked'
			}
		]);
	});

	it('filters editor overrides to one event date inside the revision module', () => {
		const draft = createDraft({
			slotChanges: [
				{
					eventDate: '2026-05-04',
					slotKey: 'staff-duty:0',
					templateSlotId: 'template-slot-1',
					slotIndex: 0,
					newPersonnelId: 'person-2',
					assignmentSource: 'manual',
					warningState: 'none',
					changeIntent: 'assign'
				},
				{
					eventDate: '2026-05-05',
					slotKey: 'staff-duty:0',
					templateSlotId: 'template-slot-1',
					slotIndex: 0,
					newPersonnelId: 'person-3',
					assignmentSource: 'manual',
					warningState: 'none',
					changeIntent: 'assign'
				}
			]
		});

		expect(advancedDutyRevisionDraftSlotChangesToOverrides(draft, '2026-05-04')).toEqual([
			{
				templateSlotId: 'template-slot-1',
				slotIndex: 0,
				assigneeId: 'person-2',
				assignmentSource: 'manual'
			}
		]);
	});

	it('derives a revision draft slot change from the previewed override result', () => {
		const change = buildAdvancedDutyRevisionDraftChangeFromOverride({
			event: createDutyEvent(),
			preview: createPreview(),
			override: {
				templateSlotId: 'template-slot-1',
				slotIndex: 0,
				assigneeId: 'person-2',
				assignmentSource: 'manual'
			}
		});

		expect(change).toEqual({
			eventDate: '2026-05-04',
			slotKey: 'template-slot-1:0',
			dutyEventId: 'event-1',
			templateSlotId: 'template-slot-1',
			roleLabel: 'Staff Duty',
			slotIndex: 0,
			newPersonnelId: 'person-2',
			assignmentSource: 'manual',
			warningState: 'warning',
			changeIntent: 'assign'
		});
		expect(advancedDutyRevisionSlotIdentity(change)).toBe('2026-05-04::template-slot-1:0');
	});

	it('derives compact change sets without copying full run snapshots', () => {
		const draft = createDraft({
			reason: 'Appointment conflict',
			slotChanges: [
				{
					eventDate: '2026-05-04',
					slotKey: 'staff-duty:0',
					dutyEventId: 'event-1',
					templateSlotId: 'template-slot-1',
					roleLabel: 'Staff Duty',
					slotIndex: 0,
					newPersonnelId: 'person-2',
					assignmentSource: 'manual',
					warningState: 'warning',
					changeIntent: 'assign',
					warningMetadata: { cooldownHours: 12 }
				},
				{
					eventDate: '2026-05-05',
					slotKey: 'staff-duty:0',
					dutyEventId: 'event-2',
					templateSlotId: 'template-slot-1',
					roleLabel: 'Staff Duty',
					slotIndex: 0,
					newPersonnelId: 'person-1',
					assignmentSource: 'generated',
					warningState: 'none',
					changeIntent: 'assign'
				}
			]
		});

		const result = deriveAdvancedDutyRevisionChangeSet({
			draft,
			appliedSlots: [
				{
					eventDate: '2026-05-04',
					slotKey: 'staff-duty:0',
					dutyEventId: 'event-1',
					templateSlotId: 'template-slot-1',
					roleLabel: 'Staff Duty',
					slotIndex: 0,
					personnelId: 'person-1',
					personnelSnapshot: { rank: 'SGT', firstName: 'Ava', lastName: 'Stone', groupLabel: 'HQ' },
					assignmentSource: 'generated',
					warningState: 'none'
				},
				{
					eventDate: '2026-05-05',
					slotKey: 'staff-duty:0',
					dutyEventId: 'event-2',
					templateSlotId: 'template-slot-1',
					roleLabel: 'Staff Duty',
					slotIndex: 0,
					personnelId: 'person-1',
					personnelSnapshot: { rank: 'SGT', firstName: 'Ava', lastName: 'Stone', groupLabel: 'HQ' },
					assignmentSource: 'generated',
					warningState: 'none'
				}
			],
			personnelSnapshots: {
				'person-2': { rank: 'SSG', firstName: 'Mia', lastName: 'Reed', groupLabel: 'HQ' }
			},
			reason: 'Appointment conflict',
			actorUserId: 'user-2',
			now: '2026-05-03T00:00:00.000Z',
			makeChangeSetId: () => 'change-set-1',
			makeSlotChangeId: () => 'slot-change-1'
		});

		expect(result.changeSet).toMatchObject({
			id: 'change-set-1',
			appliedRunId: 'run-1',
			sourceDraftId: 'draft-1',
			reason: 'Appointment conflict',
			actorUserId: 'user-2'
		});
		expect(result.slotChanges).toEqual([
			expect.objectContaining({
				eventDate: '2026-05-04',
				slotKey: 'staff-duty:0',
				previousPersonnelId: 'person-1',
				newPersonnelId: 'person-2',
				previousPersonnelSnapshot: { rank: 'SGT', firstName: 'Ava', lastName: 'Stone', groupLabel: 'HQ' },
				newPersonnelSnapshot: { rank: 'SSG', firstName: 'Mia', lastName: 'Reed', groupLabel: 'HQ' },
				changeIntent: 'assign',
				warningMetadata: { cooldownHours: 12 }
			})
		]);
		expect(JSON.stringify(result)).not.toContain('snapshotPayload');
		expect(JSON.stringify(result)).not.toContain('previewPayload');
	});

	it('classifies hard and reviewable reapply conflicts from already-loaded facts', () => {
		const draft = createDraft({
			reason: 'Appointment conflict',
			slotChanges: [
				{
					eventDate: '2026-05-04',
					slotKey: 'staff-duty:0',
					roleLabel: 'Staff Duty',
					slotIndex: 0,
					newPersonnelId: 'person-missing',
					assignmentSource: 'manual',
					warningState: 'conflict',
					changeIntent: 'assign'
				},
				{
					eventDate: '2026-05-05',
					slotKey: 'staff-duty:0',
					roleLabel: 'Staff Duty',
					slotIndex: 0,
					newPersonnelId: 'person-2',
					assignmentSource: 'manual',
					warningState: 'warning',
					changeIntent: 'assign'
				}
			]
		});

		const result = validateAdvancedDutyRevisionReapply({
			draft,
			canReapply: true,
			readOnly: false,
			reason: 'Appointment conflict',
			reviewableConflictsConfirmed: false,
			appliedSlots: [
				{ eventDate: '2026-05-04', slotKey: 'staff-duty:0' },
				{ eventDate: '2026-05-05', slotKey: 'staff-duty:0' }
			],
			personnel: {
				'person-2': { archived: false }
			},
			reviewableConflictsBySlotKey: {
				'2026-05-05::staff-duty:0': [{ code: 'overlapping-duty', message: 'Soldier has overlapping duty.' }]
			}
		});

		expect(result.canReapply).toBe(false);
		expect(result.hardConflicts).toEqual([
			{
				code: 'missing-soldier',
				message: 'Selected Soldier is no longer available in this Organization.',
				eventDate: '2026-05-04',
				slotKey: 'staff-duty:0'
			}
		]);
		expect(result.reviewableConflicts).toEqual([
			{
				code: 'overlapping-duty',
				message: 'Soldier has overlapping duty.',
				eventDate: '2026-05-05',
				slotKey: 'staff-duty:0'
			}
		]);
		expect(result.requiresReviewableConflictConfirmation).toBe(true);
	});

	it('requires a human reason before reapply and allows confirmed reviewable conflicts', () => {
		const draft = createDraft({
			slotChanges: [
				{
					eventDate: '2026-05-05',
					slotKey: 'staff-duty:0',
					roleLabel: 'Staff Duty',
					slotIndex: 0,
					newPersonnelId: 'person-2',
					assignmentSource: 'manual',
					warningState: 'warning',
					changeIntent: 'assign'
				}
			]
		});

		const withoutReason = validateAdvancedDutyRevisionReapply({
			draft,
			canReapply: true,
			readOnly: false,
			reason: '   ',
			reviewableConflictsConfirmed: true,
			appliedSlots: [{ eventDate: '2026-05-05', slotKey: 'staff-duty:0' }],
			personnel: { 'person-2': { archived: false } },
			reviewableConflictsBySlotKey: {
				'2026-05-05::staff-duty:0': [{ code: 'cooldown', message: 'Cooldown warning.' }]
			}
		});
		const withReason = validateAdvancedDutyRevisionReapply({
			draft,
			canReapply: true,
			readOnly: false,
			reason: 'Commander approved replacement.',
			reviewableConflictsConfirmed: true,
			appliedSlots: [{ eventDate: '2026-05-05', slotKey: 'staff-duty:0' }],
			personnel: { 'person-2': { archived: false } },
			reviewableConflictsBySlotKey: {
				'2026-05-05::staff-duty:0': [{ code: 'cooldown', message: 'Cooldown warning.' }]
			}
		});

		expect(withoutReason.canReapply).toBe(false);
		expect(withoutReason.reasonRequired).toBe(true);
		expect(withReason.canReapply).toBe(true);
		expect(withReason.requiresReviewableConflictConfirmation).toBe(false);
	});

	it('discards draft working state without creating applied history', () => {
		const result = discardAdvancedDutyRevisionDraft({
			draft: createDraft({ slotChanges: [{ eventDate: '2026-05-04', slotKey: 'staff-duty:0' }] }),
			actorUserId: 'user-2',
			now: '2026-05-02T00:00:00.000Z'
		});

		expect(result).toMatchObject({
			status: 'discarded',
			discardedByUserId: 'user-2',
			discardedAt: '2026-05-02T00:00:00.000Z',
			updatedByUserId: 'user-2'
		});
		expect(result.discardCleanupAfter).toBe('2026-06-01T00:00:00.000Z');
		expect(result.appliedAt).toBeNull();
	});

	it('builds formatting-neutral revision history display rows', () => {
		const history = buildAdvancedDutyRevisionHistoryModel({
			changeSets: [
				{
					id: 'change-set-1',
					orgId: 'org-1',
					appliedRunId: 'run-1',
					sourceDraftId: 'draft-1',
					sourceSnapshotId: 'snapshot-1',
					sourceSnapshotFingerprint: 'fingerprint-1',
					reason: 'Appointment conflict',
					actorUserId: 'user-1',
					reviewableConflictsConfirmed: false,
					conflictSummary: null,
					warningSummary: null,
					appliedAt: '2026-05-04T12:00:00.000Z',
					createdAt: '2026-05-04T12:00:00.000Z'
				}
			],
			slotChanges: [
				{
					id: 'slot-change-1',
					orgId: 'org-1',
					changeSetId: 'change-set-1',
					dutyEventId: 'event-1',
					eventDate: '2026-05-05',
					slotKey: 'staff-duty:0',
					templateSlotId: 'template-slot-1',
					roleLabel: 'Staff Duty',
					slotIndex: 0,
					previousPersonnelId: 'person-1',
					newPersonnelId: 'person-2',
					previousPersonnelSnapshot: { rank: 'SGT', firstName: 'Ava', lastName: 'Stone' },
					newPersonnelSnapshot: { rank: 'SSG', firstName: 'Mia', lastName: 'Reed' },
					previousAssignmentSource: 'generated',
					newAssignmentSource: 'manual',
					previousWarningState: 'none',
					newWarningState: 'warning',
					changeIntent: 'assign',
					warningMetadata: null,
					conflictMetadata: null,
					createdAt: '2026-05-04T12:00:00.000Z'
				}
			]
		});

		expect(history).toEqual([
			{
				id: 'change-set-1',
				appliedRunId: 'run-1',
				appliedAt: '2026-05-04T12:00:00.000Z',
				actorUserId: 'user-1',
				actorLabel: 'Actor unavailable',
				reason: 'Appointment conflict',
				changeCount: 1,
				changes: [
					expect.objectContaining({
						eventDate: '2026-05-05',
						roleLabel: 'Staff Duty',
						previousPersonnelSnapshot: { rank: 'SGT', firstName: 'Ava', lastName: 'Stone' },
						newPersonnelSnapshot: { rank: 'SSG', firstName: 'Mia', lastName: 'Reed' },
						changeIntent: 'assign'
					})
				]
			}
		]);
	});
});
