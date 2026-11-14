import { loadEvaluationSheet, loadRatingSchemeEntryEditor } from '$features/rating-scheme';
import { needsYouPanel, type NeedsYouPanel } from '../../sections/needsYou';
import UpdateStatusPanel from './UpdateStatusPanel.svelte';

/** Loaded with the action, so the Rating Scheme module stays out of the page's first load. */
export async function openUpdateStatusPanel(orgId: string, entryId: string): Promise<NeedsYouPanel> {
	const [{ default: Sheet }, editor] = await Promise.all([
		loadEvaluationSheet(),
		loadRatingSchemeEntryEditor(orgId, entryId)
	]);
	return needsYouPanel(UpdateStatusPanel, { orgId, editor, Sheet });
}
