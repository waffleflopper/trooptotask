import type { HelpGuide } from '../contracts';

export const fillDutyRoster: HelpGuide = {
	id: 'fill-duty-roster',
	title: 'Fill a duty roster and print the DA 6',
	summary: 'Let the duty planner pick who is next up for each open day and keep the DA 6 for you.',
	area: 'calendar',
	routes: ['calendar', 'calendar/assignments', 'calendar/rosters/[typeId]'],
	keywords: ['da 6', 'da form 6', 'staff duty', 'auto fill', 'rotation', 'count', 'print', 'schedule duty', 'cq'],
	access: { lane: 'calendar', level: 'operate', wholeUnit: true },
	missed: true,
	lead: 'The duty planner fills open days from the duty roster and picks the available Soldier with the highest count. It keeps the counts and builds the DA 6 as you go.',
	steps: [
		{ text: 'Open **Duty planner** under Calendar.', to: 'calendar/assignments' },
		{ text: "Press **Fill** at the top of the duty's column." },
		{ text: 'Set the **Open days** range and check who is **Next up** on each day.' },
		{ text: 'Press the **Fill** button at the bottom. It shows how many days it will fill.' },
		{ text: 'Select **Open the DA 6**, then press **Print DA 6**.' }
	],
	note: 'Fill passes over anyone whose status makes them unavailable that day. A day nobody can take stays open.',
	next: 'make-status-types'
};
