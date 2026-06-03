<script lang="ts">
	import type { PersonnelLookup } from '$lib/types';
	import type { RatingSchemeEntry } from '$features/rating-scheme/rating-scheme.types';
	import { ratingSchemeStore } from '$features/rating-scheme/stores/ratingScheme.svelte';
	import RatingSchemeEntryModal from '$features/rating-scheme/components/RatingSchemeEntryModal.svelte';
	import { submitDeletionRequest } from '$lib/utils/deletionRequests';
	import type { RatingSchemePageContext } from '$features/rating-scheme/contexts/RatingSchemePageContext.svelte';
	import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';

	interface Props {
		ctx: RatingSchemePageContext;
		modals: ModalRegistry;
		personnelLookup: PersonnelLookup[];
	}

	let { ctx, modals, personnelLookup }: Props = $props();

	const ratingPayload = $derived(modals.payload<{ entry: RatingSchemeEntry | null }>('rating-modal'));
	const editingEntry = $derived(ratingPayload?.entry ?? null);
	const ratingSchemeResourceUrl = $derived(`/org/${ctx.orgId}/evals`);

	async function handleSaveRatingEntry(entryData: Omit<RatingSchemeEntry, 'id'>) {
		if (editingEntry) {
			const updated = await ratingSchemeStore.update(editingEntry.id, entryData);
			if (!updated) throw new Error('Failed to update rating entry');
		} else {
			const created = await ratingSchemeStore.add(entryData);
			if (!created) throw new Error('Failed to add rating entry');
		}
	}

	async function handleDeleteRatingEntry(id: string) {
		const entry = ratingSchemeStore.items.find((ratingEntry) => ratingEntry.id === id);
		const result = await ratingSchemeStore.remove(id);
		if (result === 'approval_required' && entry) {
			const person = personnelLookup.find((p) => p.id === entry.ratedPersonId);
			const desc = person ? `Rating scheme entry for ${person.rank} ${person.lastName}` : 'Rating scheme entry';
			await submitDeletionRequest(ctx.orgId, 'rating_scheme_entry', id, desc, ratingSchemeResourceUrl);
		}
	}
</script>

{#if modals.isOpen('rating-modal')}
	{#key editingEntry?.id ?? 'new-rating-entry'}
		<RatingSchemeEntryModal
			entry={editingEntry}
			personnel={personnelLookup}
			onSave={handleSaveRatingEntry}
			onDelete={editingEntry ? handleDeleteRatingEntry : undefined}
			onClose={modals.closerFor('rating-modal')}
		/>
	{/key}
{/if}
