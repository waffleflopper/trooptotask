import type { Personnel, AvailabilityEntry, StatusType, SpecialDay } from '../types';
import type { AssignmentType, DailyAssignment } from '../stores/dailyAssignments.svelte';
import { formatDate, getMonthDates, getMonthName, isWeekend, addMonths } from './dates';

interface GroupData {
	group: string;
	personnel: Personnel[];
}

interface ExportOptions {
	personnelByGroup: GroupData[];
	availabilityEntries: AvailabilityEntry[];
	statusTypes: StatusType[];
	specialDays: SpecialDay[];
	assignmentTypes: AssignmentType[];
	assignments: DailyAssignment[];
}

interface MonthData {
	year: number;
	month: number;
	name: string;
	dates: Date[];
}

function getStatusForDate(
	personnelId: string,
	date: Date,
	availabilityEntries: AvailabilityEntry[],
	statusTypes: StatusType[]
): StatusType | null {
	const dateStr = formatDate(date);
	const entry = availabilityEntries.find(
		(e) => e.personnelId === personnelId && dateStr >= e.startDate && dateStr <= e.endDate
	);
	if (!entry) return null;
	return statusTypes.find((s) => s.id === entry.statusTypeId) ?? null;
}

function getAssignmentsForDate(
	date: Date,
	personnelId: string,
	assignments: DailyAssignment[],
	assignmentTypes: AssignmentType[]
): string[] {
	const dateStr = formatDate(date);
	return assignments
		.filter((a) => a.date === dateStr && a.assigneeId === personnelId)
		.map((a) => {
			const type = assignmentTypes.find((t) => t.id === a.assignmentTypeId);
			return type?.shortName ?? '';
		})
		.filter((s) => s);
}

function escapeCSV(value: string): string {
	if (value.includes(',') || value.includes('"') || value.includes('\n')) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

/**
 * Export single month calendar to CSV
 */
export function exportMonthToCSV(
	year: number,
	month: number,
	options: ExportOptions
): void {
	const { personnelByGroup, availabilityEntries, statusTypes, assignmentTypes, assignments } = options;
	const dates = getMonthDates(year, month);
	const monthName = getMonthName(month);

	const rows: string[][] = [];

	// Header row: Name, then each date
	const headerRow = ['Group', 'Rank', 'Name'];
	for (const date of dates) {
		const dayNum = date.getDate();
		const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
		headerRow.push(`${dayName} ${dayNum}`);
	}
	rows.push(headerRow);

	// Personnel rows
	for (const grp of personnelByGroup) {
		for (const person of grp.personnel) {
			const row = [grp.group || 'Unassigned', person.rank, `${person.lastName}, ${person.firstName}`];

			for (const date of dates) {
				const status = getStatusForDate(person.id, date, availabilityEntries, statusTypes);
				const personAssignments = getAssignmentsForDate(date, person.id, assignments, assignmentTypes);

				let cellValue = '';
				if (status) {
					cellValue = status.name;
				}
				if (personAssignments.length > 0) {
					cellValue = cellValue
						? `${cellValue} (${personAssignments.join(', ')})`
						: personAssignments.join(', ');
				}
				row.push(cellValue);
			}

			rows.push(row);
		}
	}

	const csvContent = rows.map((row) => row.map(escapeCSV).join(',')).join('\n');
	downloadFile(csvContent, `calendar-${monthName}-${year}.csv`, 'text/csv');
}

/**
 * Export 3-month view to CSV
 */
export function exportQuarterToCSV(
	startDate: Date,
	options: ExportOptions
): void {
	const { personnelByGroup, availabilityEntries, statusTypes, assignmentTypes, assignments } = options;

	// Get 3 months of data
	const months: MonthData[] = [];
	for (let i = 0; i < 3; i++) {
		const monthDate = addMonths(startDate, i);
		months.push({
			year: monthDate.getFullYear(),
			month: monthDate.getMonth(),
			name: getMonthName(monthDate.getMonth()),
			dates: getMonthDates(monthDate.getFullYear(), monthDate.getMonth())
		});
	}

	const rows: string[][] = [];

	// Header row 1: Month names spanning their dates
	const monthHeaderRow = ['', '', ''];
	for (const month of months) {
		monthHeaderRow.push(`${month.name} ${month.year}`);
		// Add empty cells for remaining days in month
		for (let i = 1; i < month.dates.length; i++) {
			monthHeaderRow.push('');
		}
	}
	rows.push(monthHeaderRow);

	// Header row 2: Day numbers
	const dayHeaderRow = ['Group', 'Rank', 'Name'];
	for (const month of months) {
		for (const date of month.dates) {
			dayHeaderRow.push(date.getDate().toString());
		}
	}
	rows.push(dayHeaderRow);

	// Personnel rows
	for (const grp of personnelByGroup) {
		for (const person of grp.personnel) {
			const row = [grp.group || 'Unassigned', person.rank, `${person.lastName}, ${person.firstName}`];

			for (const month of months) {
				for (const date of month.dates) {
					const status = getStatusForDate(person.id, date, availabilityEntries, statusTypes);
					const personAssignments = getAssignmentsForDate(date, person.id, assignments, assignmentTypes);

					let cellValue = '';
					if (status) {
						cellValue = status.name;
					}
					if (personAssignments.length > 0) {
						cellValue = cellValue
							? `${cellValue} (${personAssignments.join(', ')})`
							: personAssignments.join(', ');
					}
					row.push(cellValue);
				}
			}

			rows.push(row);
		}
	}

	const startMonth = months[0];
	const endMonth = months[2];
	const filename = `calendar-${startMonth.name}-${startMonth.year}-to-${endMonth.name}-${endMonth.year}.csv`;

	const csvContent = rows.map((row) => row.map(escapeCSV).join(',')).join('\n');
	downloadFile(csvContent, filename, 'text/csv');
}

/**
 * Print calendar (triggers browser print dialog for PDF)
 */
export function printCalendar(): void {
	window.print();
}

/**
 * Generate printable HTML for month calendar and open in new window for printing
 */
export function printMonthCalendar(
	year: number,
	month: number,
	options: ExportOptions
): void {
	const { personnelByGroup, availabilityEntries, statusTypes, specialDays, assignmentTypes, assignments } = options;
	const dates = getMonthDates(year, month);
	const monthName = getMonthName(month);

	let html = `
<!DOCTYPE html>
<html>
<head>
	<title>${monthName} ${year} - Calendar</title>
	<style>
		* { box-sizing: border-box; margin: 0; padding: 0; }
		body { font-family: Arial, sans-serif; font-size: 9px; padding: 10px; }
		h1 { font-size: 16px; margin-bottom: 10px; text-align: center; }
		table { border-collapse: collapse; width: 100%; }
		th, td { border: 1px solid #ccc; padding: 2px 3px; text-align: center; }
		th { background: #f0f0f0; font-weight: bold; }
		.name-cell { text-align: left; white-space: nowrap; min-width: 120px; }
		.group-row { background: #1e40af; color: white; font-weight: bold; }
		.group-row td { text-align: left; }
		.weekend { background: #f3f4f6; }
		.holiday { background: #fef3c7; }
		.status-cell { font-size: 8px; }
		.rank { color: #666; margin-right: 4px; }
		@media print {
			body { padding: 0; }
			@page { size: landscape; margin: 0.5cm; }
		}
	</style>
</head>
<body>
	<h1>${monthName} ${year}</h1>
	<table>
		<thead>
			<tr>
				<th class="name-cell">Personnel</th>
				${dates.map((d) => {
					const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
					const isWknd = isWeekend(d);
					const special = specialDays.find((s) => s.date === formatDate(d));
					const isHoliday = special?.type === 'federal-holiday';
					return `<th class="${isWknd ? 'weekend' : ''} ${isHoliday ? 'holiday' : ''}">${dayName}<br>${d.getDate()}</th>`;
				}).join('')}
			</tr>
		</thead>
		<tbody>
`;

	for (const grp of personnelByGroup) {
		if (grp.personnel.length > 0) {
			html += `<tr class="group-row"><td colspan="${dates.length + 1}">${grp.group || 'Unassigned'}</td></tr>`;

			for (const person of grp.personnel) {
				html += `<tr><td class="name-cell"><span class="rank">${person.rank}</span>${person.lastName}, ${person.firstName}</td>`;

				for (const date of dates) {
					const status = getStatusForDate(person.id, date, availabilityEntries, statusTypes);
					const personAssignments = getAssignmentsForDate(date, person.id, assignments, assignmentTypes);
					const isWknd = isWeekend(date);
					const special = specialDays.find((s) => s.date === formatDate(date));
					const isHoliday = special?.type === 'federal-holiday';

					let cellContent = '';
					let bgColor = '';

					if (status) {
						cellContent = status.name;
						bgColor = status.color;
					}
					if (personAssignments.length > 0) {
						cellContent = cellContent
							? `${cellContent}<br><small>${personAssignments.join(', ')}</small>`
							: personAssignments.join(', ');
					}

					const classes = [
						'status-cell',
						isWknd && !bgColor ? 'weekend' : '',
						isHoliday && !bgColor ? 'holiday' : ''
					].filter(Boolean).join(' ');

					const style = bgColor ? `background-color: ${bgColor}; color: white;` : '';

					html += `<td class="${classes}" style="${style}">${cellContent}</td>`;
				}

				html += '</tr>';
			}
		}
	}

	html += `
		</tbody>
	</table>
	<script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

	const printWindow = window.open('', '_blank');
	if (printWindow) {
		printWindow.document.write(html);
		printWindow.document.close();
	}
}

/**
 * Generate printable HTML for 3-month view and open in new window for printing
 */
export function printQuarterCalendar(
	startDate: Date,
	options: ExportOptions
): void {
	const { personnelByGroup, availabilityEntries, statusTypes, specialDays, assignmentTypes, assignments } = options;

	// Get 3 months of data
	const months: MonthData[] = [];
	for (let i = 0; i < 3; i++) {
		const monthDate = addMonths(startDate, i);
		months.push({
			year: monthDate.getFullYear(),
			month: monthDate.getMonth(),
			name: getMonthName(monthDate.getMonth()),
			dates: getMonthDates(monthDate.getFullYear(), monthDate.getMonth())
		});
	}

	const totalDays = months.reduce((sum, m) => sum + m.dates.length, 0);
	const title = `${months[0].name} ${months[0].year} - ${months[2].name} ${months[2].year}`;

	let html = `
<!DOCTYPE html>
<html>
<head>
	<title>${title} - Calendar</title>
	<style>
		* { box-sizing: border-box; margin: 0; padding: 0; }
		body { font-family: Arial, sans-serif; font-size: 7px; padding: 5px; }
		h1 { font-size: 14px; margin-bottom: 8px; text-align: center; }
		table { border-collapse: collapse; width: 100%; }
		th, td { border: 1px solid #ccc; padding: 1px 2px; text-align: center; }
		th { background: #f0f0f0; font-weight: bold; }
		.month-header { background: #1e40af; color: white; font-size: 9px; }
		.name-cell { text-align: left; white-space: nowrap; min-width: 90px; position: sticky; left: 0; background: white; }
		.group-row { background: #1e40af; color: white; font-weight: bold; }
		.group-row td { text-align: left; }
		.weekend { background: #f3f4f6; }
		.holiday { background: #fef3c7; }
		.status-cell { font-size: 6px; width: 18px; min-width: 18px; max-width: 18px; }
		.rank { color: #666; margin-right: 2px; font-size: 6px; }
		@media print {
			body { padding: 0; }
			@page { size: landscape; margin: 0.3cm; }
		}
	</style>
</head>
<body>
	<h1>${title}</h1>
	<table>
		<thead>
			<tr>
				<th class="name-cell" rowspan="2">Personnel</th>
				${months.map((m) => `<th class="month-header" colspan="${m.dates.length}">${m.name} ${m.year}</th>`).join('')}
			</tr>
			<tr>
				${months.map((m) => m.dates.map((d) => {
					const isWknd = isWeekend(d);
					const special = specialDays.find((s) => s.date === formatDate(d));
					const isHoliday = special?.type === 'federal-holiday';
					return `<th class="${isWknd ? 'weekend' : ''} ${isHoliday ? 'holiday' : ''}">${d.getDate()}</th>`;
				}).join('')).join('')}
			</tr>
		</thead>
		<tbody>
`;

	for (const grp of personnelByGroup) {
		if (grp.personnel.length > 0) {
			html += `<tr class="group-row"><td colspan="${totalDays + 1}">${grp.group || 'Unassigned'}</td></tr>`;

			for (const person of grp.personnel) {
				html += `<tr><td class="name-cell"><span class="rank">${person.rank}</span>${person.lastName}</td>`;

				for (const month of months) {
					for (const date of month.dates) {
						const status = getStatusForDate(person.id, date, availabilityEntries, statusTypes);
						const isWknd = isWeekend(date);
						const special = specialDays.find((s) => s.date === formatDate(date));
						const isHoliday = special?.type === 'federal-holiday';

						let bgColor = '';
						if (status) {
							bgColor = status.color;
						}

						const classes = [
							'status-cell',
							isWknd && !bgColor ? 'weekend' : '',
							isHoliday && !bgColor ? 'holiday' : ''
						].filter(Boolean).join(' ');

						const style = bgColor ? `background-color: ${bgColor};` : '';

						html += `<td class="${classes}" style="${style}"></td>`;
					}
				}

				html += '</tr>';
			}
		}
	}

	html += `
		</tbody>
	</table>
	<script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

	const printWindow = window.open('', '_blank');
	if (printWindow) {
		printWindow.document.write(html);
		printWindow.document.close();
	}
}

function downloadFile(content: string, filename: string, mimeType: string): void {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}
