import { describe, expect, it } from 'vitest';
import { AdvancedDutyRunSnapshotEntity } from './advancedDutyRunSnapshot';

describe('AdvancedDutyRunSnapshotEntity', () => {
	it('maps database rows to the AdvancedRunSnapshot shape', () => {
		const result = AdvancedDutyRunSnapshotEntity.fromDb({
			id: 'snapshot-1',
			organization_id: 'org-1',
			template_id: 'template-1',
			template_name: 'Staff Duty',
			pattern: 'weekday-only',
			start_date: '2026-05-01',
			end_date: '2026-05-08',
			event_count: 5,
			event_dates: ['2026-05-01'],
			candidate_personnel_ids: ['person-1'],
			draft_lineage_key: 'lineage-1',
			snapshot_fingerprint: 'fingerprint-1',
			snapshot_version: 1,
			status: 'draft',
			input_payload: { templateId: 'template-1' },
			snapshot_payload: { events: [] },
			preview_payload: { events: [] },
			export_model: null,
			created_by_user_id: 'user-1',
			applied_run_id: null,
			apply_error: null,
			expires_at: '2026-05-02T00:00:00.000Z',
			applied_at: null,
			created_at: '2026-05-01T00:00:00.000Z',
			updated_at: '2026-05-01T00:00:00.000Z'
		});

		expect(result).toEqual({
			id: 'snapshot-1',
			orgId: 'org-1',
			templateId: 'template-1',
			templateName: 'Staff Duty',
			pattern: 'weekday-only',
			startDate: '2026-05-01',
			endDate: '2026-05-08',
			eventCount: 5,
			eventDates: ['2026-05-01'],
			candidatePersonnelIds: ['person-1'],
			draftLineageKey: 'lineage-1',
			snapshotFingerprint: 'fingerprint-1',
			snapshotVersion: 1,
			status: 'draft',
			inputPayload: { templateId: 'template-1' },
			snapshotPayload: { events: [] },
			previewPayload: { events: [] },
			exportModel: null,
			createdByUserId: 'user-1',
			appliedRunId: null,
			applyError: null,
			expiresAt: '2026-05-02T00:00:00.000Z',
			appliedAt: null,
			createdAt: '2026-05-01T00:00:00.000Z',
			updatedAt: '2026-05-01T00:00:00.000Z'
		});
	});

	it('adds defaults for draft snapshot inserts', () => {
		const result = AdvancedDutyRunSnapshotEntity.toDbInsert(
			{
				templateId: 'template-1',
				templateName: 'Staff Duty',
				startDate: '2026-05-01',
				endDate: '2026-05-01',
				draftLineageKey: 'lineage-1',
				snapshotFingerprint: 'fingerprint-1'
			},
			'org-1'
		);

		expect(result).toEqual({
			organization_id: 'org-1',
			template_id: 'template-1',
			template_name: 'Staff Duty',
			pattern: 'single',
			start_date: '2026-05-01',
			end_date: '2026-05-01',
			event_count: 0,
			event_dates: [],
			candidate_personnel_ids: [],
			draft_lineage_key: 'lineage-1',
			snapshot_fingerprint: 'fingerprint-1',
			snapshot_version: 1,
			status: 'draft',
			input_payload: {},
			snapshot_payload: {},
			preview_payload: {},
			export_model: null,
			created_by_user_id: null,
			applied_run_id: null,
			apply_error: null,
			applied_at: null
		});
	});

	it('validates allowed lifecycle statuses', () => {
		expect(AdvancedDutyRunSnapshotEntity.createSchema.safeParse({ status: 'draft' }).success).toBe(false);

		const valid = AdvancedDutyRunSnapshotEntity.updateSchema.safeParse({
			id: 'snapshot-1',
			status: 'partial-failure',
			applyError: 'Slot persistence failed'
		});
		expect(valid.success).toBe(true);

		const invalid = AdvancedDutyRunSnapshotEntity.updateSchema.safeParse({ id: 'snapshot-1', status: 'consumed' });
		expect(invalid.success).toBe(false);
	});
});
