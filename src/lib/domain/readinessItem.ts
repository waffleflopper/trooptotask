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
