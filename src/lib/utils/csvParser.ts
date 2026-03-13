// src/lib/utils/csvParser.ts
import * as XLSX from 'xlsx';

/**
 * Parse CSV text into a 2D array of strings.
 * Handles comma-separated values with basic trimming.
 */
export function parseCSVText(text: string): string[][] {
  const workbook = XLSX.read(text, { type: 'string', raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
  return raw
    .map(row => Array.from(row as unknown[], cell => String(cell ?? '').trim()))
    .filter(row => row.some(cell => cell.length > 0));
}

/**
 * Parse an uploaded file (Excel or CSV) into a 2D array of strings.
 * Returns a Promise because FileReader is async.
 */
export function parseFile(file: File): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', raw: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
        // Convert all cells to trimmed strings; Array.from densifies sparse arrays (XLSX skips empty cells)
        const rows = raw
          .map(row => Array.from(row as unknown[], cell => String(cell ?? '').trim()))
          .filter(row => row.some(cell => cell.length > 0));
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Parse a training status/date value.
 * Returns { type, date } where type is 'date' | 'completed' | 'exempt' | 'skip' | 'invalid'.
 */
export function parseTrainingStatus(value: string): {
  type: 'date' | 'completed' | 'exempt' | 'skip' | 'invalid';
  date: string | null;
  raw: string;
} {
  const raw = value;
  const v = value.trim().toLowerCase();

  // Exempt values
  if (['exempt', 'exempted', 'e'].includes(v)) {
    return { type: 'exempt', date: null, raw };
  }

  // Yes/completed values → completed today
  if (['yes', 'y', 'true', '1', 'complete', 'completed', 'done', 'x'].includes(v)) {
    const today = new Date().toISOString().slice(0, 10);
    return { type: 'completed', date: today, raw };
  }

  // No/skip values
  if (['no', 'n', 'false', '0', 'incomplete', 'pending', ''].includes(v)) {
    return { type: 'skip', date: null, raw };
  }

  // Try date formats
  const date = parseDateString(value);
  if (date) {
    return { type: 'date', date, raw };
  }

  return { type: 'invalid', date: null, raw };
}

/**
 * Parse a date string in various formats to YYYY-MM-DD.
 */
export function parseDateString(str: string): string | null {
  const trimmed = str.trim();

  // ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed + 'T00:00:00');
    return isNaN(d.getTime()) ? null : trimmed;
  }

  // US: MM/DD/YYYY
  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, mm, dd, yyyy] = usMatch;
    const d = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T00:00:00`);
    return isNaN(d.getTime()) ? null : `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  // Excel serial number
  if (/^\d+$/.test(trimmed)) {
    const serial = parseInt(trimmed, 10);
    if (serial >= 25569 && serial <= 60000) {
      // Excel epoch: Jan 1, 1900, with the leap year bug
      const excelEpoch = new Date(1900, 0, 1);
      const ms = excelEpoch.getTime() + (serial - 2) * 86400000;
      const d = new Date(ms);
      if (!isNaN(d.getTime())) {
        return d.toISOString().slice(0, 10);
      }
    }
  }

  // Fallback: JS Date.parse (use local date parts to avoid UTC offset shifting the date)
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  return null;
}
