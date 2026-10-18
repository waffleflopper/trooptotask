import type { Personnel } from '$features/personnel/contracts';
import type {
	AvailabilityEntry,
	StatusType,
	SpecialDay,
	AssignmentType,
	DailyAssignment
} from '$features/calendar/contracts';
import { createWorkbook, downloadWorkbook, type Workbook, type Worksheet } from '$lib/utils/workbook';
import { formatDate, getMonthDates, getMonthName, isWeekend, addMonths, parseDate } from '$lib/utils/dates';
import type ExcelJS from 'exceljs';

interface GroupData {
	group: string;
	personnel: Personnel[];
}

export interface CalendarExportOptions {
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

function buildCalendarExportIndex(dates: Date[], options: CalendarExportOptions): CalendarExportIndex {
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
	options: CalendarExportOptions
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

export async function exportMonthToExcel(year: number, month: number, options: CalendarExportOptions): Promise<void> {
	const workbook = await buildMonthCalendarWorkbook(year, month, options);
	await downloadWorkbook(workbook, `calendar-${getMonthName(month)}-${year}.xlsx`);
}

export async function buildQuarterCalendarWorkbook(startDate: Date, options: CalendarExportOptions): Promise<Workbook> {
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

export async function exportQuarterToExcel(startDate: Date, options: CalendarExportOptions): Promise<void> {
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
