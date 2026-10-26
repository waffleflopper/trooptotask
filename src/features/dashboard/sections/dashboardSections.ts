import type { Component } from 'svelte';
import { FEATURE_SWITCHES, type FeatureKey } from '$lib/access/featureSwitches';
import type { DashboardPageUpdates } from '../dashboardPageUpdates';
import type { DashboardScreenModel } from '../read-model/dashboardScreenModel.svelte';
import type { DashboardAccess } from './dashboardAccess';
import type { DashboardInputs } from './dashboardInputs';
import {
	placeForecastLaneMarks,
	type DashboardForecastLaneView,
	type ForecastLaneRead,
	type ForecastLegendEntry
} from './forecastLanes';
import { buildNeedsYouQueue, type NeedsYouItem, type NeedsYouQueue } from './needsYou';

/** Availability and Calendar is always on; every other section belongs to one feature switch. */
export type DashboardSectionId = 'availability' | FeatureKey;

export type NeedsYouSource = (inputs: DashboardInputs) => readonly NeedsYouItem[];

/** A source that loads on its own: until it settles the queue shows a placeholder, and a failure names it. */
export type NeedsYouLoad = {
	label: string;
	retry: (updates: DashboardPageUpdates) => void;
} & (
	| { state: 'pending' | 'failed' }
	/** Rows the source counted but did not list, so the header still counts them. */
	| { state: 'partial'; unlisted: number; href: string }
);

/** Green for good, amber for warning, red only for the worst share. */
export type ReadinessTone = 'good' | 'warning' | 'critical';

export interface ReadinessShare {
	label: string;
	count: number;
	tone: ReadinessTone;
}

export type ReadinessGraphic =
	| { kind: 'shares'; shares: readonly ReadinessShare[] }
	/** One tick per date across a window, nearest first; offsets run 0 to 100. */
	| { kind: 'timeline'; ticks: readonly { id: string; offsetPercent: number }[] };

export interface ReadinessFigures {
	state: 'ready';
	figure: string;
	/** Absent paints the figure in the body color. */
	figureTone?: ReadinessTone;
	suffix: string;
	/** Points gained or lost over the last 30 days; absent or zero shows nothing. */
	trend?: number;
	graphic: ReadinessGraphic;
	note: string;
}

export type ReadinessColumn = {
	id: string;
	title: string;
	link: { label: string; href: string };
} & (ReadinessFigures | { state: 'failed'; subject: string });

/** A section's column, or null when the viewer has nothing to see in it. */
export type ReadinessSource = (inputs: DashboardInputs, access: DashboardAccess) => ReadinessColumn | null;

export type DashboardPartAvailability = (inputs: DashboardInputs, access: DashboardAccess) => boolean;

export interface ForecastLane {
	id: string;
	label: string;
	/** Said in place of the marks when the lane has none. */
	empty: string;
	legend?: readonly ForecastLegendEntry[];
	/** Null leaves the lane out, as when its source is not read for this viewer. */
	read: (inputs: DashboardInputs) => ForecastLaneRead | null;
}

export interface DashboardBlock {
	id: string;
	component: Component<{ model: DashboardScreenModel }>;
	available?: DashboardPartAvailability;
}

export interface OnDutyBlock extends DashboardBlock {
	/** Ascending slots: 10 Tonight and tomorrow, 20 Taskings due, 30 Coming and going. */
	order: number;
}

export interface QuickAddDialogProps {
	model: DashboardScreenModel;
	access: DashboardAccess;
	updates: DashboardPageUpdates;
	onClose: () => void;
}

export interface QuickAddEntry {
	id: string;
	label: string;
	icon: Component;
	/** Ascending slots: 10 Status, 20 Training record, 30 Start onboarding. */
	order: number;
	/** The one filled button; a page without this entry has none (frame 05). */
	primary?: boolean;
	/** Loaded on first open, so the dialogs stay out of the page's first load. */
	loadDialog: () => Promise<{ default: Component<QuickAddDialogProps> }>;
	available?: DashboardPartAvailability;
}

/** How a feature that is on can still have nothing to show: the gap and the place that fills it. */
export interface SetupCheck {
	isNotSetUp: (inputs: DashboardInputs) => boolean;
	/** Completes "<Feature> is on, but …", as in "there are no templates yet". */
	gap: string;
	fix: { label: string; href: (inputs: DashboardInputs) => string };
}

export interface SetupHint {
	feature: FeatureKey;
	message: string;
	fix: { label: string; href: string };
	turnOff: { label: string; href: string };
}

export interface DashboardSection {
	id: DashboardSectionId;
	/** The switch that turns the section off, or null when it is always on. */
	feature: FeatureKey | null;
	/** A section whose data the viewer may not read adds nothing, rather than reading empty data as fact. */
	available?: DashboardPartAvailability;
	/** A section that is not set up adds nothing; owners and admins see a hint instead. */
	setup: SetupCheck | null;
	needsYou: readonly NeedsYouSource[];
	/** The load state of a Needs you source that arrives after the page, or null once it has settled. */
	needsYouLoad: ((inputs: DashboardInputs) => NeedsYouLoad | null) | null;
	readiness: ReadinessSource | null;
	quickAdd: readonly QuickAddEntry[];
	onDuty: readonly OnDutyBlock[];
	forecastLanes: readonly ForecastLane[];
}

export function dashboardSection(
	id: DashboardSectionId,
	parts: Partial<Omit<DashboardSection, 'id' | 'feature'>> = {}
): DashboardSection {
	return {
		id,
		feature: id === 'availability' ? null : id,
		setup: null,
		needsYou: [],
		needsYouLoad: null,
		readiness: null,
		quickAdd: [],
		onDuty: [],
		forecastLanes: [],
		...parts
	};
}

export function activeDashboardSections(
	sections: readonly DashboardSection[],
	disabledFeatures: readonly FeatureKey[]
): readonly DashboardSection[] {
	return sections.filter((entry) => entry.feature === null || !disabledFeatures.includes(entry.feature));
}

/** Everything the active sections add to the page, computed from one read of the inputs. */
export interface DashboardSectionParts {
	needsYou: NeedsYouQueue;
	forecastLanes: readonly DashboardForecastLaneView[];
	quickAdd: readonly QuickAddEntry[];
	readinessColumns: readonly ReadinessColumn[];
	/** Titles of the sections whose Needs you items could not load, so the queue is incomplete. */
	needsYouUnavailable: readonly string[];
	/** Needs you sources still loading or failed, which the queue shows beside the rows it has. */
	needsYouLoads: readonly NeedsYouLoad[];
	onDutyBlocks: readonly OnDutyBlock[];
	/** Owners and admins only; one per feature that is on but not set up. */
	setupHints: readonly SetupHint[];
}

function setupHint(feature: FeatureKey, setup: SetupCheck, inputs: DashboardInputs): SetupHint {
	const { label } = FEATURE_SWITCHES[feature];
	return {
		feature,
		message: `${label} is on, but ${setup.gap}, so it isn't shown here.`,
		fix: { label: setup.fix.label, href: setup.fix.href(inputs) },
		turnOff: { label: `Turn off ${label.toLowerCase()}`, href: `/org/${inputs.page.orgId}/settings/features` }
	};
}

/** A row keeps its link when the viewer may not act on it; only the action goes. */
function permittedActions(items: readonly NeedsYouItem[], access: DashboardAccess): readonly NeedsYouItem[] {
	return items.map((item) =>
		item.action && !access.can(item.action.policy, item.action.resource) ? { ...item, action: null } : item
	);
}

export function composeDashboardSections(
	sections: readonly DashboardSection[],
	inputs: DashboardInputs,
	disabledFeatures: readonly FeatureKey[],
	access: DashboardAccess
): DashboardSectionParts {
	const checked = activeDashboardSections(sections, disabledFeatures)
		.filter((entry) => entry.available?.(inputs, access) ?? true)
		.map((entry) => ({
			entry,
			unset: entry.setup?.isNotSetUp(inputs) ?? false
		}));
	const active = checked.flatMap(({ entry, unset }) => (unset ? [] : [entry]));
	const readiness = active.flatMap((entry) => {
		const column = entry.readiness?.(inputs, access);
		return column ? [{ column, feedsNeedsYou: entry.needsYou.length > 0 }] : [];
	});
	return {
		needsYou: buildNeedsYouQueue(
			active.flatMap((entry) => entry.needsYou.map((source) => permittedActions(source(inputs), access)))
		),
		forecastLanes: active.flatMap((entry) =>
			entry.forecastLanes.flatMap((lane) => {
				const read = lane.read(inputs);
				if (!read) return [];
				return [
					{
						id: lane.id,
						label: lane.label,
						empty: lane.empty,
						legend: lane.legend ?? [],
						read:
							read.state === 'ready'
								? { state: 'ready' as const, marks: placeForecastLaneMarks(inputs.forecastDays, read.marks) }
								: read
					}
				];
			})
		),
		quickAdd: active
			.flatMap((entry) => entry.quickAdd)
			.filter((part) => part.available?.(inputs, access) ?? true)
			.sort((a, b) => a.order - b.order),
		readinessColumns: readiness.map(({ column }) => column),
		needsYouUnavailable: readiness.flatMap(({ column, feedsNeedsYou }) =>
			column.state === 'failed' && feedsNeedsYou ? [column.title] : []
		),
		needsYouLoads: active.flatMap((entry) => {
			const load = entry.needsYouLoad?.(inputs);
			return load ? [load] : [];
		}),
		onDutyBlocks: active
			.flatMap((entry) => entry.onDuty)
			.filter((part) => part.available?.(inputs, access) ?? true)
			.sort((a, b) => a.order - b.order),
		setupHints: access.isPrivileged
			? checked.flatMap(({ entry, unset }) =>
					unset && entry.feature && entry.setup ? [setupHint(entry.feature, entry.setup, inputs)] : []
				)
			: []
	};
}
