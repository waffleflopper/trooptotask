import type { Component } from 'svelte';
import type { FeatureKey } from '$lib/access/featureSwitches';
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

export interface DashboardAccess {
	/** Advisory permission to act on the resource, or somewhere within the viewer's scope when none is given. */
	readonly can: (action: FeatureLanePolicyAction, resource?: PolicyResource) => boolean;
}

export function createDashboardAccess(policy: Pick<ClientAccess, 'affordanceForFeatureAction'>): DashboardAccess {
	return {
		can: (action, resource = { kind: 'unscoped' }) => policy.affordanceForFeatureAction(action, resource).allowed
	};
}

export function personnelResource(person: { readonly groupId?: string | null }): PolicyResource {
	return scopeSetResourceForGroupId(person.groupId);
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
	/** Loaded on first open, so the dialogs stay out of the page's first load. */
	loadDialog: () => Promise<{ default: Component<QuickAddDialogProps> }>;
	available?: DashboardPartAvailability;
}

export interface DashboardSection {
	id: DashboardSectionId;
	/** The switch that turns the section off, or null when it is always on. */
	feature: FeatureKey | null;
	needsYou: readonly NeedsYouSource[];
	readiness: DashboardBlock | null;
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
	readinessColumns: readonly DashboardBlock[];
	onDutyBlocks: readonly OnDutyBlock[];
}

export function composeDashboardSections(
	sections: readonly DashboardSection[],
	inputs: DashboardInputs,
	disabledFeatures: readonly FeatureKey[],
	access: DashboardAccess
): DashboardSectionParts {
	const active = activeDashboardSections(sections, disabledFeatures);
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
		readinessColumns: active.flatMap((entry) =>
			entry.readiness && (entry.readiness.available?.(inputs, access) ?? true) ? [entry.readiness] : []
		),
		onDutyBlocks: active
			.flatMap((entry) => entry.onDuty)
			.filter((part) => part.available?.(inputs, access) ?? true)
			.sort((a, b) => a.order - b.order)
	};
}
