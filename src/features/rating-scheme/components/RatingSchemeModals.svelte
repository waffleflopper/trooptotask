<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import type { PersonnelLookup } from '$features/personnel/contracts';
	import type { RatingSchemeEntry, WorkflowStatus } from '$features/rating-scheme/rating-scheme.types';
	import type { RatingSchemeMove, RatingSchemeRaterChange } from '$features/rating-scheme/contracts';
	import { evaluationStore, ratingSchemeStore } from '$features/rating-scheme/stores/ratingScheme.svelte';
	import {
		archiveRatingScheme,
		changeEvaluationRater,
		createRatingScheme,
		moveEvaluation,
		startEvaluation
	} from '$features/rating-scheme/ratingSchemeRequests';
	import {
		planRatingSchemeEntrySave,
		type RatingSchemeEntrySaveData
	} from '$features/rating-scheme/utils/ratingSchemeEntryDraft';
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
		return (
			!disposed &&
			orgId === initialOrgId &&
			ratingSchemeStore.orgId === initialOrgId &&
			evaluationStore.orgId === initialOrgId
		);
	}

	const ratingPayload = $derived(modals.payload<{ entry: RatingSchemeEntry | null }>('rating-modal'));
	const editingEntry = $derived(ratingPayload?.entry ?? null);

	function failed(fallback: string) {
		return (failure: unknown): never => {
			throw new Error(rejectedRequestMessage(failure, fallback));
		};
	}

	/** Adds the Evaluation to the person's listed scheme, listing one first when they have none. */
	async function addRatingEntry(entryData: RatingSchemeEntrySaveData, isCurrent: () => boolean) {
		const fallback = 'Failed to add rating entry';
		const listed = ratingSchemeStore.items.find(
			(scheme) => scheme.ratedPersonId === entryData.ratedPersonId && scheme.archivedAt === null
		);
		const plan = planRatingSchemeEntrySave(listed ? { ...listed, chainSigned: false } : null, entryData);
		let scheme = listed;
		if (!scheme) {
			scheme = await createRatingScheme(initialOrgId, {
				...plan.scheme,
				ratedPersonId: entryData.ratedPersonId,
				evalType: entryData.evalType
			}).catch(failed(fallback));
			if (!isCurrent()) return;
			ratingSchemeStore.mergeBatchResults([scheme]);
		} else if (plan.scheme) {
			const updated = await ratingSchemeStore.updateOrThrow(scheme.id, plan.scheme).catch(failed(fallback));
			if (!isCurrent()) return;
			if (!updated) throw new Error(fallback);
		}
		const { evaluation } = await startEvaluation(initialOrgId, scheme.id, {
			reportType: entryData.reportType,
			ratingPeriodStart: entryData.ratingPeriodStart,
			ratingPeriodEnd: entryData.ratingPeriodEnd,
			completed: false,
			notes: entryData.notes
		}).catch(failed(fallback));
		if (!isCurrent()) return;
		evaluationStore.mergeBatchResults([evaluation]);
	}

	async function handleSaveRatingEntry(entryData: RatingSchemeEntrySaveData, isCurrent: () => boolean) {
		if (!isCurrent()) return;
		const editing = editingEntry;
		if (!editing) return addRatingEntry(entryData, isCurrent);
		const fallback = 'Failed to update rating entry';
		const plan = planRatingSchemeEntrySave(editing, entryData);
		if (plan.scheme) {
			const scheme = await ratingSchemeStore.updateOrThrow(editing.ratingSchemeId, plan.scheme).catch(failed(fallback));
			if (!isCurrent()) return;
			if (!scheme) throw new Error(fallback);
		}
		const evaluation = await evaluationStore.updateOrThrow(editing.id, plan.evaluation).catch(failed(fallback));
		if (!isCurrent()) return;
		if (!evaluation) throw new Error(fallback);
	}

	async function handleMoveRatingEntry(
		id: string,
		move: RatingSchemeMove,
		isCurrent: () => boolean
	): Promise<WorkflowStatus | null | undefined> {
		if (!isCurrent()) return undefined;
		const { evaluation } = await moveEvaluation(initialOrgId, id, move).catch(
			failed('The workflow did not move. Try again.')
		);
		if (!isCurrent()) return undefined;
		evaluationStore.mergeBatchResults([], [evaluation]);
		return evaluation.workflowStatus;
	}

	async function handleArchiveRatingEntry(
		ratingSchemeId: string,
		archived: boolean,
		isCurrent: () => boolean
	): Promise<string | null | undefined> {
		if (!isCurrent()) return undefined;
		const { ratingScheme } = await archiveRatingScheme(initialOrgId, ratingSchemeId, archived).catch(
			failed(
				archived ? 'The rating scheme was not archived. Try again.' : 'The rating scheme was not restored. Try again.'
			)
		);
		if (!isCurrent()) return undefined;
		ratingSchemeStore.mergeBatchResults([], [ratingScheme]);
		return ratingScheme.archivedAt;
	}

	async function handleChangeRater(
		id: string,
		change: RatingSchemeRaterChange,
		isCurrent: () => boolean
	): Promise<boolean> {
		if (!isCurrent()) return false;
		const { evaluation, ratingScheme, successor } = await changeEvaluationRater(initialOrgId, id, change).catch(
			failed('The rater was not changed. Try again.')
		);
		if (!isCurrent()) return false;
		ratingSchemeStore.mergeBatchResults([], [ratingScheme]);
		evaluationStore.mergeBatchResults(successor ? [successor] : [], [evaluation]);
		return successor !== null;
	}

	async function handleDeleteRatingEntry(id: string, isCurrent: () => boolean): Promise<boolean> {
		if (!isCurrent()) return false;
		const evaluation = evaluationStore.items.find((row) => row.id === id);
		const person = personnelLookup.find((p) => p.id === evaluation?.ratedPersonId);
		const description = person ? `Evaluation for ${person.rank} ${person.lastName}` : 'Evaluation';
		const requestDeletion = onRequestDeletion;
		const result = await evaluationStore.remove(id);
		if (!isCurrent()) return false;
		if (result === 'deleted') return true;
		if (result === 'approval_required' && evaluation) {
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
			onArchive={handleArchiveRatingEntry}
			onChangeRater={handleChangeRater}
			onClose={modals.closerFor('rating-modal')}
		/>
	{/key}
{/if}
