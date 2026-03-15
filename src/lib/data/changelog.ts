export type ChangelogEntry = {
	id: string;
	date: string;
	title: string;
	items: string[];
};

export const changelog: ChangelogEntry[] = [
	{
		id: '2026-03-15-accessibility-improvements',
		date: '2026-03-15',
		title: 'Accessibility Improvements',
		items: [
			'Improved keyboard navigation throughout the app — you can now tab through all interactive elements and use Escape to close menus and modals',
			'Added a "Skip to main content" link for keyboard and screen reader users',
			'Better color contrast across the board, in both light and dark mode',
			'Screen readers now properly announce notifications, form errors, and loading states',
			'Added support for reduced motion and high contrast display modes'
		]
	},
	{
		id: '2026-03-15-multi-template-onboarding',
		date: '2026-03-15',
		title: 'Multiple Onboarding Templates',
		items: [
			'You can now create multiple onboarding templates — one for officers, one for enlisted, one for civilians, whatever your unit needs',
			'Pick which template to use when you start someone\'s onboarding, so the right checklist shows up for the right person',
			'Use the Re-sync button to update someone\'s in-progress onboarding when the template changes — completed steps are never touched, only incomplete ones get updated',
			'If you remove a step from the template after someone already started, it shows up as deprecated on their checklist so you can review and dismiss it manually'
		]
	},
	{
		id: '2026-03-15-feedback-improvements',
		date: '2026-03-15',
		title: 'Better Feedback Reports',
		items: [
			'Feedback submissions now include which section of the app you were in — so bug reports actually come with useful context instead of just a raw URL'
		]
	},
	{
		id: '2026-03-14-duty-roster-schedule-options',
		date: '2026-03-14',
		title: 'Duty Roster Schedule Options',
		items: [
			'The duty roster generator now lets you exclude weekends, federal holidays, and org closures — no more manually skipping days that nobody works',
			'Uses the same holidays and closures you\'ve already set up in your calendar, so there\'s nothing extra to configure',
			'Roster exports now include a DA Form 6 reference grid showing each person\'s queue position for every duty date — full transparency into why someone was assigned their days'
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
];
