<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import type { PersonnelLookup } from '$features/personnel/contracts';
	import type { RatingSchemeEntry } from '$features/rating-scheme/rating-scheme.types';
	import { ratingSchemeStore } from '$features/rating-scheme/stores/ratingScheme.svelte';
	import RatingSchemeEntryModal from '$features/rating-scheme/components/RatingSchemeEntryModal.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { rejectedRequestMessage } from '$lib/stores/core';
	import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';

	interface Props {
		orgId: string;
		modals: ModalRegistry;
		personnelLookup: PersonnelLookup[];
		onRequestDeletion: (id: string, description: string, isCurrent: () => boolean) => Promise<boolean>;
	}

	let { orgId, modals, personnelLookup, onRequestDeletion }: Props = $props();
	const initialOrgId = untrack(() => orgId);
	let disposed = false;
	onDestroy(() => {
		disposed = true;
	});

	function isCurrentWorkspace(): boolean {
		return !disposed && orgId === initialOrgId && ratingSchemeStore.orgId === initialOrgId;
	}

	const ratingPayload = $derived(modals.payload<{ entry: RatingSchemeEntry | null }>('rating-modal'));
	const editingEntry = $derived(ratingPayload?.entry ?? null);

	async function handleSaveRatingEntry(entryData: Omit<RatingSchemeEntry, 'id'>, isCurrent: () => boolean) {
		if (!isCurrent()) return;
		const editingId = editingEntry?.id;
		if (editingId) {
			const updated = await ratingSchemeStore.updateOrThrow(editingId, entryData).catch((failure: unknown) => {
				throw new Error(rejectedRequestMessage(failure, 'Failed to update rating entry'));
			});
			if (!isCurrent()) return;
			if (!updated) throw new Error('Failed to update rating entry');
		} else {
			const created = await ratingSchemeStore.add(entryData);
			if (!isCurrent()) return;
			if (!created) throw new Error('Failed to add rating entry');
		}
	}

	async function handleDeleteRatingEntry(id: string, isCurrent: () => boolean): Promise<boolean> {
		if (!isCurrent()) return false;
		const entry = ratingSchemeStore.items.find((ratingEntry) => ratingEntry.id === id);
		const person = personnelLookup.find((p) => p.id === entry?.ratedPersonId);
		const description = person ? `Rating scheme entry for ${person.rank} ${person.lastName}` : 'Rating scheme entry';
		const requestDeletion = onRequestDeletion;
		const result = await ratingSchemeStore.remove(id);
		if (!isCurrent()) return false;
		if (result === 'deleted') return true;
		if (result === 'approval_required' && entry) {
			return requestDeletion(id, description, isCurrent);
		}
		toastStore.error('Failed to delete rating entry. Try again.');
		return false;
	}
</script>

{#if modals.isOpen('rating-modal')}
	{#key editingEntry?.id ?? 'new-rating-entry'}
		<RatingSchemeEntryModal
			entry={editingEntry}
			personnel={personnelLookup}
			{isCurrentWorkspace}
			onSave={handleSaveRatingEntry}
			onDelete={editingEntry ? handleDeleteRatingEntry : undefined}
			onClose={modals.closerFor('rating-modal')}
		/>
	{/key}
{/if}
