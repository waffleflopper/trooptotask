import type { HelpGuide } from '../contracts';

export const inviteMembers: HelpGuide = {
	id: 'invite-members',
	title: 'Invite members and set their access',
	summary: 'Invite one or more people by email and choose what they can see and do.',
	area: 'settings',
	routes: ['settings/members', 'setup/invite'],
	keywords: ['invite', 'add user', 'new user', 'email', 'preset', 'viewer', 'operator', 'editor', 'admin', 'access'],
	access: { role: 'admin' },
	lead: 'Members sign in to TroopToTask to work with the unit. Each invite sets what they can do and which Groups they see.',
	steps: [
		{ text: 'In Unit settings, open **Members**.', to: 'settings/members' },
		{
			text: 'Type or paste their email addresses in the **Invite** box, one per line or separated by commas. You can send up to 50 at once.'
		},
		{
			text: 'Pick a **Preset**. **Viewer** can only look, **Operator** also does the daily work, and **Editor** can also set up each area. The table under the form shows what the preset allows.'
		},
		{ text: 'Leave Groups on **Whole unit**, or pick the Groups they should see.' },
		{
			text: 'Press **Send invite**. Each address shows whether it was invited. Any that were not stay in the box to fix and send again. They accept the invite after signing in.'
		}
	],
	note: 'Only the owner can make someone an Admin.',
	next: 'limit-member-to-groups'
};
