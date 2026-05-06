import type { DutyRosterTemplateAcceptedSnapshot } from './dutyRosterTemplatePreview';

export type DutyRosterCorrectionEffect = {
	runRowDate: string;
	replacementAssigneeId: string;
	reason: string;
};

export function dutyRosterCorrectionCountsTowardFuture(input: { runStatus: 'accepted' | 'invalidated' }): boolean {
	return input.runStatus === 'accepted';
}

export function latestDutyRosterCorrectionsByDate(
	corrections: DutyRosterCorrectionEffect[]
): Map<string, DutyRosterCorrectionEffect> {
	return new Map(corrections.map((correction) => [correction.runRowDate, correction]));
}

export function effectiveDutyRosterAssigneeId(input: {
	runRowDate: string;
	acceptedAssigneeId: string | null;
	corrections: DutyRosterCorrectionEffect[];
}): string | null {
	return (
		latestDutyRosterCorrectionsByDate(input.corrections).get(input.runRowDate)?.replacementAssigneeId ??
		input.acceptedAssigneeId
	);
}

export function applyDutyRosterCorrectionsToSnapshot(
	snapshot: DutyRosterTemplateAcceptedSnapshot,
	corrections: DutyRosterCorrectionEffect[]
): DutyRosterTemplateAcceptedSnapshot {
	const latest = latestDutyRosterCorrectionsByDate(corrections);
	if (latest.size === 0) {
		return snapshot;
	}

	return {
		...snapshot,
		finalRows: snapshot.finalRows.map((row) => {
			const correction = latest.get(row.date);
			if (!correction) return row;

			const replacementDisplay =
				snapshot.selectionPersonnel.find((person) => person.id === correction.replacementAssigneeId) ??
				(row.finalDisplay?.id === correction.replacementAssigneeId ? row.finalDisplay : null);
			return {
				...row,
				finalAssigneeId: correction.replacementAssigneeId,
				finalDisplay: replacementDisplay,
				reason: correction.reason
			};
		})
	};
}
