import { fail } from '$lib/server/core/errors';
import type { QueryPorts, WritePorts } from '$lib/server/core/ports';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import type {
	DutyRosterPoolPersonnel,
	DutyRosterTemplate,
	DutyRosterTemplateAcceptedRun,
	DutyRosterTemplateCountReadModel,
	DutyRosterTemplateCorrectionInput,
	DutyRosterTemplateRunCorrection
} from '$features/duty-roster/templates/dutyRosterTemplates';
import { resolveDutyRosterPool } from '$features/duty-roster/templates/dutyRosterPool';
import {
	buildDutyRosterCountSource,
	type DutyRosterCountSourceModel,
	type DutyRosterCountSourceRun
} from '$features/duty-roster/templates/dutyRosterCountSource';
import {
	buildDutyRosterTemplateAcceptedSnapshot,
	type DutyRosterTemplateAcceptedSnapshot,
	type DutyRosterTemplatePreview
} from '$features/duty-roster/templates/dutyRosterTemplatePreview';
import { batchDailyAssignments } from '../dailyAssignmentsBatch';

const DUTY_ROSTER_TEMPLATE_RUN_TABLE = 'duty_roster_template_runs';
const DUTY_ROSTER_TEMPLATE_CORRECTION_TABLE = 'duty_roster_template_run_corrections';

export type DutyRosterTemplateRunRow = {
	id: string;
	organization_id: string;
	template_id: string;
	template_name: string;
	status: 'accepted' | 'invalidated';
	start_date: string;
	end_date: string;
	snapshot_payload: Record<string, unknown>;
	accepted_by_user_id: string | null;
	accepted_at: string;
	applied_by_user_id: string | null;
	applied_at: string | null;
	invalidated_by_user_id: string | null;
	invalidated_at: string | null;
	created_at: string;
};

export type DutyRosterTemplateRunCorrectionRow = {
	id: string;
	organization_id: string;
	run_id: string;
	run_row_date: string;
	original_assignee_id: string;
	replacement_assignee_id: string;
	reason: string;
	corrected_by_user_id: string | null;
	corrected_at: string;
	created_at: string;
};

type DutyRosterTemplateLinkedCalendarAssignmentRow = {
	id: string;
	duty_roster_template_run_id: string;
	duty_roster_template_run_row_date: string | null;
	date: string;
	assignment_type_id: string;
	assignee_id: string;
};

export type DutyRosterTemplateApplyResult = {
	acceptedRun: DutyRosterTemplateAcceptedRun;
	insertedCount: number;
	clearedCount: number;
};

export type DutyRosterTemplateInvalidateResult = {
	invalidatedRun: DutyRosterTemplateAcceptedRun;
	removedCalendarAssignments: number;
	calendarAssignmentsEdited: boolean;
};

export type AcceptedDutyRosterRunCountSource = DutyRosterTemplateCountReadModel & {
	continuationHistory: DutyRosterCountSourceModel['continuationHistory'];
};

function toAcceptedDutyRosterTemplateRun(row: DutyRosterTemplateRunRow): DutyRosterTemplateAcceptedRun {
	return {
		id: row.id,
		templateId: row.template_id,
		templateName: row.template_name,
		status: row.status,
		startDate: row.start_date,
		endDate: row.end_date,
		acceptedAt: row.accepted_at,
		acceptedByUserId: row.accepted_by_user_id,
		appliedAt: row.applied_at ?? null,
		appliedByUserId: row.applied_by_user_id ?? null,
		invalidatedAt: row.invalidated_at ?? null,
		invalidatedByUserId: row.invalidated_by_user_id ?? null,
		linkedCalendarAssignmentCount: 0,
		calendarAssignmentsEdited: false,
		corrections: [],
		snapshotPayload: row.snapshot_payload,
		createdAt: row.created_at
	};
}

function parseAcceptedRunSnapshot(snapshotPayload: Record<string, unknown>): DutyRosterTemplateAcceptedSnapshot {
	if (snapshotPayload.snapshotVersion !== 1) {
		fail(500, 'Unsupported Duty Roster accepted snapshot version.');
	}

	return snapshotPayload as unknown as DutyRosterTemplateAcceptedSnapshot;
}

function acceptedRunSnapshot(row: DutyRosterTemplateRunRow): DutyRosterTemplateAcceptedSnapshot {
	return parseAcceptedRunSnapshot(row.snapshot_payload);
}

async function loadDutyRosterRunCorrectionsByRunId(
	ctx: QueryPorts,
	runIds: string[]
): Promise<Map<string, DutyRosterTemplateRunCorrectionRow[]>> {
	if (runIds.length === 0) {
		return new Map();
	}

	const rows = await ctx.store.findMany<DutyRosterTemplateRunCorrectionRow>(
		DUTY_ROSTER_TEMPLATE_CORRECTION_TABLE,
		ctx.auth.orgId,
		{},
		{
			inFilters: { run_id: runIds },
			orderBy: [
				{ column: 'run_row_date', ascending: true },
				{ column: 'corrected_at', ascending: true }
			]
		}
	);
	const correctionsByRunId = new Map<string, DutyRosterTemplateRunCorrectionRow[]>();
	for (const row of rows) {
		const runRows = correctionsByRunId.get(row.run_id) ?? [];
		runRows.push(row);
		correctionsByRunId.set(row.run_id, runRows);
	}

	return correctionsByRunId;
}

export async function listAcceptedDutyRosterTemplateRuns(
	ctx: QueryPorts,
	templateId: string
): Promise<DutyRosterTemplateAcceptedRun[]> {
	const rows = await ctx.store.findMany<DutyRosterTemplateRunRow>(
		DUTY_ROSTER_TEMPLATE_RUN_TABLE,
		ctx.auth.orgId,
		{ template_id: templateId },
		{
			inFilters: { status: ['accepted', 'invalidated'] },
			orderBy: [{ column: 'accepted_at', ascending: false }]
		}
	);

	const runsWithCorrections = await hydrateAcceptedRunCorrections(ctx, rows.map(toAcceptedDutyRosterTemplateRun));
	return hydrateAcceptedRunCalendarState(ctx, runsWithCorrections);
}

export async function hasAcceptedDutyRosterTemplateRun(ctx: QueryPorts, templateId: string): Promise<boolean> {
	const rows = await ctx.store.findMany<{ id: string }>(
		DUTY_ROSTER_TEMPLATE_RUN_TABLE,
		ctx.auth.orgId,
		{ template_id: templateId, status: 'accepted' },
		{ select: 'id', limit: 1 }
	);

	return rows.length > 0;
}

export async function loadAcceptedDutyRosterRunCountSource(
	ctx: QueryPorts,
	input: {
		template: DutyRosterTemplate;
		personnel: DutyRosterPoolPersonnel[];
		baselineStartDate?: string;
	}
): Promise<AcceptedDutyRosterRunCountSource> {
	const runRows = await ctx.store.findMany<DutyRosterTemplateRunRow>(
		DUTY_ROSTER_TEMPLATE_RUN_TABLE,
		ctx.auth.orgId,
		{ template_id: input.template.id },
		{
			inFilters: { status: ['accepted', 'invalidated'] },
			orderBy: [{ column: 'accepted_at', ascending: true }]
		}
	);
	const correctionsByRunId = await loadDutyRosterRunCorrectionsByRunId(
		ctx,
		runRows.map((row) => row.id)
	);
	const resolvedPool = resolveDutyRosterPool({
		criteria: input.template.poolCriteria,
		personnel: input.personnel
	}).filter((person) => !input.template.exemptPersonnelIds.includes(person.id));
	const runs: DutyRosterCountSourceRun[] = runRows.map((row) => ({
		id: row.id,
		status: row.status,
		acceptedAt: row.accepted_at,
		snapshot: acceptedRunSnapshot(row),
		corrections: (correctionsByRunId.get(row.id) ?? []).map((correction) => ({
			runRowDate: correction.run_row_date,
			replacementAssigneeId: correction.replacement_assignee_id,
			reason: correction.reason
		}))
	}));

	return buildDutyRosterCountSource({
		template: input.template,
		resolvedPool,
		runs,
		baselineStartDate: input.baselineStartDate
	});
}

export async function acceptReviewedDutyRosterTemplatePreview(
	ctx: WritePorts,
	input: { preview: DutyRosterTemplatePreview; acceptedAt?: string }
): Promise<DutyRosterTemplateAcceptedRun> {
	const acceptedAt = input.acceptedAt ?? new Date().toISOString();
	const snapshot = buildDutyRosterTemplateAcceptedSnapshot({
		preview: input.preview,
		acceptedAt,
		acceptedByUserId: ctx.auth.userId
	});
	const inserted = await ctx.store.insert<DutyRosterTemplateRunRow>(DUTY_ROSTER_TEMPLATE_RUN_TABLE, ctx.auth.orgId, {
		template_id: input.preview.assignmentType.id,
		template_name: input.preview.assignmentType.name,
		status: 'accepted',
		start_date: input.preview.config.startDate,
		end_date: input.preview.config.endDate,
		snapshot_payload: snapshot as unknown as Record<string, unknown>,
		accepted_by_user_id: ctx.auth.userId,
		accepted_at: acceptedAt,
		created_at: acceptedAt
	});

	await ctx.audit.log({
		action: 'duty_roster_template_run.accepted',
		resourceType: 'duty_roster_template_run',
		resourceId: inserted.id
	});

	return toAcceptedDutyRosterTemplateRun(inserted);
}

export async function applyAcceptedDutyRosterTemplateRun(
	ctx: WritePorts,
	input: { runId: string }
): Promise<DutyRosterTemplateApplyResult> {
	const row = await ctx.store.findOne<DutyRosterTemplateRunRow>(DUTY_ROSTER_TEMPLATE_RUN_TABLE, ctx.auth.orgId, {
		id: input.runId,
		status: 'accepted'
	});
	if (!row) {
		fail(404, 'Accepted Duty Roster Run not found');
	}

	const [hydrated] = await hydrateAcceptedRunCorrections(ctx, [toAcceptedDutyRosterTemplateRun(row)]);
	return applyAcceptedDutyRosterTemplateRunRecord(ctx, hydrated ?? toAcceptedDutyRosterTemplateRun(row));
}

export async function recordDutyRosterTemplateRunCorrection(
	ctx: WritePorts,
	input: DutyRosterTemplateCorrectionInput
): Promise<DutyRosterTemplateRunCorrection> {
	const row = await ctx.store.findOne<DutyRosterTemplateRunRow>(DUTY_ROSTER_TEMPLATE_RUN_TABLE, ctx.auth.orgId, {
		id: input.runId
	});
	if (!row) {
		fail(404, 'Accepted Duty Roster Run not found');
	}
	if (row.status === 'invalidated') {
		fail(400, 'Invalidated Duty Roster Runs cannot be corrected.');
	}

	const snapshot = acceptedRunSnapshot(row);
	const acceptedRow = snapshot.finalRows.find((candidate) => candidate.date === input.runRowDate);
	if (!acceptedRow) {
		fail(400, 'Duty date is not part of this accepted run.');
	}
	if (!acceptedRow.finalAssigneeId) {
		fail(400, 'Only assigned Duty Roster rows can be corrected.');
	}

	const latestCorrections = await ctx.store.findMany<DutyRosterTemplateRunCorrectionRow>(
		DUTY_ROSTER_TEMPLATE_CORRECTION_TABLE,
		ctx.auth.orgId,
		{ run_id: input.runId, run_row_date: input.runRowDate },
		{ orderBy: [{ column: 'corrected_at', ascending: false }], limit: 1 }
	);
	const currentEffectiveAssigneeId = latestCorrections[0]?.replacement_assignee_id ?? acceptedRow.finalAssigneeId;
	if (currentEffectiveAssigneeId === input.replacementAssigneeId) {
		fail(400, 'Replacement Soldier must differ from the current Soldier.');
	}

	const replacement = await ctx.store.findOne<Record<string, unknown>>('personnel', ctx.auth.orgId, {
		id: input.replacementAssigneeId,
		archived_at: null
	});
	if (!replacement) {
		fail(400, 'Replacement Soldier is missing or archived.');
	}

	const correctedAt = new Date().toISOString();
	const inserted = await ctx.store.insert<DutyRosterTemplateRunCorrectionRow>(
		DUTY_ROSTER_TEMPLATE_CORRECTION_TABLE,
		ctx.auth.orgId,
		{
			run_id: row.id,
			run_row_date: input.runRowDate,
			original_assignee_id: currentEffectiveAssigneeId,
			replacement_assignee_id: input.replacementAssigneeId,
			reason: input.reason,
			corrected_by_user_id: ctx.auth.userId,
			corrected_at: correctedAt,
			created_at: correctedAt
		}
	);

	if (row.applied_at) {
		await batchDailyAssignments(ctx, {
			records: [
				{
					date: input.runRowDate,
					assignmentTypeId: snapshot.template.id,
					assigneeId: input.replacementAssigneeId,
					dutyRosterTemplateRunId: row.id,
					dutyRosterTemplateRunRowDate: input.runRowDate
				}
			]
		});
	}

	await ctx.audit.log({
		action: 'duty_roster_template_run.corrected',
		resourceType: 'duty_roster_template_run',
		resourceId: row.id,
		details: {
			correctionId: inserted.id,
			runRowDate: inserted.run_row_date,
			originalAssigneeId: inserted.original_assignee_id,
			replacementAssigneeId: inserted.replacement_assignee_id,
			calendarSynced: Boolean(row.applied_at)
		}
	});

	return {
		id: inserted.id,
		runId: inserted.run_id,
		runRowDate: inserted.run_row_date,
		originalAssigneeId: inserted.original_assignee_id,
		originalDisplay: snapshotPersonDisplay(snapshot, inserted.original_assignee_id),
		replacementAssigneeId: inserted.replacement_assignee_id,
		replacementDisplay:
			snapshotPersonDisplay(snapshot, inserted.replacement_assignee_id) ??
			dbPersonnelDisplay(PersonnelEntity.fromDb(replacement)),
		reason: inserted.reason,
		correctedByUserId: inserted.corrected_by_user_id,
		correctedAt: inserted.corrected_at,
		countsTowardFuture: true
	};
}

export async function invalidateLatestDutyRosterTemplateRun(
	ctx: WritePorts,
	input: { runId: string }
): Promise<DutyRosterTemplateInvalidateResult> {
	const row = await ctx.store.findOne<DutyRosterTemplateRunRow>(DUTY_ROSTER_TEMPLATE_RUN_TABLE, ctx.auth.orgId, {
		id: input.runId
	});
	if (!row) {
		fail(404, 'Accepted Duty Roster Run not found');
	}
	if (row.status === 'invalidated') {
		fail(400, 'Duty Roster Run is already invalidated.');
	}

	const templateRuns = await ctx.store.findMany<DutyRosterTemplateRunRow>(
		DUTY_ROSTER_TEMPLATE_RUN_TABLE,
		ctx.auth.orgId,
		{ template_id: row.template_id },
		{
			inFilters: { status: ['accepted', 'invalidated'] },
			orderBy: [{ column: 'accepted_at', ascending: false }]
		}
	);
	if (templateRuns[0]?.id !== row.id) {
		fail(400, 'Only the latest Accepted Duty Roster Run can be invalidated.');
	}

	const acceptedRun = toAcceptedDutyRosterTemplateRun(row);
	const linkedRows = row.applied_at
		? await ctx.store.findMany<DutyRosterTemplateLinkedCalendarAssignmentRow>(
				'daily_assignments',
				ctx.auth.orgId,
				{ duty_roster_template_run_id: row.id },
				{
					select:
						'id, duty_roster_template_run_id, duty_roster_template_run_row_date, date, assignment_type_id, assignee_id'
				}
			)
		: [];
	const calendarAssignmentsEdited = linkedCalendarAssignmentsWereEdited(acceptedRun, linkedRows);
	const calendarRemoval =
		linkedRows.length > 0
			? await batchDailyAssignments(ctx, {
					records: linkedRows.map((assignment) => ({
						date: assignment.date,
						assignmentTypeId: assignment.assignment_type_id,
						assigneeId: ''
					}))
				})
			: { inserted: [], cleared: 0 };

	const invalidatedAt = new Date().toISOString();
	const updated = await ctx.store.update<DutyRosterTemplateRunRow>(
		DUTY_ROSTER_TEMPLATE_RUN_TABLE,
		ctx.auth.orgId,
		row.id,
		{
			status: 'invalidated',
			invalidated_at: invalidatedAt,
			invalidated_by_user_id: ctx.auth.userId
		}
	);

	await ctx.audit.log({
		action: 'duty_roster_template_run.invalidated',
		resourceType: 'duty_roster_template_run',
		resourceId: row.id,
		details: {
			removedCalendarAssignments: calendarRemoval.cleared,
			calendarAssignmentsEdited
		}
	});

	return {
		invalidatedRun: toAcceptedDutyRosterTemplateRun(updated),
		removedCalendarAssignments: calendarRemoval.cleared,
		calendarAssignmentsEdited
	};
}

export async function acceptAndApplyDutyRosterTemplatePreview(
	ctx: WritePorts,
	input: { preview: DutyRosterTemplatePreview }
): Promise<DutyRosterTemplateApplyResult> {
	const acceptedRun = await acceptReviewedDutyRosterTemplatePreview(ctx, input);
	return applyAcceptedDutyRosterTemplateRunRecord(ctx, acceptedRun);
}

function snapshotPersonDisplay(
	snapshot: DutyRosterTemplateAcceptedSnapshot,
	personnelId: string | null
): DutyRosterTemplateRunCorrection['originalDisplay'] {
	if (!personnelId) return null;
	const person = snapshot.selectionPersonnel.find((candidate) => candidate.id === personnelId);
	if (!person) return null;

	return {
		id: person.id,
		rank: person.rank,
		lastName: person.lastName,
		firstName: person.firstName,
		groupName: person.groupName ?? ''
	};
}

function dbPersonnelDisplay(
	person:
		| {
				id: string;
				rank: string;
				lastName: string;
				firstName: string;
				groupName?: string;
		  }
		| undefined
): DutyRosterTemplateRunCorrection['replacementDisplay'] {
	if (!person) return null;

	return {
		id: person.id,
		rank: person.rank,
		lastName: person.lastName,
		firstName: person.firstName,
		groupName: person.groupName ?? ''
	};
}

function expectedCalendarAssignmentsByRowDate(
	run: DutyRosterTemplateAcceptedRun
): Map<string, { assignmentTypeId: string; assigneeId: string }> {
	const snapshot = run.snapshotPayload as unknown as DutyRosterTemplateAcceptedSnapshot;
	const expected = new Map<string, { assignmentTypeId: string; assigneeId: string }>();
	const correctionByDate = new Map(run.corrections.map((correction) => [correction.runRowDate, correction]));

	for (const row of snapshot.finalRows) {
		const assigneeId = correctionByDate.get(row.date)?.replacementAssigneeId ?? row.finalAssigneeId;
		if (!assigneeId) continue;
		expected.set(row.date, {
			assignmentTypeId: snapshot.template.id,
			assigneeId
		});
	}

	return expected;
}

function linkedCalendarAssignmentsWereEdited(
	run: DutyRosterTemplateAcceptedRun,
	rows: DutyRosterTemplateLinkedCalendarAssignmentRow[]
): boolean {
	if (!run.appliedAt) {
		return false;
	}

	const expected = expectedCalendarAssignmentsByRowDate(run);
	if (rows.length !== expected.size) {
		return true;
	}

	for (const row of rows) {
		const rowDate = row.duty_roster_template_run_row_date ?? row.date;
		const expectedRow = expected.get(rowDate);
		if (
			!expectedRow ||
			row.date !== rowDate ||
			row.assignment_type_id !== expectedRow.assignmentTypeId ||
			row.assignee_id !== expectedRow.assigneeId
		) {
			return true;
		}
	}

	return false;
}

function applyRecordsFromAcceptedRun(run: DutyRosterTemplateAcceptedRun) {
	const snapshot = parseAcceptedRunSnapshot(run.snapshotPayload);
	const correctionByDate = new Map(run.corrections.map((correction) => [correction.runRowDate, correction]));
	return snapshot.finalRows.map((row) => ({
		date: row.date,
		assignmentTypeId: snapshot.template.id,
		assigneeId: correctionByDate.get(row.date)?.replacementAssigneeId ?? row.finalAssigneeId ?? '',
		dutyRosterTemplateRunId: run.id,
		dutyRosterTemplateRunRowDate: row.date
	}));
}

async function applyAcceptedDutyRosterTemplateRunRecord(
	ctx: WritePorts,
	run: DutyRosterTemplateAcceptedRun
): Promise<DutyRosterTemplateApplyResult> {
	const result = await batchDailyAssignments(ctx, {
		records: applyRecordsFromAcceptedRun(run)
	});
	const appliedAt = new Date().toISOString();
	const updated = await ctx.store.update<DutyRosterTemplateRunRow>(
		DUTY_ROSTER_TEMPLATE_RUN_TABLE,
		ctx.auth.orgId,
		run.id,
		{
			applied_at: appliedAt,
			applied_by_user_id: ctx.auth.userId
		}
	);

	await ctx.audit.log({
		action: 'duty_roster_template_run.applied_to_calendar',
		resourceType: 'duty_roster_template_run',
		resourceId: run.id,
		details: {
			inserted: result.inserted.length,
			cleared: result.cleared
		}
	});

	return {
		acceptedRun: toAcceptedDutyRosterTemplateRun(updated),
		insertedCount: result.inserted.length,
		clearedCount: result.cleared
	};
}

async function hydrateAcceptedRunCalendarState(
	ctx: QueryPorts,
	runs: DutyRosterTemplateAcceptedRun[]
): Promise<DutyRosterTemplateAcceptedRun[]> {
	const appliedRunIds = runs.filter((run) => run.appliedAt).map((run) => run.id);
	if (appliedRunIds.length === 0) {
		return runs;
	}

	const rows = await ctx.store.findMany<DutyRosterTemplateLinkedCalendarAssignmentRow>(
		'daily_assignments',
		ctx.auth.orgId,
		{},
		{
			inFilters: { duty_roster_template_run_id: appliedRunIds },
			select:
				'id, duty_roster_template_run_id, duty_roster_template_run_row_date, date, assignment_type_id, assignee_id'
		}
	);
	const rowsByRunId = new Map<string, DutyRosterTemplateLinkedCalendarAssignmentRow[]>();
	for (const row of rows) {
		const runRows = rowsByRunId.get(row.duty_roster_template_run_id) ?? [];
		runRows.push(row);
		rowsByRunId.set(row.duty_roster_template_run_id, runRows);
	}

	return runs.map((run) => {
		const runRows = rowsByRunId.get(run.id) ?? [];
		return {
			...run,
			linkedCalendarAssignmentCount: runRows.length,
			calendarAssignmentsEdited: linkedCalendarAssignmentsWereEdited(run, runRows)
		};
	});
}

async function hydrateAcceptedRunCorrections(
	ctx: QueryPorts,
	runs: DutyRosterTemplateAcceptedRun[]
): Promise<DutyRosterTemplateAcceptedRun[]> {
	if (runs.length === 0) {
		return runs;
	}

	const correctionsByRunId = await loadDutyRosterRunCorrectionsByRunId(
		ctx,
		runs.map((run) => run.id)
	);
	const personnelIds = [
		...new Set(
			[...correctionsByRunId.values()]
				.flat()
				.flatMap((correction) => [correction.original_assignee_id, correction.replacement_assignee_id])
		)
	];
	const personnelById = new Map<string, DutyRosterPoolPersonnel>();
	if (personnelIds.length > 0) {
		const rows = await ctx.store.findMany<Record<string, unknown>>('personnel', ctx.auth.orgId, undefined, {
			inFilters: { id: personnelIds },
			select: PersonnelEntity.select
		});
		for (const person of PersonnelEntity.fromDbArray(rows)) {
			personnelById.set(person.id, {
				id: person.id,
				rank: person.rank,
				lastName: person.lastName,
				firstName: person.firstName,
				mos: person.mos ?? '',
				dutyRole: person.clinicRole ?? '',
				groupId: person.groupId ?? null,
				groupName: person.groupName ?? '',
				archivedAt: person.archivedAt ?? null
			});
		}
	}

	return runs.map((run) => {
		const snapshot = parseAcceptedRunSnapshot(run.snapshotPayload);
		const corrections = (correctionsByRunId.get(run.id) ?? []).map((correction) => ({
			id: correction.id,
			runId: correction.run_id,
			runRowDate: correction.run_row_date,
			originalAssigneeId: correction.original_assignee_id,
			originalDisplay:
				snapshotPersonDisplay(snapshot, correction.original_assignee_id) ??
				dbPersonnelDisplay(personnelById.get(correction.original_assignee_id)),
			replacementAssigneeId: correction.replacement_assignee_id,
			replacementDisplay:
				snapshotPersonDisplay(snapshot, correction.replacement_assignee_id) ??
				dbPersonnelDisplay(personnelById.get(correction.replacement_assignee_id)),
			reason: correction.reason,
			correctedByUserId: correction.corrected_by_user_id,
			correctedAt: correction.corrected_at,
			countsTowardFuture: run.status === 'accepted'
		}));
		return {
			...run,
			corrections
		};
	});
}
