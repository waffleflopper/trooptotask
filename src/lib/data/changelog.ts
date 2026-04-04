export type ChangelogEntry = {
	id: string;
	date: string;
	title: string;
	items: string[];
};

export const changelog: ChangelogEntry[] = [
	{
		id: '2026-04-04-duty-roster-wizard',
		date: '2026-04-04',
		title: 'Duty Roster Wizard Now Recognizes Existing Duties',
		items: [
			'Added a new duty roster wizard that can pick up your existing one-person duty types instead of making you rebuild them from scratch',
			'Simple duties now stay on the familiar roster flow while still living inside the new rebuild path, so current setup and calendar records remain usable',
			'Admins can now preview and apply recurring advanced duty runs from saved templates using daily, weekday, weekend, selected weekday, holiday or closure, and custom-date patterns'
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
	},
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
	}
];
