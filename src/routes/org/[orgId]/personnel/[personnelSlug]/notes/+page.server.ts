import { createPersonnelDetailSubpageLoad } from '../subpageLoad.server';

export const load = createPersonnelDetailSubpageLoad({
	section: 'notes',
	title: 'Notes',
	emptyState: 'No leader notes have been added for this Soldier yet.'
});
