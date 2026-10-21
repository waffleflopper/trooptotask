export interface ColumnDef {
	key: string;
	label: string;
	required: boolean;
	aliases: string[]; // recognized header variations (lowercase)
}

export interface ColumnMapping {
	columnIndex: number;
	fieldKey: string | null; // null = "Skip"
}

export function detectHeaderRow(firstRow: string[], columnDefs: ColumnDef[]): boolean {
	const allAliases = columnDefs.flatMap((d) => d.aliases);
	return firstRow.some((cell) => allAliases.includes(cell.trim().toLowerCase()));
}

export function autoMapColumns(headers: string[], columnDefs: ColumnDef[], hasHeaders: boolean): ColumnMapping[] {
	if (!hasHeaders) {
		return headers.map((_, i) => ({
			columnIndex: i,
			fieldKey: i < columnDefs.length ? columnDefs[i].key : null
		}));
	}

	const mappings: ColumnMapping[] = [];
	const usedKeys = new Set<string>();

	for (let i = 0; i < headers.length; i++) {
		const header = headers[i].trim().toLowerCase();
		const match = columnDefs.find((d) => !usedKeys.has(d.key) && d.aliases.includes(header));
		mappings.push({
			columnIndex: i,
			fieldKey: match?.key ?? null
		});
		if (match) usedKeys.add(match.key);
	}

	return mappings;
}

export function applyMapping(row: string[], mappings: ColumnMapping[]): Record<string, string> {
	const result: Record<string, string> = {};
	for (const m of mappings) {
		if (m.fieldKey && m.columnIndex < row.length) {
			result[m.fieldKey] = row[m.columnIndex].trim();
		}
	}
	return result;
}

export function getMissingRequired(mappings: ColumnMapping[], columnDefs: ColumnDef[]): ColumnDef[] {
	const mappedKeys = new Set(mappings.map((m) => m.fieldKey).filter((k): k is string => k !== null));
	return columnDefs.filter((d) => d.required && !mappedKeys.has(d.key));
}
