import type { HelpGuide } from '../contracts';

export const makeStatusTypes: HelpGuide = {
	id: 'make-status-types',
	title: 'Make your own status types',
	summary: 'Add statuses like leave, TDY or appointments and set what each one does to duty rosters.',
	area: 'calendar',
	routes: ['calendar', 'calendar/settings', 'setup/calendar'],
	keywords: ['leave', 'tdy', 'school', 'pass', 'appointment', 'color', 'legend', 'away', 'new status', 'da 6'],
	access: { lane: 'calendar', level: 'configure', wholeUnit: true },
	lead: 'Status types are the reasons someone is out, such as leave, TDY or a medical appointment. Each one also sets what happens to that Soldier on a duty roster.',
	steps: [
		{ text: 'Open calendar settings and select **Status Types**.', to: 'calendar/settings?section=status' },
		{ text: 'Press **Add new**.' },
		{ text: 'Enter a **Name** and a **One-day label** of up to 3 letters, then pick a **Color**.' },
		{ text: 'Under **On duty rosters**, pick **Still available**, **Away**, **Other duty** or **Misconduct**.' },
		{ text: 'Press **Add status type**.' }
	],
	note: "Away holds the Soldier's roster count while they are gone. Other duty and Misconduct let the count keep running.",
	next: 'bulk-statuses'
};
