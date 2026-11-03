import type { HelpGuide } from '../contracts';

export const inviteMembers: HelpGuide = {
	id: 'invite-members',
	title: 'Invite members and set their access',
	summary: 'Send an invite by email and choose what the new member can see and do.',
	area: 'settings',
	routes: ['settings/members', 'setup/invite'],
	keywords: ['invite', 'add user', 'new user', 'email', 'preset', 'viewer', 'operator', 'editor', 'admin', 'access'],
	access: { role: 'admin' },
	lead: 'Members sign in to TroopToTask to work with the unit. Each invite sets what they can do and which Groups they see.',
	steps: [
		{ text: 'In Unit settings, open **Members**.', to: 'settings/members' },
		{ text: 'Type their email address in the **Invite** field.' },
		{
			text: 'Pick a **Preset**. **Viewer** can only look, **Operator** also does the daily work, and **Editor** can also manage each area.'
		},
		{ text: 'Leave Groups on **Whole unit**, or pick the Groups they should see.' },
		{ text: 'Press **Send invite**. They accept it after signing in.' }
	],
	note: 'Only the owner can make someone an Admin.',
	next: 'limit-member-to-groups'
};
