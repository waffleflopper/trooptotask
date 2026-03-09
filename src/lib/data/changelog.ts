export type ChangelogEntry = {
	id: string;
	date: string;
	title: string;
	items: string[];
};

export const changelog: ChangelogEntry[] = [
	{
		id: '2026-03-08-platform-guide',
		date: '2026-03-08',
		title: 'Platform Guide & Permissions',
		items: [
			'New platform guide — the Help page has been completely rewritten with detailed how-to sections for every feature',
			'Role-specific tips throughout the guide show what admins, team leaders, and viewers can each do',
			'Team leaders can now be scoped to a specific group — they see and edit only their group\'s personnel while still viewing the full calendar',
			'New permission presets make it easier to set up members: Admin, Full Editor, Team Leader, Viewer, or Custom',
			'Deletion approvals — non-privileged users can request deletions, and admins approve or deny from the Admin Hub'
		]
	},
	{
		id: '2026-03-08-dashboard-timezone',
		date: '2026-03-08',
		title: 'Dashboard Timezone Fix',
		items: [
			'Fixed an issue where dashboard widgets could show the wrong day for users in timezones behind UTC (like Alaska or Hawaii)',
			'The dashboard now uses your browser\'s local time instead of the server\'s clock'
		]
	},
	{
		id: '2026-03-07-security',
		date: '2026-03-07',
		title: 'Security & Compliance',
		items: [
			'Added security headers and rate limiting across all endpoints',
			'Input validation and sanitization for all user-submitted data',
			'Audit logging for accountability and compliance tracking',
			'New Security page explaining our data protection practices'
		]
	}
];
