// The measured journeys, one entry each. A journey names its page, which actors can reach it,
// whether it is a load or an input, whether it writes, and the milestones the observer waits
// for. An interaction opens its page, waits for `ready`, runs the untimed `prepare` steps and
// times one native `trigger` step to its milestones. `sample` is the 0-based sample index
// across the warm-up and repetitions, rejected samples included; `toggles` write journeys
// alternate on it so each sample reverses the one before and an even count leaves the
// workload as seeded.
//
// A milestone is reached on the first animation frame where every `present` text is in the
// document, at least one `anyPresent` text is, every `absent` text is gone, the first element
// matching each `inside` selector holds its texts, every `presentSelector` matches, no
// `absentSelector` matches, each `count` selector matches exactly that many elements and, with
// `download`, the page has created a file download. The last milestone, `useful`, is the first useful render.
//
// A step is one native browser action: `click`, `hover` or `fill` a control named in the
// accessibility snapshot (optionally inside a named row), `type` text into the focused element,
// `press` a key, `upload` a prepared file, or `wait` for any of some texts.
//
// `reset` names the cleanup run after every sample that would otherwise leave the next one a
// different start, and `limit` names the app rate limit the samples must stay under.

const skeleton = '[data-slot="skeleton"]';
const both = { perfWide: null, perfScoped: null };
const ownerOnly = {
	perfWide: null,
	perfScoped: 'Organization settings need an admin; perfScoped is a Group-scoped operator (403).'
};
const detailActors = {
	perfWide: null,
	perfScoped:
		'The detail page needs the personnel configure capability (personnel.readSensitiveRecords); perfScoped is an operator (403).',
	perfScopedLeader: null
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
// The 3-Month view's virtual rows hold Group bands and People; only a Person row names its Person.
const longRangeRows = '.roster-rows [data-person-id]';
const monthRows = '.virtual-row--person';
const calendarLoading = ['Loading Calendar data', 'Loading calendar data', 'Loading additional calendar dates'];
const calendarReady = ({ month }) => ({
	present: [month.current],
	presentSelector: ['[data-slot="date-cell"]'],
	absent: calendarLoading,
	absentSelector: [skeleton]
});
const org = (terms, path = '') => `/org/${terms.organizationId}${path}`;
const groupFilterActors = {
	perfWide: null,
	perfScoped: 'perfScoped sees one Group, so the group filter has nothing to narrow.'
};
const openGroupFilterOnBravo = [
	{ click: { role: 'button', name: 'Calendar group filter' } },
	{ press: 'ArrowDown' },
	{ press: 'ArrowDown' }
];
// The affected-soldiers detail opens below the briefing from a hot-spot cell; every workload has
// this Training type, and its Total cell is the widest cell an actor can open.
const affected = '#training-affected-soldiers';
const openBriefingCell = { click: { role: 'button', name: 'Total, Workload Training 01:', partial: true } };
const calendarReportReady = () => [{ name: 'ready', present: ['Run status-day report'], absentSelector: [skeleton] }];
const runStatusDays = { click: { role: 'button', name: 'Run status-day report' } };

// The roster stays paused for a large wide actor, so its row journeys first narrow the roster
// to one Person with the search term, as that user would.
const findPerson = ({ searchTerm }) => [{ fill: search, value: searchTerm }, { wait: [searchTerm] }];
const openDetail = (terms) => [
	...findPerson(terms),
	{ click: { role: 'button', name: 'Details', within: { role: 'row', name: terms.edit.row } } },
	{ wait: ['Add to record'] }
];
const detailTabs = 'nav[aria-label="Personnel detail sections"]';
const streamsPending = ['[aria-label$=" loading"]', skeleton];
const detailHeaderShown = { presentSelector: [detailTabs] };
const detailSettled = {
	presentSelector: [detailTabs, 'section[aria-label="Needs attention"]'],
	absentSelector: streamsPending
};
const detailPath = (terms) => org(terms, `/personnel/${terms.edit.slug}`);
const logTabLink = {
	role: 'link',
	name: 'Log',
	partial: true,
	within: { role: 'navigation', name: 'Personnel detail sections' }
};
const logRouteCurrent = {
	presentSelector: ['a[aria-current="page"][href$="/log"]'],
	absentSelector: streamsPending
};
const logTabSwitch = (prepare) => ({
	area: 'personnel',
	kind: 'interaction',
	effect: 'read',
	actors: detailActors,
	path: detailPath,
	ready: () => [{ name: 'ready', ...detailSettled }],
	prepare: () => prepare,
	trigger: () => ({ click: logTabLink }),
	milestones: () => [{ name: 'useful', ...logRouteCurrent }]
});

export const journeys = {
	'calendar-initial': {
		area: 'calendar',
		kind: 'load',
		effect: 'read',
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
		// The server reads its first window around the anchor the page last wrote to a cookie, so
		// each sample returns the anchor to today as the next visit expects.
		reset: 'calendar-today',
		prepare: ({ month }) => [{ click: { role: 'radio', name: '3-Month' } }, { wait: [month.quarter] }],
		trigger: () => ({ click: { role: 'button', name: 'Next 3 months' } }),
		milestones: ({ month }) => [
			{
				name: 'useful',
				present: [month.nextQuarter],
				presentSelector: [longRangeRows],
				absent: calendarLoading,
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
		prepare: ({ month }) => [{ click: { role: 'radio', name: '3-Month' } }, { wait: [month.quarter] }],
		trigger: ({ searchTerm }) => ({ fill: search, value: searchTerm }),
		milestones: ({ searchTerm }) => [{ name: 'useful', present: [searchTerm], count: { [longRangeRows]: 1 } }]
	},
	// Month view opens on the anchor month. The bootstrap holds the month after it, and paging back
	// reads the earlier month's missing collections.
	'calendar-month-next': {
		area: 'calendar',
		kind: 'interaction',
		effect: 'read',
		actors: both,
		path: (terms) => org(terms, '/calendar'),
		ready: (terms) => [{ name: 'ready', ...calendarReady(terms) }],
		reset: 'calendar-today',
		trigger: () => ({ click: { role: 'button', name: 'Next month' } }),
		milestones: ({ month }) => [{ name: 'useful', ...calendarReady({ month: { current: month.next } }) }]
	},
	'calendar-month-previous': {
		area: 'calendar',
		kind: 'interaction',
		effect: 'read',
		actors: both,
		path: (terms) => org(terms, '/calendar'),
		ready: (terms) => [{ name: 'ready', ...calendarReady(terms) }],
		reset: 'calendar-today',
		trigger: () => ({ click: { role: 'button', name: 'Previous month' } }),
		milestones: ({ month }) => [{ name: 'useful', ...calendarReady({ month: { current: month.previous } }) }]
	},
	'calendar-month-search': {
		area: 'calendar',
		kind: 'interaction',
		effect: 'read',
		actors: both,
		path: (terms) => org(terms, '/calendar'),
		ready: (terms) => [{ name: 'ready', ...calendarReady(terms) }],
		trigger: ({ searchTerm }) => ({ fill: search, value: searchTerm }),
		milestones: ({ searchTerm }) => [{ name: 'useful', present: [searchTerm], count: { [monthRows]: 1 } }]
	},
	// The group filter's options are not in the accessibility snapshot, so the preparation opens it
	// and moves the highlight from `Group: All` past Alpha to Bravo, and Enter picks it. Bravo is
	// the second Group in every workload; the first visible band is Alpha's until the filter lands.
	'calendar-month-group-filter': {
		area: 'calendar',
		kind: 'interaction',
		effect: 'read',
		actors: groupFilterActors,
		path: (terms) => org(terms, '/calendar'),
		ready: (terms) => [{ name: 'ready', ...calendarReady(terms) }],
		prepare: () => openGroupFilterOnBravo,
		trigger: () => ({ press: 'Enter' }),
		milestones: () => [
			{ name: 'useful', inside: { '.virtual-row--group': ['Bravo'] }, count: { '.virtual-row--group': 1 } }
		]
	},
	'calendar-group-filter': {
		area: 'calendar',
		kind: 'interaction',
		effect: 'read',
		actors: groupFilterActors,
		path: (terms) => org(terms, '/calendar'),
		ready: (terms) => [{ name: 'ready', ...calendarReady(terms) }],
		prepare: ({ month }) => [
			{ click: { role: 'radio', name: '3-Month' } },
			{ wait: [month.quarter] },
			...openGroupFilterOnBravo
		],
		trigger: () => ({ press: 'Enter' }),
		milestones: () => [{ name: 'useful', inside: { '.roster-rows .virtual-row': ['Bravo'] } }]
	},
	'assignment-save': {
		area: 'calendar',
		kind: 'interaction',
		effect: 'write',
		toggles: true,
		actors: both,
		path: (terms) => org(terms, '/calendar/assignments'),
		ready: () => [
			{
				name: 'ready',
				present: ['Duty planner'],
				presentSelector: ['[data-duty-slot]'],
				absent: ['Loading Calendar data', 'Loading assignment planner', 'Loading assignments for this month']
			}
		],
		// The picker filters as the term is typed and Enter picks its first match. The slot's
		// name starts with its type and date and ends with its holder. The slot shows the holder
		// before the write returns; the picker closes once it has, so the save is done when both hold.
		prepare: ({ assignment }, sample) => [
			{ click: { role: 'button', name: assignment.control, partial: true } },
			{ type: assigned(assignment, sample).search }
		],
		trigger: () => ({ press: 'Enter' }),
		milestones: ({ assignment }, sample) => [
			{
				name: 'useful',
				presentSelector: [`button[aria-label^="${assignment.control}${assigned(assignment, sample).label}"]`],
				absentSelector: ['[role="dialog"]']
			}
		]
	},
	'personnel-list': {
		area: 'personnel',
		kind: 'load',
		effect: 'read',
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
			{ name: 'header', ...detailHeaderShown },
			{ name: 'useful', ...detailSettled }
		]
	},
	'personnel-detail-direct': {
		area: 'personnel',
		kind: 'load',
		effect: 'read',
		actors: detailActors,
		path: detailPath,
		milestones: () => [
			{ name: 'header', ...detailHeaderShown },
			{ name: 'useful', ...detailSettled }
		]
	},
	'personnel-detail-tab': logTabSwitch([]),
	'personnel-detail-tab-hover': logTabSwitch([{ hover: logTabLink }]),
	'personnel-edit': {
		area: 'personnel',
		kind: 'interaction',
		effect: 'write',
		toggles: true,
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
	// The detail page's Data sheet save writes the Person and the sheet in one request, then lands on the
	// Data sheet tab with only the header and that tab's loads refreshed, unlike the roster dialog, which
	// updates the open roster in place.
	'personnel-detail-edit': {
		area: 'personnel',
		kind: 'interaction',
		effect: 'write',
		toggles: true,
		actors: detailActors,
		path: (terms) => org(terms, '/personnel'),
		ready: (terms) => [{ name: 'ready', ...roster(terms) }],
		prepare: (terms, sample) => [
			...openDetail(terms),
			{ click: { role: 'link', name: 'Edit' } },
			{ wait: ['Save changes'] },
			{ fill: { role: 'textbox', name: 'MOS' }, value: edited(terms.edit, sample) }
		],
		trigger: () => ({ click: { role: 'button', name: 'Save changes' } }),
		milestones: ({ edit }, sample) => [
			{
				name: 'useful',
				presentSelector: [detailTabs, '[data-slot="fact-section"]'],
				absentSelector: streamsPending,
				inside: { '[data-slot="page-header"] [data-slot="badge"]': [edited(edit, sample)] },
				absent: ['Save changes']
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
	// Every page of the detail is one request that rebuilds the briefing source on the server.
	'briefing-detail': {
		area: 'reports',
		kind: 'interaction',
		effect: 'read',
		actors: both,
		path: (terms) => org(terms, '/training/reports'),
		ready: (terms) =>
			journeys['training-report'].milestones(terms).map((milestone) => ({ ...milestone, name: 'ready' })),
		trigger: () => openBriefingCell,
		milestones: () => [
			{
				name: 'useful',
				inside: { [`${affected} [role="status"]`]: ['not ready or lapsing by'] },
				presentSelector: [`${affected}[aria-busy="false"] table`],
				absent: ['Loading affected soldiers']
			}
		]
	},
	'briefing-detail-page': {
		area: 'reports',
		kind: 'interaction',
		effect: 'read',
		actors: {
			perfWide: null,
			perfScoped: 'The scoped Group has at most 25 soldiers, so its widest cell fits on one page and has no Next.'
		},
		path: (terms) => org(terms, '/training/reports'),
		ready: (terms) =>
			journeys['training-report'].milestones(terms).map((milestone) => ({ ...milestone, name: 'ready' })),
		prepare: () => [openBriefingCell, { wait: ['Page 1 of'] }],
		trigger: () => ({
			click: { role: 'button', name: 'Next', within: { role: 'navigation', name: 'Table pagination' } }
		}),
		milestones: () => [
			{
				name: 'useful',
				inside: { [`${affected} nav`]: ['Page 2 of'] },
				present: ['Rows 26–50 of'],
				absent: ['Loading page 2'],
				presentSelector: [`${affected}[aria-busy="false"]`]
			}
		]
	},
	// The report UI caps no range; the longest preset that holds workload data is the current
	// calendar year, which is also the Status days default.
	'calendar-report': {
		area: 'reports',
		kind: 'interaction',
		effect: 'read',
		actors: both,
		path: (terms) => org(terms, '/calendar/reports'),
		ready: calendarReportReady,
		trigger: () => runStatusDays,
		milestones: ({ population }) => [
			{
				name: 'useful',
				present: [`${population} personnel`],
				presentSelector: ['table[aria-label="Status days by person"]'],
				absent: ['Counting status days']
			}
		]
	},
	'calendar-report-export': {
		area: 'reports',
		kind: 'interaction',
		effect: 'read',
		actors: both,
		path: (terms) => org(terms, '/calendar/reports'),
		ready: calendarReportReady,
		prepare: () => [runStatusDays, { wait: ['Export status days'] }],
		trigger: () => ({ click: { role: 'button', name: 'Export status days' } }),
		milestones: () => [{ name: 'useful', download: true }]
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
	// The Dashboard renders no in-page link. Its overflow toggles exist only from typical, and the
	// scoped actor has no Out Today at large, so the control present in every cell is the sidebar.
	'dashboard-navigation': {
		area: 'dashboard',
		kind: 'interaction',
		effect: 'read',
		actors: both,
		path: (terms) => org(terms),
		ready: () => [{ name: 'ready', present: ['Upcoming Changes', 'Requires Attention'], absentSelector: [skeleton] }],
		trigger: () => ({ click: { role: 'link', name: 'Personnel' } }),
		// The Dashboard's own lists already name roster People, so the roster text alone is met
		// before the route changes; the breadcrumb is what only the Personnel page shows.
		milestones: (terms) => [
			{ name: 'useful', ...roster(terms), inside: { 'nav[aria-label="Current section"]': ['Personnel'] } }
		]
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
	return {
		current: monthName(year, month - 1),
		previous: monthName(year, month - 2),
		next: monthName(year, month),
		quarter: span(month - 1),
		nextQuarter: span(month + 2)
	};
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
