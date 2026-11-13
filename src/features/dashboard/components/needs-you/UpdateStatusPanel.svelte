<script lang="ts">
	import { untrack, type Component } from 'svelte';
	import type { RatingSchemeEntryEditorData } from '$features/rating-scheme';
	import type {
		Evaluation,
		EvaluationPatchValues,
		RatingScheme,
		RatingSchemeDueEntry,
		RatingSchemeMove,
		RatingSchemeRaterChange
	} from '$features/rating-scheme/contracts';
	import { changeEvaluationRater, moveEvaluation, saveEvaluation } from '$features/rating-scheme';
	import { isEvaluationCompleted } from '$features/rating-scheme/contracts';
	import { rejectedRequestMessage } from '$lib/stores/core';
	import type { NeedsYouPanelProps } from '../../sections/needsYou';

	type EvaluationSheet = Component<{
		orgId: string;
		evaluation: Evaluation;
		scheme: RatingScheme;
		personnel: RatingSchemeEntryEditorData['personnelLookup'];
		isCurrentWorkspace: () => boolean;
		onSave: (id: string, patch: EvaluationPatchValues, isCurrent: () => boolean) => Promise<void>;
		onMove: (id: string, move: RatingSchemeMove, isCurrent: () => boolean) => Promise<void>;
		onChangeRater: (id: string, change: RatingSchemeRaterChange, isCurrent: () => boolean) => Promise<void>;
		onClose: () => void;
	}>;

	let {
		model,
		updates,
		save,
		close,
		orgId,
		editor,
		Sheet
	}: NeedsYouPanelProps & { orgId: string; editor: RatingSchemeEntryEditorData; Sheet: EvaluationSheet } = $props();

	const isCurrentWorkspace = () => model.inputs.page.orgId === orgId;
	/** The sheet shows each step as it lands, so the panel keeps what the server answered. */
	let evaluation = $state(untrack(() => editor.evaluation));
	let scheme = $state(untrack(() => editor.ratingScheme));

	/** A viewer without Personnel access names the rated person from the entry itself, so the overlay keeps it. */
	type NamedDueEntry = RatingSchemeDueEntry & { ratedPersonName?: string };

	function ratedPersonName(ratedPersonId: string): string | undefined {
		const person = editor.personnelLookup.find((candidate) => candidate.id === ratedPersonId);
		if (person) return `${person.rank} ${person.lastName}, ${person.firstName}`;
		const loaded: readonly NamedDueEntry[] = model.inputs.page.dashboard.data.ratingSchemeEntries;
		const before = loaded.find((candidate) => candidate.id === editor.evaluation.id);
		return before?.ratedPersonId === ratedPersonId ? before.ratedPersonName : undefined;
	}

	function putEntry(saved: Evaluation) {
		const name = ratedPersonName(saved.ratedPersonId);
		const record: NamedDueEntry = {
			id: saved.id,
			ratedPersonId: saved.ratedPersonId,
			evalType: saved.evalType,
			ratingPeriodEnd: saved.ratingPeriodEnd,
			workflowStatus: saved.workflowStatus,
			...(name === undefined ? {} : { ratedPersonName: name })
		};
		updates.putRecord(orgId, { list: 'ratingSchemeEntries', record });
	}

	const rejected = (fallback: string) => (failure: unknown) => {
		throw new Error(rejectedRequestMessage(failure, fallback));
	};

	const onSave = (id: string, patch: EvaluationPatchValues, isCurrent: () => boolean) =>
		save(async () => {
			const saved = await saveEvaluation(orgId, id, patch).catch(rejected('The evaluation was not saved. Try again.'));
			if (!isCurrent()) return;
			evaluation = saved;
			putEntry(saved);
		});

	/**
	 * A step keeps the Evaluation past thru, so the panel stays open for the next one. Completing it removes the row,
	 * so that move saves through the row and focus moves on with it.
	 */
	async function onMove(id: string, workflowMove: RatingSchemeMove, isCurrent: () => boolean): Promise<void> {
		const move = async () => {
			const moved = await moveEvaluation(orgId, id, workflowMove).catch(
				rejected('The workflow did not move. Try again.')
			);
			if (!isCurrent()) return;
			evaluation = moved.evaluation;
			putEntry(moved.evaluation);
		};
		if (isEvaluationCompleted(workflowMove.to)) await save(move);
		else await move();
	}

	const onChangeRater = (id: string, change: RatingSchemeRaterChange, isCurrent: () => boolean) =>
		save(async () => {
			const result = await changeEvaluationRater(orgId, id, change).catch(
				rejected('The rater was not changed. Try again.')
			);
			if (!isCurrent()) return;
			evaluation = result.evaluation;
			scheme = result.ratingScheme;
			putEntry(result.evaluation);
			if (result.successor) putEntry(result.successor);
		});
</script>

<Sheet
	{orgId}
	{evaluation}
	{scheme}
	personnel={editor.personnelLookup}
	{isCurrentWorkspace}
	{onSave}
	{onMove}
	{onChangeRater}
	onClose={close}
/>
