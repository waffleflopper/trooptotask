// src/lib/utils/columnMapping.ts

export interface ColumnDef {
  key: string;          // internal field name (e.g., 'lastName')
  label: string;        // display label (e.g., 'Last Name')
  required: boolean;
  aliases: string[];    // recognized header variations (lowercase)
}

export interface ColumnMapping {
  columnIndex: number;
  fieldKey: string | null;  // null = "Skip"
}

/**
 * Detect whether the first row is a header row.
 * Returns true if any cell in the first row matches a known alias.
 */
export function detectHeaderRow(firstRow: string[], columnDefs: ColumnDef[]): boolean {
  const allAliases = columnDefs.flatMap(d => d.aliases);
  return firstRow.some(cell => allAliases.includes(cell.trim().toLowerCase()));
}

/**
 * Auto-map columns by matching header text to column definition aliases.
 * Falls back to positional mapping if no headers detected.
 */
export function autoMapColumns(
  headers: string[],
  columnDefs: ColumnDef[],
  hasHeaders: boolean
): ColumnMapping[] {
  if (!hasHeaders) {
    // Positional fallback: map columns 0..N to columnDefs in order
    return headers.map((_, i) => ({
      columnIndex: i,
      fieldKey: i < columnDefs.length ? columnDefs[i].key : null
    }));
  }

  const mappings: ColumnMapping[] = [];
  const usedKeys = new Set<string>();

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i].trim().toLowerCase();
    const match = columnDefs.find(
      d => !usedKeys.has(d.key) && d.aliases.includes(header)
    );
    mappings.push({
      columnIndex: i,
      fieldKey: match?.key ?? null
    });
    if (match) usedKeys.add(match.key);
  }

  return mappings;
}

/**
 * Apply column mappings to a row of raw strings.
 * Returns an object keyed by fieldKey.
 */
export function applyMapping(
  row: string[],
  mappings: ColumnMapping[]
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const m of mappings) {
    if (m.fieldKey && m.columnIndex < row.length) {
      result[m.fieldKey] = row[m.columnIndex].trim();
    }
  }
  return result;
}

/**
 * Check that all required columns are mapped.
 */
export function getMissingRequired(
  mappings: ColumnMapping[],
  columnDefs: ColumnDef[]
): ColumnDef[] {
  const mappedKeys = new Set(mappings.map(m => m.fieldKey).filter(Boolean));
  return columnDefs.filter(d => d.required && !mappedKeys.has(d.key));
}

// --- Column definitions for each importer ---

export const PERSONNEL_COLUMNS: ColumnDef[] = [
  {
    key: 'rank', label: 'Rank', required: true,
    aliases: ['rank', 'grade', 'pay grade', 'paygrade']
  },
  {
    key: 'lastName', label: 'Last Name', required: true,
    aliases: ['last name', 'lastname', 'last', 'surname', 'family name']
  },
  {
    key: 'firstName', label: 'First Name', required: true,
    aliases: ['first name', 'firstname', 'first', 'given name']
  },
  {
    key: 'mos', label: 'MOS', required: false,
    aliases: ['mos', 'military occupational specialty', 'job', 'afsc']
  },
  {
    key: 'clinicRole', label: 'Role', required: false,
    aliases: ['role', 'clinic role', 'duty position', 'position', 'billet']
  },
  {
    key: 'groupName', label: 'Group', required: false,
    aliases: ['group', 'unit', 'section', 'team', 'platoon', 'squad']
  }
];

export const TRAINING_COLUMNS: ColumnDef[] = [
  {
    key: 'lastName', label: 'Last Name', required: true,
    aliases: ['last name', 'lastname', 'last', 'surname', 'family name']
  },
  {
    key: 'firstName', label: 'First Name', required: true,
    aliases: ['first name', 'firstname', 'first', 'given name']
  },
  {
    key: 'trainingType', label: 'Training Type', required: true,
    aliases: ['training', 'training type', 'type', 'course', 'certification']
  },
  {
    key: 'status', label: 'Date / Status', required: true,
    aliases: ['date', 'completion date', 'completed', 'date completed', 'status']
  },
  {
    key: 'notes', label: 'Notes', required: false,
    aliases: ['notes', 'comments', 'remarks']
  }
];
