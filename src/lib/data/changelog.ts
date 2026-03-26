export type ChangelogEntry = {
	id: string;
	date: string;
	title: string;
	items: string[];
};

export const changelog: ChangelogEntry[] = [
	{
		id: '2026-03-25-assignment-planner-page',
		date: '2026-03-25',
		title: 'Assignment Planning Has Its Own Page Now',
		items: [
			'The monthly assignment planner now opens as a full page instead of being squeezed into a popup',
			'You now get a full month grid with more room to work through manual scheduling decisions without constant scrolling',
			'Assignment changes still feed straight back into the main calendar, so you can plan on one page and verify on the other without any extra cleanup'
		]
	},
	{
		id: '2026-03-25-duty-roster-page',
		date: '2026-03-25',
		title: 'Duty Roster Works Like a Real Page Now',
		items: [
			'The Duty Roster tool now opens as a full page instead of feeling like the same old popup crammed into a new route',
			'Configuration, preview, and history now live in clear page sections, so it is easier to review the roster before applying it',
			'Applying a roster now keeps you on the page and confirms what happened instead of dumping you back to the calendar mid-workflow'
		]
	},
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
	}
];
