import type { FeatureKey } from '$lib/access/featureSwitches';
import type { DurableFeatureLane, OrganizationAccessGrant } from '$lib/access/memberAccessShape';

interface DashboardSourceGate {
	/** The switch that turns the source off, or null for Availability and Calendar, which is always on. */
	feature: FeatureKey | null;
	lane: DurableFeatureLane;
}

/**
 * Every Dashboard read owned by a feature lane. The roster, Groups, pins and policies are the page itself
 * and stay with RLS scope alone.
 */
export const DASHBOARD_SOURCES = {
	availabilityEntries: { feature: null, lane: 'calendar' },
	assignments: { feature: null, lane: 'calendar' },
	assignmentTypes: { feature: null, lane: 'calendar' },
	statusTypes: { feature: null, lane: 'calendar' },
	specialDays: { feature: null, lane: 'calendar' },
	trainingTypes: { feature: 'training', lane: 'training' },
	trainingSummary: { feature: 'training', lane: 'training' },
	ictlSummary: { feature: 'criticalTasks', lane: 'criticalTasks' },
	ratingSchemeEntries: { feature: 'evaluations', lane: 'ratingScheme' },
	activeOnboardings: { feature: 'onboarding', lane: 'onboarding' },
	onboardingTemplates: { feature: 'onboarding', lane: 'onboarding' },
	awardAcknowledgements: { feature: 'lossesAndAwards', lane: 'personnel' },
	taskingAttention: { feature: 'eventsAndTaskings', lane: 'calendar' }
} as const satisfies Record<string, DashboardSourceGate>;

export type DashboardSource = keyof typeof DASHBOARD_SOURCES;

export type DashboardSourceAccess = (source: DashboardSource) => boolean;

/** A source is read only when its feature is on for the unit and the viewer has its lane. */
export function dashboardSourceAccess(ctx: {
	auth: Pick<OrganizationAccessGrant, 'capabilityMap'>;
	disabledFeatures: readonly FeatureKey[];
}): DashboardSourceAccess {
	return (source) => {
		const { feature, lane }: DashboardSourceGate = DASHBOARD_SOURCES[source];
		return (feature === null || !ctx.disabledFeatures.includes(feature)) && ctx.auth.capabilityMap[lane] !== 'none';
	};
}
