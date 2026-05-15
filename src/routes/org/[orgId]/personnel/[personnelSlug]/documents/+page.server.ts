import { createPersonnelDetailSubpageLoad } from '../subpageLoad.server';

export const load = createPersonnelDetailSubpageLoad({
	section: 'documents',
	title: 'Documents',
	emptyState: 'No documents have been uploaded for this Soldier yet.'
});
