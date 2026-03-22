export type ChangelogEntry = {
	id: string;
	date: string;
	title: string;
	items: string[];
};

export const changelog: ChangelogEntry[] = [
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
	},
	{
		id: '2026-03-17-training-manage-types-button',
		date: '2026-03-17',
		title: 'Training Types Button is Now Always Visible',
		items: [
			'The "Manage Types" button on the Training page is now permanently visible in the toolbar for admins and editors — no more hunting through the overflow menu or wondering where it went after you added your first training type'
		]
	},
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
			"Pick which template to use when you start someone's onboarding, so the right checklist shows up for the right person",
			"Use the Re-sync button to update someone's in-progress onboarding when the template changes — completed steps are never touched, only incomplete ones get updated",
			'If you remove a step from the template after someone already started, it shows up as deprecated on their checklist so you can review and dismiss it manually'
		]
	}
];
