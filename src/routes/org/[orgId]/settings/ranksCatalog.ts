import {
	BUILT_IN_RANK_CATALOG,
	type OrganizationRankCatalogReferenceSummary,
	type RankService
} from '$features/personnel/contracts';
import type { SettingsRankCatalogRow } from './settingsSectionTypes';

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

/** What removing or retiring this rank would do: its reference warnings, else why it stays, else that it can go. */
export function rankSentence(entry: SettingsRankCatalogRow): string {
	if (entry.warnings.length > 0) return entry.warnings.join(' ');
	return entry.commands.deleteDisabledReason ?? (entry.commands.canDelete ? REMOVABLE_SENTENCE : '');
}

export type RankCategoryGroup = { key: string; label: string; ranks: SettingsRankCatalogRow[] };
export type RankBranchGroup = {
	service: RankService;
	label: string;
	ranks: SettingsRankCatalogRow[];
	categories: RankCategoryGroup[];
};

const HISTORY_CODES = new Set(BUILT_IN_RANK_CATALOG.filter((entry) => entry.state === 'retired').map((entry) => entry.code));
const CATEGORY_ORDER = ['officer', 'warrant', 'enlisted', 'civilian', 'custom'];

/** A built-in rank that only old records use, such as SP4. */
export function isHistoryRank(entry: SettingsRankCatalogRow): boolean {
	return entry.source === 'built-in' && HISTORY_CODES.has(entry.code);
}

/**
 * Branch tabs in `services` order, each split into categories in pay grade order. Ranks of the custom service are
 * the Organization's own and sit apart from the branches.
 */
export function groupRanks(
	ranks: readonly SettingsRankCatalogRow[],
	services: readonly { value: RankService }[]
): { branches: RankBranchGroup[]; custom: SettingsRankCatalogRow[] } {
	const sorted = ranks.toSorted(compareRankPrecedence);
	const branches = services.flatMap(({ value }) => {
		const branchRanks = sorted.filter((entry) => entry.service === value);
		if (value === 'custom' || branchRanks.length === 0) return [];
		const categories = CATEGORY_ORDER.flatMap((category) => {
			const categoryRanks = branchRanks.filter((entry) => entry.category === category);
			return categoryRanks.length === 0
				? []
				: [{ key: `${value}:${category}`, label: categoryRanks[0].categoryLabel, ranks: categoryRanks }];
		});
		return [{ service: value, label: branchRanks[0].serviceLabel, ranks: branchRanks, categories }];
	});
	return { branches, custom: sorted.filter((entry) => entry.service === 'custom') };
}
