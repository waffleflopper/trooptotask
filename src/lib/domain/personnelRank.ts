import type { Personnel } from '$lib/types';
import { BUILT_IN_RANK_CATALOG, compareRankCodes } from './rankCatalog';

export const PERSONNEL_RANK_ORDER = BUILT_IN_RANK_CATALOG.filter(
	(rank) => (rank.service === 'army' && rank.state === 'active') || rank.code === 'CIV'
)
	.sort((a, b) => compareRankCodes(a.code, b.code))
	.map((rank) => rank.code);

const RANK_PRECEDENCE: Map<string, number> = new Map(PERSONNEL_RANK_ORDER.map((rank, index) => [rank, index]));

function compareNames(
	a: Pick<Personnel, 'lastName' | 'firstName' | 'rank' | 'id'>,
	b: Pick<Personnel, 'lastName' | 'firstName' | 'rank' | 'id'>
): number {
	return (
		a.lastName.localeCompare(b.lastName, 'en-US') ||
		a.firstName.localeCompare(b.firstName, 'en-US') ||
		a.rank.localeCompare(b.rank, 'en-US') ||
		a.id.localeCompare(b.id, 'en-US')
	);
}

export function getRankPrecedence(rank: string): number {
	return RANK_PRECEDENCE.get(rank) ?? PERSONNEL_RANK_ORDER.length;
}

export function comparePersonnelByRankThenName(
	a: Pick<Personnel, 'rank' | 'lastName' | 'firstName' | 'id'>,
	b: Pick<Personnel, 'rank' | 'lastName' | 'firstName' | 'id'>
): number {
	const rankDiff = getRankPrecedence(a.rank) - getRankPrecedence(b.rank);
	if (rankDiff !== 0) {
		return rankDiff;
	}
	return compareNames(a, b);
}
