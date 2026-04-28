import type { DA6Data, RosterHistoryEntry } from '../stores/dutyRosterHistory.svelte';
import type { Da6Matrix, DutyRosterExportModel } from '../run';

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

type BrowserExportInput = SnapshotBrowserExportInput | HistoryBrowserExportInput;

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
				return cell.assigned ? 1 : cell.queuePosition;
			})
		}))
	};
}

function renderRosterRows(input: BrowserExportInput): string {
	if ('history' in input) {
		return input.history.roster
			.map((entry) => {
				const displayDate = formatDisplayDate(entry.date);
				const dayName = formatDayName(entry.date);
				if (!entry.assigneeId) {
					return `
						<tr class="unavailable">
							<td>${displayDate}</td>
							<td>${dayName}</td>
							<td colspan="3">UNFILLED</td>
							<td>${escapeHtml(entry.reason)}</td>
						</tr>
					`;
				}
				return `
					<tr>
						<td>${displayDate}</td>
						<td>${dayName}</td>
						<td>${escapeHtml(entry.assigneeName)}</td>
						<td>${escapeHtml(entry.assigneeRank)}</td>
						<td>${escapeHtml(entry.assigneeGroup)}</td>
						<td></td>
					</tr>
				`;
			})
			.join('');
	}

	const personnelById = new Map(input.model.da6.rows.map((row) => [row.personnelId, row.display] as const));
	return input.model.rosterRows
		.map((entry) => {
			const assignee = entry.assigneeId ? (personnelById.get(entry.assigneeId) ?? null) : null;
			const displayDate = formatDisplayDate(entry.date);
			const dayName = formatDayName(entry.date);
			if (!assignee) {
				return `
					<tr class="unavailable">
						<td>${displayDate}</td>
						<td>${dayName}</td>
						<td colspan="3">UNFILLED</td>
						<td>${escapeHtml(entry.reason)}</td>
					</tr>
				`;
			}
			return `
				<tr>
					<td>${displayDate}</td>
					<td>${dayName}</td>
					<td>${escapeHtml(`${assignee.lastName}, ${assignee.firstName}`)}</td>
					<td>${escapeHtml(assignee.rank)}</td>
					<td>${escapeHtml(assignee.groupName)}</td>
					<td></td>
				</tr>
			`;
		})
		.join('');
}

function renderDa6Grid(da6: DA6Data | null): string {
	if (!da6 || da6.dates.length === 0) return '';

	const headerCells = da6.dates.map((date) => `<th>${formatShortDate(date.date)}</th>`).join('');
	const bodyRows = da6.personnel
		.map((person, index) => {
			const cells = da6.dates
				.map((date) => {
					const position = date.positions[index];
					if (position === null) {
						return '<td class="da6-unavail">&mdash;</td>';
					}
					if (position === 1) {
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

function getExportDetails(input: BrowserExportInput) {
	if ('history' in input) {
		return {
			typeName: input.history.typeName,
			startDate: input.history.startDate,
			endDate: input.history.endDate,
			da6: buildDa6Data(input.history.da6)
		};
	}
	return {
		typeName: input.model.assignmentType.name,
		startDate: input.model.startDate,
		endDate: input.model.endDate,
		da6: buildDa6Data(input.da6 ?? input.model.da6)
	};
}

export function buildDutyRosterBrowserExportHtml(input: BrowserExportInput): string {
	const { typeName, startDate, endDate, da6 } = getExportDetails(input);

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
			<h2>${escapeHtml(typeName)} Roster</h2>
			<p>Generated: ${new Date().toLocaleDateString()}</p>
			<p>Period: ${formatDisplayDate(startDate)} - ${formatDisplayDate(endDate)}</p>
			<table>
				<tr>
					<th>Date</th>
					<th>Day</th>
					<th>Assigned</th>
					<th>Rank</th>
					<th>Group</th>
					<th>Notes</th>
				</tr>
				${renderRosterRows(input)}
			</table>
			${renderDa6Grid(da6)}
		</body>
	</html>`;
}

export function exportDutyRosterForBrowser(input: BrowserExportInput): void {
	const { typeName, startDate, endDate } = getExportDetails(input);
	const html = buildDutyRosterBrowserExportHtml(input);
	const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');

	link.href = url;
	link.download = `${typeName.replace(/\s+/g, '_')}_Roster_${startDate}_to_${endDate}.xls`;
	link.click();
	URL.revokeObjectURL(url);
}
