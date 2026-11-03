import type { FeatureKey } from '$lib/access/featureSwitches';
import {
	capabilityMeets,
	type CapabilityLevel,
	type CapabilityMap,
	type DurableFeatureLane,
	type MembershipRole
} from '$lib/access/memberAccessShape';

export type HelpArea =
	| 'dashboard'
	| 'calendar'
	| 'personnel'
	| 'training'
	| 'criticalTasks'
	| 'onboarding'
	| 'evaluations'
	| 'settings';

export const HELP_AREA_LABELS: Record<HelpArea, string> = {
	dashboard: 'Dashboard',
	calendar: 'Calendar',
	personnel: 'Personnel',
	training: 'Training',
	criticalTasks: 'Critical tasks',
	onboarding: 'Onboarding',
	evaluations: 'Evaluations',
	settings: 'Unit settings'
};

/**
 * An Organization page path relative to `/org/[orgId]/`, with route groups removed, as `helpRouteKey` returns it.
 * The dashboard is `''`. Dynamic segments keep their route-id spelling, such as `personnel/[personnelSlug]`.
 */
export type HelpRouteKey = string;

/** Who can follow a guide. Lane access is judged with `capabilityMeets`; a role requirement admits that role or above. */
export type HelpAccess =
	| { lane: DurableFeatureLane; level: Exclude<CapabilityLevel, 'none'> }
	| { role: Exclude<MembershipRole, 'member'> };

export interface HelpStep {
	/** One instruction. `**text**` marks a control name the user looks for. */
	text: string;
	/** An Organization page, written as `HelpRouteKey` plus an optional query, that the step happens on. */
	to?: string;
}

export interface HelpGuide {
	/** Kebab-case and stable: it is the `?help=` value people share. */
	id: string;
	title: string;
	/** One line shown in lists and matched by search. */
	summary: string;
	area: HelpArea;
	/** Pages whose Help opens with this guide listed. A route also covers the pages below it. */
	routes: readonly HelpRouteKey[];
	/** Words people type that the title and summary do not already contain. */
	keywords: readonly string[];
	/** Hidden while this feature is switched off for the Organization. */
	feature?: FeatureKey;
	access?: HelpAccess;
	/** Listed under "Things people miss" on every page. */
	missed?: true;
	lead: string;
	steps: readonly HelpStep[];
	note?: string;
	/** The id of the guide to read next. */
	next?: string;
}

export interface HelpViewer {
	role: MembershipRole;
	capabilityMap: CapabilityMap;
	disabledFeatures: readonly FeatureKey[];
}

/** `/org/[orgId]/critical-tasks/(workspace)/library` becomes `critical-tasks/library`. */
export function helpRouteKey(routeId: string | null): HelpRouteKey | null {
	const prefix = '/org/[orgId]';
	if (!routeId || (routeId !== prefix && !routeId.startsWith(`${prefix}/`))) return null;
	return routeId
		.slice(prefix.length)
		.split('/')
		.filter((segment) => segment && !/^\(.+\)$/.test(segment))
		.join('/');
}

function routeDepth(guideRoute: HelpRouteKey, current: HelpRouteKey): number {
	if (guideRoute === current) return Number.MAX_SAFE_INTEGER;
	if (guideRoute && current.startsWith(`${guideRoute}/`)) return guideRoute.split('/').length;
	return -1;
}

/** Guides for the current page, the closest route first and registry order within a route. */
export function guidesForRoute(guides: readonly HelpGuide[], current: HelpRouteKey): HelpGuide[] {
	return guides
		.map((guide, order) => ({ guide, order, depth: Math.max(...guide.routes.map((r) => routeDepth(r, current))) }))
		.filter((entry) => entry.depth >= 0)
		.sort((a, b) => b.depth - a.depth || a.order - b.order)
		.map((entry) => entry.guide);
}

/** Every query word must appear somewhere in the guide; guides with more words in the title rank first. */
export function searchGuides(guides: readonly HelpGuide[], query: string): HelpGuide[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (!words.length) return [];
	return guides
		.map((guide, order) => {
			const title = guide.title.toLowerCase();
			const haystack = [title, guide.summary, HELP_AREA_LABELS[guide.area], ...guide.keywords].join(' ').toLowerCase();
			if (!words.every((word) => haystack.includes(word))) return null;
			return { guide, order, titleHits: words.filter((word) => title.includes(word)).length };
		})
		.filter((entry) => entry !== null)
		.sort((a, b) => b.titleHits - a.titleHits || a.order - b.order)
		.map((entry) => entry.guide);
}

export function isGuideAvailable(guide: HelpGuide, viewer: HelpViewer): boolean {
	return !guide.feature || !viewer.disabledFeatures.includes(guide.feature);
}

export function canFollowGuide(guide: HelpGuide, viewer: HelpViewer): boolean {
	const access = guide.access;
	if (!access) return true;
	if ('role' in access) return viewer.role === 'owner' || viewer.role === access.role;
	return capabilityMeets(viewer.capabilityMap[access.lane], access.level);
}
