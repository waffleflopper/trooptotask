import type { PersonnelArchivedArtifact, PersonnelFollowUp } from './contracts';

const DAY_MS = 86_400_000;

function utcDay(dateOnly: string): number {
	const [year, month, day] = dateOnly.split('-').map(Number);
	return Date.UTC(year, month - 1, day);
}

function datePart(date: Date, options: Intl.DateTimeFormatOptions, timeZone?: string): string {
	return new Intl.DateTimeFormat('en-US', { ...options, timeZone }).format(date);
}

function dayMonthOf(date: Date, timeZone?: string): string {
	return `${datePart(date, { day: 'numeric' }, timeZone)} ${datePart(date, { month: 'short' }, timeZone)}`;
}

export function formatDayMonth(dateOnly: string): string {
	return dayMonthOf(new Date(utcDay(dateOnly)), 'UTC');
}

export function formatWeekdayDayMonth(dateOnly: string): string {
	const date = new Date(utcDay(dateOnly));
	return `${datePart(date, { weekday: 'short' }, 'UTC')} ${dayMonthOf(date, 'UTC')}`;
}

export const nowIso = (): string => new Date().toISOString();

/** `15 Oct` for a timestamp, on the viewer's calendar day. */
export function formatTimestampDayMonth(timestamp: string): string {
	return dayMonthOf(new Date(timestamp));
}

export function formatTimestampYear(timestamp: string): string {
	return String(new Date(timestamp).getFullYear());
}

export interface DueLabel {
	text: string;
	overdue: boolean;
}

export function dueLabel(dueDate: string | null, today: string): DueLabel {
	if (!dueDate) return { text: 'No due date', overdue: false };
	const daysLate = Math.round((utcDay(today) - utcDay(dueDate)) / DAY_MS);
	if (daysLate > 0) return { text: `Overdue ${daysLate} ${daysLate === 1 ? 'day' : 'days'}`, overdue: true };
	return { text: formatWeekdayDayMonth(dueDate), overdue: false };
}

export interface FollowUpGroups {
	open: PersonnelFollowUp[];
	completed: PersonnelFollowUp[];
	overdue: number;
}

export function groupFollowUps(rows: readonly PersonnelFollowUp[], today: string): FollowUpGroups {
	const byDue = (a: PersonnelFollowUp, b: PersonnelFollowUp) => {
		if (a.dueDate !== b.dueDate) {
			if (!a.dueDate) return 1;
			if (!b.dueDate) return -1;
			return a.dueDate.localeCompare(b.dueDate);
		}
		return a.createdAt.localeCompare(b.createdAt);
	};
	const open = rows.filter((row) => row.status === 'open').sort(byDue);
	const completed = rows
		.filter((row) => row.status === 'completed')
		.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
	return { open, completed, overdue: open.filter((row) => dueLabel(row.dueDate, today).overdue).length };
}

export type ArchivedFilter = 'all' | PersonnelArchivedArtifact['kind'];

export const ARCHIVED_KIND_LABELS: Record<PersonnelArchivedArtifact['kind'], string> = {
	'follow-up': 'Follow-up',
	counseling: 'Counseling',
	document: 'Document',
	note: 'Note'
};

export function archivedAt(record: PersonnelArchivedArtifact): string {
	if (record.kind === 'follow-up') return record.archivedAt ?? record.updatedAt;
	return record.archivedAt ?? record.createdAt;
}

export function archivedTitle(record: PersonnelArchivedArtifact): string {
	if (record.kind === 'note') return `“${record.text}”`;
	return record.title;
}

function fileKind(contentType: string): string {
	if (contentType === 'application/pdf') return 'PDF';
	return contentType.split('/')[1]?.toUpperCase() ?? 'File';
}

function fileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function archivedDetail(record: PersonnelArchivedArtifact): string {
	switch (record.kind) {
		case 'follow-up': {
			const state = record.completedAt ? 'Completed' : 'Open';
			const due = record.dueDate ? ` · due ${formatDayMonth(record.dueDate)}` : '';
			return `${state}${due} · created by ${record.createdBy}`;
		}
		case 'counseling':
			return `Conducted ${formatDayMonth(record.dateConducted)} · PDF`;
		case 'document':
			return `${fileKind(record.contentType)} · ${fileSize(record.fileSizeBytes)}`;
		case 'note':
			return `Written ${formatTimestampDayMonth(record.createdAt)} by ${record.author}`;
	}
}

export function archivedStamp(record: PersonnelArchivedArtifact): string {
	const when = `Archived ${formatTimestampDayMonth(archivedAt(record))}`;
	return record.archivedBy ? `${when} · ${record.archivedBy}` : when;
}
