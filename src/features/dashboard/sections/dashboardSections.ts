import type { Component } from 'svelte';
import type { FeatureKey } from '$lib/access/featureSwitches';
import type { Group, Personnel } from '$features/personnel/contracts';
import type { AssignmentType, AvailabilityEntry, DailyAssignment, StatusType } from '$features/calendar/contracts';
import type { DashboardPageData } from '../contracts';
import type { DashboardScreenModel } from '../read-model/dashboardScreenModel.svelte';
import type { NeedsYouItem } from './needsYou';

/** Availability and Calendar is always on; every other section belongs to one feature switch. */
export type DashboardSectionId = 'availability' | FeatureKey;

/** What the page has loaded, as plain data, so a section's sources stay pure. */
export interface DashboardInputs {
	/** The viewer's day, "YYYY-MM-DD". */
	today: string;
	timeZone: string;
	/** Today through today plus 13, the forecast's columns. */
	forecastDays: readonly string[];
	/** Active personnel inside the viewer's scope. */
	personnel: readonly Personnel[];
	availability: readonly AvailabilityEntry[];
	statusTypes: readonly StatusType[];
	groups: readonly Group[];
	assignmentTypes: readonly AssignmentType[];
	assignments: readonly DailyAssignment[];
	page: DashboardPageData;
}

export type NeedsYouSource = (inputs: DashboardInputs) => readonly NeedsYouItem[];

/** A mark under the forecast's day labels. An overlay never changes the availability numbers. */
export type ForecastLaneMark =
	| { kind: 'span'; id: string; start: string; end: string; label: string; emphasis: 'strong' | 'quiet' }
	| { kind: 'point'; id: string; date: string; label: string };

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
