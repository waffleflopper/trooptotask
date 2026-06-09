import {
	addTableSheet,
	createWorkbook,
	downloadWorkbook,
	type Workbook,
	type WorkbookColumn,
	type WorkbookRow,
	type Worksheet
} from '$lib/export/workbook';
import type { DA6Data } from '../stores/dutyRosterHistory.svelte';
import type { Da6Matrix } from '../run';
import { da6CellGlyph } from '../components/shared/da6MatrixCell';
import {
	displayDutyRosterPersonName,
	dutyRosterExportFilename,
	getDutyRosterExportDetails,
	type BrowserExportDetails,
	type BrowserExportInput
} from './dutyRosterExportDetails';

const ROSTER_COLUMNS: WorkbookColumn[] = [
	{ header: 'Date', key: 'date', width: 18 },
	{ header: 'Day', key: 'day', width: 10 },
	{ header: 'Assigned', key: 'assigned', width: 28 },
	{ header: 'Rank', key: 'rank', width: 10 },
	{ header: 'Group', key: 'group', width: 20 },
	{ header: 'Source', key: 'source', width: 12 },
	{ header: 'Generated Soldier', key: 'generatedSoldier', width: 28 },
	{ header: 'Notes', key: 'notes', width: 42 }
];

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

function rosterRows(details: BrowserExportDetails): WorkbookRow[] {
	return details.rosterRows.map((entry) => {
		const warningText = entry.warnings?.length ? `Warnings: ${entry.warnings.join('; ')}` : '';
		const generatedText =
			entry.source === 'manual' && entry.generatedAssignee
				? `${entry.generatedAssignee.rank} ${displayDutyRosterPersonName(entry.generatedAssignee)}`
				: '';
		return {
			date: formatDisplayDate(entry.date),
			day: formatDayName(entry.date),
			assigned: entry.assignee ? displayDutyRosterPersonName(entry.assignee) : 'UNFILLED',
			rank: entry.assignee?.rank ?? '',
			group: entry.assignee?.groupName ?? '',
			source: entry.source === 'manual' ? 'Manual' : entry.source === 'generated' ? 'Generated' : '',
			generatedSoldier: generatedText,
			notes: [warningText, entry.reason].filter(Boolean).join(' | ')
		};
	});
}

function styleRosterRows(sheet: Worksheet, details: BrowserExportDetails): void {
	details.rosterRows.forEach((entry, index) => {
		const row = sheet.getRow(index + 2);
		if (!entry.assignee) {
			row.eachCell((cell) => {
				cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFED7D7' } };
				cell.font = { color: { argb: 'FFC53030' } };
			});
		}
		if (entry.source === 'manual') {
			row.getCell('source').font = { bold: true, color: { argb: 'FF92400E' } };
		}
	});
}

function addDa6MatrixSheet(workbook: Workbook, da6: Da6Matrix): void {
	if (da6.columns.length === 0) return;
	const columns: WorkbookColumn[] = [
		{ header: 'Rank', key: 'rank', width: 10 },
		{ header: 'Name', key: 'name', width: 28 },
		...da6.columns.map((column) => ({
			header: formatShortDate(column.date),
			key: column.date,
			width: 10
		}))
	];
	const rows = da6.rows.map((row) => ({
		rank: row.display.rank,
		name: `${row.display.lastName}, ${row.display.firstName}`,
		...Object.fromEntries(row.cells.map((cell) => [cell.date, da6CellGlyph(cell)]))
	}));
	const sheet = addTableSheet(workbook, { name: 'DA6 Matrix', columns, rows });
	da6.rows.forEach((row, rowIndex) => {
		row.cells.forEach((cell, columnIndex) => {
			const worksheetCell = sheet.getRow(rowIndex + 2).getCell(columnIndex + 3);
			worksheetCell.alignment = { horizontal: 'center' };
			if (cell.assigned) {
				worksheetCell.font = { bold: true };
				worksheetCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6F6D5' } };
			} else if (cell.da6Code === 'A' || cell.da6Code === 'D' || cell.da6Code === 'U') {
				worksheetCell.font = { bold: true, color: { argb: 'FF92400E' } };
			}
		});
	});
}

function addLegacyDa6Sheet(workbook: Workbook, da6: DA6Data): void {
	if (da6.dates.length === 0) return;
	const columns: WorkbookColumn[] = [
		{ header: 'Rank', key: 'rank', width: 10 },
		{ header: 'Name', key: 'name', width: 28 },
		...da6.dates.map((date) => ({
			header: formatShortDate(date.date),
			key: date.date,
			width: 10
		}))
	];
	const rows = da6.personnel.map((person, index) => ({
		rank: person.rank,
		name: person.name,
		...Object.fromEntries(
			da6.dates.map((date) => {
				const position = date.positions[index];
				const assigned = date.assigned?.[index] ?? position === 1;
				if (position === null) return [date.date, '-'];
				return [date.date, assigned ? 'X' : position];
			})
		)
	}));
	const sheet = addTableSheet(workbook, { name: 'DA Form 6 Reference', columns, rows });
	da6.personnel.forEach((_, rowIndex) => {
		da6.dates.forEach((date, columnIndex) => {
			const position = date.positions[rowIndex];
			const assigned = date.assigned?.[rowIndex] ?? position === 1;
			const cell = sheet.getRow(rowIndex + 2).getCell(columnIndex + 3);
			cell.alignment = { horizontal: 'center' };
			if (assigned) {
				cell.font = { bold: true };
				cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6F6D5' } };
			} else if (position === null) {
				cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7FAFC' } };
			}
		});
	});
}

export async function buildDutyRosterWorkbook(input: BrowserExportInput): Promise<Workbook> {
	const details = getDutyRosterExportDetails(input);
	const workbook = await createWorkbook();
	workbook.subject = `${details.typeName} Duty Roster`;
	workbook.title = `${details.statusLabel ? `${details.statusLabel} ` : ''}${details.typeName} Roster`;

	const rosterSheet = addTableSheet(workbook, {
		name: 'Roster',
		columns: ROSTER_COLUMNS,
		rows: rosterRows(details)
	});
	styleRosterRows(rosterSheet, details);

	if (details.da6 && 'rows' in details.da6) {
		addDa6MatrixSheet(workbook, details.da6);
	} else if (details.da6) {
		addLegacyDa6Sheet(workbook, details.da6);
	}

	return workbook;
}

export async function exportDutyRosterForBrowser(input: BrowserExportInput): Promise<void> {
	const details = getDutyRosterExportDetails(input);
	await downloadWorkbook(await buildDutyRosterWorkbook(input), dutyRosterExportFilename(details));
}
