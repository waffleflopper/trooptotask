import { fail } from '$lib/server/core/errors';
import type { QueryPorts, WritePorts } from '$lib/server/core/ports';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import type {
	DutyRosterPoolPersonnel,
	DutyRosterTemplateAcceptedRun,
	DutyRosterTemplateCorrectionInput,
	DutyRosterTemplateRunCorrection
} from '$features/duty-roster/templates/dutyRosterTemplates';
import {
	dutyRosterCorrectionCountsTowardFuture,
	effectiveDutyRosterAssigneeId
} from '$features/duty-roster/templates/dutyRosterCorrection';
import { batchDailyAssignments } from '../dailyAssignmentsBatch';
import { acceptedRunSnapshot, parseAcceptedRunSnapshot, type DutyRosterTemplateRunRow } from './acceptedRunRecord';

const DUTY_ROSTER_TEMPLATE_CORRECTION_TABLE = 'duty_roster_template_run_corrections';
const DUTY_ROSTER_TEMPLATE_RUN_TABLE = 'duty_roster_template_runs';

type DisplayPersonnel = {
	id: string;
	rank: string;
	lastName: string;
	firstName: string;
	groupName?: string;
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

export async function loadDutyRosterRunCorrectionsByRunId(
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
	return groupCorrectionsByRunId(rows);
}

export async function hydrateAcceptedRunCorrections(
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
	const personnelById = await loadCorrectionPersonnelById(ctx, correctionsByRunId);

	return runs.map((run) => {
		const snapshot = parseAcceptedRunSnapshot(run.snapshotPayload);
		const corrections = (correctionsByRunId.get(run.id) ?? []).map((row) =>
			buildDutyRosterTemplateRunCorrectionReadModel({
				row,
				runStatus: run.status,
				snapshot,
				personnelById
			})
		);
		return {
			...run,
			corrections
		};
	});
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
		{ orderBy: [{ column: 'corrected_at', ascending: true }] }
	);
	const currentEffectiveAssigneeId = effectiveDutyRosterAssigneeId({
		runRowDate: input.runRowDate,
		acceptedAssigneeId: acceptedRow.finalAssigneeId,
		corrections: latestCorrections.map(toCorrectionEffect)
	});
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
		try {
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
		} catch (error) {
			await ctx.store.delete(DUTY_ROSTER_TEMPLATE_CORRECTION_TABLE, ctx.auth.orgId, inserted.id);
			throw error;
		}
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

	return buildDutyRosterTemplateRunCorrectionReadModel({
		row: inserted,
		runStatus: row.status,
		snapshot,
		personnelById: new Map([[input.replacementAssigneeId, toDutyRosterPoolPersonnel(replacement)]])
	});
}

function groupCorrectionsByRunId(
	rows: DutyRosterTemplateRunCorrectionRow[]
): Map<string, DutyRosterTemplateRunCorrectionRow[]> {
	const correctionsByRunId = new Map<string, DutyRosterTemplateRunCorrectionRow[]>();
	for (const row of rows) {
		const runRows = correctionsByRunId.get(row.run_id) ?? [];
		runRows.push(row);
		correctionsByRunId.set(row.run_id, runRows);
	}
	return correctionsByRunId;
}

async function loadCorrectionPersonnelById(
	ctx: QueryPorts,
	correctionsByRunId: Map<string, DutyRosterTemplateRunCorrectionRow[]>
): Promise<Map<string, DutyRosterPoolPersonnel>> {
	const personnelIds = [
		...new Set(
			[...correctionsByRunId.values()]
				.flat()
				.flatMap((correction) => [correction.original_assignee_id, correction.replacement_assignee_id])
		)
	];
	const personnelById = new Map<string, DutyRosterPoolPersonnel>();
	if (personnelIds.length === 0) {
		return personnelById;
	}

	const rows = await ctx.store.findMany<Record<string, unknown>>('personnel', ctx.auth.orgId, undefined, {
		inFilters: { id: personnelIds },
		select: PersonnelEntity.select
	});
	for (const row of rows) {
		const person = toDutyRosterPoolPersonnel(row);
		personnelById.set(person.id, person);
	}
	return personnelById;
}

function buildDutyRosterTemplateRunCorrectionReadModel(input: {
	row: DutyRosterTemplateRunCorrectionRow;
	runStatus: DutyRosterTemplateAcceptedRun['status'];
	snapshot: ReturnType<typeof parseAcceptedRunSnapshot>;
	personnelById?: Map<string, DutyRosterPoolPersonnel>;
}): DutyRosterTemplateRunCorrection {
	return {
		id: input.row.id,
		runId: input.row.run_id,
		runRowDate: input.row.run_row_date,
		originalAssigneeId: input.row.original_assignee_id,
		originalDisplay:
			snapshotPersonDisplay(input.snapshot, input.row.original_assignee_id) ??
			dbPersonnelDisplay(input.personnelById?.get(input.row.original_assignee_id)),
		replacementAssigneeId: input.row.replacement_assignee_id,
		replacementDisplay:
			snapshotPersonDisplay(input.snapshot, input.row.replacement_assignee_id) ??
			dbPersonnelDisplay(input.personnelById?.get(input.row.replacement_assignee_id)),
		reason: input.row.reason,
		correctedByUserId: input.row.corrected_by_user_id,
		correctedAt: input.row.corrected_at,
		countsTowardFuture: dutyRosterCorrectionCountsTowardFuture({ runStatus: input.runStatus })
	};
}

function toCorrectionEffect(row: DutyRosterTemplateRunCorrectionRow) {
	return {
		runRowDate: row.run_row_date,
		replacementAssigneeId: row.replacement_assignee_id,
		reason: row.reason
	};
}

function snapshotPersonDisplay(
	snapshot: ReturnType<typeof parseAcceptedRunSnapshot>,
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
	person: DisplayPersonnel | undefined
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

function toDutyRosterPoolPersonnel(row: Record<string, unknown>): DutyRosterPoolPersonnel {
	const person = PersonnelEntity.fromDb(row);
	return {
		id: person.id,
		rank: person.rank,
		lastName: person.lastName,
		firstName: person.firstName,
		mos: person.mos ?? '',
		dutyRole: person.clinicRole ?? '',
		groupId: person.groupId ?? null,
		groupName: person.groupName ?? '',
		archivedAt: person.archivedAt ?? null
	};
}
