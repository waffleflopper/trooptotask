import type { Component } from 'svelte';
import { indexAssignmentsBySlot, openAssignmentDates, trackOf, type AssignmentType } from '$features/calendar';
import type { FeatureLanePolicyAction, PolicyResource } from '$lib/access/policyEvaluator';
import { toDayNumber } from '$lib/utils/dayNumber';
import type { DashboardPageUpdates } from '../dashboardPageUpdates';
import type { DashboardScreenModel } from '../read-model/dashboardScreenModel.svelte';
import type { DashboardAccess } from './dashboardAccess';
import type { DashboardInputs } from './dashboardInputs';

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

/**
 * What every panel an action opens receives from the row, beside its own props. A panel marks its submit
 * control `data-needs-you-submit` (focusable while it waits) so a failed save can return focus to it.
 */
export interface NeedsYouPanelProps {
	model: DashboardScreenModel;
	access: DashboardAccess;
	updates: DashboardPageUpdates;
	/** Saves through the row: resolves once saved, rejects with the message the row shows. */
	save: (command: () => Promise<void>) => Promise<void>;
	saving: boolean;
	failure: string | null;
	close: () => void;
}

/** A panel component with its own props bound, ready for the row to render. */
export interface NeedsYouPanel {
	component: Component<NeedsYouPanelProps & Record<string, unknown>>;
	props: Record<string, unknown>;
}

export function needsYouPanel<P extends object>(component: Component<NeedsYouPanelProps & P>, props: P): NeedsYouPanel {
	return { component: component as unknown as NeedsYouPanel['component'], props: props as Record<string, unknown> };
}

/**
 * Acting on a row in place. A `run` saves from the row itself, a `dialog` or `expand` opens a panel
 * (loaded with whatever it reads first), and a `link` opens the owning page at the step.
 */
export type NeedsYouAction = {
	label: string;
	/** The action is absent when the viewer may not do this; the row keeps its link. */
	policy: FeatureLanePolicyAction;
	resource?: PolicyResource;
} & (
	| { mode: 'run'; run: (updates: DashboardPageUpdates) => Promise<void> }
	| { mode: 'dialog' | 'expand'; open: () => Promise<NeedsYouPanel> }
	| { mode: 'link'; href: string }
);

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
	| (NeedsYouItemBase & DatedItem & { kind: 'leaving'; personnelId: string })
	| (NeedsYouItemBase & LateItem & { kind: 'taskingOverdue'; taskingId: string })
	| (NeedsYouItemBase & DatedItem & { kind: 'taskingBlocked' | 'taskingShort' | 'taskingDueSoon'; taskingId: string });

export type NeedsYouKind = NeedsYouItem['kind'];

/** A lower tier always ranks above a higher one; kinds in one tier rank together by urgency. */
export const NEEDS_YOU_KINDS = [
	{ kind: 'overdue', label: 'Overdue', severity: 'danger', tier: 0 },
	{ kind: 'taskingOverdue', label: 'Overdue', severity: 'danger', tier: 0 },
	{ kind: 'expired', label: 'Expired', severity: 'danger', tier: 1 },
	{ kind: 'taskingBlocked', label: 'Blocked', severity: 'danger', tier: 2 },
	{ kind: 'unfilled', label: 'Unfilled', severity: 'warning', tier: 3 },
	{ kind: 'taskingShort', label: 'Short', severity: 'warning', tier: 3 },
	{ kind: 'stalled', label: 'Stalled', severity: 'warning', tier: 4 },
	{ kind: 'taskingDueSoon', label: 'Due soon', severity: 'warning', tier: 5 },
	{ kind: 'leaving', label: 'Leaving', severity: 'info', tier: 6 }
] as const satisfies readonly { kind: NeedsYouKind; label: string; severity: NeedsYouSeverity; tier: number }[];

export type NeedsYouKindInfo = (typeof NEEDS_YOU_KINDS)[number];

const KIND_INFO = new Map<NeedsYouKind, NeedsYouKindInfo>(NEEDS_YOU_KINDS.map((info) => [info.kind, info]));

export function needsYouKindInfo(kind: NeedsYouKind): NeedsYouKindInfo {
	return KIND_INFO.get(kind)!;
}

/** A fill offers at most this many open days; the duty planner takes the rest. */
export const DUTY_FILL_DAYS = 7;

/**
 * A duty's open forecast days. Under No duty a person-assigned roster details nobody on weekends or Special Days,
 * so those stay out. A Group duty ignores the setting, which it may keep from before it became a Group duty.
 */
export function openDutyDates(inputs: DashboardInputs, type: AssignmentType): string[] {
	const holidays = new Set(inputs.specialDays.map((day) => toDayNumber(day.date)));
	const dutyDays =
		type.assignTo === 'personnel'
			? inputs.forecastDays.filter((date) => trackOf(type.weekendMode, toDayNumber(date), holidays) !== null)
			: inputs.forecastDays;
	return openAssignmentDates(indexAssignmentsBySlot(inputs.assignments), type.id, dutyDays);
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
