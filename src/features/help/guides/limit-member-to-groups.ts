import type { HelpGuide } from '../contracts';

export const limitMemberToGroups: HelpGuide = {
	id: 'limit-member-to-groups',
	title: 'Limit a member to their own section',
	summary: 'Let a squad leader or section chief see only the Soldiers in their Groups.',
	area: 'settings',
	routes: ['settings/members'],
	keywords: [
		'scope',
		'restrict',
		'permissions',
		'access',
		'squad leader',
		'team leader',
		'section',
		'only their soldiers',
		'limit access'
	],
	access: { role: 'admin' },
	missed: true,
	lead: 'A member can be limited to certain Groups, so they only see and work on those Soldiers. Picking a Group also gives them the Groups inside it.',
	steps: [
		{ text: 'In Unit settings, open **Members**.', to: 'settings/members' },
		{ text: "Press **Manage** on the member's row." },
		{ text: 'Under **Groups**, pick **Selected**, then pick their Groups in **Choose Groups**.' },
		{ text: 'Check their **Preset**, and adjust **Area by area** if they need more or less in one area.' },
		{ text: 'Press the **Save** button at the bottom of the sheet.' }
	],
	note: 'Pick at least one Group. With none, they can sign in but see no records. Owners and admins always see the whole unit.',
	next: 'invite-members'
};
