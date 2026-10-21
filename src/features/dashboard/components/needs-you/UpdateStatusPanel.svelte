<script lang="ts">
	import type { Component, ComponentProps } from 'svelte';
	import type { RatingSchemeEntryEditorData } from '$features/rating-scheme';
	import { saveRatingSchemeEntry } from '$features/rating-scheme';
	import type { NeedsYouPanelProps } from '../../sections/needsYou';

	type EntryModal = Component<{
		entry: RatingSchemeEntryEditorData['entry'] | null;
		personnel: RatingSchemeEntryEditorData['personnelLookup'];
		isCurrentWorkspace: () => boolean;
		onSave: (data: Omit<RatingSchemeEntryEditorData['entry'], 'id'>, isCurrent: () => boolean) => Promise<void>;
		onClose: () => void;
	}>;

	let {
		model,
		updates,
		save,
		close,
		orgId,
		editor,
		Modal
	}: NeedsYouPanelProps & { orgId: string; editor: RatingSchemeEntryEditorData; Modal: EntryModal } = $props();

	const isCurrentWorkspace = () => model.inputs.page.orgId === orgId;

	const onSave: ComponentProps<EntryModal>['onSave'] = (data) =>
		save(async () => {
			const saved = await saveRatingSchemeEntry(orgId, editor.entry.id, data);
			updates.putRecord(orgId, {
				list: 'ratingSchemeEntries',
				record: {
					id: saved.id,
					ratedPersonId: saved.ratedPersonId,
					evalType: saved.evalType,
					ratingPeriodEnd: saved.ratingPeriodEnd,
					status: saved.status
				}
			});
		});
</script>

<Modal entry={editor.entry} personnel={editor.personnelLookup} {isCurrentWorkspace} {onSave} onClose={close} />
