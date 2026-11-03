import type { HelpGuide } from '../contracts';

export const importCalendarStatuses: HelpGuide = {
	id: 'import-calendar-statuses',
	title: 'Import statuses from a spreadsheet',
	summary: 'Load leave, TDY and other statuses for many people from an Excel or CSV file.',
	area: 'calendar',
	routes: ['calendar', 'calendar/import'],
	keywords: ['import', 'csv', 'excel', 'xlsx', 'upload', 'file', 'leave', 'tdy', 'calendar data'],
	access: { lane: 'calendar', level: 'operate' },
	lead: 'The status import reads one row per status, with the person, the dates and the status name. Rows already on the calendar are left alone.',
	steps: [
		{ text: 'On the calendar, open **Bulk Status** and choose **Import CSV**.', to: 'calendar/import' },
		{
			text: 'Download the **Template (.xlsx)**, or use your own sheet with Rank, Last name, First name, From, To and Status columns.'
		},
		{ text: 'Drop the file on the page or choose it. Excel, CSV and TSV files work.' },
		{ text: 'Match the columns to what they hold, then review the rows and answer any questions.' },
		{ text: 'Press the **Import** button to save the changes.' }
	],
	note: 'A status name the unit does not have is flagged in the review so you can match it to one of your status types.',
	next: 'make-status-types'
};
