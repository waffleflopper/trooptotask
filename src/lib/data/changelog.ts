export type ChangelogEntry = {
	id: string;
	date: string;
	title: string;
	items: string[];
};

export const changelog: ChangelogEntry[] = [
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
		id: '2026-03-27-duty-roster-selection',
		date: '2026-03-27',
		title: 'Duty Roster Selection Feels More Like the Rest of Calendar',
		items: [
			'Eligible and exempt personnel now use the same searchable grouped table pattern as the bulk calendar tools, so working through large rosters is much easier than dealing with tiny toggle pills',
			'The duty-roster form was reorganized into clearer planning and selection panels, which makes it easier to review settings and roster scope side by side',
			'Exemptions are now easier to audit and save for each duty type without hunting through one long wall of chips'
		]
	}
];
