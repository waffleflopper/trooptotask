export type ChangelogEntry = {
	id: string;
	date: string;
	title: string;
	items: string[];
};

export const changelog: ChangelogEntry[] = [
	{
		id: '2026-03-14-duty-roster-schedule-options',
		date: '2026-03-14',
		title: 'Duty Roster Schedule Options',
		items: [
			'The duty roster generator now lets you exclude weekends, federal holidays, and org closures — no more manually skipping days that nobody works',
			'Uses the same holidays and closures you\'ve already set up in your calendar, so there\'s nothing extra to configure'
		]
	},
	{
		id: '2026-03-13-bulk-status-import',
		date: '2026-03-13',
		title: 'Import Statuses from Spreadsheets',
		items: [
			'You can now import status data from CSV or Excel files directly into the calendar — great for bringing over historic data you\'ve been tracking elsewhere',
			'The importer will help you match up status names if they don\'t exactly line up with your organization\'s status types',
			'Supports column auto-detection so your spreadsheet doesn\'t have to be in any particular order'
		]
	},
	{
		id: '2026-03-12-production-polish',
		date: '2026-03-12',
		title: 'Production Polish',
		items: [
			'Added a Getting Started checklist to help new organizations set up quickly',
			'Improved error pages so you see a friendly message instead of a blank screen when something goes wrong',
			'Added helpful descriptions to each permission setting so you know exactly what you\'re granting',
			'The site now works properly on phones and tablets — tables scroll horizontally and toolbar buttons no longer disappear on small screens',
			'Bulk import error messages now tell you what the valid values are instead of just saying something is wrong',
			'Various stability and accessibility improvements under the hood'
		]
	},
	{
		id: '2026-03-11-sign-in-rosters',
		date: '2026-03-11',
		title: 'Sign-In Rosters',
		items: [
			'You can now generate printable sign-in rosters for training events right from the Training page',
			'Filter by rank and group, sort alphabetically or by rank, and optionally separate sections by group',
			'Every roster you generate is saved automatically so you can re-print it later',
			'Upload the signed copy afterward so you always have proof of attendance on file'
		]
	},
	{
		id: '2026-03-11-onboarding-highlight-and-performance',
		date: '2026-03-11',
		title: 'Onboarding Highlighting & Performance',
		items: [
			'Calendar cells for onboarding personnel now show a subtle brass tint when they have no status — makes it easy to tell at a glance who is still in their 1:1 onboarding period vs. fully available',
			'New "Onboarding" toggle in the calendar toolbar lets you turn the highlighting on or off (your preference is remembered)',
			'Faster page navigation — layout queries are now parallelized and onboarding data loads in fewer round-trips',
			'Added a progress bar at the top of the page during navigation so the app never feels frozen'
		]
	},
];
