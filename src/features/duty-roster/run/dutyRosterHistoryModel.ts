import type { AssignmentType, Personnel } from '$lib/types';
import type { DutyRosterHistoryPayload } from './dutyRosterRun.types';

export const MANUAL_HISTORY_IMPORT_SOURCE = 'manual-history-import';

export function isManualHistoryImport(config: Record<string, unknown> | undefined): boolean {
	return config?.historySource === MANUAL_HISTORY_IMPORT_SOURCE;
}

export function buildManualHistoryImportPayload(input: {
	assignmentType: AssignmentType;
	assignee: Personnel;
	dutyDate: string;
	sourceNote: string;
}): DutyRosterHistoryPayload {
	const sourceNote = input.sourceNote.trim();
	return {
		assignmentTypeId: input.assignmentType.id,
		name: `Manual history import - ${input.assignmentType.name} - ${input.dutyDate}`,
		startDate: input.dutyDate,
		endDate: input.dutyDate,
		roster: [
			{
				date: input.dutyDate,
				assigneeId: input.assignee.id,
				assigneeName: `${input.assignee.lastName}, ${input.assignee.firstName}`,
				assigneeRank: input.assignee.rank,
				assigneeGroup: input.assignee.groupName,
				reason: sourceNote
			}
		],
		config: {
			historySource: MANUAL_HISTORY_IMPORT_SOURCE,
			sourceNote,
			assignmentTypeName: input.assignmentType.name
		}
	};
}
