import { formatDayMonth, formatDayMonthYear, localDateIn } from '$lib/utils/dates';

const MEGABYTE = 1024 * 1024;

const TYPE_LABELS: Record<string, string> = {
	'application/pdf': 'PDF',
	'image/jpeg': 'JPG',
	'image/png': 'PNG',
	'image/heic': 'HEIC',
	'image/heif': 'HEIC'
};

/** `PDF`, `JPG`, `PNG` or `HEIC`; the raw subtype for anything else. */
export function fileTypeLabel(contentType: string): string {
	return TYPE_LABELS[contentType] ?? (contentType.split('/').pop() ?? contentType).toUpperCase();
}

/** `1.2 MB`, `210 KB` or `812 B`. */
export function formatFileSize(bytes: number): string {
	if (bytes >= MEGABYTE) return `${(bytes / MEGABYTE).toFixed(1)} MB`;
	if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${bytes} B`;
}

/** Megabytes with a decimal only when the figure has one: `100`, `18.6`. */
export function formatMegabytes(bytes: number): string {
	return String(Number((bytes / MEGABYTE).toFixed(1)));
}

/** `18.6 of 100 MB`. */
export function storageCaption(usedBytes: number, capBytes: number): string {
	return `${formatMegabytes(usedBytes)} of ${formatMegabytes(capBytes)} MB`;
}

/** The share of the cap in use, clamped to 0 to 1, with a zero cap read as full. */
export function storageFraction(usedBytes: number, capBytes: number): number {
	if (capBytes <= 0) return 1;
	return Math.min(1, Math.max(0, usedBytes / capBytes));
}

/** The calendar day a stored timestamp falls on in the viewer's time zone, as `YYYY-MM-DD`. */
export function viewerDay(timestamp: string, timeZone: string): string {
	return localDateIn(timeZone, new Date(timestamp));
}

/** `13 Sep`, or `13 Sep 2025` when the year is not the viewer's current one. */
export function uploadedOn(timestamp: string, timeZone: string, asOf: string): string {
	const day = viewerDay(timestamp, timeZone);
	return day.slice(0, 4) === asOf.slice(0, 4) ? formatDayMonth(day) : formatDayMonthYear(day);
}
