import type { DurableFeatureLane } from './memberAccessShape';

export type FeatureKey = 'training' | 'criticalTasks' | 'evaluations' | 'onboarding' | 'lossesAndAwards';

export interface FeatureSwitch {
	readonly label: string;
	/** The lane the switch projects to `none`; Losses and awards has none and its consumers read the switch. */
	readonly lane: DurableFeatureLane | null;
	/** The `/org/[orgId]/<segment>` routes that show the off state. */
	readonly routeSegment: string | null;
}

export const FEATURE_SWITCHES: Readonly<Record<FeatureKey, FeatureSwitch>> = {
	training: { label: 'Training', lane: 'training', routeSegment: 'training' },
	criticalTasks: { label: 'Critical tasks', lane: 'criticalTasks', routeSegment: 'critical-tasks' },
	evaluations: { label: 'Evaluations', lane: 'ratingScheme', routeSegment: 'evals' },
	onboarding: { label: 'Onboarding', lane: 'onboarding', routeSegment: 'onboarding' },
	lossesAndAwards: { label: 'Losses and awards', lane: null, routeSegment: null }
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
	const [segment] = routeId.slice(ORG_ROUTE_PREFIX.length).split('/');
	return disabledFeatures.find((key) => FEATURE_SWITCHES[key].routeSegment === segment) ?? null;
}

export function featureExportNote(key: FeatureKey): string {
	if (key === 'lossesAndAwards') return 'Losses and awards is turned off; award acknowledgements are not included.';
	return `${FEATURE_SWITCHES[key].label} is turned off; its records are not included.`;
}
