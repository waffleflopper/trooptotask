import type { PageServerLoad } from './$types';
import { readPublishedWhatsNew } from '$features/platform-admin/index.server';

/** Entries are plain text, so this bound is far above what a person scrolls and below anything heavy. */
const ENTRY_LIMIT = 200;

export const load: PageServerLoad = (event) => ({
	entries: readPublishedWhatsNew(event, ENTRY_LIMIT).then(
		(entries) => ({ status: 'loaded' as const, entries }),
		(cause) => {
			console.error('[whats-new] Failed to load entries:', cause);
			return { status: 'failed' as const };
		}
	)
});
