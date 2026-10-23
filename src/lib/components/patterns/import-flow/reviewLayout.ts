import type { BadgeVariant } from '$lib/components/ui/badge';
import type { Outcome, ReviewedRow } from './rowModel';
import type { FieldDiff, ValueKind } from './types';
import { parseImportDate } from './values';

export interface ReviewColumn {
	field: string;
	label: string;
	kind: ValueKind;
}

export const OUTCOMES: Record<Outcome, { label: string; badge: BadgeVariant }> = {
	fix: { label: 'Needs a fix', badge: 'danger' },
	new: { label: 'New', badge: 'success' },
	update: { label: 'Update', badge: 'info' },
	unchanged: { label: 'Unchanged', badge: 'outline' },
	skipped: { label: 'Skipped', badge: 'outline' }
};

const TABLE_ROW = 52;
const TABLE_MESSAGE = 22;
const CARD_HEADER = 52;
const CARD_LINE = 28;
const CARD_FIELD = 76;
const CARD_GAP = 12;

export function rowMessages(row: ReviewedRow<unknown>): readonly string[] {
	if (row.outcome === 'skipped') return [row.reason];
	if (row.outcome !== 'fix') return [];
	return [...new Set(row.problems.map((problem) => problem.message))];
}

export function fieldMessage(row: ReviewedRow<unknown>, field: string): string | undefined {
	if (row.outcome !== 'fix') return undefined;
	const messages = row.problems.filter((problem) => problem.field === field).map((problem) => problem.message);
	return messages.length ? [...new Set(messages)].join(' ') : undefined;
}

export function looseMessages(row: ReviewedRow<unknown>, editable: ReadonlySet<string>): readonly string[] {
	if (row.outcome !== 'fix') return [];
	return [...new Set(row.problems.filter((problem) => !editable.has(problem.field)).map((problem) => problem.message))];
}

export function editableFields(row: ReviewedRow<unknown>, columns: readonly ReviewColumn[]): ReadonlySet<string> {
	if (row.outcome !== 'fix') return new Set();
	const shown = new Set(columns.map((column) => column.field));
	return new Set(row.problems.map((problem) => problem.field).filter((field) => shown.has(field)));
}

export function cellText(row: ReviewedRow<unknown>, column: ReviewColumn): string {
	const raw = row.row.raw[column.field] ?? '';
	const resolved = row.resolved?.[column.field];
	if (resolved !== undefined) return resolved;
	return column.kind === 'date' ? (parseImportDate(raw, row.row) ?? raw) : raw;
}

export function changeFor(row: ReviewedRow<unknown>, column: ReviewColumn): FieldDiff | undefined {
	if (row.outcome !== 'update') return undefined;
	return row.diff.find((item) => (item.field ? item.field === column.field : item.label === column.label));
}

export function cardContext(row: ReviewedRow<unknown>, columns: readonly ReviewColumn[]): string {
	const editable = editableFields(row, columns);
	return columns
		.filter((column) => !editable.has(column.field) && !changeFor(row, column))
		.map((column) => cellText(row, column))
		.filter(Boolean)
		.join(' · ');
}

export function tableRowHeight(row: ReviewedRow<unknown>): number {
	return row.outcome === 'fix' ? TABLE_ROW + TABLE_MESSAGE : TABLE_ROW;
}

export function cardRowHeight(
	row: ReviewedRow<unknown>,
	identityColumns: readonly ReviewColumn[],
	columns: readonly ReviewColumn[]
): number {
	const context = (row.outcome === 'fix' || row.outcome === 'update') && cardContext(row, columns) ? CARD_LINE : 0;
	const body = (() => {
		if (row.outcome === 'fix') {
			const fields = editableFields(row, [...identityColumns, ...columns]);
			return fields.size * CARD_FIELD + looseMessages(row, fields).length * CARD_LINE;
		}
		if (row.outcome === 'update') return row.diff.length * CARD_LINE;
		return CARD_LINE;
	})();
	return CARD_HEADER + context + body + CARD_GAP;
}
