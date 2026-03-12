import type { Personnel, AvailabilityEntry, StatusType, SpecialDay } from '../types';
import type { AssignmentType, DailyAssignment } from '../stores/dailyAssignments.svelte';
import { formatDate, getMonthDates, getMonthName, isWeekend, addMonths } from './dates';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

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
 * Export single month calendar to Excel-compatible HTML with colors
 */
export function exportMonthToCSV(
	year: number,
	month: number,
	options: ExportOptions
): void {
	const { personnelByGroup, availabilityEntries, statusTypes, specialDays, assignmentTypes, assignments } = options;
	const dates = getMonthDates(year, month);
	const monthName = getMonthName(month);

	let html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head>
<meta charset="UTF-8">
<style>
	table { border-collapse: collapse; }
	th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: center; font-family: Arial, sans-serif; font-size: 10pt; }
	th { background: #1e40af; color: white; font-weight: bold; }
	.name-cell { text-align: left; min-width: 150px; }
	.group-row { background: #1e40af; color: white; font-weight: bold; }
	.weekend { background: #f3f4f6; }
	.holiday { background: #fef3c7; }
</style>
</head>
<body>
<table>
	<tr>
		<th class="name-cell">Personnel</th>`;

	// Header row with dates
	for (const date of dates) {
		const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
		const dayNum = date.getDate();
		const isWknd = isWeekend(date);
		const special = specialDays.find((s) => s.date === formatDate(date));
		const isHoliday = special?.type === 'federal-holiday';
		const bgClass = isHoliday ? 'holiday' : isWknd ? 'weekend' : '';
		html += `<th class="${bgClass}">${dayName}<br>${dayNum}</th>`;
	}
	html += '</tr>';

	// Personnel rows
	for (const grp of personnelByGroup) {
		if (grp.personnel.length > 0) {
			// Group header row
			html += `<tr class="group-row"><td colspan="${dates.length + 1}">${grp.group}</td></tr>`;

			for (const person of grp.personnel) {
				html += `<tr><td class="name-cell"><b style="color:#666">${person.rank}</b> ${person.lastName}, ${person.firstName}</td>`;

				for (const date of dates) {
					const status = getStatusForDate(person.id, date, availabilityEntries, statusTypes);
					const personAssignments = getAssignmentsForDate(date, person.id, assignments, assignmentTypes);
					const isWknd = isWeekend(date);
					const special = specialDays.find((s) => s.date === formatDate(date));
					const isHoliday = special?.type === 'federal-holiday';

					let cellContent = '';
					let bgColor = '';
					let textColor = '';

					if (status) {
						cellContent = status.name;
						bgColor = status.color;
						textColor = 'white';
					}
					if (personAssignments.length > 0) {
						const assignmentText = personAssignments.join(', ');
						cellContent = cellContent ? `${cellContent} (${assignmentText})` : assignmentText;
					}

					let style = '';
					if (bgColor) {
						style = `background-color: ${bgColor}; color: ${textColor};`;
					} else if (isHoliday) {
						style = 'background-color: #fef3c7;';
					} else if (isWknd) {
						style = 'background-color: #f3f4f6;';
					}

					html += `<td style="${style}">${cellContent}</td>`;
				}

				html += '</tr>';
			}
		}
	}

	html += '</table></body></html>';

	downloadFile(html, `calendar-${monthName}-${year}.xls`, 'application/vnd.ms-excel');
}

/**
 * Export 3-month view to Excel-compatible HTML with colors (same format as single month)
 */
export function exportQuarterToCSV(
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

	const allDates = months.flatMap((m) => m.dates);
	const totalDays = allDates.length;
	const startMonth = months[0];
	const endMonth = months[2];

	let html = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head>
<meta charset="UTF-8">
<style>
	table { border-collapse: collapse; }
	th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: center; font-family: Arial, sans-serif; font-size: 10pt; }
	th { background: #1e40af; color: white; font-weight: bold; }
	.name-cell { text-align: left; min-width: 150px; }
	.group-row { background: #1e40af; color: white; font-weight: bold; }
	.weekend { background: #f3f4f6; }
	.holiday { background: #fef3c7; }
	.month-header { background: #1e40af; color: white; font-weight: bold; font-size: 11pt; }
</style>
</head>
<body>
<table>
	<tr>
		<th class="name-cell" rowspan="2">Personnel</th>`;

	// Month header row
	for (const month of months) {
		html += `<th class="month-header" colspan="${month.dates.length}">${month.name} ${month.year}</th>`;
	}
	html += '</tr><tr>';

	// Day header row with day names and numbers
	for (const month of months) {
		for (const date of month.dates) {
			const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
			const dayNum = date.getDate();
			const isWknd = isWeekend(date);
			const special = specialDays.find((s) => s.date === formatDate(date));
			const isHoliday = special?.type === 'federal-holiday';
			const bgClass = isHoliday ? 'holiday' : isWknd ? 'weekend' : '';
			html += `<th class="${bgClass}">${dayName}<br>${dayNum}</th>`;
		}
	}
	html += '</tr>';

	// Personnel rows
	for (const grp of personnelByGroup) {
		if (grp.personnel.length > 0) {
			// Group header row
			html += `<tr class="group-row"><td colspan="${totalDays + 1}">${grp.group}</td></tr>`;

			for (const person of grp.personnel) {
				html += `<tr><td class="name-cell"><b style="color:#666">${person.rank}</b> ${person.lastName}, ${person.firstName}</td>`;

				for (const month of months) {
					for (const date of month.dates) {
						const status = getStatusForDate(person.id, date, availabilityEntries, statusTypes);
						const personAssignments = getAssignmentsForDate(date, person.id, assignments, assignmentTypes);
						const isWknd = isWeekend(date);
						const special = specialDays.find((s) => s.date === formatDate(date));
						const isHoliday = special?.type === 'federal-holiday';

						let cellContent = '';
						let bgColor = '';
						let textColor = '';

						if (status) {
							cellContent = status.name;
							bgColor = status.color;
							textColor = 'white';
						}
						if (personAssignments.length > 0) {
							const assignmentText = personAssignments.join(', ');
							cellContent = cellContent ? `${cellContent} (${assignmentText})` : assignmentText;
						}

						let style = '';
						if (bgColor) {
							style = `background-color: ${bgColor}; color: ${textColor};`;
						} else if (isHoliday) {
							style = 'background-color: #fef3c7;';
						} else if (isWknd) {
							style = 'background-color: #f3f4f6;';
						}

						html += `<td style="${style}">${cellContent}</td>`;
					}
				}

				html += '</tr>';
			}
		}
	}

	html += '</table></body></html>';

	const filename = `calendar-${startMonth.name}-${startMonth.year}-to-${endMonth.name}-${endMonth.year}.xls`;
	downloadFile(html, filename, 'application/vnd.ms-excel');
}

/**
 * Print calendar (triggers browser print dialog for PDF)
 */
export function printCalendar(): void {
	window.print();
}

/**
 * Parse hex color to RGB tuple for jsPDF
 */
function hexToRgb(hex: string): [number, number, number] {
	const h = hex.replace('#', '');
	return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * Build calendar PDF table data for a set of dates
 */
function buildCalendarTable(
	dates: Date[],
	personnelByGroup: GroupData[],
	availabilityEntries: AvailabilityEntry[],
	statusTypes: StatusType[],
	specialDays: SpecialDay[],
	assignmentTypes: AssignmentType[],
	assignments: DailyAssignment[],
	compact: boolean
) {
	const head = ['Personnel', ...dates.map((d) => {
		const dayName = d.toLocaleDateString('en-US', { weekday: 'narrow' });
		return `${dayName}\n${d.getDate()}`;
	})];

	const body: any[][] = [];
	const weekendCols = new Set<number>();
	const holidayCols = new Set<number>();

	dates.forEach((d, i) => {
		if (isWeekend(d)) weekendCols.add(i + 1);
		const special = specialDays.find((s) => s.date === formatDate(d));
		if (special?.type === 'federal-holiday') holidayCols.add(i + 1);
	});

	// Track styling per cell: [rowIndex][colIndex] = { fillColor, textColor }
	const cellStyles: Map<string, { fillColor?: [number, number, number]; textColor?: number }> = new Map();
	// Track group header rows
	const groupRows = new Set<number>();

	for (const grp of personnelByGroup) {
		if (grp.personnel.length === 0) continue;

		// Group header row
		const groupRowIdx = body.length;
		groupRows.add(groupRowIdx);
		body.push([{ content: grp.group, colSpan: dates.length + 1, styles: { fontStyle: 'bold' as const, fillColor: [30, 64, 175] as [number, number, number], textColor: 255, halign: 'left' as const } }]);

		for (const person of grp.personnel) {
			const rowIdx = body.length;
			const nameLabel = compact
				? `${person.rank} ${person.lastName}`
				: `${person.rank} ${person.lastName}, ${person.firstName}`;

			const row: any[] = [nameLabel];

			for (let di = 0; di < dates.length; di++) {
				const date = dates[di];
				const status = getStatusForDate(person.id, date, availabilityEntries, statusTypes);
				const personAssignments = compact ? [] : getAssignmentsForDate(date, person.id, assignments, assignmentTypes);

				let cellContent = '';
				if (status) {
					cellContent = compact ? '' : status.name;
					cellStyles.set(`${rowIdx}:${di + 1}`, {
						fillColor: hexToRgb(status.color),
						textColor: 255
					});
				}
				if (personAssignments.length > 0) {
					const assignText = personAssignments.join(', ');
					cellContent = cellContent ? `${cellContent}\n${assignText}` : assignText;
				}

				row.push(cellContent);
			}

			body.push(row);
		}
	}

	return { head, body, weekendCols, holidayCols, cellStyles, groupRows };
}

/**
 * Generate PDF for month calendar using jsPDF
 */
export function printMonthCalendar(
	year: number,
	month: number,
	options: ExportOptions
): void {
	const { personnelByGroup, availabilityEntries, statusTypes, specialDays, assignmentTypes, assignments } = options;
	const dates = getMonthDates(year, month);
	const monthName = getMonthName(month);

	const { head, body, weekendCols, holidayCols, cellStyles, groupRows } = buildCalendarTable(
		dates, personnelByGroup, availabilityEntries, statusTypes, specialDays, assignmentTypes, assignments, false
	);

	const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
	const pageWidth = doc.internal.pageSize.getWidth();

	doc.setFontSize(14);
	doc.text(`${monthName} ${year}`, pageWidth / 2, 30, { align: 'center' });

	const numCols = dates.length;
	const nameColWidth = 110;
	const availableWidth = pageWidth - 40 - nameColWidth;
	const dayCellWidth = Math.max(availableWidth / numCols, 14);

	const columnStyles: Record<number, any> = {
		0: { cellWidth: nameColWidth, halign: 'left', overflow: 'hidden' }
	};
	for (let i = 1; i <= numCols; i++) {
		columnStyles[i] = { cellWidth: dayCellWidth, halign: 'center', overflow: 'hidden' };
	}

	autoTable(doc, {
		startY: 40,
		head: [head],
		body,
		theme: 'grid',
		styles: {
			fontSize: 6,
			cellPadding: 1.5,
			lineColor: [200, 200, 200],
			lineWidth: 0.25,
			overflow: 'hidden'
		},
		headStyles: {
			fillColor: [240, 240, 240],
			textColor: 30,
			fontStyle: 'bold',
			fontSize: 5.5,
			halign: 'center',
			cellPadding: 1
		},
		columnStyles,
		margin: { left: 20, right: 20 },
		didParseCell: (data: any) => {
			if (data.section !== 'body') return;
			const rowIdx = data.row.index;
			if (groupRows.has(rowIdx)) return;
			const colIdx = data.column.index;

			// Apply status color
			const key = `${rowIdx}:${colIdx}`;
			const style = cellStyles.get(key);
			if (style) {
				data.cell.styles.fillColor = style.fillColor;
				data.cell.styles.textColor = style.textColor;
			} else if (holidayCols.has(colIdx)) {
				data.cell.styles.fillColor = [254, 243, 199];
			} else if (weekendCols.has(colIdx)) {
				data.cell.styles.fillColor = [243, 244, 246];
			}
		}
	});

	doc.save(`calendar-${monthName}-${year}.pdf`);
}

/**
 * Generate PDF for 3-month calendar view using jsPDF
 */
export function printQuarterCalendar(
	startDate: Date,
	options: ExportOptions
): void {
	const { personnelByGroup, availabilityEntries, statusTypes, specialDays, assignmentTypes, assignments } = options;

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

	const allDates = months.flatMap((m) => m.dates);
	const title = `${months[0].name} ${months[0].year} - ${months[2].name} ${months[2].year}`;

	const { head, body, weekendCols, holidayCols, cellStyles, groupRows } = buildCalendarTable(
		allDates, personnelByGroup, availabilityEntries, statusTypes, specialDays, assignmentTypes, assignments, true
	);

	const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
	const pageWidth = doc.internal.pageSize.getWidth();

	doc.setFontSize(12);
	doc.text(title, pageWidth / 2, 25, { align: 'center' });

	// Month separator labels
	doc.setFontSize(6);
	const nameColWidth = 80;
	const availableWidth = pageWidth - 40 - nameColWidth;
	const numCols = allDates.length;
	const dayCellWidth = Math.max(availableWidth / numCols, 6);

	let xOffset = 20 + nameColWidth;
	for (const m of months) {
		const spanWidth = m.dates.length * dayCellWidth;
		doc.setFillColor(30, 64, 175);
		doc.rect(xOffset, 30, spanWidth, 10, 'F');
		doc.setTextColor(255);
		doc.text(`${m.name} ${m.year}`, xOffset + spanWidth / 2, 37, { align: 'center' });
		xOffset += spanWidth;
	}
	doc.setTextColor(0);

	const columnStyles: Record<number, any> = {
		0: { cellWidth: nameColWidth, halign: 'left', overflow: 'hidden' }
	};
	for (let i = 1; i <= numCols; i++) {
		columnStyles[i] = { cellWidth: dayCellWidth, halign: 'center', overflow: 'hidden' };
	}

	autoTable(doc, {
		startY: 42,
		head: [head],
		body,
		theme: 'grid',
		styles: {
			fontSize: 4.5,
			cellPadding: 1,
			lineColor: [200, 200, 200],
			lineWidth: 0.25,
			overflow: 'hidden'
		},
		headStyles: {
			fillColor: [240, 240, 240],
			textColor: 30,
			fontStyle: 'bold',
			fontSize: 4,
			halign: 'center',
			cellPadding: 0.5
		},
		columnStyles,
		margin: { left: 20, right: 20 },
		didParseCell: (data: any) => {
			if (data.section !== 'body') return;
			const rowIdx = data.row.index;
			if (groupRows.has(rowIdx)) return;
			const colIdx = data.column.index;

			const key = `${rowIdx}:${colIdx}`;
			const style = cellStyles.get(key);
			if (style) {
				data.cell.styles.fillColor = style.fillColor;
				data.cell.styles.textColor = style.textColor;
			} else if (holidayCols.has(colIdx)) {
				data.cell.styles.fillColor = [254, 243, 199];
			} else if (weekendCols.has(colIdx)) {
				data.cell.styles.fillColor = [243, 244, 246];
			}
		}
	});

	doc.save(`calendar-${months[0].name}-${months[0].year}-to-${months[2].name}-${months[2].year}.pdf`);
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
