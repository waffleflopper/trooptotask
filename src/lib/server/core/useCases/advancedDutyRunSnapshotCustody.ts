import { createHash } from 'node:crypto';
import { fail } from '$lib/server/core/errors';
import type { QueryPorts, WritePorts } from '$lib/server/core/ports';
import { AdvancedDutyRunSnapshotEntity } from '$lib/server/entities/advancedDutyRunSnapshot';
import type { AdvancedRunSnapshot } from '$features/duty-roster/advanced-run/advancedDutyRun';
import type {
	AdvancedDutyRunSnapshotRecord,
	DutyEventApplyInput,
	DutyEventOriginalProposal,
	DutyEventPreview,
	DutyEventPreviewSlotInstance,
	DutyEventSeriesInput,
	DutyEventSeriesPreview,
	DutyEventSlotOverrideInput
} from '$features/duty-roster/duty-roster.types';
import {
	RESUMABLE_ADVANCED_DUTY_RUN_SNAPSHOT_STATUSES,
	isResumableAdvancedDutyRunSnapshotStatus
} from '$features/duty-roster/duty-roster.types';
import { requireAdvancedDutyAccess } from './advancedDutyAccess';

export type AdvancedRunSnapshotPattern = 'single' | DutyEventSeriesInput['pattern'];

export type AdvancedDutyRunEventSlotPreview = DutyEventPreviewSlotInstance & {
	blockingMessages: string[];
	isBlocking: boolean;
};

export type AdvancedDutyRunEventPreview = Omit<DutyEventPreview, 'slotInstances'> & {
	slotInstances: AdvancedDutyRunEventSlotPreview[];
	blockingConflicts: string[];
};

export type AdvancedRunSnapshotPayload = AdvancedRunSnapshot & {
	originalProposalsByEventDate?: Record<string, DutyEventOriginalProposal>;
};

const ADVANCED_DUTY_RUN_SNAPSHOT_SUMMARY_SELECT = [
	'id',
	'organization_id',
	'template_id',
	'template_name',
	'pattern',
	'start_date',
	'end_date',
	'event_count',
	'event_dates',
	'candidate_personnel_ids',
	'snapshot_fingerprint',
	'snapshot_version',
	'status',
	'created_by_user_id',
	'applied_run_id',
	'apply_error',
	'expires_at',
	'applied_at',
	'created_at',
	'updated_at'
].join(', ');

const ADVANCED_DUTY_RUN_APPLIED_SNAPSHOT_SELECT = `${ADVANCED_DUTY_RUN_SNAPSHOT_SUMMARY_SELECT}, snapshot_payload, export_model`;

function stableStringify(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map((item) => stableStringify(item)).join(',')}]`;
	}
	if (value && typeof value === 'object') {
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
			.join(',')}}`;
	}
	return JSON.stringify(value);
}

function buildSnapshotFingerprint(payload: Record<string, unknown>): string {
	return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

export function omitPreviewOnlyDa6Matrices<T extends Record<string, unknown>>(previewPayload: T): T {
	const storedPreviewPayload = { ...previewPayload };
	delete storedPreviewPayload.da6Matrices;
	return storedPreviewPayload as T;
}

function normalizeSlotOverridesForSnapshotCompare(
	slotOverrides: DutyEventSlotOverrideInput[] | undefined
): DutyEventSlotOverrideInput[] {
	return (slotOverrides ?? [])
		.map((slot) => ({
			templateSlotId: slot.templateSlotId,
			slotIndex: slot.slotIndex,
			assigneeId: slot.assigneeId,
			...(slot.assignmentSource ? { assignmentSource: slot.assignmentSource } : {})
		}))
		.sort(
			(left, right) =>
				String(left.templateSlotId ?? '').localeCompare(String(right.templateSlotId ?? '')) ||
				left.slotIndex - right.slotIndex
		);
}

function normalizeCandidatePersonnelIdsForSnapshotCompare(values: string[] | undefined): string[] {
	return [...new Set(values ?? [])].sort((left, right) => left.localeCompare(right));
}

function normalizeSingleApplyInputForSnapshotCompare(input: DutyEventApplyInput): Record<string, unknown> {
	return {
		templateId: input.templateId,
		eventDate: input.eventDate,
		candidatePersonnelIds: normalizeCandidatePersonnelIdsForSnapshotCompare(input.candidatePersonnelIds),
		slotOverrides: normalizeSlotOverridesForSnapshotCompare(input.slotOverrides)
	};
}

function normalizeSeriesApplyInputForSnapshotCompare(input: DutyEventSeriesInput): Record<string, unknown> {
	return {
		templateId: input.templateId,
		startDate: input.startDate,
		endDate: input.endDate,
		pattern: input.pattern,
		selectedWeekdays: [...new Set(input.selectedWeekdays ?? [])].sort((left, right) => left - right),
		customDates: normalizeDates(input.customDates ?? []),
		candidatePersonnelIds: normalizeCandidatePersonnelIdsForSnapshotCompare(input.candidatePersonnelIds),
		eventOverrides: (input.eventOverrides ?? [])
			.map((eventOverride) => ({
				eventDate: eventOverride.eventDate,
				slotOverrides: normalizeSlotOverridesForSnapshotCompare(eventOverride.slotOverrides)
			}))
			.sort((left, right) => left.eventDate.localeCompare(right.eventDate))
	};
}

function normalizeDates(values: string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function assertSnapshotInputMatches(
	snapshot: AdvancedDutyRunSnapshotRecord,
	currentInput: Record<string, unknown>,
	storedInput: Record<string, unknown>
): void {
	if (stableStringify(currentInput) !== stableStringify(storedInput)) {
		fail(400, getRegenerateAdvancedRunSnapshotMessage());
	}
}

export function getRegenerateAdvancedRunSnapshotMessage(): string {
	return 'Regenerate the advanced duty preview before applying.';
}

function requireSnapshotMetadata(input: { snapshotId?: string; snapshotFingerprint?: string }): {
	snapshotId: string;
	snapshotFingerprint: string;
} {
	if (!input.snapshotId || !input.snapshotFingerprint) {
		fail(400, getRegenerateAdvancedRunSnapshotMessage());
	}
	return { snapshotId: input.snapshotId, snapshotFingerprint: input.snapshotFingerprint };
}

export async function loadApprovedAdvancedRunSnapshot(
	ctx: QueryPorts,
	input: { snapshotId?: string; snapshotFingerprint?: string }
): Promise<AdvancedDutyRunSnapshotRecord> {
	const { snapshotId, snapshotFingerprint } = requireSnapshotMetadata(input);
	const snapshotRow = await ctx.store.findOne<Record<string, unknown>>(
		AdvancedDutyRunSnapshotEntity.table,
		ctx.auth.orgId,
		{ id: snapshotId }
	);
	if (!snapshotRow) {
		fail(400, getRegenerateAdvancedRunSnapshotMessage());
	}

	const snapshot = AdvancedDutyRunSnapshotEntity.fromDb(snapshotRow);
	if (
		snapshot.status !== 'draft' ||
		snapshot.snapshotFingerprint !== snapshotFingerprint ||
		snapshot.expiresAt <= new Date().toISOString()
	) {
		fail(400, getRegenerateAdvancedRunSnapshotMessage());
	}

	return snapshot;
}

export function assertApprovedSingleAdvancedRunSnapshot(
	snapshot: AdvancedDutyRunSnapshotRecord,
	input: DutyEventApplyInput
): void {
	if (
		snapshot.pattern !== 'single' ||
		snapshot.templateId !== input.templateId ||
		!snapshot.eventDates.includes(input.eventDate)
	) {
		fail(400, getRegenerateAdvancedRunSnapshotMessage());
	}
	assertSnapshotInputMatches(
		snapshot,
		normalizeSingleApplyInputForSnapshotCompare(input),
		normalizeSingleApplyInputForSnapshotCompare(snapshot.inputPayload as unknown as DutyEventApplyInput)
	);
}

export function assertAdvancedRunSnapshotIncludesEvent(
	snapshot: AdvancedDutyRunSnapshotRecord,
	input: Pick<DutyEventApplyInput, 'templateId' | 'eventDate'>
): void {
	if (snapshot.templateId !== input.templateId || !snapshot.eventDates.includes(input.eventDate)) {
		fail(400, getRegenerateAdvancedRunSnapshotMessage());
	}
}

export function assertApprovedSeriesAdvancedRunSnapshot(
	snapshot: AdvancedDutyRunSnapshotRecord,
	input: DutyEventSeriesInput,
	eventDates: string[]
): void {
	if (
		snapshot.pattern !== input.pattern ||
		snapshot.templateId !== input.templateId ||
		stableStringify(snapshot.eventDates) !== stableStringify(eventDates)
	) {
		fail(400, getRegenerateAdvancedRunSnapshotMessage());
	}
	assertSnapshotInputMatches(
		snapshot,
		normalizeSeriesApplyInputForSnapshotCompare(input),
		normalizeSeriesApplyInputForSnapshotCompare(snapshot.inputPayload as unknown as DutyEventSeriesInput)
	);
}

export function toAdvancedDutyRunEventPreview(
	snapshotEvent: AdvancedRunSnapshot['events'][number]
): AdvancedDutyRunEventPreview {
	return {
		...snapshotEvent.preview,
		slotInstances: snapshotEvent.slotProposals,
		blockingConflicts: snapshotEvent.blockingConflicts
	};
}

export function toPublicAdvancedDutyPreview(preview: AdvancedDutyRunEventPreview): DutyEventPreview {
	return {
		templateId: preview.templateId,
		templateName: preview.templateName,
		eventDate: preview.eventDate,
		advancedDa6SequenceKey: preview.advancedDa6SequenceKey,
		advancedDa6SequenceLabel: preview.advancedDa6SequenceLabel,
		coverageMode: preview.coverageMode,
		coverageStart: preview.coverageStart,
		coverageEnd: preview.coverageEnd,
		isBlocking: preview.isBlocking,
		cooldownHours: preview.cooldownHours,
		rulesSnapshot: preview.rulesSnapshot,
		fillSummary: preview.fillSummary,
		collisionSummary: preview.collisionSummary,
		slotInstances: preview.slotInstances.map<DutyEventPreviewSlotInstance>((slot) => ({
			templateSlotId: slot.templateSlotId,
			roleLabel: slot.roleLabel,
			slotIndex: slot.slotIndex,
			assigneeId: slot.assigneeId,
			assignmentSource: slot.assignmentSource,
			warningState: slot.warningState,
			fairnessConfidence: slot.fairnessConfidence,
			selectionReason: slot.selectionReason,
			unfilledReason: slot.unfilledReason,
			overrideMessages: slot.overrideMessages,
			candidateRankings: slot.candidateRankings,
			sortOrder: slot.sortOrder
		}))
	};
}

export function buildAdvancedRunOriginalProposal(preview: AdvancedDutyRunEventPreview): DutyEventOriginalProposal {
	return {
		fillSummary: preview.fillSummary,
		collisionSummary: preview.collisionSummary,
		slotInstances: toPublicAdvancedDutyPreview(preview).slotInstances
	};
}

function getSnapshotEvent(snapshot: AdvancedDutyRunSnapshotRecord, eventDate: string) {
	const snapshotPayload = snapshot.snapshotPayload as unknown as AdvancedRunSnapshot;
	const snapshotEvent = snapshotPayload.events.find((event) => event.eventDate === eventDate);
	if (!snapshotEvent) {
		fail(400, getRegenerateAdvancedRunSnapshotMessage());
	}
	return snapshotEvent;
}

function getSnapshotPublicPreview(snapshot: AdvancedDutyRunSnapshotRecord, eventDate: string): DutyEventPreview {
	const previewPayload = snapshot.previewPayload as unknown as DutyEventPreview | DutyEventSeriesPreview;
	if ('events' in previewPayload) {
		const preview = previewPayload.events.find((event) => event.eventDate === eventDate);
		if (!preview) {
			fail(400, getRegenerateAdvancedRunSnapshotMessage());
		}
		return preview;
	}
	if (previewPayload.eventDate !== eventDate) {
		fail(400, getRegenerateAdvancedRunSnapshotMessage());
	}
	return previewPayload;
}

export function buildApprovedAdvancedRunEventPreview(
	snapshot: AdvancedDutyRunSnapshotRecord,
	eventDate: string
): AdvancedDutyRunEventPreview {
	const snapshotEvent = getSnapshotEvent(snapshot, eventDate);
	const publicPreview = getSnapshotPublicPreview(snapshot, eventDate);
	return {
		...publicPreview,
		slotInstances: snapshotEvent.slotProposals.map((slot) => ({
			...slot,
			overrideMessages:
				publicPreview.slotInstances.find(
					(publicSlot) => publicSlot.templateSlotId === slot.templateSlotId && publicSlot.slotIndex === slot.slotIndex
				)?.overrideMessages ?? slot.overrideMessages
		})),
		blockingConflicts: snapshotEvent.blockingConflicts
	};
}

export function getOriginalProposalFromAdvancedRunSnapshot(
	snapshot: AdvancedDutyRunSnapshotRecord,
	eventDate: string
): DutyEventOriginalProposal | null {
	const snapshotPayload = snapshot.snapshotPayload as unknown as AdvancedRunSnapshotPayload;
	return snapshotPayload.originalProposalsByEventDate?.[eventDate] ?? null;
}

export async function createDraftAdvancedRunSnapshot(
	ctx: QueryPorts,
	input: {
		templateId: string;
		templateName: string;
		pattern: AdvancedRunSnapshotPattern;
		eventDates: string[];
		candidatePersonnelIds?: string[];
		inputPayload: Record<string, unknown>;
		snapshotPayload: AdvancedRunSnapshotPayload;
		previewPayload: Record<string, unknown>;
	}
): Promise<{ snapshotId: string; snapshotFingerprint: string; snapshotVersion: number }> {
	const snapshotVersion = input.snapshotPayload.snapshotVersion;
	const snapshotFingerprint = buildSnapshotFingerprint({
		input: input.inputPayload,
		preview: input.previewPayload,
		snapshot: input.snapshotPayload,
		snapshotVersion
	});
	const existingDraftRows = await ctx.store.findMany<Record<string, unknown>>(
		AdvancedDutyRunSnapshotEntity.table,
		ctx.auth.orgId,
		{
			template_id: input.templateId,
			status: 'draft'
		},
		{
			orderBy: [{ column: 'created_at', ascending: false }],
			limit: 100,
			select: 'id, expires_at, pattern, event_dates'
		}
	);
	const now = new Date().toISOString();
	const replaceableDraftIds = existingDraftRows
		.filter((row) => typeof row.expires_at !== 'string' || row.expires_at > now)
		.filter((row) => row.pattern === input.pattern)
		.filter((row) => stableStringify(row.event_dates ?? []) === stableStringify(input.eventDates))
		.map((row) => String(row.id));
	if (replaceableDraftIds.length > 0) {
		await ctx.store.deleteManyByIds(AdvancedDutyRunSnapshotEntity.table, ctx.auth.orgId, replaceableDraftIds);
	}
	const inserted = await ctx.store.insert<Record<string, unknown>>(
		AdvancedDutyRunSnapshotEntity.table,
		ctx.auth.orgId,
		AdvancedDutyRunSnapshotEntity.toDbInsert(
			{
				templateId: input.templateId,
				templateName: input.templateName,
				pattern: input.pattern,
				startDate: input.eventDates[0],
				endDate: input.eventDates[input.eventDates.length - 1],
				eventCount: input.eventDates.length,
				eventDates: input.eventDates,
				candidatePersonnelIds: input.candidatePersonnelIds ?? [],
				snapshotFingerprint,
				snapshotVersion,
				inputPayload: input.inputPayload,
				snapshotPayload: input.snapshotPayload as unknown as Record<string, unknown>,
				previewPayload: input.previewPayload,
				createdByUserId: ctx.auth.userId
			},
			ctx.auth.orgId
		)
	);

	return {
		snapshotId: String(inserted.id),
		snapshotFingerprint,
		snapshotVersion
	};
}

export async function markAdvancedRunSnapshotApplying(
	ctx: WritePorts,
	snapshotId: string,
	now = new Date().toISOString()
): Promise<void> {
	await ctx.store.update<Record<string, unknown>>(AdvancedDutyRunSnapshotEntity.table, ctx.auth.orgId, snapshotId, {
		status: 'applying',
		updated_at: now
	});
}

export async function markAdvancedRunSnapshotDraft(
	ctx: WritePorts,
	snapshotId: string,
	now = new Date().toISOString()
): Promise<void> {
	await ctx.store.update<Record<string, unknown>>(AdvancedDutyRunSnapshotEntity.table, ctx.auth.orgId, snapshotId, {
		status: 'draft',
		updated_at: now
	});
}

export async function markAdvancedRunSnapshotApplied(
	ctx: WritePorts,
	snapshotId: string,
	input: { appliedRunId: string | null },
	now = new Date().toISOString()
): Promise<void> {
	await ctx.store.update<Record<string, unknown>>(AdvancedDutyRunSnapshotEntity.table, ctx.auth.orgId, snapshotId, {
		status: 'applied',
		applied_run_id: input.appliedRunId,
		applied_at: now,
		updated_at: now
	});
}

export async function markAdvancedRunSnapshotPartialFailure(
	ctx: WritePorts,
	snapshotId: string,
	error: unknown
): Promise<void> {
	try {
		await ctx.store.update<Record<string, unknown>>(AdvancedDutyRunSnapshotEntity.table, ctx.auth.orgId, snapshotId, {
			status: 'partial-failure',
			apply_error: error instanceof Error ? error.message : 'Advanced duty apply failed.',
			updated_at: new Date().toISOString()
		});
	} catch {
		// Best effort only; the original persistence error remains the useful failure.
	}
}

export async function listVisibleAdvancedDutyRunSnapshots(ctx: QueryPorts): Promise<AdvancedDutyRunSnapshotRecord[]> {
	requireAdvancedDutyAccess(ctx.auth);
	const rows = await ctx.store.findMany<Record<string, unknown>>(
		AdvancedDutyRunSnapshotEntity.table,
		ctx.auth.orgId,
		undefined,
		{
			orderBy: [{ column: 'created_at', ascending: false }],
			limit: 100
		}
	);
	return AdvancedDutyRunSnapshotEntity.fromDbArray(rows)
		.map(withSnapshotPayloadDefaults)
		.map(withResumePreviewPayload)
		.filter(isVisibleAdvancedDutyRunSnapshot);
}

export async function listVisibleAdvancedDutyRunSnapshotSummaries(
	ctx: QueryPorts
): Promise<AdvancedDutyRunSnapshotRecord[]> {
	requireAdvancedDutyAccess(ctx.auth);
	const [resumableRows, appliedRows] = await Promise.all([
		ctx.store.findMany<Record<string, unknown>>(AdvancedDutyRunSnapshotEntity.table, ctx.auth.orgId, undefined, {
			inFilters: { status: [...RESUMABLE_ADVANCED_DUTY_RUN_SNAPSHOT_STATUSES] },
			orderBy: [{ column: 'created_at', ascending: false }],
			limit: 100,
			select: ADVANCED_DUTY_RUN_SNAPSHOT_SUMMARY_SELECT
		}),
		ctx.store.findMany<Record<string, unknown>>(
			AdvancedDutyRunSnapshotEntity.table,
			ctx.auth.orgId,
			{ status: 'applied' },
			{
				orderBy: [{ column: 'created_at', ascending: false }],
				limit: 100,
				select: ADVANCED_DUTY_RUN_APPLIED_SNAPSHOT_SELECT
			}
		)
	]);

	return AdvancedDutyRunSnapshotEntity.fromDbArray([...resumableRows, ...appliedRows])
		.map(withSummaryPayloadBoundary)
		.map(withSnapshotPayloadDefaults)
		.filter(isVisibleAdvancedDutyRunSnapshot)
		.sort((left, right) => (right.createdAt ?? '').localeCompare(left.createdAt ?? ''));
}

export async function getVisibleAdvancedDutyRunSnapshot(
	ctx: QueryPorts,
	snapshotId: string
): Promise<AdvancedDutyRunSnapshotRecord> {
	requireAdvancedDutyAccess(ctx.auth);
	const row = await ctx.store.findOne<Record<string, unknown>>(AdvancedDutyRunSnapshotEntity.table, ctx.auth.orgId, {
		id: snapshotId
	});
	if (!row) {
		fail(404, 'Advanced duty snapshot not found.');
	}
	const snapshot = AdvancedDutyRunSnapshotEntity.fromDb(row);
	if (!isVisibleAdvancedDutyRunSnapshot(snapshot)) {
		fail(404, 'Advanced duty snapshot not found.');
	}
	return withResumePreviewPayload(withSnapshotPayloadDefaults(snapshot));
}

export async function deleteVisibleAdvancedDutyRunSnapshot(
	ctx: WritePorts,
	snapshotId: string
): Promise<{ success: true }> {
	requireAdvancedDutyAccess(ctx.auth);
	const row = await ctx.store.findOne<Record<string, unknown>>(AdvancedDutyRunSnapshotEntity.table, ctx.auth.orgId, {
		id: snapshotId
	});
	if (!row) {
		fail(404, 'Advanced duty snapshot not found.');
	}
	const snapshot = AdvancedDutyRunSnapshotEntity.fromDb(row);
	if (snapshot.status === 'applied') {
		fail(400, 'Applied advanced duty snapshots cannot be deleted from the draft snapshot workspace.');
	}
	if (snapshot.status === 'applying') {
		fail(409, 'Advanced duty snapshots cannot be deleted while apply is in progress.');
	}
	await ctx.store.delete(AdvancedDutyRunSnapshotEntity.table, ctx.auth.orgId, snapshotId);
	return { success: true };
}

function withSnapshotPayloadDefaults(snapshot: AdvancedDutyRunSnapshotRecord): AdvancedDutyRunSnapshotRecord {
	const { inputPayload, snapshotPayload, previewPayload, exportModel, ...summary } = snapshot;
	return {
		...summary,
		inputPayload: inputPayload ?? {},
		snapshotPayload: snapshotPayload ?? {},
		previewPayload: previewPayload ?? {},
		exportModel: exportModel ?? null
	};
}

function withSummaryPayloadBoundary(snapshot: AdvancedDutyRunSnapshotRecord): AdvancedDutyRunSnapshotRecord {
	if (snapshot.status === 'applied') {
		return {
			...snapshot,
			inputPayload: {},
			previewPayload: {}
		};
	}
	return {
		...snapshot,
		inputPayload: {},
		snapshotPayload: {},
		previewPayload: {},
		exportModel: null
	};
}

function withResumePreviewPayload(snapshot: AdvancedDutyRunSnapshotRecord): AdvancedDutyRunSnapshotRecord {
	const snapshotPayload = snapshot.snapshotPayload as { da6Matrices?: unknown } | undefined;
	const previewPayload = snapshot.previewPayload as { da6Matrices?: unknown } | undefined;
	if (!snapshotPayload?.da6Matrices || previewPayload?.da6Matrices) return snapshot;
	return {
		...snapshot,
		previewPayload: {
			...snapshot.previewPayload,
			da6Matrices: snapshotPayload.da6Matrices
		}
	};
}

function isVisibleAdvancedDutyRunSnapshot(snapshot: AdvancedDutyRunSnapshotRecord): boolean {
	if (snapshot.status === 'draft') {
		return snapshot.expiresAt > new Date().toISOString();
	}
	return snapshot.status === 'applied' || isResumableAdvancedDutyRunSnapshotStatus(snapshot.status);
}
