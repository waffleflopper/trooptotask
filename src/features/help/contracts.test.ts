import { describe, expect, it } from 'vitest';
import type { CapabilityMap } from '$lib/access/memberAccessShape';
import {
	accessGap,
	canFollowGuide,
	guidesForRoute,
	helpLocation,
	helpPagePath,
	helpRouteKey,
	isGuideAvailable,
	isStepAvailable,
	isStepHere,
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
	return { role: 'member', capabilityMap: noAccess, scopeKind: 'organization', disabledFeatures: [], ...overrides };
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

describe('helpPagePath', () => {
	it('is the path under the Organization, without slashes at the ends', () => {
		expect(helpPagePath('c-co', '/org/c-co/setup/calendar')).toBe('setup/calendar');
		expect(helpPagePath('c-co', '/org/c-co/setup/calendar/')).toBe('setup/calendar');
		expect(helpPagePath('c-co', '/org/c-co')).toBe('');
	});

	it('is null for another Organization or a page outside one', () => {
		expect(helpPagePath('c-co', '/org/c-co-2/calendar')).toBeNull();
		expect(helpPagePath('c-co', '/dashboard')).toBeNull();
	});
});

describe('guidesForRoute by concrete path', () => {
	const setupCalendar = guide('setup-calendar', { routes: ['setup/calendar'] });
	const anySetup = guide('any-setup', { routes: ['setup/[step]'] });
	const calendar = guide('calendar', { routes: ['calendar'] });

	it('lists a guide named for the page path on that page only', () => {
		const guides = [setupCalendar, anySetup, calendar];
		expect(guidesForRoute(guides, 'setup/[step]', 'setup/calendar').map((g) => g.id)).toEqual([
			'setup-calendar',
			'any-setup'
		]);
		expect(guidesForRoute(guides, 'setup/[step]', 'setup/groups').map((g) => g.id)).toEqual(['any-setup']);
	});

	it('does not let a calendar guide cover a setup page that merely ends in calendar', () => {
		expect(guidesForRoute([calendar], 'setup/[step]', 'setup/calendar')).toEqual([]);
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

describe('whole-unit access', () => {
	const wholeUnit = guide('g', { access: { lane: 'calendar', level: 'configure', wholeUnit: true } });
	const manage = { ...noAccess, calendar: 'configure' } as const;

	it('admits a viewer whose access covers the whole unit', () => {
		expect(canFollowGuide(wholeUnit, viewer({ capabilityMap: manage, scopeKind: 'organization' }))).toBe(true);
	});

	it('refuses a viewer limited to Groups even with the lane level', () => {
		expect(canFollowGuide(wholeUnit, viewer({ capabilityMap: manage, scopeKind: 'groups' }))).toBe(false);
	});

	it('lets a guide without the requirement through for a group-limited viewer', () => {
		const plain = guide('g', { access: { lane: 'calendar', level: 'configure' } });
		expect(canFollowGuide(plain, viewer({ capabilityMap: manage, scopeKind: 'groups' }))).toBe(true);
	});
});

describe('accessGap', () => {
	const manage = { ...noAccess, calendar: 'configure' } as const;

	it('is undefined when the viewer meets the requirement or there is none', () => {
		expect(accessGap(undefined, viewer())).toBeUndefined();
		expect(accessGap({ lane: 'calendar', level: 'configure' }, viewer({ capabilityMap: manage }))).toBeUndefined();
	});

	it('names the lane and level the viewer lacks', () => {
		expect(accessGap({ lane: 'calendar', level: 'configure' }, viewer())).toBe('You need Calendar Manage access.');
		expect(accessGap({ lane: 'training', level: 'operate' }, viewer())).toBe('You need Training Update access.');
	});

	it('adds the whole unit to a missing level, and explains a Group limit when the level is held', () => {
		const access = { lane: 'calendar', level: 'configure', wholeUnit: true } as const;
		expect(accessGap(access, viewer())).toBe('You need Calendar Manage access across the whole unit.');
		expect(accessGap(access, viewer({ capabilityMap: manage, scopeKind: 'groups' }))).toBe(
			'This works across the whole unit, and your access covers only your Groups.'
		);
	});

	it('names the role a role requirement admits', () => {
		expect(accessGap({ role: 'admin' }, viewer())).toBe('Only owners and admins can do this.');
		expect(accessGap({ role: 'owner' }, viewer({ role: 'admin' }))).toBe('Only owners can do this.');
	});
});

describe('isStepAvailable', () => {
	it('hides a step whose feature is switched off', () => {
		const step = { text: 'x', feature: 'training' } as const;
		expect(isStepAvailable(step, viewer({ disabledFeatures: ['training'] }))).toBe(false);
		expect(isStepAvailable(step, viewer())).toBe(true);
		expect(isStepAvailable({ text: 'x' }, viewer({ disabledFeatures: ['training'] }))).toBe(true);
	});
});

describe('isStepHere', () => {
	const on = (routeKey: string | null, search = '', path: string | null = routeKey) => ({
		routeKey,
		path,
		params: new URLSearchParams(search)
	});

	it('is true for a step with no query on the same page, and false on another', () => {
		expect(isStepHere('calendar/settings', on('calendar/settings'))).toBe(true);
		expect(isStepHere('calendar/settings', on('calendar'))).toBe(false);
	});

	it('needs the same value for each param the step names', () => {
		const assignments = 'calendar/settings?section=assignments';
		expect(isStepHere(assignments, on('calendar/settings', 'section=assignments'))).toBe(true);
		expect(isStepHere(assignments, on('calendar/settings', 'section=status-types'))).toBe(false);
		expect(isStepHere(assignments, on('calendar/settings', 'section=closures&help=g'))).toBe(false);
	});

	it('reads a missing param as the value the page defaults to', () => {
		expect(isStepHere('calendar/settings?section=status', on('calendar/settings'))).toBe(true);
		expect(isStepHere('calendar/settings?section=assignments', on('calendar/settings'))).toBe(false);
		expect(isStepHere('calendar/bulk?tab=add', on('calendar/bulk'))).toBe(true);
		expect(isStepHere('calendar/bulk?tab=remove', on('calendar/bulk'))).toBe(false);
	});

	it('ignores params the step does not name', () => {
		expect(isStepHere('calendar', on('calendar', 'month=2026-03&help='))).toBe(true);
	});

	it('matches a concrete path as well as a route key', () => {
		expect(isStepHere('setup/calendar', on('setup/[step]', '', 'setup/calendar'))).toBe(true);
		expect(isStepHere('setup/groups', on('setup/[step]', '', 'setup/calendar'))).toBe(false);
	});

	it('counts the page a Setup step embeds as here', () => {
		const setup = on('setup/[step]', '', 'setup/calendar');
		expect(isStepHere('calendar/settings?section=assignments', setup)).toBe(true);
		expect(isStepHere('calendar', setup)).toBe(false);
		expect(isStepHere('calendar/settings', on('setup/[step]', '', 'setup/groups'))).toBe(false);
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
