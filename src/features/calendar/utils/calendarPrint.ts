import type { jsPDF } from 'jspdf';
import type { Personnel } from '$features/personnel/contracts';
import type { StatusType } from '$features/calendar/contracts';
import { addMonths, getMonthDates, getMonthName } from '$lib/utils/dates';
import { buildAvailabilityTracks } from './availabilityTracks';
import {
	fitMarkers,
	fittedLabel,
	type Bar,
	type BarLabel,
	type BarOverflow,
	type LabelFit,
	type MarkedDay,
	type TrackPiece
} from './barLayout';
import type { CalendarExportOptions } from './calendarExport';
import {
	buildCalendarDays,
	buildDutyMarkers,
	type CalendarCellMarkerState,
	type CalendarDateHeaderState
} from './calendarRenderState';
import { dayWindow, toDayNumber } from './dayNumber';
import { oneDayLabel } from './oneDayLabel';

export interface CalendarPrintOptions extends CalendarExportOptions {
	organizationName: string;
}

type PrintView = 'month' | '3-month';
type Rgb = readonly [number, number, number];

interface PersonLine {
	readonly kind: 'person';
	readonly person: Personnel;
	readonly bars: readonly Bar[];
	readonly overflows: readonly BarOverflow[];
	readonly markers: readonly MarkedDay[];
	readonly duties: ReadonlyMap<number, readonly CalendarCellMarkerState[]>;
}

interface GroupLine {
	readonly kind: 'group';
	readonly name: string;
	readonly count: number;
	readonly continued: boolean;
}

type SheetLine = PersonLine | GroupLine;

interface MonthBand {
	readonly name: string;
	readonly start: number;
}

interface Sheet {
	readonly view: PrintView;
	readonly title: string;
	readonly days: readonly CalendarDateHeaderState[];
	readonly months: readonly MonthBand[];
	readonly lines: readonly SheetLine[];
	readonly personnelCount: number;
	readonly fits: LabelFit;
}

interface Geometry {
	readonly nameWidth: number;
	readonly headHeight: number;
	readonly rowHeight: number;
	readonly groupHeight: number;
	readonly barInset: number;
	readonly fullLabel: number;
	readonly laneLabel: number;
}

const GEOMETRY: Record<PrintView, Geometry> = {
	month: {
		nameWidth: 132,
		headHeight: 24,
		rowHeight: 19,
		groupHeight: 14,
		barInset: 2.5,
		fullLabel: 6,
		laneLabel: 4.6
	},
	'3-month': { nameWidth: 104, headHeight: 24, rowHeight: 14, groupHeight: 12, barInset: 2, fullLabel: 5, laneLabel: 4 }
};

const PAGE = { width: 792, height: 612, marginX: 30, top: 30, bottom: 24 };
const GRID_TOP = 76;
const LABEL_TRACKING = 0.04;
const BAR_PADDING = 1.6;
const CHEVRON = 3.2;

const INK: Rgb = [28, 25, 23];
const MUTED: Rgb = [87, 83, 78];
const FAINT: Rgb = [120, 113, 108];
const RULE: Rgb = [231, 229, 228];
const STRONG_RULE: Rgb = [168, 162, 158];
const SHADE: Rgb = [245, 245, 244];
const CLOSED: Rgb = [254, 243, 199];
const CLOSED_INK: Rgb = [180, 83, 9];
const PAPER: Rgb = [255, 255, 255];

const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export async function printMonthCalendar(year: number, month: number, options: CalendarPrintOptions): Promise<void> {
	const doc = await buildMonthCalendarPdf(year, month, options);
	doc.save(`calendar-${getMonthName(month)}-${year}.pdf`);
}

export async function printQuarterCalendar(startDate: Date, options: CalendarPrintOptions): Promise<void> {
	const doc = await buildQuarterCalendarPdf(startDate, options);
	const end = addMonths(startDate, 2);
	doc.save(
		`calendar-${getMonthName(startDate.getMonth())}-${startDate.getFullYear()}-to-${getMonthName(end.getMonth())}-${end.getFullYear()}.pdf`
	);
}

export async function buildMonthCalendarPdf(
	year: number,
	month: number,
	options: CalendarPrintOptions
): Promise<jsPDF> {
	const title = `${getMonthName(month)} ${year}`;
	return renderSheet('month', title, [{ name: title, dates: getMonthDates(year, month) }], options);
}

export async function buildQuarterCalendarPdf(startDate: Date, options: CalendarPrintOptions): Promise<jsPDF> {
	const months = [0, 1, 2].map((offset) => {
		const date = addMonths(startDate, offset);
		return {
			name: `${getMonthName(date.getMonth())} ${date.getFullYear()}`,
			dates: getMonthDates(date.getFullYear(), date.getMonth())
		};
	});
	return renderSheet('3-month', `${months[0].name} – ${months[2].name}`, months, options);
}

async function renderSheet(
	view: PrintView,
	title: string,
	months: readonly { name: string; dates: Date[] }[],
	options: CalendarPrintOptions
): Promise<jsPDF> {
	const { jsPDF } = await import('jspdf');
	const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
	const sheet = buildSheet(doc, view, title, months, options);
	const legend = legendRows(doc, sheet);
	const pages = paginate(sheet, legendTop(legend) - 8 - GRID_TOP - GEOMETRY[view].headHeight);
	pages.forEach((lines, index) => {
		if (index > 0) doc.addPage();
		drawPage(doc, sheet, lines, options);
		drawLegend(legend);
	});
	for (let page = 1; page <= pages.length; page++) {
		doc.setPage(page);
		drawFooter(doc, options.organizationName, page, pages.length);
	}
	return doc;
}

function buildSheet(
	doc: jsPDF,
	view: PrintView,
	title: string,
	months: readonly { name: string; dates: Date[] }[],
	options: CalendarPrintOptions
): Sheet {
	const geometry = GEOMETRY[view];
	const dates = months.flatMap((month) => month.dates);
	const days = buildCalendarDays(dates, options.specialDays);
	const window = dayWindow(days[0].dateKey, days.length);
	const tracks = buildAvailabilityTracks(options.availabilityEntries, options.statusTypes);
	const duties =
		view === 'month'
			? buildDutyMarkers(
					options.assignments,
					options.assignmentTypes,
					days.map((day) => day.dateKey)
				)
			: new Map<string, ReadonlyMap<number, readonly CalendarCellMarkerState[]>>();
	const dayWidth = gridWidth(view) / days.length;
	const fits = labelFit(doc, geometry.fullLabel);
	const policy = { view: 'print', dayWidth, fits } as const;

	const lines: SheetLine[] = [];
	let personnelCount = 0;
	for (const group of options.personnelByGroup) {
		if (group.personnel.length === 0) continue;
		lines.push({ kind: 'group', name: group.group, count: group.personnel.length, continued: false });
		for (const person of group.personnel) {
			const personDuties = duties.get(person.id) ?? new Map<number, readonly CalendarCellMarkerState[]>();
			const fitted = fitMarkers(tracks.layout(person.id, window, policy), [...personDuties.keys()]);
			lines.push({
				kind: 'person',
				person,
				bars: fitted.layout.bars,
				overflows: fitted.layout.overflows,
				markers: fitted.markers,
				duties: personDuties
			});
			personnelCount++;
		}
	}

	let start = 0;
	const bands = months.map((month) => {
		const band = { name: month.name, start };
		start += month.dates.length;
		return band;
	});
	return { view, title, days, months: bands, lines, personnelCount, fits };
}

function gridWidth(view: PrintView): number {
	return PAGE.width - PAGE.marginX * 2 - GEOMETRY[view].nameWidth;
}

/** Measures at the full-lane size; a lane bar draws smaller text, so whatever fits here fits there too. */
function labelFit(doc: jsPDF, size: number): LabelFit {
	return (text, width, chevrons) => labelWidth(doc, text, size) + BAR_PADDING * 2 + chevrons * CHEVRON <= width - 1.2;
}

function labelWidth(doc: jsPDF, text: string, size: number): number {
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(size);
	const upper = text.toUpperCase();
	return doc.getTextWidth(upper) + size * LABEL_TRACKING * Math.max([...upper].length - 1, 0);
}

function lineHeight(sheet: Sheet, line: SheetLine): number {
	const geometry = GEOMETRY[sheet.view];
	return line.kind === 'group' ? geometry.groupHeight : geometry.rowHeight;
}

/** Keeps a group header with at least one of its people, and repeats it when a group runs onto another page. */
function paginate(sheet: Sheet, capacity: number): SheetLine[][] {
	const pages: SheetLine[][] = [[]];
	let used = 0;
	let group: GroupLine | undefined;
	sheet.lines.forEach((line, index) => {
		if (line.kind === 'group') group = line;
		const next = sheet.lines[index + 1];
		const needed = lineHeight(sheet, line) + (line.kind === 'group' && next ? lineHeight(sheet, next) : 0);
		if (used + needed > capacity && pages[pages.length - 1].length > 0) {
			pages.push([]);
			used = 0;
			if (line.kind === 'person' && group) {
				const continued: GroupLine = { ...group, continued: true };
				pages[pages.length - 1].push(continued);
				used += lineHeight(sheet, continued);
			}
		}
		pages[pages.length - 1].push(line);
		used += lineHeight(sheet, line);
	});
	return pages;
}

function drawPage(doc: jsPDF, sheet: Sheet, lines: readonly SheetLine[], options: CalendarPrintOptions): void {
	const geometry = GEOMETRY[sheet.view];
	const left = PAGE.marginX;
	const gridLeft = left + geometry.nameWidth;
	const right = PAGE.width - PAGE.marginX;
	const dayWidth = gridWidth(sheet.view) / sheet.days.length;
	const bodyTop = GRID_TOP + geometry.headHeight;
	const bodyBottom = bodyTop + lines.reduce((sum, line) => sum + lineHeight(sheet, line), 0);

	drawHeader(doc, sheet, options);

	sheet.days.forEach((day, index) => {
		const fill = day.holiday ? CLOSED : day.weekend ? SHADE : undefined;
		if (!fill) return;
		setFill(doc, fill);
		doc.rect(gridLeft + index * dayWidth, GRID_TOP, dayWidth, bodyBottom - GRID_TOP, 'F');
	});

	if (sheet.view === 'month') drawMonthHead(doc, sheet, gridLeft, dayWidth);
	else drawQuarterHead(doc, sheet, gridLeft, dayWidth);

	drawDayRules(doc, sheet, gridLeft, dayWidth, GRID_TOP + (sheet.view === 'month' ? 0 : 12), bodyBottom);
	setDraw(doc, STRONG_RULE);
	doc.setLineWidth(0.6);
	doc.line(gridLeft, GRID_TOP, gridLeft, bodyBottom);

	let y = bodyTop;
	for (const line of lines) {
		const height = lineHeight(sheet, line);
		if (line.kind === 'group') drawGroupRow(doc, line, left, right, y, height);
		y += height;
	}

	y = bodyTop;
	for (const line of lines) {
		const height = lineHeight(sheet, line);
		if (line.kind === 'person') drawPersonRow(doc, sheet, line, left, gridLeft, dayWidth, y, height);
		setDraw(doc, RULE);
		doc.setLineWidth(0.4);
		doc.line(left, y + height, right, y + height);
		y += height;
	}

	setDraw(doc, STRONG_RULE);
	doc.setLineWidth(0.6);
	doc.line(left, bodyTop, right, bodyTop);
	doc.rect(left, GRID_TOP, right - left, bodyBottom - GRID_TOP, 'S');
}

function drawHeader(doc: jsPDF, sheet: Sheet, options: CalendarPrintOptions): void {
	tracked(
		doc,
		`Calendar · ${options.organizationName} · ${sheet.personnelCount} personnel`,
		PAGE.marginX,
		PAGE.top + 6,
		6.5,
		FAINT
	);
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(20);
	setText(doc, INK);
	doc.text(sheet.title, PAGE.marginX, PAGE.top + 30);
	const view = sheet.view === 'month' ? 'Month' : '3-Month';
	tracked(doc, `${view} view`, PAGE.width - PAGE.marginX, PAGE.top + 6, 6.5, FAINT, 'right');
	tracked(
		doc,
		`Printed ${DAY_MONTH.format(new Date())}`,
		PAGE.width - PAGE.marginX,
		PAGE.top + 30,
		6.5,
		FAINT,
		'right'
	);
}

function drawMonthHead(doc: jsPDF, sheet: Sheet, gridLeft: number, dayWidth: number): void {
	tracked(doc, 'Personnel', PAGE.marginX + 6, GRID_TOP + 14.5, 5.5, FAINT);
	sheet.days.forEach((day, index) => {
		const center = gridLeft + (index + 0.5) * dayWidth;
		tracked(doc, day.dayName, center, GRID_TOP + 8, 4.3, day.holiday ? CLOSED_INK : FAINT, 'center');
		doc.setFont('helvetica', 'bold');
		doc.setFontSize(8.5);
		setText(doc, day.holiday ? CLOSED_INK : INK);
		doc.text(String(day.dayOfMonth), center, GRID_TOP + 18.5, { align: 'center' });
	});
}

function drawQuarterHead(doc: jsPDF, sheet: Sheet, gridLeft: number, dayWidth: number): void {
	tracked(doc, 'Personnel', PAGE.marginX + 6, GRID_TOP + 8.5, 5.5, FAINT);
	for (const month of sheet.months) {
		tracked(doc, month.name, gridLeft + month.start * dayWidth + 3, GRID_TOP + 8.5, 5.5, INK);
	}
	setDraw(doc, RULE);
	doc.setLineWidth(0.4);
	doc.line(gridLeft, GRID_TOP + 12, PAGE.width - PAGE.marginX, GRID_TOP + 12);
	const monthStarts = sheet.months.map((month) => month.start);
	sheet.days.forEach((day, index) => {
		const monthStart = monthStarts.includes(index);
		const nearMonthStart = monthStarts.some((start) => Math.abs(start - index) < 3);
		if (!monthStart && (day.date.getDay() !== 1 || nearMonthStart)) return;
		doc.setFont('helvetica', 'bold');
		doc.setFontSize(5);
		setText(doc, day.holiday ? CLOSED_INK : MUTED);
		doc.text(String(day.dayOfMonth), gridLeft + index * dayWidth + 1.2, GRID_TOP + 20.5);
	});
}

/** Month draws every day; 3-Month draws week starts, with a firmer rule where a month begins. */
function drawDayRules(doc: jsPDF, sheet: Sheet, gridLeft: number, dayWidth: number, top: number, bottom: number): void {
	sheet.days.forEach((day, index) => {
		if (index === 0) return;
		const monthStart = day.dayOfMonth === 1;
		if (sheet.view === '3-month' && !monthStart && day.date.getDay() !== 1) return;
		setDraw(doc, monthStart && sheet.view === '3-month' ? STRONG_RULE : RULE);
		doc.setLineWidth(monthStart && sheet.view === '3-month' ? 0.6 : 0.4);
		const x = gridLeft + index * dayWidth;
		doc.line(x, monthStart && sheet.view === '3-month' ? GRID_TOP : top, x, bottom);
	});
}

function drawGroupRow(doc: jsPDF, line: GroupLine, left: number, right: number, y: number, height: number): void {
	setFill(doc, SHADE);
	doc.rect(left, y, right - left, height, 'F');
	const name = line.continued ? `${line.name} (continued)` : line.name;
	const end = tracked(doc, name, left + 6, y + height / 2 + 2, 6, INK);
	tracked(doc, `· ${line.count}`, end + 4, y + height / 2 + 2, 6, FAINT);
}

function drawPersonRow(
	doc: jsPDF,
	sheet: Sheet,
	line: PersonLine,
	left: number,
	gridLeft: number,
	dayWidth: number,
	y: number,
	height: number
): void {
	const { person } = line;
	const baseline = y + height / 2 + 2.2;
	const rankEnd = tracked(doc, person.rank, left + 6, baseline, 5.5, MUTED);
	const name = sheet.view === 'month' ? `${person.lastName}, ${person.firstName}` : person.lastName;
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(sheet.view === 'month' ? 7.5 : 6.5);
	setText(doc, INK);
	doc.text(truncate(doc, name, gridLeft - rankEnd - 9), rankEnd + 4, baseline);

	const lanes = laneBounds(sheet.view, y, height);
	for (const bar of line.bars) drawBar(doc, sheet, bar, lanes[bar.lane], gridLeft, dayWidth);
	for (const overflow of line.overflows) drawOverflow(doc, overflow, lanes.bottom, gridLeft, dayWidth);
	for (const marker of line.markers) {
		drawDuties(doc, line.duties.get(marker.day) ?? [], marker, lanes.bottom, gridLeft, dayWidth);
	}
}

type LaneBounds = Record<Bar['lane'], { top: number; bottom: number }>;

function laneBounds(view: PrintView, y: number, height: number): LaneBounds {
	const inset = GEOMETRY[view].barInset;
	const middle = y + height / 2;
	return {
		full: { top: y + inset, bottom: y + height - inset },
		top: { top: y + inset, bottom: middle - 0.5 },
		bottom: { top: middle + 0.5, bottom: y + height - inset }
	};
}

function piecesOf(item: { start: number; end: number; pieces?: readonly TrackPiece[] }): readonly TrackPiece[] {
	return item.pieces ?? [{ start: item.start, end: item.end, yieldsEnd: false }];
}

function pieceBox(piece: TrackPiece, gridLeft: number, dayWidth: number) {
	const x = gridLeft + piece.start * dayWidth + 0.6;
	const width = (piece.end - piece.start + 1) * dayWidth - 1.2 - (piece.yieldsEnd ? dayWidth * 0.75 : 0);
	return { x, width };
}

/** Duty markers can cut an item into pieces; its label goes on the widest one. */
function widest(boxes: readonly { width: number }[]): number {
	return boxes.reduce((best, box, index) => (box.width > boxes[best].width ? index : best), 0);
}

function drawBar(
	doc: jsPDF,
	sheet: Sheet,
	bar: Bar,
	lane: { top: number; bottom: number },
	gridLeft: number,
	dayWidth: number
): void {
	const geometry = GEOMETRY[sheet.view];
	const height = lane.bottom - lane.top;
	const radius = Math.min(1.6, height / 3);
	const color = rgb(bar.status.color);
	const ink = rgb(bar.status.textColor);
	const pieces = piecesOf(bar);
	const boxes = pieces.map((piece) => pieceBox(piece, gridLeft, dayWidth));
	const labeled = widest(boxes);
	const label = bar.pieces ? pieceLabel(sheet, bar, boxes[labeled].width, labeled, pieces.length) : bar.label;
	pieces.forEach((piece, index) => {
		const { x, width } = boxes[index];
		const squareStart = index === 0 && bar.continuesBefore;
		const squareEnd = index === pieces.length - 1 && bar.continuesAfter;
		setFill(doc, color);
		doc.roundedRect(x, lane.top, width, height, radius, radius, 'F');
		if (squareStart) doc.rect(x, lane.top, radius, height, 'F');
		if (squareEnd) doc.rect(x + width - radius, lane.top, radius, height, 'F');
		setFill(doc, ink);
		const middle = lane.top + height / 2;
		const chevron = Math.min(1.8, height / 4);
		if (squareStart)
			doc.triangle(x + 1.2, middle, x + 1.2 + chevron, middle - chevron, x + 1.2 + chevron, middle + chevron, 'F');
		if (squareEnd) {
			const tip = x + width - 1.2;
			doc.triangle(tip, middle, tip - chevron, middle - chevron, tip - chevron, middle + chevron, 'F');
		}
		const text = index === labeled ? labelText(label) : '';
		if (!text) return;
		const size = bar.lane === 'full' ? geometry.fullLabel : geometry.laneLabel;
		const textLeft = x + BAR_PADDING + (squareStart ? CHEVRON : 0);
		doc.saveGraphicsState();
		doc.rect(x, lane.top, width - (squareEnd ? CHEVRON : 0) - 0.8, height, null);
		doc.clip();
		doc.discardPath();
		tracked(doc, text, textLeft, middle + size * 0.35, size, ink);
		doc.restoreGraphicsState();
	});
}

/** A bar's label was fitted to its whole span; a cut bar fits it again to the piece that carries it. */
function pieceLabel(sheet: Sheet, bar: Bar, width: number, index: number, count: number): BarLabel {
	const days = toDayNumber(bar.entry.endDate) - toDayNumber(bar.entry.startDate) + 1;
	const chevrons = Number(index === 0 && bar.continuesBefore) + Number(index === count - 1 && bar.continuesAfter);
	return fittedLabel(bar.status, days, width + 1.2, chevrons, sheet.fits);
}

function labelText(label: BarLabel): string {
	switch (label.kind) {
		case 'with-length':
			return `${label.text} · ${label.days}D`;
		case 'one-day':
		case 'name':
			return label.text;
		case 'name-note':
			return label.name;
		case 'none':
			return '';
	}
}

function drawOverflow(
	doc: jsPDF,
	overflow: BarOverflow,
	lane: { top: number; bottom: number },
	gridLeft: number,
	dayWidth: number
): void {
	const height = lane.bottom - lane.top;
	const boxes = piecesOf(overflow).map((piece) => pieceBox(piece, gridLeft, dayWidth));
	const labeled = widest(boxes);
	boxes.forEach(({ x, width }, index) => {
		setFill(doc, PAPER);
		setDraw(doc, FAINT);
		doc.setLineWidth(0.5);
		doc.setLineDashPattern([1, 0.8], 0);
		doc.roundedRect(x, lane.top, width, height, 1, 1, 'FD');
		doc.setLineDashPattern([], 0);
		if (index === labeled) tracked(doc, `+${overflow.spans.length}`, x + 1.5, lane.top + height / 2 + 1.5, 4.2, MUTED);
	});
}

function drawDuties(
	doc: jsPDF,
	duties: readonly CalendarCellMarkerState[],
	marker: MarkedDay,
	lane: { top: number; bottom: number },
	gridLeft: number,
	dayWidth: number
): void {
	const [first, ...more] = duties;
	if (!first) return;
	const size = 4.4;
	const code = { code: first.shortName, color: rgb(first.color) };
	const rest = { code: `+${more.length}`, color: FAINT };
	const room = dayWidth * (marker.shared ? 0.75 : 1) - 1.2;
	const chipWidth = (chip: { code: string }) => labelWidth(doc, chip.code, size) + 2.4;
	const fitting = [more.length > 0 ? [code, rest] : [code], [code]].find(
		(chips) => chips.reduce((sum, chip) => sum + chipWidth(chip) + 0.6, -0.6) <= room
	);
	const height = lane.bottom - lane.top;
	let x = gridLeft + (marker.day + 1) * dayWidth - 0.6;
	for (const chip of [...(fitting ?? [code])].reverse()) {
		const width = Math.min(chipWidth(chip), room);
		x -= width;
		setFill(doc, PAPER);
		setDraw(doc, chip.color);
		doc.setLineWidth(0.6);
		doc.roundedRect(x, lane.top, width, height, 0.8, 0.8, 'FD');
		doc.saveGraphicsState();
		doc.rect(x, lane.top, width, height, null);
		doc.clip();
		doc.discardPath();
		tracked(doc, chip.code, x + 1.2, lane.top + height / 2 + size * 0.35, size, INK);
		doc.restoreGraphicsState();
		x -= 0.6;
	}
}

interface LegendItem {
	readonly width: number;
	draw(x: number, y: number): void;
}

type ClosureLegend = 'named' | 'counted';

function legendItems(doc: jsPDF, sheet: Sheet, closureLegend: ClosureLegend): LegendItem[] {
	const statuses = new Map<string, StatusType>();
	const duties = new Map<string, CalendarCellMarkerState>();
	for (const line of sheet.lines) {
		if (line.kind !== 'person') continue;
		for (const bar of line.bars) statuses.set(bar.status.id, bar.status);
		for (const overflow of line.overflows) for (const span of overflow.spans) statuses.set(span.status.id, span.status);
		for (const markers of line.duties.values()) for (const duty of markers) duties.set(duty.shortName, duty);
	}
	const items: LegendItem[] = [...statuses.values()]
		.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
		.map((status) => {
			const code = oneDayLabel(status);
			const swatch = Math.max(labelWidth(doc, code, 5) + BAR_PADDING * 2, 14);
			return {
				width: swatch + 4 + legendTextWidth(doc, status.name),
				draw(x, y) {
					setFill(doc, rgb(status.color));
					doc.roundedRect(x, y - 4.5, swatch, 8, 1.4, 1.4, 'F');
					tracked(doc, code, x + BAR_PADDING, y + 1.3, 5, rgb(status.textColor));
					legendLabel(doc, status.name, x + swatch + 4, y + 2);
				}
			};
		});
	for (const duty of [...duties.values()].sort((a, b) => a.shortName.localeCompare(b.shortName))) {
		const chip = labelWidth(doc, duty.shortName, 4.4) + 2.4;
		items.push({
			width: chip + 4 + legendTextWidth(doc, duty.name),
			draw(x, y) {
				setFill(doc, PAPER);
				setDraw(doc, rgb(duty.color));
				doc.setLineWidth(0.6);
				doc.roundedRect(x, y - 3.5, chip, 6.5, 0.8, 0.8, 'FD');
				tracked(doc, duty.shortName, x + 1.2, y + 1.2, 4.4, INK);
				legendLabel(doc, duty.name, x + chip + 4, y + 2);
			}
		});
	}
	const closures = sheet.days.filter((day) => day.specialDay);
	if (closures.length === 0) return items;
	const closed = closureLegend === 'named' ? 'Closed' : `Closed (${closures.length} days)`;
	items.push({
		width: 18 + legendTextWidth(doc, closed),
		draw(x, y) {
			setFill(doc, CLOSED);
			doc.rect(x, y - 4.5, 14, 8, 'F');
			legendLabel(doc, closed, x + 18, y + 2);
		}
	});
	if (closureLegend === 'counted') return items;
	for (const day of closures) {
		const month = sheet.view === 'month' ? '' : ` ${day.date.toLocaleDateString('en-GB', { month: 'short' })}`;
		items.push(textItem(doc, `${day.dayOfMonth}${month} ${day.specialDay!.name}`));
	}
	return items;
}

function textItem(doc: jsPDF, value: string): LegendItem {
	return { width: legendTextWidth(doc, value), draw: (x, y) => legendLabel(doc, value, x, y + 2) };
}

const LEGEND_TEXT = 6.5;

function legendTextWidth(doc: jsPDF, value: string): number {
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(LEGEND_TEXT);
	return doc.getTextWidth(value);
}

function legendLabel(doc: jsPDF, value: string, x: number, y: number): void {
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(LEGEND_TEXT);
	setText(doc, MUTED);
	doc.text(value, x, y);
}

const LEGEND_ROW = 12;
const LEGEND_GAP = 14;
const LEGEND_MAX_ROWS = 3;
const LEGEND_WIDTH = PAGE.width - PAGE.marginX * 2;

function wrapLegend(items: readonly LegendItem[]): LegendItem[][] {
	const rows: LegendItem[][] = [];
	let used = Infinity;
	for (const item of items) {
		if (used + item.width > LEGEND_WIDTH) {
			rows.push([]);
			used = 0;
		}
		rows[rows.length - 1].push(item);
		used += item.width + LEGEND_GAP;
	}
	return rows;
}

/** Names each closure while that fits, then counts them; past the row limit the rest is counted too. */
function legendRows(doc: jsPDF, sheet: Sheet): LegendItem[][] {
	const named = wrapLegend(legendItems(doc, sheet, 'named'));
	const rows = named.length <= LEGEND_MAX_ROWS ? named : wrapLegend(legendItems(doc, sheet, 'counted'));
	if (rows.length <= LEGEND_MAX_ROWS) return rows;
	const kept = rows.slice(0, LEGEND_MAX_ROWS);
	const last = kept[kept.length - 1];
	let hidden = rows.slice(LEGEND_MAX_ROWS).flat().length;
	const used = () => last.reduce((sum, item) => sum + item.width + LEGEND_GAP, 0);
	while (last.length > 0 && used() + textItem(doc, `and ${hidden} more`).width > LEGEND_WIDTH) {
		last.pop();
		hidden++;
	}
	last.push(textItem(doc, `and ${hidden} more`));
	return kept;
}

function legendTop(legend: readonly LegendItem[][]): number {
	return PAGE.height - PAGE.bottom - 12 - legend.length * LEGEND_ROW;
}

function drawLegend(legend: readonly LegendItem[][]): void {
	let y = legendTop(legend) + LEGEND_ROW / 2;
	for (const row of legend) {
		let x = PAGE.marginX;
		for (const item of row) {
			item.draw(x, y);
			x += item.width + LEGEND_GAP;
		}
		y += LEGEND_ROW;
	}
}

function drawFooter(doc: jsPDF, organizationName: string, page: number, pages: number): void {
	const y = PAGE.height - PAGE.bottom + 4;
	setDraw(doc, RULE);
	doc.setLineWidth(0.5);
	doc.line(PAGE.marginX, y - 9, PAGE.width - PAGE.marginX, y - 9);
	const end = tracked(doc, 'TroopToTask', PAGE.marginX, y, 5.5, INK);
	tracked(doc, organizationName, end + 6, y, 5.5, FAINT);
	tracked(doc, `Page ${page} of ${pages}`, PAGE.width - PAGE.marginX, y, 5.5, FAINT, 'right');
}

/** Draws bold uppercase text with the screen's letter spacing and returns where it ends. */
function tracked(
	doc: jsPDF,
	value: string,
	x: number,
	y: number,
	size: number,
	color: Rgb,
	align: 'left' | 'center' | 'right' = 'left'
): number {
	const text = value.toUpperCase();
	const width = labelWidth(doc, text, size);
	const start = align === 'left' ? x : align === 'center' ? x - width / 2 : x - width;
	setText(doc, color);
	doc.text(text, start, y, { charSpace: size * LABEL_TRACKING });
	return start + width;
}

function truncate(doc: jsPDF, value: string, width: number): string {
	if (doc.getTextWidth(value) <= width) return value;
	let text = value;
	while (text.length > 1 && doc.getTextWidth(`${text}…`) > width) text = text.slice(0, -1);
	return `${text.trimEnd()}…`;
}

function rgb(hex: string): Rgb {
	const value = hex.replace('#', '').trim();
	const full = value.length === 3 ? [...value].map((part) => part + part).join('') : value;
	return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function setFill(doc: jsPDF, [r, g, b]: Rgb): void {
	doc.setFillColor(r, g, b);
}

function setDraw(doc: jsPDF, [r, g, b]: Rgb): void {
	doc.setDrawColor(r, g, b);
}

function setText(doc: jsPDF, [r, g, b]: Rgb): void {
	doc.setTextColor(r, g, b);
}
