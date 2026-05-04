import { describe, expect, it } from 'vitest';
import {
	AdvancedDutyRevisionChangeSetEntity,
	AdvancedDutyRevisionDraftEntity,
	AdvancedDutyRevisionSlotChangeEntity
} from './advancedDutyRevision';

describe('Advanced Duty revision entities', () => {
	it('maps revision draft database rows to the app record shape', () => {
		const result = AdvancedDutyRevisionDraftEntity.fromDb({
			id: 'draft-1',
			organization_id: 'org-1',
			applied_run_id: 'run-1',
			source_snapshot_id: 'snapshot-1',
			source_snapshot_fingerprint: 'fingerprint-1',
			source_run_created_at: '2026-05-01T00:00:00.000Z',
			source_run_updated_at: '2026-05-01T01:00:00.000Z',
			status: 'draft',
			slot_changes: [{ eventDate: '2026-05-02', slotKey: 'staff-duty:0', newPersonnelId: 'person-2' }],
			reason: null,
			latest_validation: { hardConflicts: [] },
			latest_error: null,
			conflict_summary: { reviewable: 1 },
			draft_version: 2,
			created_by_user_id: 'user-1',
			updated_by_user_id: 'user-2',
			applied_by_user_id: null,
			discarded_by_user_id: null,
			expires_at: '2026-05-08T00:00:00.000Z',
			discard_cleanup_after: null,
			applied_at: null,
			discarded_at: null,
			created_at: '2026-05-01T00:00:00.000Z',
			updated_at: '2026-05-01T01:00:00.000Z'
		});

		expect(result).toEqual({
			id: 'draft-1',
			orgId: 'org-1',
			appliedRunId: 'run-1',
			sourceSnapshotId: 'snapshot-1',
			sourceSnapshotFingerprint: 'fingerprint-1',
			sourceRunCreatedAt: '2026-05-01T00:00:00.000Z',
			sourceRunUpdatedAt: '2026-05-01T01:00:00.000Z',
			status: 'draft',
			slotChanges: [{ eventDate: '2026-05-02', slotKey: 'staff-duty:0', newPersonnelId: 'person-2' }],
			reason: null,
			latestValidation: { hardConflicts: [] },
			latestError: null,
			conflictSummary: { reviewable: 1 },
			draftVersion: 2,
			createdByUserId: 'user-1',
			updatedByUserId: 'user-2',
			appliedByUserId: null,
			discardedByUserId: null,
			expiresAt: '2026-05-08T00:00:00.000Z',
			discardCleanupAfter: null,
			appliedAt: null,
			discardedAt: null,
			createdAt: '2026-05-01T00:00:00.000Z',
			updatedAt: '2026-05-01T01:00:00.000Z'
		});
	});

	it('adds defaults for draft inserts without full snapshot payload copies', () => {
		const result = AdvancedDutyRevisionDraftEntity.toDbInsert(
			{
				appliedRunId: 'run-1',
				sourceSnapshotId: 'snapshot-1',
				sourceSnapshotFingerprint: 'fingerprint-1',
				sourceRunCreatedAt: '2026-05-01T00:00:00.000Z',
				sourceRunUpdatedAt: '2026-05-01T01:00:00.000Z'
			},
			'org-1'
		);

		expect(result).toEqual({
			organization_id: 'org-1',
			applied_run_id: 'run-1',
			source_snapshot_id: 'snapshot-1',
			source_snapshot_fingerprint: 'fingerprint-1',
			source_run_created_at: '2026-05-01T00:00:00.000Z',
			source_run_updated_at: '2026-05-01T01:00:00.000Z',
			status: 'draft',
			slot_changes: [],
			reason: null,
			latest_validation: null,
			latest_error: null,
			conflict_summary: null,
			draft_version: 1,
			created_by_user_id: null,
			updated_by_user_id: null,
			applied_by_user_id: null,
			discarded_by_user_id: null,
			discard_cleanup_after: null,
			applied_at: null,
			discarded_at: null
		});
		expect(result).not.toHaveProperty('snapshot_payload');
		expect(result).not.toHaveProperty('preview_payload');
	});

	it('maps compact applied change sets and slot rows', () => {
		const changeSet = AdvancedDutyRevisionChangeSetEntity.fromDb({
			id: 'change-set-1',
			organization_id: 'org-1',
			applied_run_id: 'run-1',
			source_draft_id: 'draft-1',
			source_snapshot_id: 'snapshot-1',
			source_snapshot_fingerprint: 'fingerprint-1',
			reason: 'Swap after appointment conflict',
			actor_user_id: 'user-1',
			reviewable_conflicts_confirmed: true,
			conflict_summary: { confirmed: ['overlap'] },
			warning_summary: { warnings: ['cooldown'] },
			applied_at: '2026-05-02T00:00:00.000Z',
			created_at: '2026-05-02T00:00:00.000Z'
		});

		const slotChange = AdvancedDutyRevisionSlotChangeEntity.fromDb({
			id: 'slot-change-1',
			organization_id: 'org-1',
			change_set_id: 'change-set-1',
			duty_event_id: 'event-1',
			event_date: '2026-05-02',
			slot_key: 'staff-duty:0',
			template_slot_id: 'template-slot-1',
			role_label: 'Staff Duty',
			slot_index: 0,
			previous_personnel_id: 'person-1',
			new_personnel_id: 'person-2',
			previous_personnel_snapshot: { rank: 'SGT', firstName: 'Ava', lastName: 'Stone' },
			new_personnel_snapshot: { rank: 'SSG', firstName: 'Mia', lastName: 'Reed' },
			previous_assignment_source: 'generated',
			new_assignment_source: 'manual',
			previous_warning_state: 'none',
			new_warning_state: 'warning',
			change_intent: 'assign',
			warning_metadata: { cooldownHours: 12 },
			conflict_metadata: null,
			created_at: '2026-05-02T00:00:00.000Z'
		});

		expect(changeSet).toMatchObject({
			id: 'change-set-1',
			appliedRunId: 'run-1',
			reason: 'Swap after appointment conflict',
			reviewableConflictsConfirmed: true,
			conflictSummary: { confirmed: ['overlap'] },
			warningSummary: { warnings: ['cooldown'] }
		});
		expect(slotChange).toMatchObject({
			id: 'slot-change-1',
			changeSetId: 'change-set-1',
			eventDate: '2026-05-02',
			slotKey: 'staff-duty:0',
			previousPersonnelId: 'person-1',
			newPersonnelId: 'person-2',
			newAssignmentSource: 'manual',
			changeIntent: 'assign',
			warningMetadata: { cooldownHours: 12 }
		});
	});

	it('validates lifecycle status and explicit slot intent values', () => {
		expect(AdvancedDutyRevisionDraftEntity.createSchema.safeParse({ status: 'applying' }).success).toBe(false);
		expect(
			AdvancedDutyRevisionSlotChangeEntity.updateSchema.safeParse({ id: 'slot-change-1', changeIntent: 'locked' })
				.success
		).toBe(false);
		expect(
			AdvancedDutyRevisionSlotChangeEntity.updateSchema.safeParse({
				id: 'slot-change-1',
				changeIntent: 'lock-open'
			}).success
		).toBe(true);
	});
});
