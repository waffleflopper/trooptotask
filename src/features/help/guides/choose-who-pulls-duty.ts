import type { HelpGuide } from '../contracts';

export const chooseWhoPullsDuty: HelpGuide = {
	id: 'choose-who-pulls-duty',
	title: 'Choose who pulls a duty',
	summary: 'Narrow a duty roster by rank, MOS, role or Group, and excuse people for a standing reason.',
	area: 'calendar',
	routes: ['calendar', 'calendar/settings', 'calendar/assignments', 'setup/calendar'],
	keywords: [
		'staff duty',
		'soldiers',
		'add people',
		'eligible',
		'pool',
		'excuse',
		'excusal',
		'rank',
		'mos',
		'rotation'
	],
	access: { lane: 'calendar', level: 'configure', wholeUnit: true },
	missed: true,
	lead: 'Every Person assignment type keeps a duty roster of who can be picked for it. It starts as everyone in the unit, and you narrow it with rules.',
	steps: [
		{ text: 'Open calendar settings and select **Assignment Types**.', to: 'calendar/settings?section=assignments' },
		{ text: "Open the menu at the end of the duty's row and choose **Edit**." },
		{
			text: 'Under **Who pulls this duty**, pick **Only people who match** and add a **Rank**, **MOS**, **Role** or **Group** rule. A Group rule also covers the Groups inside it.'
		},
		{ text: 'Check the count of people on the roster, and press **See list** to see each name.' },
		{ text: 'Press **Excuse someone** to take a person off for a standing reason, such as first sergeant.' },
		{
			text: 'Press **Save Changes**. When the duty already has a DA 6, new rules start a new form the next day and everyone keeps their count.'
		}
	],
	note: "To put someone who is not on the roster on one day, search their name in the duty planner's picker.",
	next: 'fill-duty-roster'
};
