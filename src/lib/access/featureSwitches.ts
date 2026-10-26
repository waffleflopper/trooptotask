import type { DurableFeatureLane } from './memberAccessShape';

export type FeatureKey =
	| 'training'
	| 'criticalTasks'
	| 'evaluations'
	| 'onboarding'
	| 'lossesAndAwards'
	| 'eventsAndTaskings';

export interface FeatureSwitch {
	readonly label: string;
	/** The lane the switch projects to `none`; a switch without one is read directly by its consumers. */
	readonly lane: DurableFeatureLane | null;
	/** The `/org/[orgId]/<path>` routes, and everything below them, that show the off state. */
	readonly routePaths: readonly string[];
}

export const FEATURE_SWITCHES: Readonly<Record<FeatureKey, FeatureSwitch>> = {
	training: { label: 'Training', lane: 'training', routePaths: ['training'] },
	criticalTasks: { label: 'Critical tasks', lane: 'criticalTasks', routePaths: ['critical-tasks'] },
	evaluations: { label: 'Evaluations', lane: 'ratingScheme', routePaths: ['evals'] },
	onboarding: { label: 'Onboarding', lane: 'onboarding', routePaths: ['onboarding'] },
	lossesAndAwards: { label: 'Losses and awards', lane: null, routePaths: [] },
	eventsAndTaskings: { label: 'Events & Taskings', lane: null, routePaths: ['calendar/events', 'calendar/taskings'] }
};

export const FEATURE_KEYS = Object.keys(FEATURE_SWITCHES) as FeatureKey[];

export function isFeatureKey(value: unknown): value is FeatureKey {
	return typeof value === 'string' && Object.hasOwn(FEATURE_SWITCHES, value);
}

/** Reads the stored column. The database constraint admits only known keys, so anything else is dropped. */
export function parseDisabledFeatures(value: unknown): FeatureKey[] {
	if (!Array.isArray(value)) return [];
	return FEATURE_KEYS.filter((key) => value.includes(key));
}

export function featureOffMessage(key: FeatureKey): string {
	return `This organization has turned off ${FEATURE_SWITCHES[key].label}. Speak with the organization owner to have it turned back on.`;
}

export function disabledFeatureLanes(disabledFeatures: readonly FeatureKey[]): DurableFeatureLane[] {
	return disabledFeatures.flatMap((key) => FEATURE_SWITCHES[key].lane ?? []);
}

const ORG_ROUTE_PREFIX = '/org/[orgId]/';

/** The disabled feature that owns the SvelteKit route `routeId`, if any. */
export function findDisabledFeatureRoute(
	routeId: string | null,
	disabledFeatures: readonly FeatureKey[]
): FeatureKey | null {
	if (!routeId?.startsWith(ORG_ROUTE_PREFIX)) return null;
	const path = `${routeId.slice(ORG_ROUTE_PREFIX.length)}/`;
	return (
		disabledFeatures.find((key) => FEATURE_SWITCHES[key].routePaths.some((owned) => path.startsWith(`${owned}/`))) ??
		null
	);
}

export function featureExportNote(key: FeatureKey): string {
	if (key === 'lossesAndAwards') return 'Losses and awards is turned off; award acknowledgements are not included.';
	return `${FEATURE_SWITCHES[key].label} is turned off; its records are not included.`;
}
