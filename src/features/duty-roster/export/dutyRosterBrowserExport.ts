import type { DA6Data, RosterHistoryEntry } from '../stores/dutyRosterHistory.svelte';
import type { Da6Matrix, DutyRosterExportModel } from '../run';
import {
	manualSelectionForDate,
	previewFinalAssigneeId,
	type DutyRosterTemplateAcceptedSnapshot,
	type DutyRosterTemplatePreview,
	type DutyRosterTemplatePreviewPersonnel
} from '../templates/dutyRosterTemplatePreview';

type SnapshotBrowserExportInput = {
	model: DutyRosterExportModel;
	da6?: Da6Matrix;
};

type HistoryBrowserExportInput = {
	history: {
		roster: RosterHistoryEntry[];
		typeName: string;
		startDate: string;
		endDate: string;
		da6?: DA6Data;
	};
};

type TemplatePreviewBrowserExportInput = {
	templatePreview: DutyRosterTemplatePreview;
	statusLabel: 'Draft';
};

type AcceptedSnapshotBrowserExportInput = {
	acceptedSnapshot: DutyRosterTemplateAcceptedSnapshot;
	statusLabel: 'Official';
};

type BrowserExportInput =
	| SnapshotBrowserExportInput
	| HistoryBrowserExportInput
	| TemplatePreviewBrowserExportInput
	| AcceptedSnapshotBrowserExportInput;

interface BrowserExportDetails {
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

function formatDisplayDate(dateStr: string): string {
	const date = new Date(`${dateStr}T00:00:00`);
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatShortDate(dateStr: string): string {
	const date = new Date(`${dateStr}T00:00:00`);
	return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
}

function formatDayName(dateStr: string): string {
	const date = new Date(`${dateStr}T00:00:00`);
	return date.toLocaleDateString('en-US', { weekday: 'short' });
}

function escapeHtml(value: string | null | undefined): string {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function displayName(person: DutyRosterTemplatePreviewPersonnel | null): string {
	if (!person) return '';
	return person.firstName ? `${person.lastName}, ${person.firstName}` : person.lastName;
}

function formatDa6CellLabel(cell: Da6Matrix['rows'][number]['cells'][number]): string {
	if (cell.assigned) {
		return 'X';
	}
	if (cell.da6Code === 'A') {
		return 'A';
	}
	if (cell.da6Code === 'D' || cell.da6Code === 'U') {
		return cell.da6Code;
	}
	return cell.sequenceNumber === null ? '' : String(cell.sequenceNumber);
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

function renderRosterRows(details: BrowserExportDetails): string {
	return details.rosterRows
		.map((entry) => {
			const displayDate = formatDisplayDate(entry.date);
			const dayName = formatDayName(entry.date);
			const warningText = entry.warnings?.length ? `Warnings: ${entry.warnings.join('; ')}` : '';
			const generatedText =
				entry.source === 'manual' && entry.generatedAssignee
					? `Generated: ${entry.generatedAssignee.rank} ${displayName(entry.generatedAssignee)}`
					: '';
			const note = [entry.source === 'manual' ? 'MANUAL' : '', generatedText, warningText, entry.reason]
				.filter(Boolean)
				.join(' | ');
			if (!entry.assignee) {
				return `
					<tr class="unavailable">
						<td>${displayDate}</td>
						<td>${dayName}</td>
						<td colspan="3">UNFILLED</td>
						<td>${escapeHtml(note)}</td>
					</tr>
				`;
			}
			return `
				<tr>
					<td>${displayDate}</td>
					<td>${dayName}</td>
					<td>${escapeHtml(displayName(entry.assignee))}</td>
					<td>${escapeHtml(entry.assignee.rank)}</td>
					<td>${escapeHtml(entry.assignee.groupName)}</td>
					<td>${escapeHtml(note)}</td>
				</tr>
			`;
		})
		.join('');
}

function renderDa6Matrix(da6: Da6Matrix): string {
	if (da6.columns.length === 0) return '';

	const headerCells = da6.columns.map((column) => `<th>${formatShortDate(column.date)}</th>`).join('');
	const bodyRows = da6.rows
		.map((row) => {
			const cells = row.cells
				.map((cell) => `<td class="da6-position">${escapeHtml(formatDa6CellLabel(cell))}</td>`)
				.join('');
			return `<tr><td>${escapeHtml(row.display.rank)}</td><td>${escapeHtml(`${row.display.lastName}, ${row.display.firstName}`)}</td>${cells}</tr>`;
		})
		.join('');

	return `
		<h2>DA6 Matrix</h2>
		<p>Authorized markings only: roster numbers, A, D#, and U#.</p>
		<table>
			<tr>
				<th>Rank</th>
				<th>Name</th>
				${headerCells}
			</tr>
			${bodyRows}
		</table>
	`;
}

function renderLegacyDa6Grid(da6: DA6Data | null): string {
	if (!da6 || da6.dates.length === 0) return '';

	const headerCells = da6.dates.map((date) => `<th>${formatShortDate(date.date)}</th>`).join('');
	const bodyRows = da6.personnel
		.map((person, index) => {
			const cells = da6.dates
				.map((date) => {
					const position = date.positions[index];
					const assigned = date.assigned?.[index] ?? position === 1;
					if (position === null) {
						return '<td class="da6-unavail">&mdash;</td>';
					}
					if (assigned) {
						return '<td class="da6-assigned">X</td>';
					}
					return `<td class="da6-position">${position}</td>`;
				})
				.join('');
			return `<tr><td>${escapeHtml(person.rank)}</td><td>${escapeHtml(person.name)}</td>${cells}</tr>`;
		})
		.join('');

	return `
		<h2>DA Form 6 Reference</h2>
		<p>Queue position per date. <b>X</b> = assigned duty, number = queue position, <b>&mdash;</b> = unavailable.</p>
		<table>
			<tr>
				<th>Rank</th>
				<th>Name</th>
				${headerCells}
			</tr>
			${bodyRows}
		</table>
	`;
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

function getExportDetails(input: BrowserExportInput): BrowserExportDetails {
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

export function buildDutyRosterBrowserExportHtml(input: BrowserExportInput): string {
	const details = getExportDetails(input);
	const statusTitle = details.statusLabel ? `${details.statusLabel} ` : '';
	const da6Markup =
		details.da6 && 'rows' in details.da6 ? renderDa6Matrix(details.da6) : renderLegacyDa6Grid(details.da6);

	return `
		<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
		<head>
			<meta charset="utf-8">
			<style>
				table { border-collapse: collapse; margin-bottom: 24px; }
				th, td { border: 1px solid #000; padding: 8px; text-align: left; }
				th { background-color: #4a5568; color: white; font-weight: bold; }
				.unavailable { background-color: #fed7d7; color: #c53030; }
				.da6-assigned { background-color: #c6f6d5; font-weight: bold; text-align: center; }
				.da6-position { text-align: center; color: #718096; }
				.da6-unavail { text-align: center; color: #a0aec0; background-color: #f7fafc; }
			</style>
		</head>
		<body>
			<h2>${escapeHtml(statusTitle)}${escapeHtml(details.typeName)} Roster</h2>
			<p>Generated: ${new Date().toLocaleDateString()}</p>
			<p>Period: ${formatDisplayDate(details.startDate)} - ${formatDisplayDate(details.endDate)}</p>
			<table>
				<tr>
					<th>Date</th>
					<th>Day</th>
					<th>Assigned</th>
					<th>Rank</th>
					<th>Group</th>
					<th>Notes</th>
				</tr>
				${renderRosterRows(details)}
			</table>
			${da6Markup}
		</body>
	</html>`;
}

export function exportDutyRosterForBrowser(input: BrowserExportInput): void {
	const { typeName, startDate, endDate, statusLabel } = getExportDetails(input);
	const html = buildDutyRosterBrowserExportHtml(input);
	const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	const prefix = statusLabel ? `${statusLabel}_` : '';

	link.href = url;
	link.download = `${prefix}${typeName.replace(/\s+/g, '_')}_Roster_${startDate}_to_${endDate}.xls`;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function printDutyRosterForBrowser(input: BrowserExportInput): void {
	const printWindow = window.open('', '_blank');
	if (!printWindow) return;
	printWindow.opener = null;
	printWindow.document.open();
	printWindow.document.write(buildDutyRosterBrowserExportHtml(input));
	printWindow.document.close();
	printWindow.focus();
	printWindow.print();
}
