export type ChangelogEntry = {
	id: string;
	date: string;
	title: string;
	items: string[];
};

export const changelog: ChangelogEntry[] = [
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
	{
		id: '2026-03-09-personnel-archival',
		date: '2026-03-09',
		title: 'Personnel Archival',
		items: [
			'Personnel are now archived instead of permanently deleted — archived records are preserved and can be restored by admins',
			'Admins and owners can view archived personnel, restore them to active status, or permanently delete them from the new Archived Personnel tab in Admin Hub',
			'Export an archived person\'s complete records (training, counseling, goals, availability) as an Excel file before permanent deletion',
			'Configurable retention period in Admin Hub Settings — archived personnel are automatically cleaned up after the retention window (default 36 months)',
			'Archived personnel don\'t count toward your subscription\'s personnel cap'
		]
	},
];
