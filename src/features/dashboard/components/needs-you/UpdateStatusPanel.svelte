<script lang="ts">
	import type { Component, ComponentProps } from 'svelte';
	import type { RatingSchemeEntryEditorData } from '$features/rating-scheme';
	import type {
		Evaluation,
		RatingSchemeDueEntry,
		RatingSchemeEntry,
		RatingSchemeMove,
		RatingSchemeRaterChange
	} from '$features/rating-scheme/contracts';
	import {
		changeEvaluationRater,
		moveEvaluation,
		saveRatingSchemeEntry,
		toRatingSchemeEntry
	} from '$features/rating-scheme';
	import { isEvaluationCompleted } from '$features/rating-scheme/contracts';
	import { rejectedRequestMessage } from '$lib/stores/core';
	import type { NeedsYouPanelProps } from '../../sections/needsYou';

	type EntryModal = Component<{
		entry: RatingSchemeEntry | null;
		personnel: RatingSchemeEntryEditorData['personnelLookup'];
		isCurrentWorkspace: () => boolean;
		onSave: (
			data: Omit<RatingSchemeEntry, 'id' | 'ratingSchemeId' | 'workflowStatus' | 'archivedAt' | 'chainSigned'>,
			isCurrent: () => boolean
		) => Promise<void>;
		onMove: (id: string, move: RatingSchemeMove, isCurrent: () => boolean) => Promise<RatingSchemeEntry | undefined>;
		onChangeRater: (id: string, change: RatingSchemeRaterChange, isCurrent: () => boolean) => Promise<boolean>;
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
	const entry = $derived(toRatingSchemeEntry(editor.ratingScheme, editor.evaluation));

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

	const onSave: ComponentProps<EntryModal>['onSave'] = (data, isCurrent) =>
		save(async () => {
			const saved = await saveRatingSchemeEntry(orgId, editor, data, isCurrent);
			if (saved && isCurrent()) putEntry(saved.evaluation);
		});

	/**
	 * A step keeps the Evaluation past thru, so the panel stays open for the next one. Completing it removes the row,
	 * so that move saves through the row and focus moves on with it.
	 */
	const onMove: ComponentProps<EntryModal>['onMove'] = async (id, workflowMove, isCurrent) => {
		const move = async () => {
			const { evaluation } = await moveEvaluation(orgId, id, workflowMove).catch((failure: unknown) => {
				throw new Error(rejectedRequestMessage(failure, 'The workflow did not move. Try again.'));
			});
			if (!isCurrent()) return undefined;
			putEntry(evaluation);
			return toRatingSchemeEntry(editor.ratingScheme, evaluation);
		};
		if (!isEvaluationCompleted(workflowMove.to)) return move();
		let reached: RatingSchemeEntry | undefined;
		await save(async () => {
			reached = await move();
		});
		return reached;
	};

	const onChangeRater: ComponentProps<EntryModal>['onChangeRater'] = async (id, change, isCurrent) => {
		let opened = false;
		await save(async () => {
			const { evaluation, successor } = await changeEvaluationRater(orgId, id, change);
			if (!isCurrent()) return;
			putEntry(evaluation);
			if (successor) putEntry(successor);
			opened = successor !== null;
		});
		return opened;
	};
</script>

<Modal
	{entry}
	personnel={editor.personnelLookup}
	{isCurrentWorkspace}
	{onSave}
	{onMove}
	{onChangeRater}
	onClose={close}
/>
