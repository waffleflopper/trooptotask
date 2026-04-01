export type ChangelogEntry = {
	id: string;
	date: string;
	title: string;
	items: string[];
};

export const changelog: ChangelogEntry[] = [
	{
		id: '2026-03-31-marketing-pages-rollout',
		date: '2026-03-31',
		title: 'The Rest of the Public Site Now Feels Like the Same Product',
		items: [
			'The Features and Pricing pages were rebuilt to match the new public site design instead of feeling like older standalone pages',
			'Pricing information is now easier to scan, with cleaner plan comparisons and simpler explanations of how billing works during beta',
			'The public site should also feel more consistent from page to page now, instead of acting like five different people designed it during five different lunch breaks'
		]
	},
	{
		id: '2026-03-31-landing-page-rollout',
		date: '2026-03-31',
		title: 'The Public Site Has a Better Front Door',
		items: [
			'The homepage was rebuilt with a cleaner layout, clearer section flow, and a more polished first impression for new visitors',
			'Feature highlights, roadmap details, and common questions are now easier to scan instead of feeling like one long wall of marketing copy',
			'The public landing page should also feel better on mobile and in dark mode now, instead of acting like those views were invited out of pity'
		]
	},
	{
		id: '2026-03-31-preferences-follow-your-account',
		date: '2026-03-31',
		title: 'Your Calendar and Training Preferences Stick Around Better',
		items: [
			"Calendar display choices like showing status text and keeping Today's Summary open or closed now follow your account instead of depending on that computer remembering local settings",
			'The training page now remembers your selected saved view, group filter, and layout view after refreshes so you do not have to keep setting the page back up',
			'This is especially helpful on locked-down government machines that like to forget browser storage whenever they feel like it'
		]
	},
	{
		id: '2026-03-26-calendar-bulk-workspace',
		date: '2026-03-26',
		title: 'Bulk Calendar Updates Have More Room to Breathe',
		items: [
			'The bulk add and bulk remove calendar tools now make much better use of wide screens, so you can see a lot more people at once instead of constantly fighting the list',
			'Status settings now live in a cleaner side panel while the personnel list gets the larger workspace, which makes bulk changes feel a lot less cramped',
			'Selection controls were cleaned up too, including clearer counts and a better "select shown" action when you are filtering the list'
		]
	},
	{
		id: '2026-03-26-calendar-month-picker',
		date: '2026-03-26',
		title: 'Jump Around the Calendar Much Faster',
		items: [
			'You can now click the month name at the top of the calendar to jump straight to a different month instead of hammering the next and previous buttons over and over',
			'The same quick-jump picker also works in the 3-month calendar view, so it is easier to move across the year without losing your place',
			'Keyboard navigation was added too, so the new picker is easier to use without needing to rely on a mouse'
		]
	}
];
