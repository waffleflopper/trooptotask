<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import type { PersonnelLookup } from '$features/personnel/contracts';
	import { LINE_PARAM, LINE_SHEET_MODAL, type LineSheetPayload } from '../contexts/RatingSchemeLinesContext.svelte';
	import { evaluationStore, ratingSchemeLines, ratingSchemeStore } from '../stores/ratingScheme.svelte';
	import { archiveRatingScheme, createRatingScheme } from '../ratingSchemeRequests';
	import type { RatingSchemeLineSave } from '../utils/ratingSchemeLineDraft';
	import type { RatingSchemeLine } from '../utils/ratingSchemeLines';
	import RatingSchemeLineSheet from './RatingSchemeLineSheet.svelte';
	import { rejectedRequestMessage } from '$lib/stores/core';
	import { writeAddress } from '$lib/utils/addressWriter';
	import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import { visibleUrl } from '$lib/utils/visibleUrl';

	interface Props {
		orgId: string;
		modals: ModalRegistry;
		personnelLookup: PersonnelLookup[];
		listedPersonIds: ReadonlySet<string>;
	}

	let { orgId, modals, personnelLookup, listedPersonIds }: Props = $props();
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

	function failed(fallback: string) {
		return (failure: unknown): never => {
			throw new Error(rejectedRequestMessage(failure, fallback));
		};
	}

	const sheetPayload = $derived(modals.payload<LineSheetPayload>(LINE_SHEET_MODAL));

	/** Closing the line sheet takes `?line=` off the address, so a reload does not reopen it. */
	function closeLineSheet() {
		modals.close(LINE_SHEET_MODAL);
		if (visibleUrl().searchParams.has(LINE_PARAM))
			void writeAddress({ url: (url) => url.searchParams.delete(LINE_PARAM) });
	}

	/** The line as the stores hold it now; a completed Change of Rater or an archive may have moved it since the sheet opened. */
	function lineById(id: string | null | undefined): RatingSchemeLine | null {
		return id ? (ratingSchemeLines.items.find((line) => line.id === id) ?? null) : null;
	}

	const sheetLine = $derived(lineById(sheetPayload?.lineId));
	/** A Not tracked Evaluation is open work on the Eval Tracker, though it does not lock the rater. */
	const notTrackedId = $derived(
		sheetLine
			? (evaluationStore.items.find((row) => row.ratingSchemeId === sheetLine.id && row.workflowStatus === null)?.id ??
					null)
			: null
	);

	async function saveLine(save: RatingSchemeLineSave, isCurrent: () => boolean): Promise<void> {
		if (!isCurrent()) return;
		if (save.kind === 'create') {
			const fallback = 'Failed to add to the scheme';
			const scheme = await createRatingScheme(initialOrgId, save.values).catch(failed(fallback));
			if (!isCurrent()) return;
			ratingSchemeStore.mergeBatchResults([scheme]);
			return;
		}
		const fallback = 'Failed to update the line';
		const line = lineById(sheetPayload?.lineId);
		if (!line) throw new Error(fallback);
		const updated = await ratingSchemeStore.updateOrThrow(line.id, save.patch).catch(failed(fallback));
		if (!isCurrent()) return;
		if (!updated) throw new Error(fallback);
	}

	async function archiveLine(ratingSchemeId: string, archived: boolean, isCurrent: () => boolean): Promise<void> {
		if (!isCurrent()) return;
		const { ratingScheme } = await archiveRatingScheme(initialOrgId, ratingSchemeId, archived).catch(
			failed(
				archived ? 'The rating scheme was not archived. Try again.' : 'The rating scheme was not restored. Try again.'
			)
		);
		if (!isCurrent()) return;
		ratingSchemeStore.mergeBatchResults([], [ratingScheme]);
	}
</script>

{#if modals.isOpen(LINE_SHEET_MODAL) && (sheetPayload?.lineId == null || sheetLine)}
	{#key sheetPayload?.lineId ?? 'new-rating-scheme-line'}
		<RatingSchemeLineSheet
			orgId={initialOrgId}
			line={sheetLine}
			{notTrackedId}
			personnel={personnelLookup}
			{listedPersonIds}
			{isCurrentWorkspace}
			onSave={saveLine}
			onArchive={archiveLine}
			onClose={closeLineSheet}
		/>
	{/key}
{/if}
