import type { DA6Data, RosterHistoryEntry } from '../stores/dutyRosterHistory.svelte';
import type { Da6Matrix, DutyRosterExportModel } from '../run';
import {
	manualSelectionForDate,
	previewFinalAssigneeId,
	type DutyRosterTemplateAcceptedSnapshot,
	type DutyRosterTemplatePreview,
	type DutyRosterTemplatePreviewPersonnel
} from '../templates/dutyRosterTemplatePreview';

export type SnapshotBrowserExportInput = {
	model: DutyRosterExportModel;
	da6?: Da6Matrix;
};

export type HistoryBrowserExportInput = {
	history: {
		roster: RosterHistoryEntry[];
		typeName: string;
		startDate: string;
		endDate: string;
		da6?: DA6Data;
	};
};

export type TemplatePreviewBrowserExportInput = {
	templatePreview: DutyRosterTemplatePreview;
	statusLabel: 'Draft';
};

export type AcceptedSnapshotBrowserExportInput = {
	acceptedSnapshot: DutyRosterTemplateAcceptedSnapshot;
	statusLabel: 'Official';
};

export type BrowserExportInput =
	| SnapshotBrowserExportInput
	| HistoryBrowserExportInput
	| TemplatePreviewBrowserExportInput
	| AcceptedSnapshotBrowserExportInput;

export interface BrowserExportDetails {
	typeName: string;
	statusLabel: 'Draft' | 'Official' | null;
	startDate: string;
	endDate: string;
	rosterRows: Array<{
		date: string;
		assignee: DutyRosterTemplatePreviewPersonnel | null;
		generatedAssignee?: DutyRosterTemplatePreviewPersonnel | null;
		source?: 'generated' | 'manual';
		reason?: string | null;
		warnings?: string[];
	}>;
	da6: Da6Matrix | DA6Data | null;
}

function buildDa6Data(da6: Da6Matrix | DA6Data | undefined): DA6Data | null {
	if (!da6) return null;
	if ('personnel' in da6 && 'dates' in da6) {
		return da6;
	}

	return {
		personnel: da6.rows.map((row) => ({
			id: row.personnelId,
			name: `${row.display.lastName}, ${row.display.firstName}`,
			rank: row.display.rank,
			group: row.display.groupName
		})),
		dates: da6.columns.map((column, columnIndex) => ({
			date: column.date,
			positions: da6.rows.map((row) => {
				const cell = row.cells[columnIndex];
				if (!cell) return null;
				return cell.queuePosition;
			}),
			assigned: da6.rows.map((row) => Boolean(row.cells[columnIndex]?.assigned))
		}))
	};
}

function personnelByIdFromDa6(da6: Da6Matrix): Map<string, DutyRosterTemplatePreviewPersonnel> {
	return new Map(
		da6.rows.map((row) => [
			row.personnelId,
			{
				id: row.personnelId,
				rank: row.display.rank,
				lastName: row.display.lastName,
				firstName: row.display.firstName,
				groupId: row.display.groupId,
				groupName: row.display.groupName,
				archivedAt: null
			}
		])
	);
}

function previewAssignee(
	preview: DutyRosterTemplatePreview,
	assigneeId: string | null
): DutyRosterTemplatePreviewPersonnel | null {
	return assigneeId ? (preview.selectionPersonnel.find((person) => person.id === assigneeId) ?? null) : null;
}

export function displayDutyRosterPersonName(person: DutyRosterTemplatePreviewPersonnel | null): string {
	if (!person) return '';
	return person.firstName ? `${person.lastName}, ${person.firstName}` : person.lastName;
}

export function getDutyRosterExportDetails(input: BrowserExportInput): BrowserExportDetails {
	if ('templatePreview' in input) {
		return {
			typeName: input.templatePreview.assignmentType.name,
			statusLabel: input.statusLabel,
			startDate: input.templatePreview.config.startDate,
			endDate: input.templatePreview.config.endDate,
			rosterRows: input.templatePreview.rosterRows.map((row) => {
				const manualSelection = manualSelectionForDate(input.templatePreview, row.date);
				const finalAssigneeId = previewFinalAssigneeId(input.templatePreview, row.date);
				return {
					date: row.date,
					assignee: previewAssignee(input.templatePreview, finalAssigneeId),
					generatedAssignee: previewAssignee(input.templatePreview, row.assigneeId),
					source: manualSelection ? 'manual' : 'generated',
					reason: manualSelection?.reason ?? row.reason ?? null,
					warnings: manualSelection?.warnings.map((warning) => warning.message) ?? []
				};
			}),
			da6: input.templatePreview.da6
		};
	}

	if ('acceptedSnapshot' in input) {
		return {
			typeName: input.acceptedSnapshot.template.name,
			statusLabel: input.statusLabel,
			startDate: input.acceptedSnapshot.config.startDate,
			endDate: input.acceptedSnapshot.config.endDate,
			rosterRows: input.acceptedSnapshot.finalRows.map((row) => ({
				date: row.date,
				assignee: row.finalDisplay,
				generatedAssignee: row.generatedDisplay,
				source: row.assignmentSource,
				reason: row.reason,
				warnings: row.warnings.map((warning) => warning.message)
			})),
			da6: input.acceptedSnapshot.da6
		};
	}

	if ('history' in input) {
		return {
			typeName: input.history.typeName,
			statusLabel: null,
			startDate: input.history.startDate,
			endDate: input.history.endDate,
			rosterRows: input.history.roster.map((row) => ({
				date: row.date,
				assignee: row.assigneeId
					? {
							id: row.assigneeId,
							rank: row.assigneeRank ?? '',
							lastName: row.assigneeName ?? '',
							firstName: '',
							groupId: null,
							groupName: row.assigneeGroup ?? '',
							archivedAt: null
						}
					: null,
				reason: row.reason ?? null
			})),
			da6: buildDa6Data(input.history.da6)
		};
	}

	const personnelById = personnelByIdFromDa6(input.model.da6);
	return {
		typeName: input.model.assignmentType.name,
		statusLabel: null,
		startDate: input.model.startDate,
		endDate: input.model.endDate,
		rosterRows: input.model.rosterRows.map((row) => ({
			date: row.date,
			assignee: row.assigneeId ? (personnelById.get(row.assigneeId) ?? null) : null,
			reason: row.reason ?? null
		})),
		da6: input.da6 ?? input.model.da6
	};
}

export function dutyRosterExportFilename(details: BrowserExportDetails): string {
	const prefix = details.statusLabel ? `${details.statusLabel}_` : '';
	return `${prefix}${details.typeName.replace(/\s+/g, '_')}_Roster_${details.startDate}_to_${details.endDate}.xlsx`;
}
