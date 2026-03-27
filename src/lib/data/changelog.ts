export type ChangelogEntry = {
	id: string;
	date: string;
	title: string;
	items: string[];
};

export const changelog: ChangelogEntry[] = [
	{
		id: '2026-03-26-calendar-month-picker',
		date: '2026-03-26',
		title: 'Jump Around the Calendar Much Faster',
		items: [
			'You can now click the month name at the top of the calendar to jump straight to a different month instead of hammering the next and previous buttons over and over',
			'The same quick-jump picker also works in the 3-month calendar view, so it is easier to move across the year without losing your place',
			'Keyboard navigation was added too, so the new picker is easier to use without needing to rely on a mouse'
		]
	},
	{
		id: '2026-03-26-calendar-grid-polish',
		date: '2026-03-26',
		title: 'Calendar Grid Scrolling Feels Less Janky',
		items: [
			'Cleaned up the calendar grid so row lines no longer stack on top of each other and create that double-border look',
			'Improved horizontal scrolling so the personnel column is meant to stay anchored while you move across the month, especially on smaller screens',
			'Tightened up the calendar layout under the hood so the header and body stay lined up better while you scroll'
		]
	},
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
	}
];
