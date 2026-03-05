import { ARMY_RANKS } from '../types';
import type { RatingDueStatus } from '../types';

export function getEvalTypeForRank(rank: string): 'OER' | 'NCOER' | 'WOER' {
	if ((ARMY_RANKS.officer as readonly string[]).includes(rank)) return 'OER';
	if ((ARMY_RANKS.warrant as readonly string[]).includes(rank)) return 'WOER';
	return 'NCOER';
}

export function getRatingDueStatus(
	ratingPeriodEnd: string,
	status: string,
	today: Date = new Date()
): RatingDueStatus {
	if (status === 'completed') return 'completed';

	const end = new Date(ratingPeriodEnd + 'T00:00:00');
	const diffMs = end.getTime() - today.getTime();
	const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays < 0) return 'overdue';
	if (diffDays <= 30) return 'due-30';
	if (diffDays <= 60) return 'due-60';
	return 'current';
}

export function getDaysUntilDue(ratingPeriodEnd: string, today: Date = new Date()): number {
	const end = new Date(ratingPeriodEnd + 'T00:00:00');
	const diffMs = end.getTime() - today.getTime();
	return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}
