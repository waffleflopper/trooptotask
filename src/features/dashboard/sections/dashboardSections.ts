import type { Component } from 'svelte';
import { FEATURE_SWITCHES, type FeatureKey } from '$lib/access/featureSwitches';
import type { ClientAccess } from '$lib/access/clientAccess';
import type { FeatureLanePolicyAction, PolicyResource } from '$lib/access/policyEvaluator';
import { scopeSetResourceForGroupId } from '$lib/access/scopeSetAccess';
import type { DashboardPageUpdates } from '../dashboardPageUpdates';
import type { DashboardScreenModel } from '../read-model/dashboardScreenModel.svelte';
import type { DashboardInputs } from './dashboardInputs';
import { placeForecastLaneMarks, type DashboardForecastLaneView, type ForecastLaneMark } from './forecastLanes';
import { buildNeedsYouQueue, type NeedsYouItem, type NeedsYouQueue } from './needsYou';

/** Availability and Calendar is always on; every other section belongs to one feature switch. */
export type DashboardSectionId = 'availability' | FeatureKey;

export type NeedsYouSource = (inputs: DashboardInputs) => readonly NeedsYouItem[];

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

export interface DashboardAccess {
	/** Advisory permission to act on the resource, or somewhere within the viewer's scope when none is given. */
	readonly can: (action: FeatureLanePolicyAction, resource?: PolicyResource) => boolean;
	/** Owners and admins, who set the unit up and switch its features. */
	readonly isPrivileged: boolean;
}

export function createDashboardAccess(
	policy: Pick<ClientAccess, 'affordanceForFeatureAction'> & { readonly isPrivileged: boolean }
): DashboardAccess {
	return {
		can: (action, resource = { kind: 'unscoped' }) => policy.affordanceForFeatureAction(action, resource).allowed,
		get isPrivileged() {
			return policy.isPrivileged;
		}
	};
}

export function personnelResource(person: { readonly groupId?: string | null }): PolicyResource {
	return scopeSetResourceForGroupId(person.groupId);
}

export function actionablePersonnel<P extends { readonly groupId?: string | null }>(
	personnel: readonly P[],
	access: DashboardAccess,
	action: FeatureLanePolicyAction
): P[] {
	return personnel.filter((person) => access.can(action, personnelResource(person)));
}

export type DashboardPartAvailability = (inputs: DashboardInputs, access: DashboardAccess) => boolean;

export interface ForecastLane {
	id: string;
	label: string;
	marks: (inputs: DashboardInputs) => readonly ForecastLaneMark[];
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
	/** A section that is not set up adds nothing; owners and admins see a hint instead. */
	setup: SetupCheck | null;
	needsYou: readonly NeedsYouSource[];
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

export function composeDashboardSections(
	sections: readonly DashboardSection[],
	inputs: DashboardInputs,
	disabledFeatures: readonly FeatureKey[],
	access: DashboardAccess
): DashboardSectionParts {
	const checked = activeDashboardSections(sections, disabledFeatures).map((entry) => ({
		entry,
		unset: entry.setup?.isNotSetUp(inputs) ?? false
	}));
	const active = checked.flatMap(({ entry, unset }) => (unset ? [] : [entry]));
	const readiness = active.flatMap((entry) => {
		const column = entry.readiness?.(inputs, access);
		return column ? [{ column, feedsNeedsYou: entry.needsYou.length > 0 }] : [];
	});
	return {
		needsYou: buildNeedsYouQueue(active.flatMap((entry) => entry.needsYou.map((source) => source(inputs)))),
		forecastLanes: active.flatMap((entry) =>
			entry.forecastLanes.map((lane) => ({
				id: lane.id,
				label: lane.label,
				marks: placeForecastLaneMarks(inputs.forecastDays, lane.marks(inputs))
			}))
		),
		quickAdd: active
			.flatMap((entry) => entry.quickAdd)
			.filter((part) => part.available?.(inputs, access) ?? true)
			.sort((a, b) => a.order - b.order),
		readinessColumns: readiness.map(({ column }) => column),
		needsYouUnavailable: readiness.flatMap(({ column, feedsNeedsYou }) =>
			column.state === 'failed' && feedsNeedsYou ? [column.title] : []
		),
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
