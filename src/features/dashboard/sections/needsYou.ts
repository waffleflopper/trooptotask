export type NeedsYouSeverity = 'danger' | 'warning' | 'info';

/** Something a viewer can clear from the Dashboard; the owning page remains the full workflow. */
interface NeedsYouItemBase {
	/** Stable across reloads so a cleared row can be removed by id. */
	id: string;
	title: string;
	subtitle: string;
	timing: string;
	href: string;
	/** Runs before the link navigates, for an owning page that opens from client state rather than the URL. */
	onOpen?: () => void;
	action: NeedsYouAction | null;
}

export interface NeedsYouAction {
	label: string;
}

interface LateItem {
	urgency: { daysLate: number };
}

interface DatedItem {
	/** The date the row is about, "YYYY-MM-DD"; sooner ranks higher. */
	urgency: { date: string };
}

export type NeedsYouItem =
	| (NeedsYouItemBase & LateItem & { kind: 'overdue'; ratingSchemeEntryId: string })
	| (NeedsYouItemBase & LateItem & { kind: 'expired'; trainingTypeId: string; personnelIds: readonly string[] })
	| (NeedsYouItemBase & DatedItem & { kind: 'unfilled'; assignmentTypeId: string; openDates: readonly string[] })
	| (NeedsYouItemBase & DatedItem & { kind: 'stalled'; onboardingId: string; stepId: string })
	| (NeedsYouItemBase & DatedItem & { kind: 'leaving'; personnelId: string });

export type NeedsYouKind = NeedsYouItem['kind'];

/** Rank order is row order: an earlier kind always ranks above a later one. */
export const NEEDS_YOU_KINDS = [
	{ kind: 'overdue', label: 'Overdue', severity: 'danger' },
	{ kind: 'expired', label: 'Expired', severity: 'danger' },
	{ kind: 'unfilled', label: 'Unfilled', severity: 'warning' },
	{ kind: 'stalled', label: 'Stalled', severity: 'warning' },
	{ kind: 'leaving', label: 'Leaving', severity: 'info' }
] as const satisfies readonly { kind: NeedsYouKind; label: string; severity: NeedsYouSeverity }[];

export type NeedsYouKindInfo = (typeof NEEDS_YOU_KINDS)[number];

const KIND_INFO = new Map<NeedsYouKind, NeedsYouKindInfo & { tier: number }>(
	NEEDS_YOU_KINDS.map((info, tier) => [info.kind, { ...info, tier }])
);

export function needsYouKindInfo(kind: NeedsYouKind): NeedsYouKindInfo {
	return KIND_INFO.get(kind)!;
}

export const NEEDS_YOU_FULL_LENGTH = 9;
export const NEEDS_YOU_FOLDED_LENGTH = 7;

export interface NeedsYouFold {
	count: number;
	titles: readonly string[];
}

export interface NeedsYouQueue {
	/** Every item, ranked; "Show all" renders this list. */
	ranked: readonly NeedsYouItem[];
	/** The rows shown before the fold. */
	rows: readonly NeedsYouItem[];
	fold: NeedsYouFold | null;
}

function compareUrgency(a: NeedsYouItem, b: NeedsYouItem): number {
	if ('daysLate' in a.urgency && 'daysLate' in b.urgency) return b.urgency.daysLate - a.urgency.daysLate;
	if ('date' in a.urgency && 'date' in b.urgency) return a.urgency.date.localeCompare(b.urgency.date);
	return 0;
}

function compareItems(a: NeedsYouItem, b: NeedsYouItem): number {
	return (
		KIND_INFO.get(a.kind)!.tier - KIND_INFO.get(b.kind)!.tier ||
		compareUrgency(a, b) ||
		a.title.localeCompare(b.title) ||
		a.id.localeCompare(b.id)
	);
}

/** Merges every source's items, ranks them by kind then urgency, and folds a long queue. */
export function buildNeedsYouQueue(sources: readonly (readonly NeedsYouItem[])[]): NeedsYouQueue {
	const ranked = sources.flat().sort(compareItems);
	if (ranked.length <= NEEDS_YOU_FULL_LENGTH) return { ranked, rows: ranked, fold: null };

	const folded = ranked.slice(NEEDS_YOU_FOLDED_LENGTH);
	return {
		ranked,
		rows: ranked.slice(0, NEEDS_YOU_FOLDED_LENGTH),
		fold: { count: folded.length, titles: folded.map((item) => item.title) }
	};
}
