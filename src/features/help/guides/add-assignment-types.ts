import type { HelpGuide } from '../contracts';

export const addAssignmentTypes: HelpGuide = {
	id: 'add-assignment-types',
	title: 'Add your own assignment types',
	summary: 'Create duties like Staff Duty, CQ or a detail and fill them in the duty planner.',
	area: 'calendar',
	routes: ['calendar', 'calendar/settings', 'calendar/assignments', 'setup/calendar'],
	keywords: ['staff duty', 'soldiers', 'duty', 'add people', 'cq', 'charge of quarters', 'detail', 'new duty', 'sd'],
	access: { lane: 'calendar', level: 'configure', wholeUnit: true },
	missed: true,
	lead: 'Assignment types are the daily duties your unit fills, such as Staff Duty, CQ or a range detail. Staff Duty is one of them, and you can add as many more as you need.',
	steps: [
		{ text: 'Open calendar settings and select **Assignment Types**.', to: 'calendar/settings?section=assignments' },
		{ text: 'Press **Add new**.' },
		{ text: 'Enter a **Full name** and a **Short code** of up to 5 letters, and pick a **Color**.' },
		{
			text: 'Under **Assigned to**, pick **Person** for a duty one Soldier pulls, or **Group** for a duty a whole Group covers.'
		},
		{ text: 'Set **Who pulls this duty** to choose which Soldiers can be picked, then press **Add Assignment Type**.' }
	],
	note: 'A Group assignment has no duty roster or DA 6. Pick Person when you want rotation counts.',
	next: 'choose-who-pulls-duty'
};
