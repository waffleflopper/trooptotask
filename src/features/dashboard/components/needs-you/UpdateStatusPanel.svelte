<script lang="ts">
	import type { Component, ComponentProps } from 'svelte';
	import type { RatingSchemeEntryEditorData } from '$features/rating-scheme';
	import type { RatingSchemeDueEntry } from '$features/rating-scheme/contracts';
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

	/** A viewer without Personnel access names the rated person from the entry itself, so the overlay keeps it. */
	type NamedDueEntry = RatingSchemeDueEntry & { ratedPersonName?: string };

	function ratedPersonName(ratedPersonId: string): string | undefined {
		const person = editor.personnelLookup.find((candidate) => candidate.id === ratedPersonId);
		if (person) return `${person.rank} ${person.lastName}, ${person.firstName}`;
		const loaded: readonly NamedDueEntry[] = model.inputs.page.dashboard.data.ratingSchemeEntries;
		const before = loaded.find((candidate) => candidate.id === editor.entry.id);
		return before?.ratedPersonId === ratedPersonId ? before.ratedPersonName : undefined;
	}

	const onSave: ComponentProps<EntryModal>['onSave'] = (data) =>
		save(async () => {
			const saved = await saveRatingSchemeEntry(orgId, editor.entry.id, data);
			const name = ratedPersonName(saved.ratedPersonId);
			const record: NamedDueEntry = {
				id: saved.id,
				ratedPersonId: saved.ratedPersonId,
				evalType: saved.evalType,
				ratingPeriodEnd: saved.ratingPeriodEnd,
				status: saved.status,
				...(name === undefined ? {} : { ratedPersonName: name })
			};
			updates.putRecord(orgId, { list: 'ratingSchemeEntries', record });
		});
</script>

<Modal entry={editor.entry} personnel={editor.personnelLookup} {isCurrentWorkspace} {onSave} onClose={close} />
