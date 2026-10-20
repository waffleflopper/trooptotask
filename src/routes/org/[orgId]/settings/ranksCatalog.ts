import type { OrganizationRankCatalogReferenceSummary } from '$features/personnel/contracts';
import type { SettingsRankCatalogRow } from './settingsSectionTypes';

export type RankStateFilter = 'all' | SettingsRankCatalogRow['state'];
export type RankBranchFilter = 'all' | SettingsRankCatalogRow['service'];

export type RankInUse = { kind: 'people' | 'training' | 'history' | 'none' | 'unknown'; text: string };

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

function count(value: number, one: string, many: string): string {
	return `${value} ${value === 1 ? one : many}`;
}

/** People first, because a rank people hold is the reason it cannot be removed. */
export function rankInUse(summary: OrganizationRankCatalogReferenceSummary): RankInUse {
	const { activeReferences, historicalReferences } = summary;
	if (activeReferences.personnel > 0) {
		return { kind: 'people', text: count(activeReferences.personnel, 'person', 'people') };
	}
	if (activeReferences.total > 0) return { kind: 'training', text: `${activeReferences.total} in training` };
	if (historicalReferences.total > 0) return { kind: 'history', text: `${historicalReferences.total} in history` };
	// A summary with no references that still blocks removal is the loader's stand-in for a failed reference check.
	if (!summary.canDelete) return { kind: 'unknown', text: 'Unknown' };
	return { kind: 'none', text: 'Not in use' };
}

/** What removing or retiring this rank would do, in one sentence, with the tie-break hint when the row is editable. */
export function rankSentence(entry: SettingsRankCatalogRow, tieBreakHelp: string | null): string {
	const consequence =
		entry.warnings.length > 0
			? entry.warnings.join(' ')
			: (entry.commands.deleteDisabledReason ?? (entry.commands.canDelete ? REMOVABLE_SENTENCE : ''));
	return [consequence, tieBreakHelp].filter(Boolean).join(' ');
}
