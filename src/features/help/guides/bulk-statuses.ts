import type { HelpGuide } from '../contracts';

export const bulkStatuses: HelpGuide = {
	id: 'bulk-statuses',
	title: 'Add one status to many people',
	summary: 'Put a whole Group or a list of Soldiers on the same status for the same dates in one step.',
	area: 'calendar',
	routes: ['calendar', 'calendar/bulk'],
	keywords: ['bulk', 'many', 'mass', 'block leave', 'field', 'multiple people', 'everyone', 'remove', 'group'],
	access: { lane: 'calendar', level: 'operate' },
	missed: true,
	lead: 'Bulk status puts the same status on many people for the same dates. It also removes a status from many people at once.',
	steps: [
		{ text: 'On the calendar, open **Bulk Status** and choose **Add Bulk**.', to: 'calendar/bulk?tab=add' },
		{ text: 'Pick the **Status**, set the **Dates**, and add a **Note** if you want one.' },
		{ text: 'Check the people under **Who**. The box on a Group header picks the whole Group.' },
		{ text: 'Press the **Add to** button at the bottom. It names how many people you picked.' },
		{ text: 'To clear a status from many people, switch to **Remove**.', to: 'calendar/bulk?tab=remove' }
	],
	note: 'The bar at the bottom warns you when someone already has a status on those dates.',
	next: 'import-calendar-statuses'
};
