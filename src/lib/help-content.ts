export interface HelpTopic {
	title: string;
	content: string;
}

export const helpContent: Record<string, HelpTopic> = {
	'dashboard': {
		title: 'Dashboard',
		content: `
			<p>The dashboard is your real-time command center, showing organization strength, assignments, training status, and upcoming changes at a glance.</p>

			<h4>Today's Strength</h4>
			<p>Shows how many personnel are available vs. total, with a color-coded strength bar (green 80%+, orange 60-79%, red below 60%). Status chips break down who is out and why.</p>

			<h4>Duty Assignments</h4>
			<p>Lists today's duty assignments (MOD, Front Desk, etc.) and who is assigned. Click through to the Calendar to make changes.</p>

			<h4>Training Status</h4>
			<p>Highlights expired and expiring certifications across the unit. Shows the top 5 personnel needing attention so you can prioritize follow-ups.</p>

			<h4>Upcoming Changes</h4>
			<p>Shows who is departing or returning over the next 7 days so you can plan ahead for staffing changes.</p>

			<h4>Group Breakdown</h4>
			<p>A table showing each group's total, present, and status counts. Pinned groups appear at the top for quick reference.</p>
		`
	},
	'calendar': {
		title: 'Calendar',
		content: `
			<p>The calendar displays your unit's monthly schedule as a grid. Each row is a person (grouped by section), and each column is a date. Colored cells indicate statuses, and small badges show duty assignments.</p>

			<h4>Setting Statuses</h4>
			<p><strong>Click any cell</strong> to open the status modal for that person and date. Select a status type (Leave, TDY, Appointment, etc.), set start and end dates, and save. Multiple statuses can overlap — the cell will show a diagonal stripe pattern.</p>

			<h4>Daily Assignments</h4>
			<p><strong>Click a date header</strong> to assign personnel to duties for that day (MOD, Front Desk, etc.). Use the <strong>Assignments</strong> button in the toolbar to plan an entire month at once.</p>

			<h4>Toolbar Actions</h4>
			<ul>
				<li><strong>Today's Breakdown</strong> — summary of who's available, who's out, and today's assignments</li>
				<li><strong>Assignments</strong> — monthly assignment planner for bulk duty scheduling</li>
				<li><strong>3-Month View</strong> — long-range view with export and print options</li>
			</ul>

			<h4>More Tools (overflow menu)</h4>
			<ul>
				<li><strong>Bulk Status</strong> — apply the same status to multiple people at once</li>
				<li><strong>Duty Roster Generator</strong> — auto-generate duty assignments with filters and rules (Pro feature)</li>
				<li><strong>Export to Excel / Print</strong> — download or print the current month</li>
				<li><strong>Show Status Text</strong> — toggle status names on cells</li>
				<li><strong>Status Types / Assignment Types / Holidays</strong> — configure your organization's options</li>
			</ul>

			<h4>Tips</h4>
			<ul>
				<li>Pin frequently-used groups to the top by clicking the pin icon on a group header</li>
				<li>Collapse groups you don't need to see by clicking the arrow on the group header</li>
				<li>A small gold dot on a person's name means they have an active onboarding checklist</li>
			</ul>
		`
	},
	'personnel': {
		title: 'Personnel',
		content: `
			<p>Manage your unit's roster. Add, edit, and organize personnel by group, rank, MOS, and clinic role.</p>

			<h4>Adding Personnel</h4>
			<p>Click <strong>Add Person</strong> to create a new entry. Fill in rank, name, MOS, clinic role, and assign them to a group. You can also use <strong>Bulk Import</strong> (Pro feature) to paste CSV data for multiple people at once.</p>

			<h4>Editing & Deleting</h4>
			<p>Click any person's card to edit their details or remove them. Changes take effect immediately across the calendar, training, and leader's book.</p>

			<h4>Views</h4>
			<ul>
				<li><strong>A-Z</strong> — all personnel sorted alphabetically</li>
				<li><strong>By Group</strong> — personnel organized into collapsible group sections</li>
			</ul>
			<p>Use the search bar to filter by name, rank, or role.</p>

			<h4>Groups</h4>
			<p>Open <strong>Manage Groups</strong> from the overflow menu to create, rename, or remove groups. Groups are used throughout the app to organize the calendar, reports, and leader's book.</p>
		`
	},
	'training-records': {
		title: 'Training & Certifications',
		content: `
			<p>Track every training requirement and certification across your unit in a color-coded matrix. Rows are personnel, columns are training types.</p>

			<h4>Status Colors</h4>
			<ul>
				<li><strong style="color:#22c55e;">Green (Current)</strong> — training is up to date</li>
				<li><strong style="color:#eab308;">Yellow (Expiring 60d)</strong> — expires within 60 days</li>
				<li><strong style="color:#f97316;">Orange (Expiring 30d)</strong> — expires within 30 days</li>
				<li><strong style="color:#ef4444;">Red (Expired)</strong> — past expiration date</li>
				<li><strong style="color:#6b7280;">Gray (Not Done)</strong> — no record on file</li>
			</ul>

			<h4>Recording Training</h4>
			<p><strong>Click a cell</strong> to record or update a single training entry. <strong>Click a person's name</strong> to see all their trainings at once with quick-action buttons ("Today" for one-click completion, "Mark All Completed Today" for bulk entry).</p>

			<h4>Training Type Modes</h4>
			<ul>
				<li><strong>Normal</strong> — enter completion date, expiration auto-calculates (e.g., CPR every 12 months)</li>
				<li><strong>Never Expires</strong> — mark complete once, stays current forever (e.g., diplomas)</li>
				<li><strong>Expiration Date Only</strong> — enter the license/cert expiration directly (e.g., driver's license)</li>
			</ul>

			<h4>Exemptions</h4>
			<p>Some training types allow exemptions. When a person is exempted, they show as "Exempt" and won't appear in delinquency reports.</p>

			<h4>Tools</h4>
			<ul>
				<li><strong>Reports</strong> — filter by group, role, or status, then export to Excel</li>
				<li><strong>Manage Types</strong> — create training types with expiration periods, warning thresholds, and role requirements</li>
				<li><strong>Reorder Columns</strong> — drag training types to prioritize what you see first</li>
				<li><strong>Bulk Import</strong> — paste or upload CSV/Excel data to import many records at once</li>
			</ul>
		`
	},
	'leaders-book': {
		title: "Leader's Book",
		content: `
			<p>A consolidated view of each soldier's key information — counseling records, development goals, extended personal info, current status, and training.</p>

			<h4>Getting Started</h4>
			<p>Click any person's card to open their full detail view. The card shows indicators for info completeness, counseling count, and goal count so you can quickly see who needs attention.</p>

			<h4>Soldier Detail View</h4>
			<p>The detail view has five sections:</p>
			<ul>
				<li><strong>Information</strong> — emergency contact, spouse, vehicle, home address, and leader notes</li>
				<li><strong>Status</strong> — current status and upcoming statuses for the next 3 months</li>
				<li><strong>Training</strong> — all training types with completion and expiration dates</li>
				<li><strong>Counselings</strong> — chronological counseling records with type, date, subject, and signature tracking</li>
				<li><strong>Goals</strong> — development goals organized by category (Career, Education, Physical, Personal)</li>
			</ul>

			<h4>Counseling Records</h4>
			<p>Click <strong>+ New</strong> to add a counseling record. Select a counseling type (Initial, Monthly, Quarterly, Event, or Freeform), enter the date, subject, and notes. You can attach a PDF document and track counselor/soldier signatures.</p>
			<p>Counseling types are managed from the overflow menu — you can customize names, colors, recurrence schedules, and even add template content.</p>

			<h4>Development Goals</h4>
			<p>Track career, education, physical, and personal goals for each soldier. Set priority (Low/Medium/High), status (Not Started/In Progress/Completed/On Hold), target dates, and progress notes.</p>
		`
	},
	'onboarding': {
		title: 'Onboarding',
		content: `
			<p>Track multi-step onboarding checklists for new personnel joining the unit. Each onboarding uses a shared template of steps that you can customize.</p>

			<h4>Starting an Onboarding</h4>
			<p>Click <strong>Start Onboarding</strong> and select a person. If they aren't in the system yet, you can create them inline without leaving the modal. Set a start date and the template steps will be applied automatically.</p>

			<h4>Step Types</h4>
			<ul>
				<li><strong>Checkbox</strong> — simple yes/no completion (e.g., "Issued ID card")</li>
				<li><strong>Training</strong> — linked to a training type, auto-completes when the training record is entered</li>
				<li><strong>Paperwork</strong> — multi-stage progression (e.g., "Submitted → Reviewed → Filed"), advance with arrow buttons</li>
			</ul>

			<h4>Tracking Progress</h4>
			<p>Each onboarding shows a progress bar and step count. Click to expand and see all steps. Add notes to document issues or special instructions. An onboarding auto-completes when all steps are finished.</p>
			<p>Use the <strong>Active / All</strong> toggle to show only in-progress onboardings or include completed and cancelled ones.</p>

			<h4>Managing the Template</h4>
			<p>Open <strong>Manage Template</strong> from the overflow menu to add, edit, reorder, or remove onboarding steps. Changes to the template only affect new onboardings — existing ones keep their original steps.</p>
		`
	},
	'rating-scheme': {
		title: 'Rating Scheme',
		content: `
			<p>Maintain OER/NCOER/WOER rating chains and track evaluation timelines with due-date warnings, per AR 623-3. Only personnel who are rated (typically NCOs, officers, and warrant officers) need to be added.</p>

			<h4>Views</h4>
			<ul>
				<li><strong>Grouped View</strong> — entries organized by senior rater, then by rater, for a quick read of the rating chain hierarchy</li>
				<li><strong>Table View</strong> — flat sortable table showing all entries with report type and workflow status columns</li>
			</ul>
			<p>Switch between views using the Grouped/Table toggle in the toolbar.</p>

			<h4>Adding an Entry</h4>
			<p>Click <strong>Add Entry</strong> to create a new rating scheme record. Select a rated individual — the eval type (OER, NCOER, or WOER) is auto-suggested based on rank but can be changed. Set the rater, senior rater, rating period dates, and optionally add an intermediate rater or reviewer.</p>

			<h4>Report Types</h4>
			<p>Optionally select a report type (Annual, Change of Rater, Extended Annual, etc.) per AR 623-3. Available options change based on eval type. When "Annual" is selected and you set a start date, the thru date auto-populates to start + 12 months - 1 day. Extended Annual reports show a warning if the period exceeds 15 months (NCOER) or 16 months (OER/WOER).</p>

			<h4>Workflow Tracking</h4>
			<p>Click <strong>+ Track Workflow</strong> in the entry modal to enable granular tracking of where the evaluation is in the signature process — from Drafting through With Rater, SR Signed, With Rated Soldier, and finally Submitted to S1. Workflow steps for intermediate rater and reviewer only appear when those roles are populated. Workflow tracking is optional and can be removed at any time.</p>

			<h4>Internal vs. External Raters</h4>
			<p>Each rater role can be filled by an internal person (selected from your organization's roster) or an external individual (entered as freetext with rank, name, and position). Use the Internal/External toggle on each rater field.</p>

			<h4>Due-Date Status Colors</h4>
			<ul>
				<li><strong style="color:#22c55e;">Green (Current)</strong> — more than 60 days to thru date</li>
				<li><strong style="color:#eab308;">Yellow (Due 60d)</strong> — 31–60 days until thru date</li>
				<li><strong style="color:#f97316;">Orange (Due 30d)</strong> — 1–30 days until thru date</li>
				<li><strong style="color:#ef4444;">Red (Overdue)</strong> — past thru date and still active</li>
				<li><strong style="color:#6b7280;">Gray (Completed)</strong> — evaluation completed</li>
			</ul>

			<h4>Stats Bar</h4>
			<p>The stats bar at the top shows counts for each due-date category across all active entries, so you can quickly identify evaluations needing attention.</p>

			<h4>Filtering</h4>
			<p>Use the filter dropdowns to show by status (Active, Completed, Change of Rater, All), eval type (OER, NCOER, WOER), or workflow status. The workflow filter only appears when at least one entry has workflow tracking enabled.</p>

			<h4>Excel Export</h4>
			<p>Click <strong>Export</strong> in the toolbar to download the current filtered view as an Excel spreadsheet. The export includes all visible columns: eval type, report type, rated individual, raters, dates, due status, workflow status, and notes.</p>

			<h4>Editing & Deleting</h4>
			<p>Click any entry (in either view) to open the edit modal. You can update all fields, change status to Completed or Change of Rater, or delete the entry entirely.</p>
		`
	},
	'settings': {
		title: 'Settings',
		content: `
			<p>Configure your organization's name, manage team members, and control access permissions.</p>

			<h4>Organization Name</h4>
			<p>The organization owner can update the display name at any time.</p>

			<h4>Team Members</h4>
			<p>Invite new members by email and assign them a permission level. Click any member to expand and adjust their permissions. Available roles:</p>
			<ul>
				<li><strong>Owner</strong> — full access, can delete the organization and transfer ownership</li>
				<li><strong>Admin</strong> — full access plus member management</li>
				<li><strong>Full Editor</strong> — can edit calendar, personnel, and training</li>
				<li><strong>Calendar Only / Personnel Only / Training Only</strong> — scoped edit access</li>
				<li><strong>Viewer</strong> — read-only access to everything</li>
			</ul>

			<h4>Transferring Ownership</h4>
			<p>The owner can transfer ownership to another member from their expanded permission panel.</p>

			<h4>Danger Zone</h4>
			<p>The organization owner can permanently delete the organization. This requires typing the organization name to confirm and cannot be undone.</p>
		`
	}
};
