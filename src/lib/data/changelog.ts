export type ChangelogEntry = {
	id: string;
	date: string;
	title: string;
	items: string[];
};

export const changelog: ChangelogEntry[] = [
	{
		id: '2026-09-21-duty-rosters-temporarily-offline',
		date: '2026-09-21',
		title: 'Duty Rosters Temporarily Offline',
		items: [
			'Duty Rosters has been temporarily taken offline while bugs are addressed. Its links have been removed from the navigation bar and Calendar’s Planning menu',
			'Calendar and the Assignment Planner remain available'
		]
	},
	{
		id: '2026-06-29-organization-rank-catalogs',
		date: '2026-06-29',
		title: 'Organization Rank Catalogs',
		items: [
			'Organizations can now manage rank catalogs for joint-service ranks instead of being limited to one default rank list',
			'Personnel imports can accept configured Navy ranks and other service-specific rank codes when they are active in the Organization catalog',
			'Duty Roster, Sign-in Roster, and Training rank workflows now use pay-grade-aware ordering so cross-service ranks sort together more predictably'
		]
	},
	{
		id: '2026-05-23-organization-invite-setup-flow',
		date: '2026-05-23',
		title: 'Clearer Organization Invites',
		items: [
			'Organization invites can now start the platform access request for new users, so invitees do not have to figure out that step on their own',
			'Invite emails now explain when an access request has already been submitted on the invitee’s behalf and what happens after approval',
			'Platform admins can see clearer invitation context during access review, including who sent the organization invite',
			'Account access, organization invites, and owner/admin actions now have stronger protections against repeated attempts and may ask for extra identity confirmation when needed'
		]
	},
	{
		id: '2026-05-15-account-settings-and-organization-exit',
		date: '2026-05-15',
		title: 'Account Settings and Organization Exit',
		items: [
			'There is now an Account Settings page for managing account-level options outside of any one organization',
			'Members can leave an organization from the account menu when they no longer need access',
			'Organization owners are protected from accidentally leaving an organization they still own'
		]
	},
	{
		id: '2026-05-13-new-look-and-workflow-refresh',
		date: '2026-05-13',
		title: 'A Fresh Look and Smoother Workflows',
		items: [
			'TroopToTask has a new look, with cleaner screens and more consistent controls across the app',
			'Org Settings has moved to the top-left organization area so it is easier to find alongside organization-level controls',
			'Training and Critical Task reports have been improved so readiness details are easier to scan and act on',
			'The organization dashboard has been refined to make unit-level information clearer at a glance',
			'Personnel rows now open a full Soldier detail page with readiness lanes, notes, counseling records, follow-ups, documents, and archived items in one place',
			'Onboarding has been revamped with a smoother experience for tracking packets, progress, and next steps',
			'Please report any bugs or issues you run into with the feedback button, or use it to share your thoughts on the new look',
			'Several other quality-of-life updates are included throughout the app to make day-to-day work feel more polished'
		]
	},
	{
		id: '2026-05-05-duty-roster-alpha',
		date: '2026-05-05',
		title: 'Duty Rosters Alpha',
		items: [
			'A new Duty Rosters system is now available from Calendar planning, built to better reflect how DA6 duty rosters are handled',
			'This workflow is still under development and in an alpha state, so expect bugs. If you run into bugs or issues, please report them so they can be fixed'
		]
	},
	{
		id: '2026-04-23-access-control-improvements',
		date: '2026-04-23',
		title: 'Clearer Access Controls',
		items: [
			'TroopToTask now has more precise access controls, so leaders can give people access to the tools they need without opening up unrelated areas',
			'Rating Scheme access is now managed on its own, separate from Personnel and Leader’s Book access, making permissions easier to understand and safer to adjust',
			'Navigation and page access now line up more closely with each person’s assigned permissions, so users see fewer dead ends and fewer areas they should not be working in'
		]
	},
	{
		id: '2026-04-15-upcoming-losses',
		date: '2026-04-15',
		title: 'Upcoming Loss Tracking',
		items: [
			'Personnel records now support ETS and PCS / DEROS dates, so upcoming losses can be tracked directly in TroopToTask',
			'People & Duty now includes upcoming losses on the dashboard, making it easier to keep an eye on who is approaching ETS or PCS / DEROS',
			'Personnel approaching a loss date get a small badge next to their name on the personnel page, with an Ack Award button to clear the award reminder once it is being tracked',
			'The goal is simple: catch upcoming losses early and avoid forgetting to start awards before people leave'
		]
	},
	{
		id: '2026-04-12-readiness-dashboard',
		date: '2026-04-12',
		title: 'Readiness Dashboard',
		items: [
			'A new home screen gives you a live readiness picture the moment you log in — no hunting across pages to piece together where your unit stands',
			'Unit Readiness tab shows your strength count and availability percentage for the day, a status breakdown across all absence types, per-group readiness bars, and a 7-day look-ahead of who is coming and going',
			"People & Duty tab puts personnel status and the duty roster side by side: see everyone out today with their reason, today and tomorrow's duty assignments, active onboarding pipelines with completion progress, and upcoming availability changes all in one view",
			'Training & Evals tab surfaces training currency percentage, expiring and expired records by person, a group-by-group delinquency comparison, and your full evaluation pipeline showing overdue and upcoming ratings — color-coded by urgency',
			'Your preferred tab is remembered so the dashboard always opens where you left it'
		]
	},
	{
		id: '2026-04-04-duty-conflict-detection',
		date: '2026-04-04',
		title: 'Safer Assignments with Conflict Detection',
		items: [
			'Manual calendar assignments now warn when someone is already on duty or inside a cooldown window, so schedule conflicts are caught before they happen rather than discovered after the fact'
		]
	}
];
