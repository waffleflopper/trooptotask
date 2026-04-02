export type ChangelogEntry = {
	id: string;
	date: string;
	title: string;
	items: string[];
};

export const changelog: ChangelogEntry[] = [
	{
		id: '2026-04-01-refresh-pass',
		date: '2026-04-01',
		title: 'A Cleaner, Easier-to-Read Refresh',
		items: [
			'Refreshed the overall look of the app and public site so screens feel more consistent from page to page',
			'Improved text sizing and spacing across key areas like dashboards, modals, and marketing pages so things are easier to scan without feeling oversized',
			'Smoothed out navigation and layout behavior across desktop, tablet, and mobile so menus stay available where you expect them'
		]
	},
	{
		id: '2026-03-22-under-the-hood',
		date: '2026-03-22',
		title: 'Under the Hood Improvements',
		items: [
			'Made a bunch of behind-the-scenes changes to improve how the app handles requests — things should feel snappier and more reliable overall',
			'Tightened up error handling so the app recovers more gracefully when something goes wrong instead of showing a confusing error page',
			'Improved how bulk operations (like importing personnel or updating assignments) handle edge cases — fewer surprises when working with large batches',
			"If you run into anything weird or notice something that doesn't look right, please don't hesitate to report it — we'll make it a high priority to fix"
		]
	},
	{
		id: '2026-03-22-table-improvements',
		date: '2026-03-22',
		title: 'Tables Got a Glow-Up',
		items: [
			'All tables across the app now have a consistent look and feel — reports, training matrix, admin pages, rating scheme, the works',
			'You can now click column headers to sort most tables — finally, no more squinting to find someone buried in a long list',
			'Fixed a bug where editing a rating scheme entry would create a duplicate instead of actually saving your changes'
		]
	},
	{
		id: '2026-03-19-leaders-book-redesign',
		date: '2026-03-19',
		title: "Leader's Book Redesign In Progress",
		items: [
			"We've temporarily removed the Leader's Book while we rebuild it from the ground up — the new version will be more intuitive and better integrated with the rest of the app",
			'Your existing data (counseling records, development goals, extended info) is safely preserved and will carry over to the new version',
			'The Rating Scheme is still fully available on the Personnel page — nothing changed there'
		]
	}
];
