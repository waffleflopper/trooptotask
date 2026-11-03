import type { HelpGuide } from '../contracts';

export const showDutyCalendarLane: HelpGuide = {
	id: 'show-duty-calendar-lane',
	title: 'Show a duty as a calendar lane',
	summary: 'Put who has Staff Duty or CQ each day in a row under the dates on the calendar.',
	area: 'calendar',
	routes: ['calendar', 'calendar/settings'],
	keywords: ['lane', 'row', 'staff duty', 'cq', 'show on calendar', 'who has duty', 'assignment'],
	access: { lane: 'calendar', level: 'configure' },
	lead: 'A duty can show as its own lane under the dates, so everyone sees who has it each day. A duty you leave off still gets assigned and reported in the duty planner.',
	steps: [
		{ text: 'Open calendar settings and select **Assignment Types**.', to: 'calendar/settings?section=assignments' },
		{ text: 'Turn on the switch beside the duty so it reads **On calendar**.' },
		{ text: 'Drag the lanes into the order you want.' },
		{ text: 'On the calendar, open **Display** and make sure **Show Assignments** is on.', to: 'calendar' }
	],
	note: 'Everyone who can view the calendar sees these lanes. Show Assignments only hides them for you.',
	next: 'fill-duty-roster'
};
