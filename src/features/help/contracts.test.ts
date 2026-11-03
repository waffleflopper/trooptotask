import { describe, expect, it } from 'vitest';
import type { CapabilityMap } from '$lib/access/memberAccessShape';
import {
	canFollowGuide,
	guidesForRoute,
	helpLocation,
	helpRouteKey,
	isGuideAvailable,
	readHelpView,
	searchGuides,
	stepHref,
	type HelpGuide,
	type HelpViewer
} from './contracts';

function guide(id: string, overrides: Partial<HelpGuide> = {}): HelpGuide {
	return {
		id,
		title: id,
		summary: '',
		area: 'calendar',
		routes: [],
		keywords: [],
		lead: '',
		steps: [],
		...overrides
	};
}

const noAccess: CapabilityMap = {
	calendar: 'none',
	personnel: 'none',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'none',
	ratingScheme: 'none'
};

function viewer(overrides: Partial<HelpViewer> = {}): HelpViewer {
	return { role: 'member', capabilityMap: noAccess, disabledFeatures: [], ...overrides };
}

describe('helpRouteKey', () => {
	it('maps the dashboard route group to the empty key', () => {
		expect(helpRouteKey('/org/[orgId]/(dashboard)')).toBe('');
		expect(helpRouteKey('/org/[orgId]')).toBe('');
	});

	it('drops route groups wherever they sit', () => {
		expect(helpRouteKey('/org/[orgId]/critical-tasks/(workspace)/library')).toBe('critical-tasks/library');
	});

	it('keeps dynamic segments in their route-id spelling', () => {
		expect(helpRouteKey('/org/[orgId]/personnel/[personnelSlug]')).toBe('personnel/[personnelSlug]');
	});

	it('is null outside an Organization page', () => {
		expect(helpRouteKey('/dashboard')).toBeNull();
		expect(helpRouteKey('/org/[orgId]-archive/calendar')).toBeNull();
		expect(helpRouteKey(null)).toBeNull();
	});
});

describe('guidesForRoute', () => {
	const exact = guide('exact', { routes: ['calendar/settings'] });
	const parent = guide('parent', { routes: ['calendar'] });
	const sibling = guide('sibling', { routes: ['calendar/settings'] });
	const home = guide('home', { routes: [''] });
	const elsewhere = guide('elsewhere', { routes: ['personnel'] });

	it('lists an exact match before a guide for an ancestor page', () => {
		expect(guidesForRoute([parent, exact], 'calendar/settings').map((g) => g.id)).toEqual(['exact', 'parent']);
	});

	it('lets an ancestor cover the pages below it but not the reverse', () => {
		expect(guidesForRoute([parent], 'calendar/settings/status').map((g) => g.id)).toEqual(['parent']);
		expect(guidesForRoute([exact], 'calendar')).toEqual([]);
	});

	it('does not treat the dashboard as an ancestor of every page', () => {
		expect(guidesForRoute([home], 'calendar')).toEqual([]);
		expect(guidesForRoute([home], '').map((g) => g.id)).toEqual(['home']);
	});

	it('keeps registry order among guides at the same depth', () => {
		expect(guidesForRoute([sibling, elsewhere, exact], 'calendar/settings').map((g) => g.id)).toEqual([
			'sibling',
			'exact'
		]);
	});

	it('ranks a guide by its closest route', () => {
		const both = guide('both', { routes: ['calendar', 'calendar/settings'] });
		expect(guidesForRoute([parent, both], 'calendar/settings').map((g) => g.id)).toEqual(['both', 'parent']);
	});
});

describe('searchGuides', () => {
	const duty = guide('duty', { title: 'Print the DA 6', summary: 'Fill the roster first', keywords: ['cq'] });
	const roster = guide('roster', { title: 'Fill a roster', summary: 'Print the DA 6 afterwards' });
	const other = guide('other', { title: 'Add a Soldier', area: 'personnel' });

	it('requires every word to appear somewhere in the guide', () => {
		expect(searchGuides([duty, roster, other], 'print roster').map((g) => g.id)).toEqual(['duty', 'roster']);
		expect(searchGuides([duty, roster, other], 'print soldier')).toEqual([]);
	});

	it('ranks guides with more words in the title first', () => {
		expect(searchGuides([roster, duty], 'fill roster').map((g) => g.id)).toEqual(['roster', 'duty']);
	});

	it('matches keywords and the area label, ignoring case', () => {
		expect(searchGuides([duty, other], 'CQ').map((g) => g.id)).toEqual(['duty']);
		expect(searchGuides([duty, other], 'personnel').map((g) => g.id)).toEqual(['other']);
	});

	it('returns nothing for an empty query', () => {
		expect(searchGuides([duty], '   ')).toEqual([]);
	});
});

describe('canFollowGuide', () => {
	const needsManage = guide('g', { access: { lane: 'calendar', level: 'configure' } });

	it('admits a guide with no requirement', () => {
		expect(canFollowGuide(guide('open'), viewer())).toBe(true);
	});

	it('compares the lane level the viewer holds with the level required', () => {
		expect(canFollowGuide(needsManage, viewer({ capabilityMap: { ...noAccess, calendar: 'view' } }))).toBe(false);
		expect(canFollowGuide(needsManage, viewer({ capabilityMap: { ...noAccess, calendar: 'operate' } }))).toBe(false);
		expect(canFollowGuide(needsManage, viewer({ capabilityMap: { ...noAccess, calendar: 'configure' } }))).toBe(true);
	});

	it('does not borrow access from another lane', () => {
		expect(canFollowGuide(needsManage, viewer({ capabilityMap: { ...noAccess, personnel: 'configure' } }))).toBe(false);
	});

	it('admits owners and admins to an admin-only guide but not members', () => {
		const adminOnly = guide('g', { access: { role: 'admin' } });
		expect(canFollowGuide(adminOnly, viewer({ role: 'owner' }))).toBe(true);
		expect(canFollowGuide(adminOnly, viewer({ role: 'admin' }))).toBe(true);
		expect(canFollowGuide(adminOnly, viewer({ role: 'member' }))).toBe(false);
	});
});

describe('isGuideAvailable', () => {
	it('hides a guide whose feature is switched off', () => {
		const g = guide('g', { feature: 'training' });
		expect(isGuideAvailable(g, viewer({ disabledFeatures: ['training'] }))).toBe(false);
		expect(isGuideAvailable(g, viewer({ disabledFeatures: [] }))).toBe(true);
		expect(isGuideAvailable(guide('plain'), viewer({ disabledFeatures: ['training'] }))).toBe(true);
	});
});

describe('readHelpView', () => {
	const at = (search: string) => new URL(`https://example.test/org/a/calendar${search}`);

	it('is closed with no state and no param', () => {
		expect(readHelpView({}, at(''))).toBeNull();
	});

	it('reads the list from an empty param and a guide from a value', () => {
		expect(readHelpView({}, at('?help'))).toEqual({ guide: null });
		expect(readHelpView({}, at('?help=print-da6'))).toEqual({ guide: 'print-da6' });
	});

	it('lets entry state win over the URL, including a closed state', () => {
		expect(readHelpView({ help: { guide: 'a' } }, at('?help=b'))).toEqual({ guide: 'a' });
		expect(readHelpView({ help: null }, at('?help=b'))).toBeNull();
	});
});

describe('helpLocation', () => {
	const url = new URL('https://example.test/org/a/calendar?month=2026-03#top');

	it('adds the param and keeps the rest of the URL', () => {
		expect(helpLocation(url, 'print-da6')).toBe('/org/a/calendar?month=2026-03&help=print-da6#top');
		expect(helpLocation(url, null)).toBe('/org/a/calendar?month=2026-03&help=#top');
	});

	it('replaces an existing param and removes it on request', () => {
		const open = new URL('https://example.test/org/a/calendar?help=old');
		expect(helpLocation(open, 'new')).toBe('/org/a/calendar?help=new');
		expect(helpLocation(open, undefined)).toBe('/org/a/calendar');
	});
});

describe('stepHref', () => {
	it('points at the Organization page with the guide kept open', () => {
		expect(stepHref('c-co', 'calendar/settings', 'add-types')).toBe('/org/c-co/calendar/settings?help=add-types');
	});

	it('keeps the step query and links the dashboard as the Organization root', () => {
		expect(stepHref('c-co', 'calendar?view=month', 'g')).toBe('/org/c-co/calendar?view=month&help=g');
		expect(stepHref('c-co', '', 'g')).toBe('/org/c-co?help=g');
	});

	it('has no link for a page that needs an id the guide cannot know', () => {
		expect(stepHref('c-co', 'personnel/[personnelSlug]', 'g')).toBeNull();
	});
});
