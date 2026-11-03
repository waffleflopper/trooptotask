import type { HelpGuide } from '../contracts';

export const openSoldierRecord: HelpGuide = {
	id: 'open-soldier-record',
	title: "Open a Soldier's full record",
	summary: 'See readiness, the log, files and the data sheet for one Soldier, and add to the record.',
	area: 'personnel',
	routes: ['personnel', 'personnel/[personnelSlug]'],
	keywords: ['profile', 'record', 'counseling', 'note', 'follow-up', 'files', 'documents', 'data sheet', 'soldier'],
	access: { lane: 'personnel', level: 'configure' },
	lead: 'Each Soldier has a full record behind their name on the roster. It holds their readiness, a log of what happened, their files and their data sheet.',
	steps: [
		{ text: "Select the Soldier's name on the Personnel roster.", to: 'personnel' },
		{ text: 'Move between **Overview**, **Readiness**, **Log**, **Files** and **Data sheet** with the tabs.' },
		{
			text: 'Press **Add to record** to add a **Follow-up**, **Note**, **Counseling**, **Document** or **Training completion**.'
		},
		{ text: 'Press **Edit** to change their details.' }
	],
	note: 'On a wide screen, clicking a row away from the name opens a quick preview. Press **Open record** there to see everything.',
	next: 'manage-groups'
};
