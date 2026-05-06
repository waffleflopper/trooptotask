export type ChangelogEntry = {
	id: string;
	date: string;
	title: string;
	items: string[];
};

export const changelog: ChangelogEntry[] = [
	{
		id: '2026-05-05-duty-roster-alpha',
		date: '2026-05-05',
		title: 'Duty Rosters Alpha',
		items: [
			'A new Duty Rosters system is now available from Calendar planning, built to better reflect how DA6 duty rosters are handled',
			'This workflow is still under development and in an alpha state, so expect bugs. If you run into bugs or issues, please report them so they can be fixed'
		]
	},
	{
		id: '2026-04-30-duty-roster-workspace',
		date: '2026-04-30',
		title: 'Duty Roster Workspace Updates',
		items: [
			'Duty roster planning now has a clearer workspace for simple assignments, advanced templates, draft runs, and applied events, so the next action is easier to find',
			'Advanced roster previews now use saved run snapshots, which means you can review, adjust, resume after a reload, and apply the approved version without rebuilding the plan from scratch',
			'DA6 review and print views are easier to trust, with clearer weekend rows, assignment-collision labels, availability treatment, and candidate rationale before you commit the roster'
		]
	},
	{
		id: '2026-04-23-access-control-improvements',
		date: '2026-04-23',
		title: 'Clearer Access Controls',
		items: [
			'TroopToTask now has more precise access controls, so leaders can give people access to the tools they need without opening up unrelated areas',
			'Rating Scheme access is now managed on its own, separate from Personnel and Leader’s Book access, making permissions easier to understand and safer to adjust',
			'Navigation and page access now line up more closely with each person’s assigned permissions, so users see fewer dead ends and fewer areas they should not be working in'
		]
	},
	{
		id: '2026-04-15-upcoming-losses',
		date: '2026-04-15',
		title: 'Upcoming Loss Tracking',
		items: [
			'Personnel records now support ETS and PCS / DEROS dates, so upcoming losses can be tracked directly in TroopToTask',
			'People & Duty now includes upcoming losses on the dashboard, making it easier to keep an eye on who is approaching ETS or PCS / DEROS',
			'Personnel approaching a loss date get a small badge next to their name on the personnel page, with an Ack Award button to clear the award reminder once it is being tracked',
			'The goal is simple: catch upcoming losses early and avoid forgetting to start awards before people leave'
		]
	},
	{
		id: '2026-04-12-readiness-dashboard',
		date: '2026-04-12',
		title: 'Readiness Dashboard',
		items: [
			'A new home screen gives you a live readiness picture the moment you log in — no hunting across pages to piece together where your unit stands',
			'Unit Readiness tab shows your strength count and availability percentage for the day, a status breakdown across all absence types, per-group readiness bars, and a 7-day look-ahead of who is coming and going',
			"People & Duty tab puts personnel status and the duty roster side by side: see everyone out today with their reason, today and tomorrow's duty assignments, active onboarding pipelines with completion progress, and upcoming availability changes all in one view",
			'Training & Evals tab surfaces training currency percentage, expiring and expired records by person, a group-by-group delinquency comparison, and your full evaluation pipeline showing overdue and upcoming ratings — color-coded by urgency',
			'Your preferred tab is remembered so the dashboard always opens where you left it'
		]
	},
	{
		id: '2026-04-05-advanced-template-stability',
		date: '2026-04-05',
		title: 'Advanced Template Builder Reliability Improvements',
		items: [
			'Fixed a crash when opening Advanced Templates so older template data no longer breaks the page',
			'Cleaned up the template wizard layout so the full summary only appears on the final Review step (instead of crowding every step)',
			'Hardened template save/edit flows to work even when older organizations are missing newer policy columns, so saves no longer fail with a server error'
		]
	},
	{
		id: '2026-04-05-duty-roster-ux',
		date: '2026-04-05',
		title: 'Duty Roster Quality-of-Life Improvements',
		items: [
			'Replaced checkbox piles in the advanced template manager with filterable multi-select controls — type a name to narrow it down instead of scrolling through everyone',
			'Applied advanced duty events are now shown one month at a time with prev/next navigation, so the list stays manageable as the months stack up',
			'Opening an applied advanced duty event now launches the editor in a modal so you can edit immediately without jumping to the bottom of a long history list',
			'Fixed another advanced-series edge case that could still throw a server 500 even though the run had already saved',
			'Advanced templates can now mark calendar statuses (like Leave/TDY) as day-level exemptions so the generator skips those people only on affected days and rotates them back in automatically later',
			'The simple duty wizard now walks you through Setup, Personnel, and Preview as separate steps instead of presenting everything as one giant form at once',
			'Slot definitions in the template builder can now be collapsed down to a one-line summary so you can manage several slots without endless scrolling',
			'Re-applying a duty template series to overlapping dates now replaces the existing assignments instead of stacking duplicates on top — same behavior as how simple daily duties work'
		]
	},
	{
		id: '2026-04-04-advanced-duty-on-calendar',
		date: '2026-04-04',
		title: 'Advanced Duty Events Now Show On The Calendar',
		items: [
			'Advanced duty events generated from the new wizard now appear as small inline badges on the main calendar, right alongside your existing daily assignment badges, so you can see who is on duty without switching pages or hunting through the wizard',
			'Each template gets its own consistent color and two- or three-letter abbreviation, and hovering the badge shows the template name and role so you know exactly which duty that person is covering'
		]
	},
	{
		id: '2026-04-04-advanced-duty-planner',
		date: '2026-04-04',
		title: 'Advanced Duty Planner',
		items: [
			'Rebuilt the duty roster flow with a step-by-step wizard: pick a template, review the policy, choose a date pattern, preview the generated team, and apply — all without leaving the page',
			'Preview now lets you swap people, lock positions, and see exactly why someone was picked or skipped before you commit the run. Applied events can be reopened, regenerated, or exported as a printable team duty packet'
		]
	},
	{
		id: '2026-04-04-duty-conflict-detection',
		date: '2026-04-04',
		title: 'Safer Assignments with Conflict Detection',
		items: [
			'Manual calendar assignments now warn when someone is already on duty or inside a cooldown window, so schedule conflicts are caught before they happen rather than discovered after the fact'
		]
	}
];
