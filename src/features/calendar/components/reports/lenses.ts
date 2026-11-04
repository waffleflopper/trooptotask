import type { Component } from 'svelte';
import AssignmentLoadLens from './AssignmentLoadLens.svelte';
import AvailabilityLens from './AvailabilityLens.svelte';
import TimeAwayLens from './TimeAwayLens.svelte';
import { NEXT_OUT_WINDOW_DAYS } from '../../utils/timeAway';
import type { LensHandle, LensProps } from './lensTypes';
import type { LensId, LensSpan } from './reportQuery';

export interface LensDefinition {
	id: LensId;
	label: string;
	component: Component<LensProps, LensHandle>;
	/** Reads the span and the shared Group, MOS and Counts as away filters; a lens without them brings its own date range. */
	sharedControls: boolean;
	/** Whether the span looks ahead from today or back to yesterday, and its default length. */
	span: LensSpan;
	/** Days of data wanted after the span end, fetched in the same request; the span's own figures never count them. */
	loadAfterDays: number;
}

const AHEAD_30: LensSpan = { direction: 'ahead', defaultDays: 30 };
const BACK_90: LensSpan = { direction: 'back', defaultDays: 90 };

export const LENSES: readonly LensDefinition[] = [
	{
		id: 'availability',
		label: 'Availability',
		component: AvailabilityLens,
		sharedControls: true,
		span: AHEAD_30,
		loadAfterDays: 0
	},
	{
		id: 'time-away',
		label: 'Time away',
		component: TimeAwayLens,
		sharedControls: true,
		span: BACK_90,
		loadAfterDays: NEXT_OUT_WINDOW_DAYS
	},
	{
		id: 'assignment-load',
		label: 'Assignment load',
		component: AssignmentLoadLens,
		sharedControls: true,
		span: BACK_90,
		loadAfterDays: 0
	}
];

export const lensDefinition = (id: LensId): LensDefinition => LENSES.find((lens) => lens.id === id) ?? LENSES[0];

export const spanOf = (id: LensId): LensSpan => lensDefinition(id).span;
