// The measured journeys, one entry each. A journey names its page, which actors can reach it,
// whether it is a load or an input, whether it writes, and the milestones the observer waits
// for. An interaction opens its page, waits for `ready`, runs the untimed `prepare` steps and
// times one native `trigger` step to its milestones. `sample` is the 0-based sample index
// across the warm-up and repetitions; write journeys alternate on it so each sample reverses
// the one before and an even sample count leaves the workload as seeded.
//
// A milestone is reached on the first animation frame where every `present` text is in the
// document, at least one `anyPresent` text is, every `absent` text is gone, the first element
// matching each `inside` selector holds its texts, every `presentSelector` matches, no
// `absentSelector` matches, each `count` selector matches exactly that many elements and, with
// `download`, the page has created a file download. The last milestone, `useful`, is the first useful render.
//
// A step is one native browser action: `click` or `fill` a control named in the accessibility
// snapshot (optionally inside a named row), `type` text into the focused element, `press` a
// key, `upload` a prepared file, or `wait` for any of some texts.
//
// `reset` names the cleanup run after every sample of a write that cannot be toggled, and
// `limit` names the app rate limit the samples must stay under.

const skeleton = '[data-slot="skeleton"]';
const both = { perfWide: null, perfScoped: null };
const ownerOnly = {
	perfWide: null,
	perfScoped: 'Organization settings need an admin; perfScoped is a Group-scoped operator (403).'
};
const detailActors = {
	perfWide: null,
	perfScoped:
		'The detail page needs the personnel configure capability (personnel.readSensitiveRecords); perfScoped is an operator (403).'
};
const platformOnly = {
	platformReviewer: null,
	perfWide: 'Platform administration needs a platform role.',
	perfScoped: 'Platform administration needs a platform role.'
};

// Above 250 People the By Group roster renders a pause notice instead of rows, so for a
// large Organization-wide actor that notice is the useful roster.
const roster = ({ sentinel }) => ({ anyPresent: [sentinel, 'personnel are loaded'], absentSelector: [skeleton] });
const search = { role: 'searchbox', name: 'Search by name, rank, MOS, role, or group' };
const personRows = '[aria-label^="Open "]';
// The 3-Month view's virtual rows hold Group bands and People; a Person row has status cells.
const longRangeRows = '.roster-rows .virtual-row:has(.status-cell)';
const calendarReady = ({ month }) => ({
	present: [month.current],
	presentSelector: ['[data-slot="date-cell"]'],
	absent: ['Loading Calendar data', 'Loading calendar data'],
	absentSelector: [skeleton]
});
const org = (terms, path = '') => `/org/${terms.organizationId}${path}`;

// The roster stays paused for a large wide actor, so its row journeys first narrow the roster
// to one Person with the search term, as that user would.
const findPerson = ({ searchTerm }) => [{ fill: search, value: searchTerm }, { wait: [searchTerm] }];
const openDetail = (terms) => [
	...findPerson(terms),
	{ click: { role: 'button', name: 'Details', within: { role: 'row', name: terms.edit.row } } },
	{ wait: ['Edit basic info'] }
];
const detailOpen = { presentSelector: ['[aria-label="Readiness summary"]'] };
// Each pending lane and panel is named "<Lane> loading" until its stream settles.
const detailSettled = { ...detailOpen, absentSelector: ['[aria-label$=" loading"]', skeleton] };

export const journeys = {
	'calendar-initial': {
		area: 'calendar',
		kind: 'load',
		effect: 'read',
		cold: true,
		actors: both,
		path: (terms) => org(terms, '/calendar'),
		milestones: (terms) => [{ name: 'useful', ...calendarReady(terms) }]
	},
	'calendar-range': {
		area: 'calendar',
		kind: 'interaction',
		effect: 'read',
		actors: both,
		path: (terms) => org(terms, '/calendar'),
		ready: (terms) => [{ name: 'ready', ...calendarReady(terms) }],
		prepare: ({ month }) => [{ click: { role: 'button', name: '3-Month' } }, { wait: [month.quarter] }],
		trigger: () => ({ click: { role: 'button', name: 'Next 3 Months' } }),
		milestones: ({ month }) => [
			{
				name: 'useful',
				present: [month.nextQuarter],
				presentSelector: [longRangeRows],
				absent: ['Loading Calendar data', 'Loading calendar data', 'Loading additional calendar dates'],
				absentSelector: [skeleton]
			}
		]
	},
	'calendar-search': {
		area: 'calendar',
		kind: 'interaction',
		effect: 'read',
		actors: both,
		path: (terms) => org(terms, '/calendar'),
		ready: (terms) => [{ name: 'ready', ...calendarReady(terms) }],
		prepare: ({ month }) => [{ click: { role: 'button', name: '3-Month' } }, { wait: [month.quarter] }],
		trigger: ({ searchTerm }) => ({ fill: search, value: searchTerm }),
		milestones: ({ searchTerm }) => [{ name: 'useful', present: [searchTerm], count: { [longRangeRows]: 1 } }]
	},
	'assignment-save': {
		area: 'calendar',
		kind: 'interaction',
		effect: 'write',
		actors: both,
		path: (terms) => org(terms, '/calendar/assignments'),
		ready: () => [{ name: 'ready', present: ['Assignment Planner'], presentSelector: ['[aria-label^="Select "]'] }],
		prepare: ({ assignment }, sample) => [
			{ click: { role: 'button', name: assignment.control } },
			{ type: assigned(assignment, sample).search }
		],
		trigger: () => ({ press: 'Enter' }),
		milestones: ({ assignment }, sample) => [
			{
				name: 'useful',
				inside: { [`button[aria-label="${assignment.control}"]`]: [assigned(assignment, sample).label] }
			}
		]
	},
	'personnel-list': {
		area: 'personnel',
		kind: 'load',
		effect: 'read',
		cold: true,
		actors: both,
		path: (terms) => org(terms, '/personnel'),
		milestones: (terms) => [{ name: 'useful', ...roster(terms) }]
	},
	'personnel-search': {
		area: 'personnel',
		kind: 'interaction',
		effect: 'read',
		actors: both,
		path: (terms) => org(terms, '/personnel'),
		ready: (terms) => [{ name: 'ready', ...roster(terms) }],
		trigger: ({ searchTerm }) => ({ fill: search, value: searchTerm }),
		milestones: ({ sentinel, searchTerm }) => [{ name: 'useful', present: [searchTerm], absent: [sentinel] }]
	},
	'personnel-filter': {
		area: 'personnel',
		kind: 'interaction',
		effect: 'read',
		actors: both,
		path: (terms) => org(terms, '/personnel'),
		ready: (terms) => [{ name: 'ready', ...roster(terms) }],
		trigger: ({ filter }) => ({ fill: search, value: filter.term }),
		milestones: ({ filter }) => [{ name: 'useful', count: { [personRows]: filter.rows } }]
	},
	'personnel-large-table': {
		area: 'personnel',
		kind: 'interaction',
		effect: 'read',
		actors: both,
		path: (terms) => org(terms, '/personnel'),
		ready: (terms) => [{ name: 'ready', ...roster(terms) }],
		prepare: ({ rosterPaused }) =>
			rosterPaused ? [{ click: { role: 'button', name: 'A-Z' } }, { wait: ['Sort by Name'] }] : [],
		trigger: () => ({ click: { role: 'button', name: 'Sort by Name' } }),
		milestones: () => [{ name: 'useful', presentSelector: ['th[aria-sort="descending"]', personRows] }]
	},
	'personnel-detail': {
		area: 'personnel',
		kind: 'interaction',
		effect: 'read',
		actors: detailActors,
		path: (terms) => org(terms, '/personnel'),
		ready: (terms) => [{ name: 'ready', ...roster(terms) }],
		prepare: findPerson,
		trigger: ({ edit }) => ({ click: { role: 'button', name: 'Details', within: { role: 'row', name: edit.row } } }),
		milestones: () => [
			{ name: 'header', ...detailOpen },
			{ name: 'useful', ...detailSettled }
		]
	},
	'personnel-edit': {
		area: 'personnel',
		kind: 'interaction',
		effect: 'write',
		actors: both,
		path: (terms) => org(terms, '/personnel'),
		ready: (terms) => [{ name: 'ready', ...roster(terms) }],
		prepare: (terms, sample) => [
			...findPerson(terms),
			{ click: { role: 'button', name: 'Edit', within: { role: 'row', name: terms.edit.row } } },
			{ wait: ['Edit Personnel'] },
			{ fill: { role: 'textbox', name: 'MOS / Job Title' }, value: edited(terms.edit, sample) }
		],
		trigger: () => ({ click: { role: 'button', name: 'Save Changes' } }),
		milestones: ({ edit }, sample) => [
			{
				name: 'useful',
				inside: { [`[aria-label="${edit.row}"]`]: [edited(edit, sample)] },
				absentSelector: ['[role="dialog"]']
			}
		]
	},
	// The detail page's basic-info save refreshes every load on the page (invalidateAll), unlike the
	// roster dialog, which updates the open roster in place.
	'personnel-detail-edit': {
		area: 'personnel',
		kind: 'interaction',
		effect: 'write',
		actors: detailActors,
		path: (terms) => org(terms, '/personnel'),
		ready: (terms) => [{ name: 'ready', ...roster(terms) }],
		prepare: (terms, sample) => [
			...openDetail(terms),
			{ click: { role: 'button', name: 'Edit basic info' } },
			{ wait: ['Save basic info'] },
			{ fill: { role: 'textbox', name: 'MOS' }, value: edited(terms.edit, sample) }
		],
		trigger: () => ({ click: { role: 'button', name: 'Save basic info' } }),
		milestones: ({ edit }, sample) => [
			{
				name: 'useful',
				...detailSettled,
				present: [`/ ${edited(edit, sample)} /`],
				absent: ['Save basic info', `/ ${edited(edit, sample + 1)} /`]
			}
		]
	},
	'personnel-import': {
		area: 'personnel',
		kind: 'interaction',
		effect: 'write',
		reset: 'imported-personnel',
		actors: both,
		path: (terms) => org(terms, '/personnel/import'),
		ready: () => [{ name: 'ready', present: ['Upload roster file'] }],
		prepare: ({ importFile }) => [
			{ upload: { role: 'button', name: 'Upload personnel file' }, file: importFile.path },
			{ click: { role: 'button', name: `Preview ${importFile.rows} Rows` } },
			{ wait: [`${importFile.rows} of ${importFile.rows} selected`] }
		],
		trigger: () => ({ click: { role: 'button', name: 'Import checked rows' } }),
		milestones: ({ importFile }) => [
			{
				name: 'useful',
				present: ['Import complete'],
				absent: ['Import completed with issues'],
				inside: { '[data-slot="alert"] dl': [`Saved ${importFile.rows}`, 'Failed 0'] }
			}
		]
	},
	dashboard: {
		area: 'dashboard',
		kind: 'load',
		effect: 'read',
		cold: true,
		actors: both,
		path: (terms) => org(terms),
		// The route shows its own skeleton section until both the streamed bootstrap and the
		// deferred summary resolve; `summary` is the first frame after that, when either the
		// hydrating panel skeleton or the Overview itself appears.
		milestones: () => [
			{ name: 'pending', presentSelector: [`section[role="status"] ${skeleton}`] },
			{ name: 'summary', presentSelector: ['[data-testid="skeleton-block"], [aria-label="Personnel availability"]'] },
			{ name: 'useful', present: ['Upcoming Changes', 'Requires Attention'], absentSelector: [skeleton] }
		]
	},
	'training-report': {
		area: 'reports',
		kind: 'load',
		effect: 'read',
		actors: both,
		path: (terms) => org(terms, '/training/reports'),
		milestones: ({ population }) => [
			{
				name: 'useful',
				present: [`${population} soldiers`, 'Bottom line'],
				presentSelector: ['section[aria-label="Training readiness briefing"][aria-busy="false"]'],
				absent: ['Updating briefing']
			}
		]
	},
	'critical-tasks-report': {
		area: 'reports',
		kind: 'load',
		effect: 'read',
		actors: both,
		path: (terms) => org(terms, '/critical-tasks/reports'),
		milestones: ({ population }) => [
			{
				name: 'useful',
				inside: { '[aria-label="Critical task analysis console"]': ['Population', String(population)] },
				presentSelector: ['[aria-label="Critical task report metrics"]'],
				absentSelector: ['[aria-busy="true"]', skeleton]
			}
		]
	},
	'members-list': {
		area: 'lists',
		kind: 'load',
		effect: 'read',
		actors: ownerOnly,
		path: (terms) => org(terms, '/settings/members'),
		milestones: ({ members }) => [{ name: 'useful', present: [`${members} members`], absentSelector: [skeleton] }]
	},
	// The platform user directory spans every Organization, so it is the largest list the product
	// shows; its size is the whole owned Auth directory when the sample runs, not one workload.
	'admin-users': {
		area: 'lists',
		kind: 'load',
		effect: 'read',
		actors: platformOnly,
		path: () => '/admin/users',
		milestones: () => [
			{
				name: 'useful',
				present: ['Directory Size', 'Reviewing page 1 of'],
				presentSelector: ['a[href*="/admin/users/"]']
			}
		]
	},
	'workbook-export': {
		area: 'reports',
		kind: 'interaction',
		effect: 'read',
		actors: both,
		path: (terms) => org(terms, '/training/reports'),
		ready: (terms) =>
			journeys['training-report'].milestones(terms).map((milestone) => ({ ...milestone, name: 'ready' })),
		trigger: () => ({ click: { role: 'button', name: 'Export Excel' } }),
		milestones: () => [{ name: 'useful', download: true, absent: ['Exporting...'] }]
	},
	// Each export records its own history row, which the workload journals for clean-seeds.
	'organization-export': {
		area: 'reports',
		kind: 'interaction',
		effect: 'write',
		limit: 'export',
		actors: ownerOnly,
		path: (terms) => org(terms, '/settings/exports'),
		ready: () => [{ name: 'ready', present: ['Full organization', 'Export JSON'] }],
		trigger: () => ({ click: { role: 'button', name: 'Export JSON' } }),
		milestones: () => [{ name: 'useful', download: true, present: ['Export downloaded successfully.'] }]
	},
	// The request path on a client navigation: a sidebar link from a settled Calendar.
	'sidebar-navigation': {
		area: 'request',
		kind: 'interaction',
		effect: 'read',
		actors: both,
		path: (terms) => org(terms, '/calendar'),
		ready: (terms) => [{ name: 'ready', ...calendarReady(terms) }],
		trigger: () => ({ click: { role: 'link', name: 'Personnel' } }),
		milestones: (terms) => [{ name: 'useful', ...roster(terms) }]
	},
	'organization-switch': {
		area: 'organization',
		kind: 'interaction',
		effect: 'read',
		actors: both,
		path: ({ switchFrom }) => `/org/${switchFrom.organizationId}/personnel`,
		ready: ({ switchFrom }) => [{ name: 'ready', ...roster(switchFrom) }],
		prepare: () => [{ click: { role: 'button', name: 'Switch organization' } }],
		// Its accessible name is "<initials> <Organization> <role>".
		trigger: ({ organizationName }) => ({ click: { role: 'menuitem', name: organizationName, partial: true } }),
		milestones: (terms) => [
			{ name: 'useful', ...roster(terms), inside: { 'nav[aria-label="Current section"]': [terms.organizationName] } }
		]
	}
};

// Sample 0 writes the alternate value and sample 1 writes the original back.
const toggled = ({ original, alternate }, sample) => (sample % 2 ? original : alternate);
const assigned = toggled;
const edited = toggled;

const monthName = (year, month) =>
	new Date(Date.UTC(year, month, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** The Calendar's month and 3-Month labels for the workload's anchor day (YYYY-MM-DD). */
export function monthLabels(anchor) {
	const [year, month] = anchor.split('-').map(Number);
	const span = (first) => `${monthName(year, first)} – ${monthName(year, first + 2)}`;
	return { current: monthName(year, month - 1), quarter: span(month - 1), nextQuarter: span(month + 2) };
}

/** The KIND journey NAME as ACTOR; an actor that cannot reach it is refused with the reason. */
export function journeyFor(name, actor, kind) {
	const journey = journeys[name];
	if (journey?.kind !== kind) {
		const names = Object.keys(journeys).filter((key) => journeys[key].kind === kind);
		throw new Error(`Use a ${kind} journey: ${names.join(', ')}.`);
	}
	if (!(actor in journey.actors)) throw new Error(`${name} is not measured as ${actor}.`);
	if (journey.actors[actor]) throw new Error(`${name} is not applicable to ${actor}: ${journey.actors[actor]}`);
	return journey;
}
