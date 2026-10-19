import { formatDayMonth, formatDayMonthYear } from '$lib/utils/dates';

/** A required, dated item on one Person's readiness record, as leaders read it. */
export type ReadinessItemStatus = 'expired' | 'missing' | 'expiring' | 'current';
export type ReadinessProblemStatus = Exclude<ReadinessItemStatus, 'current'>;

const STATUS_ORDER: Record<ReadinessItemStatus, number> = { expired: 0, missing: 1, expiring: 2, current: 3 };

export function isReadinessProblem(status: ReadinessItemStatus): status is ReadinessProblemStatus {
	return status !== 'current';
}

export interface RankedReadinessItem {
	status: ReadinessItemStatus;
	daysUntilExpiration: number | null;
	name: string;
}

/** Expired before missing before expiring before current; within a status the nearest expiry first, never-expiring last. */
export function compareReadinessItems(a: RankedReadinessItem, b: RankedReadinessItem): number {
	return (
		STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
		(a.daysUntilExpiration ?? Number.POSITIVE_INFINITY) - (b.daysUntilExpiration ?? Number.POSITIVE_INFINITY) ||
		a.name.localeCompare(b.name)
	);
}

function days(count: number): string {
	return `${count} ${count === 1 ? 'day' : 'days'}`;
}

/** The drawer header's status line, such as "Expired 24 Sep · 12 days ago". */
export function describeReadinessStanding(item: {
	status: ReadinessItemStatus;
	expirationDate: string | null;
	daysUntilExpiration: number | null;
}): string {
	const { status, expirationDate, daysUntilExpiration: daysLeft } = item;
	if (status === 'missing') return 'Missing · never recorded';
	if (!expirationDate) return status === 'current' ? 'Current · does not expire' : 'Expired';
	if (status === 'current') return `Current until ${formatDayMonthYear(expirationDate)}`;
	if (status === 'expiring') {
		return `Expiring ${formatDayMonth(expirationDate)} · ${daysLeft === 0 ? 'today' : `in ${days(daysLeft ?? 0)}`}`;
	}
	return `Expired ${formatDayMonth(expirationDate)} · ${daysLeft === 0 ? 'today' : `${days(-(daysLeft ?? 0))} ago`}`;
}

export type RenewalPreview = { tone: 'current' | 'expired'; text: string };

/** What saving a completion does to the item, previewed before the save. */
export function previewRenewal(
	expirationDate: string | null,
	cycleMonths: number | null,
	asOf: string
): RenewalPreview {
	if (!expirationDate) return { tone: 'current', text: 'Becomes current. Does not expire.' };
	const cycle = cycleMonths === null ? '' : ` on the ${cycleMonths}-month cycle`;
	return expirationDate < asOf
		? { tone: 'expired', text: `Already lapsed. Expired ${formatDayMonthYear(expirationDate)}${cycle}.` }
		: { tone: 'current', text: `Becomes current. Expires ${formatDayMonthYear(expirationDate)}${cycle}.` };
}
