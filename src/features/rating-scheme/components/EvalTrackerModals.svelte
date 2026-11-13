<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import type { PersonnelLookup } from '$features/personnel/contracts';
	import type { EvaluationPatchValues, EvaluationStart, RatingSchemeMove, RatingSchemeRaterChange } from '../contracts';
	import {
		ENTRY_PARAM,
		EVALUATION_SHEET_MODAL,
		START_EVALUATION_MODAL,
		START_PARAM,
		type EvaluationSheetPayload,
		type StartEvaluationPayload
	} from '../contexts/EvalTrackerContext.svelte';
	import { evaluationStore, ratingSchemeStore } from '../stores/ratingScheme.svelte';
	import { changeEvaluationRater, moveEvaluation, startEvaluation } from '../ratingSchemeRequests';
	import { readyToStart } from '../utils/evalTracker';
	import EvaluationSheet from './EvaluationSheet.svelte';
	import StartEvaluationSheet from './StartEvaluationSheet.svelte';
	import { rejectedRequestMessage } from '$lib/stores/core';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { writeAddress } from '$lib/utils/addressWriter';
	import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import { visibleUrl } from '$lib/utils/visibleUrl';

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

	function failed(fallback: string) {
		return (failure: unknown): never => {
			throw new Error(rejectedRequestMessage(failure, fallback));
		};
	}

	const sheetPayload = $derived(modals.payload<EvaluationSheetPayload>(EVALUATION_SHEET_MODAL));
	const startPayload = $derived(modals.payload<StartEvaluationPayload>(START_EVALUATION_MODAL));
	const sheetEvaluation = $derived(
		sheetPayload ? evaluationStore.items.find((row) => row.id === sheetPayload.evaluationId) : undefined
	);
	const sheetScheme = $derived(
		sheetEvaluation ? ratingSchemeStore.items.find((row) => row.id === sheetEvaluation.ratingSchemeId) : undefined
	);
	const ready = $derived(readyToStart(ratingSchemeStore.items, evaluationStore.items));

	/** Closing a sheet the address named takes its param off, so a reload does not reopen it. */
	function closer(modal: string, param: string) {
		return () => {
			modals.close(modal);
			if (visibleUrl().searchParams.has(param)) void writeAddress({ url: (url) => url.searchParams.delete(param) });
		};
	}

	async function save(id: string, patch: EvaluationPatchValues, isCurrent: () => boolean): Promise<void> {
		if (!isCurrent()) return;
		const fallback = 'The evaluation was not saved. Try again.';
		const updated = await evaluationStore.updateOrThrow(id, patch).catch(failed(fallback));
		if (!isCurrent()) return;
		if (!updated) throw new Error(fallback);
	}

	async function move(id: string, step: RatingSchemeMove, isCurrent: () => boolean): Promise<void> {
		if (!isCurrent()) return;
		const { evaluation } = await moveEvaluation(initialOrgId, id, step).catch(
			failed('The workflow did not move. Try again.')
		);
		if (!isCurrent()) return;
		evaluationStore.mergeBatchResults([], [evaluation]);
	}

	async function changeRater(id: string, change: RatingSchemeRaterChange, isCurrent: () => boolean): Promise<void> {
		if (!isCurrent()) return;
		const { evaluation, ratingScheme, successor } = await changeEvaluationRater(initialOrgId, id, change).catch(
			failed('The rater was not changed. Try again.')
		);
		if (!isCurrent()) return;
		ratingSchemeStore.mergeBatchResults([], [ratingScheme]);
		evaluationStore.mergeBatchResults(successor ? [successor] : [], [evaluation]);
	}

	async function remove(id: string, isCurrent: () => boolean): Promise<boolean> {
		if (!isCurrent()) return false;
		const evaluation = evaluationStore.items.find((row) => row.id === id);
		const person = personnelLookup.find((p) => p.id === evaluation?.ratedPersonId);
		const description = person ? `Evaluation for ${person.rank} ${person.lastName}` : 'Evaluation';
		const requestDeletion = onRequestDeletion;
		const result = await evaluationStore.remove(id);
		if (!isCurrent()) return false;
		if (result === 'deleted') {
			toastStore.success('Evaluation deleted');
			return true;
		}
		if (result === 'approval_required' && evaluation) return requestDeletion(id, description, isCurrent);
		if (result === 'unconfirmed') {
			toastStore.unconfirmed("We couldn't confirm the evaluation was deleted. Reload to see whether it was.");
			return false;
		}
		toastStore.error('The evaluation was not deleted. Try again.');
		return false;
	}

	async function start(ratingSchemeId: string, values: EvaluationStart, isCurrent: () => boolean): Promise<void> {
		if (!isCurrent()) return;
		const { evaluation } = await startEvaluation(initialOrgId, ratingSchemeId, values).catch(
			failed('The evaluation was not started. Try again.')
		);
		if (!isCurrent()) return;
		evaluationStore.mergeBatchResults([evaluation]);
	}
</script>

{#if sheetEvaluation && sheetScheme}
	{#key sheetEvaluation.id}
		<EvaluationSheet
			orgId={initialOrgId}
			evaluation={sheetEvaluation}
			scheme={sheetScheme}
			personnel={personnelLookup}
			evaluations={evaluationStore.items}
			{isCurrentWorkspace}
			onSave={save}
			onMove={move}
			onChangeRater={changeRater}
			onDelete={remove}
			onOpenEvaluation={(id) => modals.open(EVALUATION_SHEET_MODAL, { evaluationId: id, fromUrl: false })}
			onClose={closer(EVALUATION_SHEET_MODAL, ENTRY_PARAM)}
		/>
	{/key}
{/if}

{#if startPayload}
	{#key startPayload.ratingSchemeId ?? 'start-evaluation'}
		<StartEvaluationSheet
			orgId={initialOrgId}
			{ready}
			ratingSchemeId={startPayload.ratingSchemeId}
			personnel={personnelLookup}
			{isCurrentWorkspace}
			onStart={start}
			onClose={closer(START_EVALUATION_MODAL, START_PARAM)}
		/>
	{/key}
{/if}
