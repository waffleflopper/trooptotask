import type { FeatureKey } from '$lib/access/featureSwitches';
import {
	ACCESS_LANE_LABELS,
	CAPABILITY_LEVEL_LABELS,
	capabilityMeets,
	type AdvisoryGroupScope,
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

/**
 * Who can follow a guide or a step. Lane access is judged with `capabilityMeets`; a role requirement admits that role
 * or above. `wholeUnit` is for work the server refuses a member limited to certain Groups, such as a unit-wide catalog.
 */
export type HelpAccess =
	| { lane: DurableFeatureLane; level: Exclude<CapabilityLevel, 'none'>; wholeUnit?: true }
	| { role: Exclude<MembershipRole, 'member'> };

export interface HelpStep {
	/** One instruction. `**text**` marks a control name the user looks for. */
	text: string;
	/** An Organization page, written as `HelpRouteKey` plus an optional query, that the step happens on. */
	to?: string;
	/** For a step whose control needs more than the guide does. A viewer without it reads a short note on the step. */
	access?: HelpAccess;
	/** The step is hidden while this feature is switched off. */
	feature?: FeatureKey;
}

export interface HelpGuide {
	/** Kebab-case and stable: it is the `?help=` value people share. */
	id: string;
	title: string;
	/** One line shown in lists and matched by search. */
	summary: string;
	area: HelpArea;
	/**
	 * Pages whose Help opens with this guide listed, as a route key or as the page's concrete path such as
	 * `setup/calendar`. A route also covers the pages below it.
	 */
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
	/** `groups` for a member limited to certain Groups. Owners and admins always cover the whole unit. */
	scopeKind: AdvisoryGroupScope['kind'];
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

/** `/org/c-co/setup/calendar` becomes `setup/calendar`, the page's own path under its Organization. */
export function helpPagePath(orgUrlSegment: string, pathname: string): HelpRouteKey | null {
	const prefix = `/org/${orgUrlSegment}`;
	if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return null;
	return pathname.slice(prefix.length).split('/').filter(Boolean).join('/');
}

function routeDepth(guideRoute: HelpRouteKey, current: HelpRouteKey): number {
	if (guideRoute === current) return Number.MAX_SAFE_INTEGER;
	if (guideRoute && current.startsWith(`${guideRoute}/`)) return guideRoute.split('/').length;
	return -1;
}

/**
 * Guides for the current page, the closest route first and registry order within a route. A guide's route may name the
 * page by its route key (`current`) or by its concrete `path`, which is how one dynamic route such as `setup/[step]`
 * gets a different guide on each of its pages.
 */
export function guidesForRoute(
	guides: readonly HelpGuide[],
	current: HelpRouteKey,
	path?: HelpRouteKey | null
): HelpGuide[] {
	const pages = path && path !== current ? [current, path] : [current];
	return guides
		.map((guide, order) => ({
			guide,
			order,
			depth: Math.max(...guide.routes.flatMap((route) => pages.map((page) => routeDepth(route, page))))
		}))
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

export function isStepAvailable(step: HelpStep, viewer: HelpViewer): boolean {
	return !step.feature || !viewer.disabledFeatures.includes(step.feature);
}

export function canMeetAccess(access: HelpAccess | undefined, viewer: HelpViewer): boolean {
	if (!access) return true;
	if ('role' in access) return viewer.role === 'owner' || viewer.role === access.role;
	if (!capabilityMeets(viewer.capabilityMap[access.lane], access.level)) return false;
	return !access.wholeUnit || viewer.scopeKind === 'organization';
}

export function canFollowGuide(guide: HelpGuide, viewer: HelpViewer): boolean {
	return canMeetAccess(guide.access, viewer);
}

/** What the viewer lacks for `access`, in a sentence, or undefined when they have it. */
export function accessGap(access: HelpAccess | undefined, viewer: HelpViewer): string | undefined {
	if (!access || canMeetAccess(access, viewer)) return undefined;
	if ('role' in access) {
		return access.role === 'owner' ? 'Only owners can do this.' : 'Only owners and admins can do this.';
	}
	if (!capabilityMeets(viewer.capabilityMap[access.lane], access.level)) {
		const need = `${ACCESS_LANE_LABELS[access.lane]} ${CAPABILITY_LEVEL_LABELS[access.level]} access`;
		return `You need ${need}${access.wholeUnit ? ' across the whole unit' : ''}.`;
	}
	return 'This works across the whole unit, and your access covers only your Groups.';
}

/** The search param that opens Help and names its guide, so a shared link or a reload opens the same view. */
export const HELP_PARAM = 'help';

export type HelpView = { guide: string | null };

/** The part of `page.url` Help reads, so SvelteKit's read-only URL fits as well as a `URL`. */
export type HelpPageUrl = Pick<URL, 'origin' | 'pathname' | 'search' | 'hash'> & {
	searchParams: Pick<URLSearchParams, 'get'>;
};

/** What the page asks Help to show: the entry's own state first, else the URL, else closed. */
export function readHelpView(state: { help?: HelpView | null }, url: HelpPageUrl): HelpView | null {
	if (state.help !== undefined) return state.help;
	const param = url.searchParams.get(HELP_PARAM);
	return param === null ? null : { guide: param || null };
}

/** `url` with Help pointed at one guide (`''` for the list) or, with `undefined`, removed. */
export function helpLocation(url: HelpPageUrl, guide: string | null | undefined): string {
	const params = new URLSearchParams(url.search);
	if (guide === undefined) params.delete(HELP_PARAM);
	else params.set(HELP_PARAM, guide ?? '');
	const query = params.toString();
	return `${url.pathname}${query ? `?${query}` : ''}${url.hash}`;
}

/** A step's page path and query, as written in `HelpStep.to`. */
export function splitStepTarget(to: string): { key: HelpRouteKey; query: string } {
	const [key, ...rest] = to.split('?');
	return { key, query: rest.join('?') };
}

/** Setup steps that embed another page's editor. Steps for that page are already "here" on the Setup step. */
export const SETUP_EMBEDS: Readonly<Record<HelpRouteKey, HelpRouteKey>> = {
	'setup/groups': 'personnel',
	'setup/personnel': 'personnel/import',
	'setup/calendar': 'calendar/settings',
	'setup/training': 'training/types',
	'setup/invite': 'settings/members'
};

/** What a page shows when a step's query param is missing, for pages that read a param once and default the rest. */
const STEP_QUERY_DEFAULTS: Readonly<Record<HelpRouteKey, Readonly<Record<string, string>>>> = {
	'calendar/settings': { section: 'status' },
	'calendar/bulk': { tab: 'add' }
};

export interface HelpPage {
	/** The page's route key, or null outside an Organization page. */
	routeKey: HelpRouteKey | null;
	/** The page's concrete path under its Organization, as `helpPagePath` returns it. */
	path: HelpRouteKey | null;
	/** The visible URL's params. */
	params: Pick<URLSearchParams, 'get'>;
}

/** Whether the visible page already is the step's page, with the same value for every param the step names. */
export function isStepHere(to: string, page: HelpPage): boolean {
	const { key, query } = splitStepTarget(to);
	if (page.path !== null && SETUP_EMBEDS[page.path] === key) return true;
	if (key !== page.routeKey && key !== page.path) return false;
	return [...new URLSearchParams(query)].every(
		([name, value]) => (page.params.get(name) ?? STEP_QUERY_DEFAULTS[key]?.[name]) === value
	);
}

/** Where a step's "Go there" link points, keeping the guide open. Null when the page has a dynamic segment. */
export function stepHref(orgUrlSegment: string, to: string, guideId: string): string | null {
	const { key, query } = splitStepTarget(to);
	if (key.includes('[')) return null;
	const params = new URLSearchParams(query);
	params.set(HELP_PARAM, guideId);
	return `/org/${orgUrlSegment}${key ? `/${key}` : ''}?${params}`;
}
