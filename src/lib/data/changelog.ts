export type ChangelogEntry = {
	id: string;
	date: string;
	title: string;
	items: string[];
};

export const changelog: ChangelogEntry[] = [
	{
		id: '2026-04-05-duty-roster-ux',
		date: '2026-04-05',
		title: 'Duty Roster Quality-of-Life Improvements',
		items: [
			'Replaced checkbox piles in the advanced template manager with filterable multi-select controls — type a name to narrow it down instead of scrolling through everyone',
			'Applied advanced duty events are now shown one month at a time with prev/next navigation, so the list stays manageable as the months stack up',
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
	},
	{
		id: '2026-04-04-calendar-training-responsiveness',
		date: '2026-04-04',
		title: 'Smoother Calendar and Training Controls',
		items: [
			'Improved calendar preference toggles so they behave much better on slower connections instead of getting grumpy when clicked a few times in a row',
			'Fixed training filters and view switches so they no longer kick the page back into a distracting loading flash just for changing how you want to look at the data',
			'Cleaned up some behind-the-scenes preference saving so quick changes are bundled together more reliably before they get sent off to the server'
		]
	},
	{
		id: '2026-04-03-account-security-hardening',
		date: '2026-04-03',
		title: 'Safer Account Security Changes',
		items: [
			'Turning off multi-factor authentication now requires a fresh authenticator code, so it is much harder for someone with a stray session to quietly remove that protection',
			'Improved password reset for two-factor accounts so recovery now asks for your authenticator code instead of leaving you stuck at an access error',
			'Tightened recovery, invite, and verification flows so incomplete sign-ins stay contained, while still giving you a clear sign-out escape hatch if you want to back out'
		]
	}
];
