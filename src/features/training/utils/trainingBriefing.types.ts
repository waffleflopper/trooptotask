import type { Personnel } from '$features/personnel/contracts';
import type { TrainingCompletionFacts, TrainingStatus, TrainingType } from '$features/training/training.types';

export type BriefingRowsBy = 'group' | 'mos' | 'role';

/** Readiness band relative to the goal G: ≥G, G−10, G−20, G−30, below that, or nothing applicable. */
export type BriefingBand = 'goal' | 'near' | 'below' | 'far' | 'critical' | 'none';

export type FocusCandidateKey = 'wave' | `gap:${string}` | `row:${BriefingRowsBy}:${string}`;

/** Group and rank select one value; MOS, duty role and training types are multi-selections where empty means all. */
export interface TrainingBriefingFilters {
	groupId?: string;
	rank?: string;
	mos?: string[];
	role?: string[];
	trainingTypeIds?: string[];
}

export interface TrainingBriefingInput {
	personnel: Personnel[];
	/** Selected-view training types, already resolved and ordered as columns. */
	types: TrainingType[];
	records: TrainingCompletionFacts[];
	filters: TrainingBriefingFilters;
	horizonDays: number;
	/** YYYY-MM-DD in the organization's calendar. */
	asOf: string;
	goalPercent: number;
	rowsBy: BriefingRowsBy;
	/** The selected group's name, or the organization's name when no group is selected. */
	scopeName: string;
}

/** A grid cell (`rowKey` null is the Total row) or one of the briefing's selected focus areas. */
export type BriefingScope = { kind: 'cell'; rowKey: string | null; typeId: string } | { kind: 'focus'; key: string };

/** One applicable person × training type requirement, identified by `personId` and `typeId`. */
export interface BriefingRequirement {
	personId: string;
	typeId: string;
	rowKey: string;
	status: TrainingStatus;
	label: string;
	completionDate: string | null;
	expirationDate: string | null;
	readyToday: boolean;
	/** The first date the requirement is expired; null when it never lapses or is already not ready. */
	lapseDate: string | null;
	lapsesInHorizon: boolean;
}

export interface BriefingReadiness {
	ready: number;
	applicable: number;
	percent: number | null;
	band: BriefingBand;
}

export interface BriefingBottomLine {
	scopeName: string;
	soldierCount: number;
	asOf: string;
	asOfLabel: string;
	horizonEnd: string;
	horizonEndLabel: string;
	today: BriefingReadiness;
	horizon: BriefingReadiness;
	drop: number | null;
	expired: number;
	notRecorded: number;
	lapsing: number;
	sentence: string;
}

export interface BriefingForecastPoint {
	date: string;
	label: string;
	ready: number;
	percent: number | null;
}

export interface BriefingForecastBucket {
	startDate: string;
	endDate: string;
	label: string;
	lapses: number;
	inCliff: boolean;
}

export interface BriefingCliff {
	startDate: string;
	endDate: string;
	label: string;
	caption: string;
	lapses: number;
	sharePercent: number;
	highlighted: boolean;
	/** The fewest (at most two) types covering at least 60% of the window's lapses; empty when none can. */
	dominantTypeIds: string[];
}

/** Today, the first of each month inside the horizon, and the horizon end. */
export interface BriefingAxisTick {
	date: string;
	label: string;
}

export interface BriefingForecast {
	goalPercent: number;
	axisTicks: BriefingAxisTick[];
	points: BriefingForecastPoint[];
	buckets: BriefingForecastBucket[];
	cliff: BriefingCliff | null;
}

export interface BriefingGridCell {
	typeId: string;
	today: BriefingReadiness;
	horizon: BriefingReadiness;
	drop: number | null;
	dropAlert: boolean;
}

export interface BriefingGridRow {
	key: string | null;
	label: string;
	/** Filtered soldiers in the row, including those with no applicable requirement. */
	soldierCount: number;
	cells: BriefingGridCell[];
	today: BriefingReadiness;
	horizon: BriefingReadiness;
	drop: number | null;
}

export interface BriefingLegendItem {
	band: Exclude<BriefingBand, 'none'>;
	label: string;
}

export interface BriefingGrid {
	rowsBy: BriefingRowsBy;
	columns: Array<{ typeId: string; name: string }>;
	rows: BriefingGridRow[];
	total: BriefingGridRow;
	legend: BriefingLegendItem[];
	/** A cell losing at least this many points by the horizon end is an upcoming hot spot. */
	dropAlertPoints: number;
}

export interface BriefingTypeRisk {
	typeId: string;
	name: string;
	applicable: number;
	notReady: number;
	lapsing: number;
}

export interface BriefingWhatIf {
	chip: string;
	before: number | null;
	after: number | null;
}

interface BriefingFocusAreaBase {
	key: FocusCandidateKey;
	title: string;
	body: string;
	whatIf: BriefingWhatIf;
	requirementCount: number;
	soldierCount: number;
	linkLabel: string;
}

export type BriefingFocusArea =
	| (BriefingFocusAreaBase & { kind: 'wave'; typeIds: string[]; firstLapseDate: string; firstLapseLabel: string })
	| (BriefingFocusAreaBase & { kind: 'gap'; typeId: string })
	| (BriefingFocusAreaBase & { kind: 'row'; rowKey: string; typeIds: string[] });

export interface BriefingFocus {
	areas: BriefingFocusArea[];
	emptyMessage: string | null;
}

export interface TrainingBriefing {
	bottomLine: BriefingBottomLine;
	forecast: BriefingForecast;
	grid: BriefingGrid;
	typeRisk: BriefingTypeRisk[];
	focus: BriefingFocus;
}
