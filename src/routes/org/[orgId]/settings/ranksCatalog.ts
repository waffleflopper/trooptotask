import type { OrganizationRankCatalogReferenceSummary } from '$features/personnel/contracts';
import type { SettingsRankCatalogRow } from './settingsSectionTypes';

export type RankStateFilter = 'all' | SettingsRankCatalogRow['state'];
export type RankBranchFilter = 'all' | SettingsRankCatalogRow['service'];

export type RankInUse = { kind: 'people' | 'training' | 'history' | 'none' | 'unknown'; count: number; text: string };
type RankComparator = (a: SettingsRankCatalogRow, b: SettingsRankCatalogRow) => number;

const PAY_GRADE_ORDER = new Map(
	[
		'O-10',
		'O-9',
		'O-8',
		'O-7',
		'O-6',
		'O-5',
		'O-4',
		'O-3',
		'O-2',
		'O-1',
		'W-5',
		'W-4',
		'W-3',
		'W-2',
		'W-1',
		'E-9',
		'E-8',
		'E-7',
		'E-6',
		'E-5',
		'E-4',
		'E-3',
		'E-2',
		'E-1',
		'ungraded'
	].map((payGrade, index) => [payGrade, index])
);

const IN_USE_ORDER: RankInUse['kind'][] = ['none', 'unknown', 'history', 'training', 'people'];

const REMOVABLE_SENTENCE = 'Not used by any person, training filter or history, so it can be removed.';

function payGradeIndex(entry: SettingsRankCatalogRow): number {
	return PAY_GRADE_ORDER.get(entry.payGrade) ?? Number.MAX_SAFE_INTEGER;
}

export function compareRankPrecedence(a: SettingsRankCatalogRow, b: SettingsRankCatalogRow): number {
	return (
		payGradeIndex(a) - payGradeIndex(b) ||
		a.sortOrder - b.sortOrder ||
		a.code.localeCompare(b.code) ||
		a.label.localeCompare(b.label)
	);
}

export function filterRanks(
	ranks: readonly SettingsRankCatalogRow[],
	filters: { state: RankStateFilter; branch: RankBranchFilter; search: string }
): SettingsRankCatalogRow[] {
	const query = filters.search.trim().toLowerCase();
	return ranks.filter(
		(entry) =>
			(filters.state === 'all' || entry.state === filters.state) &&
			(filters.branch === 'all' || entry.service === filters.branch) &&
			(!query ||
				`${entry.code} ${entry.label} ${entry.serviceLabel} ${entry.sourceLabel}`.toLowerCase().includes(query))
	);
}

/** People first, because a rank people hold is the reason it cannot be removed. */
export function rankInUse(summary: OrganizationRankCatalogReferenceSummary): RankInUse {
	const { activeReferences, historicalReferences } = summary;
	if (activeReferences.personnel > 0) {
		const count = activeReferences.personnel;
		return { kind: 'people', count, text: `${count} ${count === 1 ? 'person' : 'people'}` };
	}
	if (activeReferences.total > 0) {
		return { kind: 'training', count: activeReferences.total, text: `${activeReferences.total} in training` };
	}
	if (historicalReferences.total > 0) {
		return { kind: 'history', count: historicalReferences.total, text: `${historicalReferences.total} in history` };
	}
	// A summary with no references that still blocks removal is the loader's stand-in for a failed reference check.
	if (!summary.canDelete) return { kind: 'unknown', count: 0, text: 'Unknown' };
	return { kind: 'none', count: 0, text: 'Not in use' };
}

function compareInUse(a: SettingsRankCatalogRow, b: SettingsRankCatalogRow): number {
	const left = rankInUse(a.referenceSummary);
	const right = rankInUse(b.referenceSummary);
	return (
		IN_USE_ORDER.indexOf(left.kind) - IN_USE_ORDER.indexOf(right.kind) ||
		left.count - right.count ||
		compareRankPrecedence(a, b)
	);
}

/** Ascending order for each sortable catalog lane; ties fall back to rank precedence. */
export const RANK_LANE_ORDER = {
	rank: compareRankPrecedence,
	branch: (a, b) => a.serviceLabel.localeCompare(b.serviceLabel) || compareRankPrecedence(a, b),
	grade: compareRankPrecedence,
	source: (a, b) => a.sourceLabel.localeCompare(b.sourceLabel) || compareRankPrecedence(a, b),
	inUse: compareInUse,
	state: (a, b) => a.state.localeCompare(b.state) || compareRankPrecedence(a, b)
} satisfies Record<string, RankComparator>;

/** What removing or retiring this rank would do, in one sentence. */
export function rankSentence(entry: SettingsRankCatalogRow): string {
	return entry.commands.deleteDisabledReason ?? (entry.commands.canDelete ? REMOVABLE_SENTENCE : '');
}
