import type { Personnel, AvailabilityEntry, StatusType, SpecialDay, AssignmentType, DailyAssignment } from '$lib/types';
import { createWorkbook, downloadWorkbook, type Workbook, type Worksheet } from '$lib/export/workbook';
import { formatDate, getMonthDates, getMonthName, isWeekend, addMonths, parseDate } from '$lib/utils/dates';
import type ExcelJS from 'exceljs';
import type { RowInput } from 'jspdf-autotable';

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

interface CalendarExportDateMeta {
	date: Date;
	dateKey: string;
	isWeekend: boolean;
	specialDay: SpecialDay | undefined;
	isHoliday: boolean;
}

interface CalendarExportIndex {
	dateMetas: CalendarExportDateMeta[];
	getStatus: (personnelId: string, dateKey: string) => StatusType | undefined;
	getAssignments: (personnelId: string, dateKey: string) => string[];
}

interface CalendarWorkbookCell {
	value: string | null;
	status: StatusType | undefined;
	assignments: string[];
	meta: CalendarExportDateMeta;
}

type WorkbookCell = ExcelJS.Cell;

function cellKey(personnelId: string, dateKey: string): string {
	return `${personnelId}:${dateKey}`;
}

function nextLocalDay(date: Date) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

function buildCalendarExportIndex(dates: Date[], options: ExportOptions): CalendarExportIndex {
	const dateKeys = dates.map(formatDate);
	const firstDateKey = dateKeys[0];
	const lastDateKey = dateKeys.at(-1);
	const specialDayByDate = new Map<string, SpecialDay>();
	for (const specialDay of options.specialDays) {
		if (!specialDayByDate.has(specialDay.date)) {
			specialDayByDate.set(specialDay.date, specialDay);
		}
	}
	const dateKeySet = new Set(dateKeys);
	const dateMetas = dates.map((date, index) => {
		const dateKey = dateKeys[index];
		const specialDay = specialDayByDate.get(dateKey);
		return {
			date,
			dateKey,
			isWeekend: isWeekend(date),
			specialDay,
			isHoliday: specialDay?.type === 'federal-holiday'
		};
	});
	const statusTypeById = new Map(options.statusTypes.map((statusType) => [statusType.id, statusType]));
	const statusByPersonDate = new Map<string, StatusType>();
	if (firstDateKey && lastDateKey) {
		for (const entry of options.availabilityEntries) {
			const statusType = statusTypeById.get(entry.statusTypeId);
			if (!statusType || entry.endDate < firstDateKey || entry.startDate > lastDateKey) {
				continue;
			}
			const startDate = entry.startDate > firstDateKey ? entry.startDate : firstDateKey;
			const endDate = entry.endDate < lastDateKey ? entry.endDate : lastDateKey;
			for (let date = parseDate(startDate); ; date = nextLocalDay(date)) {
				const dateKey = formatDate(date);
				if (dateKey > endDate) {
					break;
				}
				if (!dateKeySet.has(dateKey)) {
					continue;
				}
				const key = cellKey(entry.personnelId, dateKey);
				if (!statusByPersonDate.has(key)) {
					statusByPersonDate.set(key, statusType);
				}
			}
		}
	}
	const assignmentTypeById = new Map(
		options.assignmentTypes.map((assignmentType) => [assignmentType.id, assignmentType])
	);
	const assignmentsByPersonDate = new Map<string, string[]>();
	for (const assignment of options.assignments) {
		if (!dateKeySet.has(assignment.date)) {
			continue;
		}
		const shortName = assignmentTypeById.get(assignment.assignmentTypeId)?.shortName;
		if (!shortName) {
			continue;
		}
		const key = cellKey(assignment.assigneeId, assignment.date);
		const values = assignmentsByPersonDate.get(key) ?? [];
		values.push(shortName);
		assignmentsByPersonDate.set(key, values);
	}

	return {
		dateMetas,
		getStatus: (personnelId, dateKey) => statusByPersonDate.get(cellKey(personnelId, dateKey)),
		getAssignments: (personnelId, dateKey) => assignmentsByPersonDate.get(cellKey(personnelId, dateKey)) ?? []
	};
}

export async function buildMonthCalendarWorkbook(
	year: number,
	month: number,
	options: ExportOptions
): Promise<Workbook> {
	const { personnelByGroup } = options;
	const dates = getMonthDates(year, month);
	const exportIndex = buildCalendarExportIndex(dates, options);
	const monthName = getMonthName(month);
	const workbook = await createWorkbook();
	workbook.addWorksheet(`${monthName} ${year}`);
	const sheet = workbook.getWorksheet(1);
	if (!sheet) return workbook;

	populateCalendarWorkbookSheet(sheet, personnelByGroup, exportIndex, [{ name: `${monthName} ${year}`, dates }]);
	return workbook;
}

export async function exportMonthToExcel(year: number, month: number, options: ExportOptions): Promise<void> {
	const workbook = await buildMonthCalendarWorkbook(year, month, options);
	await downloadWorkbook(workbook, `calendar-${getMonthName(month)}-${year}.xlsx`);
}

export async function buildQuarterCalendarWorkbook(startDate: Date, options: ExportOptions): Promise<Workbook> {
	const { personnelByGroup } = options;

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
	const exportIndex = buildCalendarExportIndex(allDates, options);
	const startMonth = months[0];
	const endMonth = months[2];
	const workbook = await createWorkbook();
	workbook.addWorksheet(`${startMonth.name} to ${endMonth.name}`);
	const sheet = workbook.getWorksheet(1);
	if (!sheet) return workbook;

	populateCalendarWorkbookSheet(
		sheet,
		personnelByGroup,
		exportIndex,
		months.map((month) => ({ name: `${month.name} ${month.year}`, dates: month.dates }))
	);
	return workbook;
}

export async function exportQuarterToExcel(startDate: Date, options: ExportOptions): Promise<void> {
	const workbook = await buildQuarterCalendarWorkbook(startDate, options);
	const startMonth = getMonthName(startDate.getMonth());
	const endDate = addMonths(startDate, 2);
	const endMonth = getMonthName(endDate.getMonth());
	await downloadWorkbook(
		workbook,
		`calendar-${startMonth}-${startDate.getFullYear()}-to-${endMonth}-${endDate.getFullYear()}.xlsx`
	);
}

function populateCalendarWorkbookSheet(
	sheet: Worksheet,
	personnelByGroup: GroupData[],
	exportIndex: CalendarExportIndex,
	monthGroups: Array<{ name: string; dates: Date[] }>
): void {
	const allDates = monthGroups.flatMap((month) => month.dates);
	sheet.columns = [{ key: 'personnel', width: 24 }, ...allDates.map((date) => ({ key: formatDate(date), width: 12 }))];
	sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }];

	const monthHeader = sheet.getRow(1);
	monthHeader.getCell(1).value = 'Personnel';
	monthHeader.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
	monthHeader.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
	monthHeader.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
	let monthStartColumn = 2;
	for (const group of monthGroups) {
		const monthEndColumn = monthStartColumn + group.dates.length - 1;
		monthHeader.getCell(monthStartColumn).value = group.name;
		if (monthEndColumn > monthStartColumn) {
			sheet.mergeCells(1, monthStartColumn, 1, monthEndColumn);
		}
		for (let column = monthStartColumn; column <= monthEndColumn; column += 1) {
			const cell = monthHeader.getCell(column);
			cell.alignment = { vertical: 'middle', horizontal: 'center' };
			cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
			cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
		}
		monthStartColumn = monthEndColumn + 1;
	}

	const dateHeader = sheet.getRow(2);
	dateHeader.getCell(1).value = 'Personnel';
	dateHeader.font = { bold: true };
	exportIndex.dateMetas.forEach((meta, index) => {
		const cell = dateHeader.getCell(index + 2);
		cell.value = `${meta.date.toLocaleDateString('en-US', { weekday: 'short' })}\n${meta.date.getDate()}`;
		cell.font = { bold: true };
		cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
		applyCalendarMetaFill(cell, meta);
	});

	for (const group of personnelByGroup) {
		if (group.personnel.length === 0) continue;
		const groupRow = sheet.addRow([group.group]);
		sheet.mergeCells(groupRow.number, 1, groupRow.number, allDates.length + 1);
		groupRow.eachCell((cell) => {
			cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
			cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
			cell.alignment = { horizontal: 'left' };
		});

		for (const person of group.personnel) {
			const cells = exportIndex.dateMetas.map((meta) =>
				calendarWorkbookCell(
					person.id,
					meta,
					exportIndex.getStatus(person.id, meta.dateKey),
					exportIndex.getAssignments(person.id, meta.dateKey)
				)
			);
			const row = sheet.addRow([
				`${person.rank} ${person.lastName}, ${person.firstName}`,
				...cells.map((cell) => cell.value)
			]);
			row.getCell(1).font = { bold: true, color: { argb: 'FF666666' } };
			cells.forEach((workbookCell, index) => {
				const cell = row.getCell(index + 2);
				cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
				if (workbookCell.status) {
					cell.fill = {
						type: 'pattern',
						pattern: 'solid',
						fgColor: { argb: hexToArgb(workbookCell.status.color) }
					};
					cell.font = { color: { argb: hexToArgb(workbookCell.status.textColor) } };
				} else {
					applyCalendarMetaFill(cell, workbookCell.meta);
				}
			});
		}
	}
}

function calendarWorkbookCell(
	personnelId: string,
	meta: CalendarExportDateMeta,
	status: StatusType | undefined,
	assignments: string[]
): CalendarWorkbookCell {
	let value: string | null = status?.name ?? null;
	if (assignments.length > 0) {
		const assignmentText = assignments.join(', ');
		value = value ? `${value} (${assignmentText})` : assignmentText;
	}
	return { value, status, assignments, meta };
}

function applyCalendarMetaFill(cell: WorkbookCell, meta: CalendarExportDateMeta): void {
	if (meta.isHoliday) {
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
	} else if (meta.isWeekend) {
		cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
	}
}

function hexToArgb(hex: string): string {
	const value = hex.replace('#', '').trim();
	return `FF${
		value.length === 3
			? value
					.split('')
					.map((part) => part + part)
					.join('')
			: value
	}`.toUpperCase();
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
	exportIndex: CalendarExportIndex,
	compact: boolean
) {
	const head = [
		'Personnel',
		...dates.map((d) => {
			const dayName = d.toLocaleDateString('en-US', { weekday: 'narrow' });
			return `${dayName}\n${d.getDate()}`;
		})
	];

	const body: RowInput[] = [];
	const weekendCols = new Set<number>();
	const holidayCols = new Set<number>();

	exportIndex.dateMetas.forEach((meta, i) => {
		if (meta.isWeekend) weekendCols.add(i + 1);
		if (meta.isHoliday) holidayCols.add(i + 1);
	});

	// Track styling per cell: [rowIndex][colIndex] = { fillColor, textColor }
	const cellStyles: Map<string, { fillColor?: [number, number, number]; textColor?: [number, number, number] }> =
		new Map();
	// Track group header rows
	const groupRows = new Set<number>();

	for (const grp of personnelByGroup) {
		if (grp.personnel.length === 0) continue;

		// Group header row
		const groupRowIdx = body.length;
		groupRows.add(groupRowIdx);
		body.push([
			{
				content: grp.group,
				colSpan: dates.length + 1,
				styles: {
					fontStyle: 'bold' as const,
					fillColor: [30, 64, 175] as [number, number, number],
					textColor: 255,
					halign: 'left' as const
				}
			}
		]);

		for (const person of grp.personnel) {
			const rowIdx = body.length;
			const nameLabel = compact
				? `${person.rank} ${person.lastName}`
				: `${person.rank} ${person.lastName}, ${person.firstName}`;

			// eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsPDF-autoTable row cells use mixed types
			const row: any[] = [nameLabel];

			for (let di = 0; di < dates.length; di++) {
				const meta = exportIndex.dateMetas[di];
				const status = exportIndex.getStatus(person.id, meta.dateKey);
				const personAssignments = compact ? [] : exportIndex.getAssignments(person.id, meta.dateKey);

				let cellContent = '';
				if (status) {
					cellContent = compact ? '' : status.name;
					cellStyles.set(`${rowIdx}:${di + 1}`, {
						fillColor: hexToRgb(status.color),
						textColor: hexToRgb(status.textColor)
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
export async function printMonthCalendar(year: number, month: number, options: ExportOptions): Promise<void> {
	const { personnelByGroup } = options;
	const dates = getMonthDates(year, month);
	const exportIndex = buildCalendarExportIndex(dates, options);
	const monthName = getMonthName(month);

	const { head, body, weekendCols, holidayCols, cellStyles, groupRows } = buildCalendarTable(
		dates,
		personnelByGroup,
		exportIndex,
		false
	);

	const { jsPDF } = await import('jspdf');
	const { default: autoTable } = await import('jspdf-autotable');
	const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
	const pageWidth = doc.internal.pageSize.getWidth();

	doc.setFontSize(14);
	doc.text(`${monthName} ${year}`, pageWidth / 2, 30, { align: 'center' });

	const numCols = dates.length;
	const nameColWidth = 110;
	const availableWidth = pageWidth - 40 - nameColWidth;
	const dayCellWidth = Math.max(availableWidth / numCols, 14);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsPDF-autoTable columnStyles uses dynamic numeric keys with vendor-specific types
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
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsPDF-autoTable didParseCell callback has vendor-specific untyped data param
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
export async function printQuarterCalendar(startDate: Date, options: ExportOptions): Promise<void> {
	const { personnelByGroup } = options;

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
	const exportIndex = buildCalendarExportIndex(allDates, options);
	const title = `${months[0].name} ${months[0].year} - ${months[2].name} ${months[2].year}`;

	const { head, body, weekendCols, holidayCols, cellStyles, groupRows } = buildCalendarTable(
		allDates,
		personnelByGroup,
		exportIndex,
		true
	);

	const { jsPDF } = await import('jspdf');
	const { default: autoTable } = await import('jspdf-autotable');
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

	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsPDF-autoTable columnStyles uses dynamic numeric keys with vendor-specific types
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
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- jsPDF-autoTable didParseCell callback has vendor-specific untyped data param
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
