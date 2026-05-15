import { createPersonnelDetailSubpageLoad } from '../subpageLoad.server';

export const load = createPersonnelDetailSubpageLoad({
	section: 'counselings',
	title: 'Counselings',
	emptyState: 'No counseling records have been added for this Soldier yet.'
});
