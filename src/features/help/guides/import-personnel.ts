import type { HelpGuide } from '../contracts';

export const importPersonnel: HelpGuide = {
	id: 'import-personnel',
	title: 'Import your roster from a spreadsheet',
	summary: 'Add and update many Soldiers at once from an Excel or CSV file.',
	area: 'personnel',
	routes: ['personnel', 'personnel/import'],
	keywords: ['import', 'csv', 'excel', 'xlsx', 'upload', 'roster', 'alpha roster', 'add soldiers', 'bulk add'],
	access: { lane: 'personnel', level: 'operate' },
	lead: 'One file adds new Soldiers and updates the ones already in the unit. Blank cells never clear a saved value, and nobody missing from the file is touched.',
	steps: [
		{ text: 'On the Personnel page, press **Import**.', to: 'personnel/import' },
		{ text: 'Download the **Template (.xlsx)**, or use the sheet you already have.' },
		{ text: 'Drop the file on the page or choose it.' },
		{ text: 'Match the columns to what they hold, then review the rows.' },
		{ text: 'Press the **Import** button to save the changes.' }
	],
	note: 'The review can create a new Group named in the file only if you can manage Groups.',
	next: 'manage-groups'
};
