export type ChangelogEntry = {
	id: string;
	date: string;
	title: string;
	items: string[];
};

export const changelog: ChangelogEntry[] = [
	{
		id: '2026-03-24-training-reports',
		date: '2026-03-24',
		title: 'Training Reports & Optional Training Types',
		items: [
			'Added a brand new Training Reports page — see overall readiness percentages, status breakdowns, worst-performing training types, and group comparisons all in one place',
			"Training types can now be marked as \"optional\" — optional types won't count against your unit's readiness score, so things like nice-to-have certifications won't drag down your numbers",
			'You can now save custom column views in the training matrix — set up different views for different purposes and switch between them without reconfiguring every time',
			"Training matrix columns are now sortable by clicking the header — quickly find who's expired or expiring soon"
		]
	},
	{
		id: '2026-03-23-onboarding-improvements',
		date: '2026-03-23',
		title: 'Onboarding Report & Step Improvements',
		items: [
			'Fixed a bug where training steps showed as incomplete in the Onboarding Report even when they were actually done — the report now correctly reflects training completion status',
			'The Onboarding Report can now be filtered by template, so you can focus on just the in-processing checklist for medics, officers, or whatever templates you have set up',
			'Training steps now show the associated training type name in parentheses when it differs from the step name — so if your "NREMT" onboarding step is tied to the "Credentials/License" training column, you can see both at a glance'
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
	},
	{
		id: '2026-03-17-training-manage-types-button',
		date: '2026-03-17',
		title: 'Training Types Button is Now Always Visible',
		items: [
			'The "Manage Types" button on the Training page is now permanently visible in the toolbar for admins and editors — no more hunting through the overflow menu or wondering where it went after you added your first training type'
		]
	}
];
