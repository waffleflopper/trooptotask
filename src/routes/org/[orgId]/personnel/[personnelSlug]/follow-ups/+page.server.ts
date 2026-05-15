import { createPersonnelDetailSubpageLoad } from '../subpageLoad.server';

export const load = createPersonnelDetailSubpageLoad({
	section: 'follow-ups',
	title: 'Follow-ups',
	emptyState: 'No follow-ups are ready for this Soldier yet.'
});
