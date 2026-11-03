import type { Component } from 'svelte';
import AssignmentLoadLens from './AssignmentLoadLens.svelte';
import AvailabilityLens from './AvailabilityLens.svelte';
import TimeAwayLens from './TimeAwayLens.svelte';
import type { LensHandle, LensProps } from './lensTypes';
import type { LensId } from './reportQuery';

export interface LensDefinition {
	id: LensId;
	label: string;
	component: Component<LensProps, LensHandle>;
	/** Reads the span and the shared Group, MOS and Counts as away filters; the rest bring their own date range. */
	sharedControls: boolean;
}

export const LENSES: readonly LensDefinition[] = [
	{ id: 'availability', label: 'Availability', component: AvailabilityLens, sharedControls: true },
	{ id: 'time-away', label: 'Time away', component: TimeAwayLens, sharedControls: false },
	{ id: 'assignment-load', label: 'Assignment load', component: AssignmentLoadLens, sharedControls: false }
];
