import { cn } from '$lib/utils.js';
import type { ColumnDef } from './types.js';

const HIDDEN_BELOW = {
	md: 'max-md:hidden!',
	'@3xl': '@max-3xl/data-table:hidden!',
	'@xl': '@max-xl/data-table:hidden!'
} as const;

/** A column's alignment and narrow-width hiding, for its header and every body cell, including a `row` snippet's. */
export function columnCellClass(column: Pick<ColumnDef<never>, 'align' | 'hiddenBelow'>): string {
	return cn(
		column.align === 'center' && 'text-center',
		column.align === 'right' && 'text-right',
		column.hiddenBelow && HIDDEN_BELOW[column.hiddenBelow]
	);
}
