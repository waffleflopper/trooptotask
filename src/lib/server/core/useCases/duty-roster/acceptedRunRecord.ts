import { fail } from '$lib/server/core/errors';
import type {
	DutyRosterPoolPersonnel,
	DutyRosterTemplateAcceptedRun,
	DutyRosterTemplateRunCorrection
} from '$features/duty-roster/templates/dutyRosterTemplates';
import type { DutyRosterTemplateAcceptedSnapshot } from '$features/duty-roster/templates/dutyRosterTemplatePreview';

type DisplayPersonnel = {
	id: string;
	rank: string;
	lastName: string;
	firstName: string;
	groupName?: string;
};

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

export type DutyRosterTemplateLinkedCalendarAssignmentRow = {
	id: string;
	duty_roster_template_run_id: string;
	duty_roster_template_run_row_date: string | null;
	date: string;
	assignment_type_id: string;
	assignee_id: string;
};

export function toAcceptedDutyRosterTemplateRun(row: DutyRosterTemplateRunRow): DutyRosterTemplateAcceptedRun {
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

export function parseAcceptedRunSnapshot(snapshotPayload: Record<string, unknown>): DutyRosterTemplateAcceptedSnapshot {
	if (snapshotPayload.snapshotVersion !== 1) {
		fail(500, 'Unsupported Duty Roster accepted snapshot version.');
	}

	return snapshotPayload as unknown as DutyRosterTemplateAcceptedSnapshot;
}

export function acceptedRunSnapshot(row: DutyRosterTemplateRunRow): DutyRosterTemplateAcceptedSnapshot {
	return parseAcceptedRunSnapshot(row.snapshot_payload);
}

export function buildDutyRosterTemplateRunCorrectionReadModel(input: {
	row: DutyRosterTemplateRunCorrectionRow;
	runStatus: DutyRosterTemplateAcceptedRun['status'];
	snapshot: DutyRosterTemplateAcceptedSnapshot;
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
		countsTowardFuture: input.runStatus === 'accepted'
	};
}

export function snapshotPersonDisplay(
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

export function dbPersonnelDisplay(
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

export function expectedCalendarAssignmentsByRowDate(
	run: DutyRosterTemplateAcceptedRun
): Map<string, { assignmentTypeId: string; assigneeId: string }> {
	const snapshot = parseAcceptedRunSnapshot(run.snapshotPayload);
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

export function linkedCalendarAssignmentsWereEdited(
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

export function applyRecordsFromAcceptedRun(run: DutyRosterTemplateAcceptedRun) {
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
