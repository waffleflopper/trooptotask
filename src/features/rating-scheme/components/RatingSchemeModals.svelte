<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import type { PersonnelLookup } from '$features/personnel/contracts';
	import type { RatingSchemeEntry, WorkflowStatus } from '$features/rating-scheme/rating-scheme.types';
	import type { RatingSchemeRaterChange } from '$features/rating-scheme/contracts';
	import { ratingSchemeStore } from '$features/rating-scheme/stores/ratingScheme.svelte';
	import { changeRatingSchemeRater, moveRatingSchemeEntry } from '$features/rating-scheme/ratingSchemeRequests';
	import type { RatingSchemeEntrySaveData } from '$features/rating-scheme/utils/ratingSchemeEntryDraft';
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

	async function handleSaveRatingEntry(entryData: RatingSchemeEntrySaveData, isCurrent: () => boolean) {
		if (!isCurrent()) return;
		const editingId = editingEntry?.id;
		if (editingId) {
			const updated = await ratingSchemeStore.updateOrThrow(editingId, entryData).catch((failure: unknown) => {
				throw new Error(rejectedRequestMessage(failure, 'Failed to update rating entry'));
			});
			if (!isCurrent()) return;
			if (!updated) throw new Error('Failed to update rating entry');
		} else {
			const created = await ratingSchemeStore.add({ ...entryData, workflowStatus: null });
			if (!isCurrent()) return;
			if (!created) throw new Error('Failed to add rating entry');
		}
	}

	async function handleMoveRatingEntry(
		id: string,
		to: WorkflowStatus | null,
		isCurrent: () => boolean
	): Promise<WorkflowStatus | null | undefined> {
		if (!isCurrent()) return undefined;
		const { entry } = await moveRatingSchemeEntry(initialOrgId, id, to).catch((failure: unknown) => {
			throw new Error(rejectedRequestMessage(failure, 'The workflow did not move. Try again.'));
		});
		if (!isCurrent()) return undefined;
		ratingSchemeStore.mergeBatchResults([], [entry]);
		return entry.workflowStatus;
	}

	async function handleChangeRater(
		id: string,
		change: RatingSchemeRaterChange,
		isCurrent: () => boolean
	): Promise<boolean> {
		if (!isCurrent()) return false;
		const { entry, successor } = await changeRatingSchemeRater(initialOrgId, id, change).catch((failure: unknown) => {
			throw new Error(rejectedRequestMessage(failure, 'The rater was not changed. Try again.'));
		});
		if (!isCurrent()) return false;
		ratingSchemeStore.mergeBatchResults(successor ? [successor] : [], [entry]);
		return successor !== null;
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
		if (result === 'unconfirmed') {
			toastStore.unconfirmed("We couldn't confirm the rating entry was deleted. Reload to see whether it was.");
			return false;
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
			onMove={handleMoveRatingEntry}
			onChangeRater={handleChangeRater}
			onClose={modals.closerFor('rating-modal')}
		/>
	{/key}
{/if}
