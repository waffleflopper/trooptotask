import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { AdvancedDutyRunSnapshotRecord } from '$features/duty-roster/duty-roster.types';

const runPatternSchema = z.enum([
	'single',
	'daily',
	'weekday-only',
	'weekend-only',
	'selected-weekdays',
	'holiday-closure-only',
	'custom-dates'
]);

const snapshotStatusSchema = z.enum(['draft', 'applying', 'applied', 'apply-failed', 'partial-failure', 'expired']);

const payloadSchema = z.record(z.string(), z.unknown());

export const AdvancedDutyRunSnapshotEntity = defineEntity<AdvancedDutyRunSnapshotRecord>({
	table: 'advanced_duty_run_snapshots',
	permission: 'calendar',
	groupScope: 'none',
	audit: { resourceType: 'advanced_duty_run_snapshot', detailFields: ['templateName', 'status'] },
	orderBy: [{ column: 'created_at', ascending: false }],
	schema: {
		id: field(z.string(), { readOnly: true }),
		orgId: field(z.string(), { column: 'organization_id', readOnly: true }),
		templateId: field(z.string(), { column: 'template_id' }),
		templateName: field(z.string().min(1), { column: 'template_name' }),
		pattern: field(runPatternSchema, { insertDefault: 'single' }),
		startDate: field(z.string(), { column: 'start_date' }),
		endDate: field(z.string(), { column: 'end_date' }),
		eventCount: field(z.number().int().min(0), { column: 'event_count', insertDefault: 0 }),
		eventDates: field(z.array(z.string()), { column: 'event_dates', insertDefault: [], nullDefault: [] }),
		candidatePersonnelIds: field(z.array(z.string()), {
			column: 'candidate_personnel_ids',
			insertDefault: [],
			nullDefault: []
		}),
		snapshotFingerprint: field(z.string().min(1), { column: 'snapshot_fingerprint' }),
		snapshotVersion: field(z.number().int().min(1), { column: 'snapshot_version', insertDefault: 1 }),
		status: field(snapshotStatusSchema, { insertDefault: 'draft' }),
		inputPayload: field(payloadSchema, { column: 'input_payload', insertDefault: {}, nullDefault: {} }),
		snapshotPayload: field(payloadSchema, { column: 'snapshot_payload', insertDefault: {}, nullDefault: {} }),
		previewPayload: field(payloadSchema, { column: 'preview_payload', insertDefault: {}, nullDefault: {} }),
		exportModel: field(payloadSchema.nullable(), { column: 'export_model', insertDefault: null }),
		createdByUserId: field(z.string().nullable(), { column: 'created_by_user_id', insertDefault: null }),
		appliedRunId: field(z.string().nullable(), { column: 'applied_run_id', insertDefault: null }),
		applyError: field(z.string().nullable(), { column: 'apply_error', insertDefault: null }),
		expiresAt: field(z.string(), { column: 'expires_at', readOnly: true }),
		appliedAt: field(z.string().nullable(), { column: 'applied_at', insertDefault: null }),
		createdAt: field(z.string(), { column: 'created_at', readOnly: true }),
		updatedAt: field(z.string(), { column: 'updated_at', readOnly: true })
	}
});
