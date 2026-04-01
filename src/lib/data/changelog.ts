export type ChangelogEntry = {
	id: string;
	date: string;
	title: string;
	items: string[];
};

export const changelog: ChangelogEntry[] = [
	{
		id: '2026-04-01-onboarding-workspace-refresh',
		date: '2026-04-01',
		title: 'Onboarding Workflows Are Easier to Scan and Manage',
		items: [
			'The main onboarding workspace, history view, and template library were cleaned up so they feel like one connected system instead of a collection of older admin screens',
			'Starting, reviewing, and managing onboarding packets should now be easier to follow, with clearer progress framing and better-organized action panels',
			'Onboarding reports and template dialogs were refreshed too, so the admin side of getting new people settled in should feel a lot less clunky'
		]
	},
	{
		id: '2026-04-01-calendar-workspace-finish-pass',
		date: '2026-04-01',
		title: 'The Calendar Workspace Looks More Intentional From End to End',
		items: [
			'The main calendar, long-range view, settings pages, and report picker were cleaned up so they feel like parts of the same product instead of a mix of old and new layouts',
			'Bulk status tools and duty-roster lists now use calmer hover states and cleaner status badges, which makes scanning personnel lists a lot less visually weird',
			'Calendar rows were tightened up a bit too, so you can see a little more of the month without the grid feeling squashed'
		]
	},
	{
		id: '2026-04-01-dashboard-entry-refresh',
		date: '2026-04-01',
		title: 'The Dashboard and Sign-In Landing Screens Got a Much Better First Impression',
		items: [
			'The main dashboard was rebuilt with cleaner section framing, clearer summary modules, and a more readable daily snapshot of readiness, tasking, and follow-up items',
			'The organization selection screen after sign-in now does a better job surfacing invitations, available workspaces, and next-step actions without feeling like an older leftover page',
			'Dashboard setup and customization panels were cleaned up too, so getting a new workspace off the ground should feel less like you are rummaging through a supply closet'
		]
	},
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
	}
];
