import type { DeletionRequestResourceType } from '$features/deletion-requests/contracts';

export interface ApprovalKind {
	label: string;
	approveLabel: 'Approve archive' | 'Approve delete';
}

export const APPROVAL_KINDS = {
	personnel: { label: 'Personnel', approveLabel: 'Approve archive' },
	counseling_record: { label: 'Counseling record', approveLabel: 'Approve delete' },
	training_type: { label: 'Training type', approveLabel: 'Approve delete' },
	personnel_training: { label: 'Training record', approveLabel: 'Approve delete' },
	rating_scheme_entry: { label: 'Rating scheme', approveLabel: 'Approve delete' }
} as const satisfies Record<DeletionRequestResourceType, ApprovalKind>;

/** Saved requests keep their original type, so one from a retired kind still gets a row. */
export function approvalKind(resourceType: string): ApprovalKind {
	return (
		APPROVAL_KINDS[resourceType as DeletionRequestResourceType] ?? { label: 'Record', approveLabel: 'Approve delete' }
	);
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

type Elapsed = { value: number; unit: 'minute' | 'hour' | 'day' };

function elapsed(since: string, now: Date): Elapsed {
	const ms = Math.max(0, now.getTime() - Date.parse(since));
	if (ms < HOUR) return { value: Math.max(1, Math.floor(ms / 60_000)), unit: 'minute' };
	if (ms < DAY) return { value: Math.floor(ms / HOUR), unit: 'hour' };
	return { value: Math.floor(ms / DAY), unit: 'day' };
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "5 minutes ago", "2 hours ago", "yesterday", "3 days ago". */
export function requestedAgo(createdAt: string, now: Date): string {
	const { value, unit } = elapsed(createdAt, now);
	return relative.format(-value, unit);
}

/** "3 waiting · oldest 2 days" for pending requests, `null` when none wait. */
export function waitingSummary(createdAts: string[], now: Date): string | null {
	if (createdAts.length === 0) return null;
	const oldest = createdAts.reduce((a, b) => (Date.parse(a) <= Date.parse(b) ? a : b));
	const { value, unit } = elapsed(oldest, now);
	return `${createdAts.length} waiting · oldest ${value} ${unit}${value === 1 ? '' : 's'}`;
}
