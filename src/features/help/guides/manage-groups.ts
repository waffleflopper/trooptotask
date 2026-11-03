import type { HelpGuide } from '../contracts';

export const manageGroups: HelpGuide = {
	id: 'manage-groups',
	title: 'Set up groups and sub-groups',
	summary: 'Build platoons, sections and squads, and put Soldiers in them.',
	area: 'personnel',
	routes: ['personnel'],
	keywords: ['group', 'platoon', 'section', 'squad', 'team', 'sub-group', 'unassigned', 'organize', 'move soldier'],
	access: { lane: 'personnel', level: 'configure' },
	lead: 'Groups are your platoons, sections and squads, and a Group can hold smaller Groups inside it. Rosters, reports, duty rules and member access all follow them.',
	steps: [
		{ text: 'On the Personnel page, press **Manage Groups**.', to: 'personnel' },
		{ text: 'Type a name in **New group name** and press **Add**.' },
		{ text: 'Use the plus button on a Group to add a sub-group inside it. Drag Groups to put them in order.' },
		{ text: 'Select a Group and use **Add people** to put Soldiers in it.' },
		{ text: 'Press **Done**. Changes save as you go.' }
	],
	note: 'Soldiers with no Group show as Unassigned. A member limited to certain Groups never sees them, so give everyone a Group.',
	next: 'limit-member-to-groups'
};
