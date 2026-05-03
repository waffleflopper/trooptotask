import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import type { AdvancedRunSnapshotPayload } from './advancedDutyRunSnapshotCustody';
import {
	assertAdvancedRunSnapshotIncludesEvent,
	assertApprovedSingleAdvancedRunSnapshot,
	buildAdvancedRunOriginalProposal,
	buildApprovedAdvancedRunEventPreview,
	createDraftAdvancedRunSnapshot,
	loadApprovedAdvancedRunSnapshot,
	markAdvancedRunSnapshotApplied,
	markAdvancedRunSnapshotApplying,
	markAdvancedRunSnapshotDraft,
	markAdvancedRunSnapshotPartialFailure
} from './advancedDutyRunSnapshotCustody';

function snapshotPayload(): AdvancedRunSnapshotPayload {
	return {
		snapshotVersion: 1,
		templateId: 'template-1',
		templateName: 'Battalion Staff Duty',
		eventDates: ['2026-04-10'],
		candidatePersonnelIds: ['person-alpha'],
		template: {
			rulesSnapshot: {
				templateId: 'template-1',
				templateName: 'Battalion Staff Duty',
				templateStatus: 'active',
				coverageMode: 'timed',
				startTime: '08:00',
				endTime: '08:00',
				spansMidnight: false,
				scopeType: 'organization',
				scopeGroupIds: [],
				exemptPersonnelIds: [],
				exemptStatusTypeIds: [],
				isBlocking: true,
				cooldownHours: 24,
				slots: [
					{
						templateSlotId: 'slot-nco',
						roleLabel: 'NCO',
						quantity: 1,
						allowedRanks: [],
						allowedGroupIds: [],
						preferredGroupIds: [],
						allowedMosValues: [],
						allowedRoleValues: [],
						rotationPoolKey: 'slot-nco',
						blockingMode: 'inherit',
						sortOrder: 0
					}
				]
			}
		},
		personnel: [],
		events: [
			{
				eventDate: '2026-04-10',
				coverageStart: '2026-04-10T08:00:00',
				coverageEnd: '2026-04-11T08:00:00',
				preview: {
					templateId: 'template-1',
					templateName: 'Battalion Staff Duty',
					eventDate: '2026-04-10',
					coverageMode: 'timed',
					coverageStart: '2026-04-10T08:00:00',
					coverageEnd: '2026-04-11T08:00:00',
					isBlocking: true,
					cooldownHours: 24,
					rulesSnapshot: {
						templateId: 'template-1',
						templateName: 'Battalion Staff Duty',
						templateStatus: 'active',
						coverageMode: 'timed',
						startTime: '08:00',
						endTime: '08:00',
						spansMidnight: false,
						scopeType: 'organization',
						scopeGroupIds: [],
						exemptPersonnelIds: [],
						exemptStatusTypeIds: [],
						isBlocking: true,
						cooldownHours: 24,
						slots: []
					},
					fillSummary: { totalSlots: 1, filledSlots: 1, unfilledSlots: 0 },
					collisionSummary: { hasConflicts: true, conflicts: ['Review this collision before apply.'] },
					slotInstances: [
						{
							templateSlotId: 'slot-nco',
							roleLabel: 'NCO',
							slotIndex: 0,
							assigneeId: 'person-alpha',
							assignmentSource: 'manual',
							warningState: 'warning',
							fairnessConfidence: 'high',
							selectionReason: 'Manually assigned.',
							unfilledReason: null,
							overrideMessages: ['Manual assignment kept from reviewed preview.'],
							sortOrder: 0
						}
					]
				},
				slotProposals: [
					{
						templateSlotId: 'slot-nco',
						roleLabel: 'NCO',
						slotIndex: 0,
						assigneeId: 'person-alpha',
						assignmentSource: 'manual',
						warningState: 'warning',
						fairnessConfidence: 'high',
						selectionReason: 'Manually assigned.',
						unfilledReason: null,
						overrideMessages: ['Generated proposal message.'],
						candidateRankings: [{ personnelId: 'person-alpha', rank: 1 }],
						blockingMessages: ['Hard conflict.'],
						isBlocking: true,
						sortOrder: 0
					}
				],
				blockingConflicts: ['Hard conflict.'],
				availabilityClassifications: [],
				da6Matrices: [],
				exportModel: {
					status: 'preview',
					statusLabel: 'Preview',
					templateName: 'Battalion Staff Duty',
					eventDate: '2026-04-10',
					coverage: {
						mode: 'timed',
						start: '2026-04-10T08:00:00',
						end: '2026-04-11T08:00:00',
						label: 'Apr 10, 08:00-Apr 11, 08:00'
					},
					isBlocking: true,
					fillSummary: { totalSlots: 1, filledSlots: 1, unfilledSlots: 0 },
					slotAssignments: [],
					collisionNotes: ['Hard conflict.']
				}
			}
		],
		da6Matrices: []
	};
}

describe('advanced duty run snapshot custody', () => {
	it('creates an approved snapshot and derives the reviewed event preview through the module interface', async () => {
		const ctx = createTestContext();
		const inputPayload = {
			templateId: 'template-1',
			eventDate: '2026-04-10',
			candidatePersonnelIds: ['person-alpha'],
			slotOverrides: [{ templateSlotId: 'slot-nco', slotIndex: 0, assigneeId: 'person-alpha' }]
		};

		const metadata = await createDraftAdvancedRunSnapshot(ctx, {
			templateId: 'template-1',
			templateName: 'Battalion Staff Duty',
			pattern: 'single',
			eventDates: ['2026-04-10'],
			candidatePersonnelIds: ['person-alpha'],
			inputPayload,
			snapshotPayload: snapshotPayload(),
			previewPayload: snapshotPayload().events[0].preview as unknown as Record<string, unknown>
		});
		const approved = await loadApprovedAdvancedRunSnapshot(ctx, metadata);

		assertApprovedSingleAdvancedRunSnapshot(approved, {
			...inputPayload,
			snapshotId: metadata.snapshotId,
			snapshotFingerprint: metadata.snapshotFingerprint
		});
		const preview = buildApprovedAdvancedRunEventPreview(approved, '2026-04-10');
		const originalProposal = buildAdvancedRunOriginalProposal(preview);

		expect(preview.blockingConflicts).toEqual(['Hard conflict.']);
		expect(preview.slotInstances[0]).toMatchObject({
			overrideMessages: ['Manual assignment kept from reviewed preview.'],
			blockingMessages: ['Hard conflict.'],
			isBlocking: true
		});
		expect(originalProposal.slotInstances[0]).toEqual(
			expect.not.objectContaining({
				blockingMessages: expect.anything(),
				isBlocking: expect.anything()
			})
		);
	});

	it('owns snapshot status transitions without exposing table update details to callers', async () => {
		const ctx = createTestContext();
		const metadata = await createDraftAdvancedRunSnapshot(ctx, {
			templateId: 'template-1',
			templateName: 'Battalion Staff Duty',
			pattern: 'single',
			eventDates: ['2026-04-10'],
			inputPayload: { templateId: 'template-1', eventDate: '2026-04-10' },
			snapshotPayload: snapshotPayload(),
			previewPayload: snapshotPayload().events[0].preview as unknown as Record<string, unknown>
		});

		await markAdvancedRunSnapshotApplying(ctx, metadata.snapshotId, '2026-04-10T01:00:00.000Z');
		await expect(loadApprovedAdvancedRunSnapshot(ctx, metadata)).rejects.toMatchObject({
			status: 400,
			message: 'Regenerate the advanced duty preview before applying.'
		});

		await markAdvancedRunSnapshotDraft(ctx, metadata.snapshotId, '2026-04-10T01:01:00.000Z');
		await expect(loadApprovedAdvancedRunSnapshot(ctx, metadata)).resolves.toMatchObject({ status: 'draft' });

		await markAdvancedRunSnapshotPartialFailure(ctx, metadata.snapshotId, new Error('slot write failed'));
		let rows = await ctx.store.findMany<Record<string, unknown>>('advanced_duty_run_snapshots', ctx.auth.orgId);
		expect(rows[0]).toMatchObject({ status: 'partial-failure', apply_error: 'slot write failed' });

		await markAdvancedRunSnapshotApplied(
			ctx,
			metadata.snapshotId,
			{ appliedRunId: 'run-1' },
			'2026-04-10T01:02:00.000Z'
		);
		rows = await ctx.store.findMany<Record<string, unknown>>('advanced_duty_run_snapshots', ctx.auth.orgId);
		expect(rows[0]).toMatchObject({
			status: 'applied',
			applied_run_id: 'run-1',
			applied_at: '2026-04-10T01:02:00.000Z'
		});
	});

	it('rejects single-event apply when an approved series snapshot does not include the requested event', async () => {
		const ctx = createTestContext();
		const metadata = await createDraftAdvancedRunSnapshot(ctx, {
			templateId: 'template-1',
			templateName: 'Battalion Staff Duty',
			pattern: 'weekday-only',
			eventDates: ['2026-04-10'],
			inputPayload: { templateId: 'template-1', startDate: '2026-04-10', endDate: '2026-04-10' },
			snapshotPayload: snapshotPayload(),
			previewPayload: snapshotPayload().events[0].preview as unknown as Record<string, unknown>
		});
		const approved = await loadApprovedAdvancedRunSnapshot(ctx, metadata);

		expect(() =>
			assertAdvancedRunSnapshotIncludesEvent(approved, { templateId: 'template-1', eventDate: '2026-04-10' })
		).not.toThrow();
		expect(() =>
			assertAdvancedRunSnapshotIncludesEvent(approved, { templateId: 'template-1', eventDate: '2026-04-11' })
		).toThrow('Regenerate the advanced duty preview before applying.');
		expect(() =>
			assertAdvancedRunSnapshotIncludesEvent(approved, { templateId: 'template-other', eventDate: '2026-04-10' })
		).toThrow('Regenerate the advanced duty preview before applying.');
	});
});
