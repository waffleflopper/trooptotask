import type { latestChangelogId } from './latestChangelog';

export type ChangelogEntry = {
	id: string;
	date: string;
	title: string;
	items: string[];
};

export const changelog: [ChangelogEntry & { id: typeof latestChangelogId }, ...ChangelogEntry[]] = [
	{
		id: '2026-10-24-faster-pages',
		date: '2026-10-24',
		title: 'Faster Pages on Slow Connections',
		items: [
			'Choosing a notification opens it right away instead of waiting for it to be marked read. If marking it read fails, a message asks you to reopen the bell and try again.',
			'A broad search in By Group shows the first 250 matches, so the roster keeps up while you type. Keep typing to narrow it, collapse a Group to see more of the Groups below, or choose Use A-Z View to page through everyone.'
		]
	},
	{
		id: '2026-10-24-personnel-roster',
		date: '2026-10-24',
		title: 'See Who Needs You From the Personnel Roster',
		items: [
			'Each row on Personnel now shows today’s status as a colored dot and the person’s most urgent Needs attention item, like CPR/BLS expired or 1 follow-up overdue. The strip by the title counts who is present and who is away today.',
			'Log a quick note or follow-up without leaving the roster: press N or the note button on a row. Press E or the pencil to fix rank, name, MOS, duty role, Group or loss dates in place.',
			'By Group puts your pinned Groups first, then the order you set. Each Group header shows how many are present and how many need attention. Manage groups now opens one editor to add, rename, reorder and delete Groups and to move people between them.',
			'Check the box on several people, or press X on their rows, to act on all of them at once: a follow-up for each, the same note, a move to another Group, an export or an archive. A Group’s menu adds a note for everyone in it.',
			'Show only chips filter the roster to expired or missing training, items expiring within 30 days, overdue follow-ups, people not present, ETS or PCS within 90 days, and counseling due. The counts by the title filter too: choose present, or a status like Leave, to see just those people. The address keeps the filter, so a link you share opens the same filtered roster.',
			'On a wide screen, clicking a row or pressing Space opens a preview beside the roster with the person’s next 7 days, what needs attention, open follow-ups and the latest note. Add a note or follow-up or quick edit from it, press J and K to move through the people the roster shows, so a filter keeps you on the people it matches, and Esc or Space to close it. The name still opens the full record.',
			'There’s a new Account settings page, and an account menu at the bottom left of the sidebar.'
		]
	},
	{
		id: '2026-10-23-critical-tasks-defaults',
		date: '2026-10-23',
		title: 'Critical Tasks Defaults Moved to the Toolbar',
		items: [
			'The default expiration and expiring-soon window for Critical Tasks no longer sit below the Task Library. Choose Defaults on the Task Library toolbar to change them. On a narrow screen, Defaults is under More.',
			'Who can change them has not changed: anyone who can manage the Critical Tasks library.'
		]
	},
	{
		id: '2026-10-23-duty-swaps',
		date: '2026-10-23',
		title: 'Swap Duty Days on a Roster',
		items: [
			'Two people traded duty days? In the Duty planner, open a filled day, choose Swap with… and pick the day they traded for. The preview shows both days with the person who will stand each and any leave or other-duty warning, and nothing is saved until you press Swap days.',
			'A swap keeps the numbers as published. Each person is still counted for the day they were detailed, so every number on the DA 6 and in the next rotation is the same as before. Only who stands the duty changes, and the DA 6 gets a numbered remark naming the two days.',
			'Swapped days carry a small exchange mark in the planner that says who held the day. Undo swap on either day puts both people back, until one of the days has passed.',
			'Reassigning or clearing either swapped day ends the swap, and both days then count for whoever holds them. The duty picker, Clear month, Quick fill and Find replacement warn you before they do.',
			'If something looks off or you have an idea for duty swaps, use Feedback in the upper right to let me know.'
		]
	},
	{
		id: '2026-10-23-operators-add-people',
		date: '2026-10-23',
		title: 'Operators Can Add People',
		items: [
			'Members who can operate Personnel can now add people in the groups they work with. Add Person on the Personnel page and in Start Onboarding both work for them, the same way Import already did.',
			'Archiving, restoring and managing groups still need Personnel configure access.'
		]
	},
	{
		id: '2026-10-22-duty-rosters',
		date: '2026-10-22',
		title: 'Duty Rosters Are Back',
		items: [
			'Every duty you assign to a person now keeps a duty roster the way AR 220-45 and DA PAM 220-45 describe. Each person has a number: how many of that duty have been pulled since their last turn. The highest number goes next. Ties go to the higher rank, then alphabetically by last name.',
			'In the Duty planner, Fill from roster fills the open days you choose. The preview shows who pulls each day and their number, who was skipped and why, and who is back from leave or TDY. Nothing is saved until you fill. One person instead still puts one person on many days.',
			'The duty picker lists people by their number, highest first. Search still finds people who are not on that roster and marks them, so you can assign them in a pinch. People excused from the roster stay out.',
			'Find replacement on a conflict offers the next person up, shows who cannot pull that day and why, and lists any later planned days the change re-picks. Days you assigned by hand stay put.',
			'Each duty assigned to people has a Duty roster section in Calendar settings. Choose who pulls the duty (everyone, or only people who match a rank range, MOS, role or group), excuse someone with a reason, and choose whether weekends and holidays share the count, keep a separate count, or have no duty. Changing the rules for who pulls it, or how weekends count, starts a new DA 6, and the old one is kept exactly as it was. Excusing or reinstating one person does not.',
			'Each status type now says what it does on a duty roster: still available, away with the count held (A), on other duty with the count running (D), or misconduct with the count running (U). Before you change one, you see every number it moves.',
			'The DA 6 page shows the form for each roster and month, with A, D and U codes, numbered remarks and a worked example of how a day was picked. Print DA 6 prints it on landscape pages.',
			'Moving over from a paper DA 6? Copy your last numbers into the first column of the form, or the first weekday and first weekend column when weekends keep a separate count. You can change them until the first duty on the roster is pulled; after that they are part of the record.',
			'Entering duty for a day before a roster’s DA 6 starts? The duty picker says whether it counts before you save. On a new roster the DA 6 moves back to that day and counts it. On a roster already running, the day is not counted.',
			'On the Dashboard, Fill duty days now suggests the same people as Fill from roster.',
			'If something looks off or you have an idea for duty rosters, use Feedback in the upper right to let me know.'
		]
	},
	{
		id: '2026-10-22-roster-import',
		date: '2026-10-22',
		title: 'Import a Roster From Any Spreadsheet',
		items: [
			'Personnel › Import has a new design. One file now adds new people and updates the ones already on your roster, so there is no separate backfill.',
			'Drop in an .xlsx, .csv or .tsv file. The import reads every tab with the same columns and skips title and banner rows above the header. You can move the header row or turn a tab off. Choose what each column holds, mark a column Don’t import, or read one Name column as Last, First.',
			'Review shows every row as New, Update, Unchanged or Needs a fix. Updates show the old value under the new one, and a blank cell never clears a saved value. One line counts the rows that already match.',
			'Fix a bad date or name right in its cell. Questions that repeat, like a rank written as Sgt. or a group name that does not match, are asked once in the fix rail and apply to every row. If you can manage groups, you can create a missing group right there.',
			'When two people share a name, you choose which one the row means or add it as a new person.',
			'After the import, a receipt shows what was added and updated. Rows that were not imported can be downloaded with a Reason column, fixed and imported again.',
			'Calendar › Bulk Status › Import CSV uses the same import. Each row puts one person on a status from one date to another, with an optional note. A status that is not on your list, like TDY - NTC, is asked once for every row that uses it. If you can configure status types, you can create the missing one right there.',
			'A status already on the calendar shows as Unchanged, so importing the same file again adds nothing. When rows overlap saved statuses, you choose once for the file: skip those rows, keep both, or replace the saved statuses. Review lists what each replace removes.',
			'If something looks off or you have an idea for importing, use Feedback in the upper right to let me know.'
		]
	},
	{
		id: '2026-10-22-critical-tasks-import',
		date: '2026-10-22',
		title: 'Import Critical Tasks and Completions',
		items: [
			'Task Library › Import and Critical Tasks › Import Completions now open their own pages and work like the roster import. Drop in a file, check the columns, review every row, then import.',
			'Tasks match on task code. A code already in the library shows as an Update with the old value under the new one, and an archived code is restored to the active library. Matching tasks show as Unchanged.',
			'Completions match each person by name, and you choose who a row means when two people share one. Each task code is matched once for the whole file, and an unknown code is asked once in the fix rail. The import never creates tasks.',
			'A completion already saved for that person, task and date shows as Unchanged or as an Update to its method, validator or notes. A blank cell never clears a saved value.'
		]
	},
	{
		id: '2026-10-22-training-import',
		date: '2026-10-22',
		title: 'Import Training From Your Tracker',
		items: [
			'Training › Import now opens its own page and works like the roster import. Drop in a file, check the columns, review every row, then import.',
			'Use one row per completion, or the tracker you already keep with one column per training. Each column is matched to a training type by name, and you pick the type for any column the app does not recognize.',
			'A date in a cell records a completion. For cells marked X or yes, the import asks once per training for the date instead of using today. Exempt or N/A marks the person exempt, and blank cells are left alone.',
			'A completion already saved with the same date shows as Unchanged. A different date shows as an Update with the old date under the new one.',
			'Anyone who can record training can now import it. Marking someone exempt still needs permission to manage training requirements.'
		]
	},
	{
		id: '2026-10-22-training-export-colors',
		date: '2026-10-22',
		title: 'Colors in the Training Export',
		items: [
			'Export Excel on the Training page now colors each training cell the way the matrix does: green for current, yellow and orange for expiring soon, red for expired, gray for missing and blue for exempt.',
			'The colors show each status on the day you export. A note at the top of the sheet gives that date and explains that the colors are fixed. They do not change as time passes or when you edit a date in the file.',
			'If something looks off or you have an idea for the export, use Feedback in the upper right to let me know.'
		]
	},
	{
		id: '2026-10-22-new-dashboard',
		date: '2026-10-22',
		title: 'A New Dashboard',
		items: [
			'The Dashboard has a new design. It answers three questions as soon as you open it: who is here, what needs you, and what is coming.',
			'Bottom line shows how many people are available today, who is out and when they are back. The line under it says how many are available tomorrow and who leaves or returns.',
			'Next to it, a 14-day forecast shows how many people are available each day against the strength floor you set in Settings › Features. Duty days under the floor are amber. The headline sums it up: under the floor today and when you are back above it, the days ahead that dip under it, steady across the two weeks, or the range you stay in and your lowest day.',
			'Under the forecast, each group shows how many of its people are available, lowest first. A group under the floor is amber.',
			'Needs you is one list, most urgent first: overdue evaluations, expired training, unfilled duty days, stalled onboarding and people leaving without an award started.',
			'Most of those rows can be handled right on the Dashboard, and the row clears once you are done. Update status on an evaluation, Record class for several people at once, Fill duty days with suggested people who have gone longest without the duty, or mark an Award started. Check off opens that person’s onboarding packet.',
			'On duty shows who has each duty tonight and tomorrow, and who leaves or comes back over the next seven days.',
			'The readiness row along the bottom covers Training, Critical tasks, Evaluations, and Arriving and leaving, each with a link to its page.',
			'Quick add beside the date lets you add a status, a training record or start onboarding without leaving the Dashboard.',
			'Features your unit has turned off disappear from the Dashboard. When a feature is on but not set up yet, owners and admins see a short hint with a link to finish setting it up.',
			'If something looks off or you have an idea for the Dashboard, use Feedback in the upper right to let me know.'
		]
	},
	{
		id: '2026-10-21-unit-settings',
		date: '2026-10-21',
		title: 'Unit Settings, Redone',
		items: [
			'Unit settings has a new design. A grouped list on the left replaces the row of tabs, with Unit, Access and Records sections and Danger zone at the bottom. Members and Approvals show how many items are waiting.',
			'A new Features page lets owners and admins turn Training, Critical tasks, Evaluations, Onboarding, or Losses and awards off for the whole unit. A feature that is off is hidden for everyone. Its records are kept, and turning it back on restores everything.',
			'Features also holds the strength floor, 80% by default. Groups with fewer people available than the floor turn amber on the Dashboard.',
			'Policies explains each number as you type. Change the loss warning window and it shows how many people would be flagged today. Change archive retention and it shows the date of the next deletion.',
			'On General, rename the unit in place and use Undo if you change your mind. The web address shows the full link and warns you before a change breaks saved bookmarks.',
			'Ranks shows how many ranks each branch is missing and adds them in one click. Click a custom rank to edit it right under its row. An In use column shows whether anyone holds a rank.',
			'On Members, invite someone in one line with their email, role, preset and groups. Manage access shows every area with None, View, Update or Manage, and marks where a member differs from their preset.',
			'On Approvals, Deny opens a reason field right under the request.',
			'Archives shows how long until each archived person is deleted. Deletions due within 30 days are amber.',
			'Exports shows how many people and training records the export includes.',
			'Logs groups entries by day and reads each one as a sentence. Quick filters narrow the list to access changes, records or deletions.',
			'Danger zone lists what deleting the unit removes: its people, training records and archived records, and the members who lose access. You type the unit name to confirm.',
			'If something looks off or you have an idea for Unit settings, use Feedback in the upper right to let me know.'
		]
	},
	{
		id: '2026-10-19-new-personnel-details',
		date: '2026-10-19',
		title: 'A New Personnel Details Page',
		items: [
			'Each person’s page has a new design. Their name, rank, MOS, time in service, time in grade and today’s availability sit at the top of every tab. The page is split into Overview, Readiness, Log, Files, Data sheet and Archived.',
			'Overview shows the person’s next 14 days from the Calendar. Below it, Needs attention lists expired, missing and expiring training and critical tasks, upcoming evaluations and an approaching ETS, most urgent first. Open follow-ups can be checked off in one click, and contact info, the rating chain, the last counseling and the latest note sit on the right.',
			'Readiness lists every training requirement and critical task, with problems at the top. Click a row to log a completion, attach a PDF or photo certificate, correct an earlier completion or mark it exempt. The new expiration date is worked out for you and shown before you save, and earlier completions are now kept as history.',
			'Log holds follow-ups and leader notes. Add a follow-up in one line, click a title or note to edit it in place, and archive it from the same spot.',
			'Files shows how many of the last 12 months have a counseling on record and which months are missing. Drop a PDF or photo on the page and choose Counseling or Document. Counselings now record who conducted them.',
			'Data sheet replaces the old basic info form and Soldier Data Sheet with one page. Click Edit to change any field in place. Changed fields are marked, and a change like a new ETS tells you what will happen before you save.',
			'Add to record in the header takes you straight to adding a follow-up, note, counseling, document or training completion. Archived items have their own tab, where you can filter, restore or delete them.',
			'If something looks off or you have an idea for this page, use Feedback in the upper right to let me know.'
		]
	},
	{
		id: '2026-10-17-new-calendar',
		date: '2026-10-17',
		title: 'A New Calendar',
		items: [
			'The Calendar has a new design that is easier to read at a glance and quicker to update.',
			'Leave, appointments and other statuses now show as one bar across their dates instead of a color in every box. A one-day bar shows a short label like APT, and longer bars show the status name and the note. When two entries overlap, both stay visible. The 3-Month view shows the same bars with a label and length, like LEAVE · 9D.',
			'Drag across a person’s days to add a status, then pick it from the list or press its number key. Click a bar to see its dates and note, edit it or remove it, and drag either end to change its dates.',
			'Duties now show in lanes right under the dates, and you can put as many duty types on the calendar as you need. Click + on an open day to assign someone. People who have gone longest without that duty are listed first, anyone unavailable that day is dimmed with their status, and people exempt from the duty are left out.',
			'A Days lane under the duties shows federal holidays and unit closures by name.',
			'The month, Today and the Month / 3-Month switch now sit beside the title, along with how many people are available today. Duty planner, Reports and Bulk Status are one click away, and display options, settings and exports have their own menus.',
			'The Duty planner shows the whole month with a column for each duty type. It flags anyone assigned on a day they are unavailable and lists every conflict with a Find replacement button. Quick fill can fill only the open days. A Fairness panel shows who has gone longest without each duty and how many duties each person pulled in the last 90 days, so it is easier to spread duties evenly.',
			'Bulk Status shows each person’s existing entries while you choose who to add, skips people already on that status and points out overlaps. Removing more than 500 entries at once now works.',
			'In Calendar settings, choose which duty types appear on the calendar and in what order, and mark people exempt from a duty. Give each status a short one-day label and drag statuses into the order you want. Add a closure over a range of dates in one step, with weekends skipped by default.',
			'If something looks off or you have an idea for the Calendar, use Feedback in the upper right to let me know.'
		]
	},
	{
		id: '2026-10-13-onboarding-glow-up',
		date: '2026-10-13',
		title: 'Onboarding Got a Glow Up',
		items: [
			'The Onboarding page now shows everyone in processing as a simple list, with the people who are stuck at the top. Each person shows what they are waiting on, how far along they are, and what day of onboarding they are on.',
			'A summary at the top shows how many people are waiting on each step, so you can spot bottlenecks at a glance. Paperwork that has sat on the same stage for 7 days or more is highlighted.',
			'Click a person to see their open steps first, update a stage, check off a step, or add a note. Notes now show who wrote them and when.',
			'Switch to Matrix to see everyone and every step in one grid, one grid per template. Click any box to update that step or add a note without leaving the grid.',
			'History is now an easy-to-read table of finished and cancelled onboardings. Search or filter by outcome, group, or template, see how long each one took, and open a row to see every step and note. It also tells you how long records are kept.',
			'Templates are easier to edit. Drag steps into a new order, edit steps right where they are, and update everyone already in processing to match your changes with one click.',
			'Everything works on phones too.'
		]
	},
	{
		id: '2026-10-05-training-reports-and-matrix-export',
		date: '2026-10-05',
		title: 'Training Reports and Excel Export',
		items: [
			'Open Reports from Training to see readiness today and forecast training dropoffs over the next 30, 60, 90, or 180 days if no one renews.',
			'Find the groups and training types at risk, see which Soldiers need training, and use the focus areas to plan renewals before readiness falls.',
			'Filter the briefing for your roster, export it to Excel, or use Print brief to share it with your leaders.',
			'The main Training page now has Export Excel for a simple spreadsheet with one person per row and every training type as a column. It keeps your Group filter and includes saved dates, exemptions, missing training, and not-required labels.'
		]
	},
	{
		id: '2026-09-26-foundation-and-fixes',
		date: '2026-09-26',
		title: 'Preparing for Future Improvements',
		items: [
			'Much of this update happened behind the scenes. We reorganized parts of the app and strengthened how existing features handle data to prepare for future improvements.',
			'This work also fixed bugs and closed gaps found while checking existing workflows.',
			'If something is not working as expected, use Feedback in the upper right to tell me what happened so I can investigate and fix it quickly.'
		]
	},
	{
		id: '2026-09-22-duty-rosters-return-planned',
		date: '2026-09-22',
		title: 'Duty Rosters Will Return',
		items: [
			'The current Duty Rosters generation and history screens have been removed. Duty Rosters will return in a future update.',
			'Saved Calendar assignments, the Assignment Planner, and independent Sign-In Rosters remain available.',
			'Use Feedback to share what worked or what you need for scheduling.'
		]
	},
	{
		id: '2026-09-21-duty-rosters-rebuild',
		date: '2026-09-21',
		title: 'Duty Rosters Taken Offline',
		items: [
			'Duty Rosters was taken offline while bugs were reviewed. A rebuild was planned at the time; the feature has since been removed.',
			'Calendar and the Assignment Planner remained available.'
		]
	},
	{
		id: '2026-06-29-organization-rank-catalogs',
		date: '2026-06-29',
		title: 'Organization Rank Catalogs',
		items: [
			'Organizations can now manage rank catalogs for joint-service ranks instead of being limited to one default rank list',
			'Personnel imports can accept configured Navy ranks and other service-specific rank codes when they are active in the Organization catalog',
			'At release, Duty Roster, Sign-In Roster, and Training rank workflows used pay-grade-aware ordering so cross-service ranks sorted together. Duty Rosters has since been removed.'
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
			'Duty Rosters Alpha launched in May 2026 as an early DA6 scheduling workflow. The feature has since been removed; saved Calendar assignments remain.'
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
			'At release, People & Duty showed upcoming losses on the dashboard. The current dashboard still shows upcoming losses.',
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
			'At launch, People & Duty showed personnel status and Duty Roster assignments. Duty Rosters has since been removed; the dashboard still shows retained Calendar assignments and availability.',
			'Training & Evals tab surfaces training currency percentage, expiring and expired records by person, a group-by-group delinquency comparison, and your full evaluation pipeline showing overdue and upcoming ratings — color-coded by urgency',
			'Your preferred tab is remembered so the dashboard always opens where you left it'
		]
	},
	{
		id: '2026-04-04-duty-conflict-detection',
		date: '2026-04-04',
		title: 'Safer Assignments with Conflict Detection',
		items: [
			'Manual Calendar assignments once warned about Duty Roster conflicts and cooldown windows. That integration has since been removed; ordinary assignment saving remains.'
		]
	}
];
