import type { BriefingRowsBy } from './trainingBriefing.types';

/** CSS px widths that fit Letter landscape with 12 mm margins, the narrowest supported sheet. */
export const PRINT_MATRIX_WIDTHS = {
	sheet: 966,
	type: 194,
	/** Also carries the 4px gap border after the total column. */
	all: 68,
	count: 52,
	minColumn: 64,
	maxColumn: 104
} as const;

export const PRINT_MATRIX_COLUMN_BUDGET =
	PRINT_MATRIX_WIDTHS.sheet - PRINT_MATRIX_WIDTHS.type - PRINT_MATRIX_WIDTHS.all - 2 * PRINT_MATRIX_WIDTHS.count;

const ESTIMATED_HEADING_CHAR_PX = 6.3;
const HEADING_PADDING_PX = 4;

export const PRINT_ROW_NOUNS: Record<BriefingRowsBy, { one: string; many: string }> = {
	group: { one: 'group', many: 'groups' },
	mos: { one: 'MOS', many: 'MOS' },
	role: { one: 'duty role', many: 'duty roles' }
};

export interface PrintColumn<T> {
	item: T;
	width: number;
}

export interface PrintColumnChunk<T> {
	start: number;
	columns: PrintColumn<T>[];
}

export function printColumnWidth(label: string): number {
	const longestWord = Math.max(0, ...label.split(/\s+/).map((word) => word.length));
	const width = Math.ceil(longestWord * ESTIMATED_HEADING_CHAR_PX) + HEADING_PADDING_PX;
	return Math.min(PRINT_MATRIX_WIDTHS.maxColumn, Math.max(PRINT_MATRIX_WIDTHS.minColumn, width));
}

function split<T>(columns: PrintColumn<T>[], budget: number): PrintColumnChunk<T>[] {
	const chunks: PrintColumnChunk<T>[] = [];
	let used = Infinity;
	columns.forEach((column, index) => {
		if (used + column.width > budget) {
			chunks.push({ start: index, columns: [] });
			used = 0;
		}
		chunks[chunks.length - 1].columns.push(column);
		used += column.width;
	});
	return chunks;
}

export function chunkPrintColumns<T>(
	items: T[],
	label: (item: T) => string,
	budget: number = PRINT_MATRIX_COLUMN_BUDGET
): PrintColumnChunk<T>[] {
	const columns = items.map((item) => ({ item, width: printColumnWidth(label(item)) }));
	const fewest = split(columns, budget);
	if (fewest.length < 2) return fewest;
	const total = columns.reduce((sum, column) => sum + column.width, 0);
	const widest = Math.max(...columns.map((column) => column.width));
	for (let target = Math.max(widest, Math.ceil(total / fewest.length)); target < budget; target++) {
		const even = split(columns, target);
		if (even.length === fewest.length) return even;
	}
	return fewest;
}
