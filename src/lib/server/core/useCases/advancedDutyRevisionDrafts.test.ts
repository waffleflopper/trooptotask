import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import type {
	AdvancedDutyRevisionAppliedRun,
	AdvancedDutyRevisionDraftSlotChange
} from '$features/duty-roster/advanced-run/advancedDutyRevision';
import {
	cleanupAdvancedDutyRevisionDrafts,
	createOrReopenAdvancedDutyRevisionDraft,
	discardAdvancedDutyRevisionDraftById,
	getActiveAdvancedDutyRevisionDraft,
	listAdvancedDutyRevisionHistory,
	listAdvancedDutyRevisionDrafts,
	markAdvancedDutyRevisionDraftAppliedById,
	updateAdvancedDutyRevisionDraftChange
} from './advancedDutyRevisionDrafts';

function appliedRun(overrides?: Partial<AdvancedDutyRevisionAppliedRun>): AdvancedDutyRevisionAppliedRun {
	return {
		id: 'run-1',
		orgId: 'test-org',
		sourceSnapshotId: 'snapshot-1',
		sourceSnapshotFingerprint: 'fingerprint-1',
		createdAt: '2026-05-02T20:00:00.000Z',
		updatedAt: '2026-05-02T20:05:00.000Z',
		...overrides
	};
}

function slotChange(overrides?: Partial<AdvancedDutyRevisionDraftSlotChange>): AdvancedDutyRevisionDraftSlotChange {
	return {
		eventDate: '2026-05-04',
		slotKey: 'slot-nco:0',
		dutyEventId: 'event-1',
		templateSlotId: 'slot-nco',
		roleLabel: 'NCO',
		slotIndex: 0,
		newPersonnelId: 'person-bravo',
		assignmentSource: 'manual',
		warningState: 'none',
		changeIntent: 'assign',
		...overrides
	};
}

function seedRevisionHistory(
	ctx: ReturnType<typeof createTestContext>,
	input?: {
		changeSet?: Record<string, unknown>;
		slotChanges?: Record<string, unknown>[];
	}
) {
	const changeSetId = String(input?.changeSet?.id ?? 'change-set-1');
	ctx.store.seed('advanced_duty_revision_change_sets', [
		{
			id: changeSetId,
			organization_id: 'test-org',
			applied_run_id: 'run-1',
			source_draft_id: 'draft-1',
			source_snapshot_id: 'snapshot-1',
			source_snapshot_fingerprint: 'fingerprint-1',
			reason: 'Leader reviewed coverage conflict.',
			actor_user_id: 'user-1',
			reviewable_conflicts_confirmed: true,
			conflict_summary: null,
			warning_summary: { reviewable: 1 },
			applied_at: '2026-05-03T02:00:00.000Z',
			created_at: '2026-05-03T02:00:00.000Z',
			...input?.changeSet
		}
	]);
	ctx.store.seed(
		'advanced_duty_revision_slot_changes',
		input?.slotChanges ?? [
			{
				id: 'slot-change-1',
				organization_id: 'test-org',
				change_set_id: changeSetId,
				duty_event_id: 'event-1',
				event_date: '2026-05-04',
				slot_key: 'slot-nco:0',
				template_slot_id: 'slot-nco',
				role_label: 'NCO',
				slot_index: 0,
				previous_personnel_id: 'person-alpha',
				new_personnel_id: 'person-bravo',
				previous_personnel_snapshot: { rank: 'SGT', firstName: 'Alex', lastName: 'Alpha' },
				new_personnel_snapshot: { rank: 'SSG', firstName: 'Blake', lastName: 'Bravo' },
				previous_assignment_source: 'generated',
				new_assignment_source: 'manual',
				previous_warning_state: 'none',
				new_warning_state: 'warning',
				change_intent: 'assign',
				warning_metadata: { note: 'reviewed' },
				conflict_metadata: null,
				created_at: '2026-05-03T02:00:00.000Z'
			}
		]
	);
}

describe('advanced duty revision draft use cases', () => {
	it('creates then reopens one active draft for an applied run', async () => {
		const ctx = createTestContext();

		const created = await createOrReopenAdvancedDutyRevisionDraft(ctx, {
			appliedRun: appliedRun(),
			now: '2026-05-03T01:00:00.000Z',
			makeId: () => 'draft-1'
		});
		const reopened = await createOrReopenAdvancedDutyRevisionDraft(ctx, {
			appliedRun: appliedRun(),
			now: '2026-05-03T01:05:00.000Z',
			makeId: () => 'draft-2'
		});
		const active = await getActiveAdvancedDutyRevisionDraft(ctx, { appliedRunId: 'run-1' });

		expect(created.action).toBe('created');
		expect(reopened.action).toBe('reopened');
		expect(reopened.draft.id).toBe(created.draft.id);
		expect(active).toMatchObject({
			id: created.draft.id,
			appliedRunId: 'run-1',
			status: 'draft',
			updatedByUserId: 'test-user',
			updatedAt: '2026-05-03T01:05:00.000Z'
		});
	});

	it('updates, lists, and discards revision drafts through the persistence boundary', async () => {
		const ctx = createTestContext();
		const { draft } = await createOrReopenAdvancedDutyRevisionDraft(ctx, {
			appliedRun: appliedRun(),
			now: '2026-05-03T01:00:00.000Z',
			makeId: () => 'draft-1'
		});

		const updated = await updateAdvancedDutyRevisionDraftChange(ctx, {
			draftId: draft.id,
			change: slotChange(),
			now: '2026-05-03T01:10:00.000Z'
		});
		const listed = await listAdvancedDutyRevisionDrafts(ctx, { appliedRunId: 'run-1' });
		const discarded = await discardAdvancedDutyRevisionDraftById(ctx, {
			draftId: draft.id,
			now: '2026-05-03T01:20:00.000Z'
		});
		const active = await getActiveAdvancedDutyRevisionDraft(ctx, { appliedRunId: 'run-1' });

		expect(updated).toMatchObject({
			draftVersion: 2,
			slotChanges: [slotChange()],
			updatedAt: '2026-05-03T01:10:00.000Z'
		});
		expect(listed).toHaveLength(1);
		expect(discarded).toMatchObject({
			status: 'discarded',
			discardedByUserId: 'test-user',
			discardedAt: '2026-05-03T01:20:00.000Z'
		});
		expect(active).toBeNull();
	});

	it('lists compact applied revision history without exposing draft payloads or snapshots', async () => {
		const ctx = createTestContext();
		ctx.store.seed('organization_memberships', [
			{ id: 'membership-1', organization_id: 'test-org', user_id: 'user-1', email: 'approver@example.mil' }
		]);
		seedRevisionHistory(ctx);

		const result = await listAdvancedDutyRevisionHistory(ctx, { appliedRunIds: ['run-1'] });

		expect(result).toEqual([
			expect.objectContaining({
				id: 'change-set-1',
				appliedRunId: 'run-1',
				reason: 'Leader reviewed coverage conflict.',
				actorUserId: 'user-1',
				actorLabel: 'approver@example.mil',
				changeCount: 1,
				changes: [
					expect.objectContaining({
						roleLabel: 'NCO',
						previousPersonnelSnapshot: { rank: 'SGT', firstName: 'Alex', lastName: 'Alpha' },
						newPersonnelSnapshot: { rank: 'SSG', firstName: 'Blake', lastName: 'Bravo' },
						warningMetadata: { note: 'reviewed' }
					})
				]
			})
		]);
		expect(JSON.stringify(result)).not.toContain('snapshotPayload');
		expect(JSON.stringify(result)).not.toContain('slot_changes');
	});

	it('uses an unavailable actor label when the change-set actor membership is missing', async () => {
		const ctx = createTestContext();
		seedRevisionHistory(ctx, {
			changeSet: {
				id: 'change-set-1',
				actor_user_id: 'deleted-user',
				warning_summary: null
			},
			slotChanges: []
		});

		const result = await listAdvancedDutyRevisionHistory(ctx, { appliedRunIds: ['run-1'] });

		expect(result[0]).toMatchObject({
			actorUserId: 'deleted-user',
			actorLabel: 'Actor unavailable'
		});
	});

	it('cleans up expired and discarded draft working state without deleting applied revision history', async () => {
		const ctx = createTestContext();
		const expiredActive = await createOrReopenAdvancedDutyRevisionDraft(ctx, {
			appliedRun: appliedRun({ id: 'run-expired' }),
			now: '2026-05-01T00:00:00.000Z',
			makeId: () => 'draft-expired'
		});
		await createOrReopenAdvancedDutyRevisionDraft(ctx, {
			appliedRun: appliedRun({ id: 'run-active' }),
			now: '2026-05-08T00:00:00.000Z',
			makeId: () => 'draft-active'
		});
		const discardedEligible = await createOrReopenAdvancedDutyRevisionDraft(ctx, {
			appliedRun: appliedRun({ id: 'run-discarded-eligible' }),
			now: '2026-03-31T00:00:00.000Z',
			makeId: () => 'draft-discarded-eligible'
		});
		await discardAdvancedDutyRevisionDraftById(ctx, {
			draftId: discardedEligible.draft.id,
			now: '2026-04-01T00:00:00.000Z'
		});
		const discardedRetained = await createOrReopenAdvancedDutyRevisionDraft(ctx, {
			appliedRun: appliedRun({ id: 'run-discarded-retained' }),
			now: '2026-04-19T00:00:00.000Z',
			makeId: () => 'draft-discarded-retained'
		});
		await discardAdvancedDutyRevisionDraftById(ctx, {
			draftId: discardedRetained.draft.id,
			now: '2026-04-20T00:00:00.000Z'
		});
		const applied = await createOrReopenAdvancedDutyRevisionDraft(ctx, {
			appliedRun: appliedRun({ id: 'run-applied' }),
			now: '2026-05-01T00:00:00.000Z',
			makeId: () => 'draft-applied'
		});
		await markAdvancedDutyRevisionDraftAppliedById(ctx, {
			draftId: applied.draft.id,
			now: '2026-05-02T00:00:00.000Z'
		});
		seedRevisionHistory(ctx, {
			changeSet: {
				id: 'change-set-1',
				applied_run_id: 'run-expired',
				source_draft_id: expiredActive.draft.id,
				actor_user_id: 'test-user',
				warning_summary: null
			},
			slotChanges: [
				{
					id: 'slot-change-1',
					organization_id: 'test-org',
					change_set_id: 'change-set-1',
					duty_event_id: 'event-1',
					event_date: '2026-05-04',
					slot_key: 'slot-nco:0',
					template_slot_id: 'slot-nco',
					role_label: 'NCO',
					slot_index: 0,
					previous_personnel_id: 'person-alpha',
					new_personnel_id: 'person-bravo',
					previous_personnel_snapshot: null,
					new_personnel_snapshot: null,
					previous_assignment_source: 'generated',
					new_assignment_source: 'manual',
					previous_warning_state: 'none',
					new_warning_state: 'none',
					change_intent: 'assign',
					warning_metadata: null,
					conflict_metadata: null,
					created_at: '2026-05-03T02:00:00.000Z'
				}
			]
		});

		const result = await cleanupAdvancedDutyRevisionDrafts(ctx, {
			now: '2026-05-10T00:00:00.000Z'
		});

		expect(result).toEqual({
			deletedCount: 2,
			draftIds: ['draft-expired', 'draft-discarded-eligible']
		});
		await expect(ctx.rawStore.findMany('advanced_duty_revision_drafts', 'test-org')).resolves.toEqual([
			expect.objectContaining({ id: 'draft-active', status: 'draft' }),
			expect.objectContaining({ id: 'draft-discarded-retained', status: 'discarded' }),
			expect.objectContaining({ id: 'draft-applied', status: 'applied' })
		]);
		await expect(ctx.rawStore.findMany('advanced_duty_revision_change_sets', 'test-org')).resolves.toHaveLength(1);
		await expect(ctx.rawStore.findMany('advanced_duty_revision_slot_changes', 'test-org')).resolves.toHaveLength(1);
		await expect(listAdvancedDutyRevisionHistory(ctx, { appliedRunIds: ['run-expired'] })).resolves.toEqual([
			expect.objectContaining({
				id: 'change-set-1',
				changeCount: 1
			})
		]);
	});
});
