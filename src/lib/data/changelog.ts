export type ChangelogEntry = {
	id: string;
	date: string;
	title: string;
	items: string[];
};

export const changelog: ChangelogEntry[] = [
	{
		id: '2026-04-02-training-types-scroll',
		date: '2026-04-02',
		title: 'A Couple of Rough Edges Smoothed Out',
		items: [
			'Fixed the training type editor so you can scroll all the way through the form without zooming out or getting stuck halfway down the page',
			'Improved the training type setup experience on taller forms so the list and editor panes behave more predictably while you work'
		]
	},
	{
		id: '2026-04-02-auth-reliability',
		date: '2026-04-02',
		title: 'Sign-In and Invite Flow Reliability Improvements',
		items: [
			'Improved account invite and password reset flows so setup links are more reliable and less likely to leave people stuck halfway through',
			'Tightened up password setup rules so account creation and password recovery now follow the same policy instead of behaving differently',
			'Cleaned up some of the behind-the-scenes auth handling so retries and follow-up steps are less brittle when connections are slow or links are reopened'
		]
	},
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
	}
];
