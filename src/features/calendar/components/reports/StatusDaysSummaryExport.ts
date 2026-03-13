import type { StatusDaysResult } from '../../utils/statusDaysReport';
import type { StatusType } from '../../calendar.types';

function escapeCsvCell(value: string): string {
	if (value.includes(',') || value.includes('"') || value.includes('\n')) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

export function exportStatusDaysCsv(
	result: StatusDaysResult,
	statusTypes: StatusType[],
	startDate: string,
	endDate: string
): void {
	const statusTypeMap = new Map(statusTypes.map((s) => [s.id, s]));
	const columns = result.activeStatusTypeIds
		.map((id) => statusTypeMap.get(id))
		.filter((s): s is StatusType => !!s);

	// Header row
	const headers = ['Rank', 'Last Name', 'First Name', ...columns.map((s) => s.name), 'Total Days'];
	const rows = [headers.map(escapeCsvCell).join(',')];

	// Data rows
	for (const row of result.rows) {
		const cells = [
			row.person.rank,
			row.person.lastName,
			row.person.firstName,
			...columns.map((s) => {
				const count = row.statusDays.get(s.id) ?? 0;
				return count > 0 ? String(count) : '';
			}),
			row.totalDays > 0 ? String(row.totalDays) : ''
		];
		rows.push(cells.map(escapeCsvCell).join(','));
	}

	const csv = rows.join('\n');
	const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = `status-days-${startDate}-to-${endDate}.csv`;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}
