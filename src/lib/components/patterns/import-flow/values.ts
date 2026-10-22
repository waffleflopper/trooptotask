import type { IsoDate, ValueKind } from './types';

export interface DateSystem {
	date1904?: boolean;
}

export type ParsedValue = { ok: true; value: IsoDate | number | string | null } | { ok: false; message: string };

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAY_MS = 86_400_000;

function isoDate(year: number, month: number, day: number): IsoDate | null {
	if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
	const date = new Date(Date.UTC(year, month - 1, day));
	if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
	return date.toISOString().slice(0, 10) as IsoDate;
}

export function parseImportDate(raw: string, system: DateSystem = {}): IsoDate | null {
	const text = raw.trim();
	let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
	if (match) return isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
	match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
	if (match) return isoDate(Number(match[3]), Number(match[1]), Number(match[2]));
	match = /^(\d{1,2})\s*([a-z]{3})\s*(\d{2}|\d{4})$/i.exec(text);
	if (match) {
		const year = Number(match[3]);
		return isoDate(
			match[3].length === 2 ? 2000 + year : year,
			MONTHS.indexOf(match[2].toLowerCase()) + 1,
			Number(match[1])
		);
	}
	if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
	const serial = Math.floor(Number(text));
	if (!Number.isSafeInteger(serial) || serial < (system.date1904 ? 0 : 1) || (!system.date1904 && serial === 60))
		return null;
	// Excel's 1900 system includes a fictional February 29; serials after it need one less day.
	const days = system.date1904 ? serial : serial - (serial > 60 ? 1 : 0);
	const date = new Date(
		Date.UTC(system.date1904 ? 1904 : 1899, system.date1904 ? 0 : 11, system.date1904 ? 1 : 31) + days * DAY_MS
	);
	if (!Number.isFinite(date.getTime())) return null;
	return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function normalizeHeader(raw: string): string {
	return raw
		.replace(/^\uFEFF/, '')
		.trim()
		.toLowerCase()
		.replace(/\s+/g, ' ');
}

export function parseValue(kind: ValueKind, raw: string, maxLength?: number, system: DateSystem = {}): ParsedValue {
	const text = raw.trim();
	if (!text) return { ok: true, value: null };
	if (kind === 'date') {
		const value = parseImportDate(text, system);
		return value ? { ok: true, value } : { ok: false, message: 'Enter a valid date.' };
	}
	if (kind === 'integer') {
		const value = Number(text);
		return /^[+-]?\d+$/.test(text) && Number.isSafeInteger(value)
			? { ok: true, value }
			: { ok: false, message: 'Enter a whole number.' };
	}
	return maxLength !== undefined && text.length > maxLength
		? { ok: false, message: `Use at most ${maxLength} characters.` }
		: { ok: true, value: text };
}
