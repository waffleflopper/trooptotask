import type { Component } from 'svelte';
import type { FeatureKey } from '$lib/access/featureSwitches';
import type { DashboardScreenModel } from '../read-model/dashboardScreenModel.svelte';
import type { DashboardInputs } from './dashboardInputs';
import { placeForecastLaneMarks, type DashboardForecastLaneView, type ForecastLaneMark } from './forecastLanes';
import { buildNeedsYouQueue, type NeedsYouItem, type NeedsYouQueue } from './needsYou';

/** Availability and Calendar is always on; every other section belongs to one feature switch. */
export type DashboardSectionId = 'availability' | FeatureKey;

export type NeedsYouSource = (inputs: DashboardInputs) => readonly NeedsYouItem[];

export interface ForecastLane {
	id: string;
	label: string;
	marks: (inputs: DashboardInputs) => readonly ForecastLaneMark[];
}

export interface DashboardBlock {
	id: string;
	component: Component<{ model: DashboardScreenModel }>;
}

export interface QuickAddEntry {
	id: string;
	label: string;
	dialog: Component<{ model: DashboardScreenModel; onClose: () => void }>;
}

export interface DashboardSection {
	id: DashboardSectionId;
	/** The switch that turns the section off, or null when it is always on. */
	feature: FeatureKey | null;
	needsYou: readonly NeedsYouSource[];
	readiness: DashboardBlock | null;
	quickAdd: readonly QuickAddEntry[];
	onDuty: readonly DashboardBlock[];
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
	onDutyBlocks: readonly DashboardBlock[];
}

export function composeDashboardSections(
	sections: readonly DashboardSection[],
	inputs: DashboardInputs,
	disabledFeatures: readonly FeatureKey[]
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
		quickAdd: active.flatMap((entry) => entry.quickAdd),
		readinessColumns: active.flatMap((entry) => (entry.readiness ? [entry.readiness] : [])),
		onDutyBlocks: active.flatMap((entry) => entry.onDuty)
	};
}
