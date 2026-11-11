<script lang="ts">
	import type { Component, ComponentProps } from 'svelte';
	import type { RatingSchemeEntryEditorData } from '$features/rating-scheme';
	import type {
		RatingSchemeDueEntry,
		RatingSchemeEntry,
		RatingSchemeRaterChange,
		WorkflowStatus
	} from '$features/rating-scheme/contracts';
	import { changeRatingSchemeRater, moveRatingSchemeEntry, saveRatingSchemeEntry } from '$features/rating-scheme';
	import { isEvaluationCompleted } from '$features/rating-scheme/contracts';
	import { rejectedRequestMessage } from '$lib/stores/core';
	import type { NeedsYouPanelProps } from '../../sections/needsYou';

	type EntryModal = Component<{
		entry: RatingSchemeEntryEditorData['entry'] | null;
		personnel: RatingSchemeEntryEditorData['personnelLookup'];
		isCurrentWorkspace: () => boolean;
		onSave: (
			data: Omit<RatingSchemeEntryEditorData['entry'], 'id' | 'workflowStatus'>,
			isCurrent: () => boolean
		) => Promise<void>;
		onMove: (
			id: string,
			to: WorkflowStatus | null,
			isCurrent: () => boolean
		) => Promise<WorkflowStatus | null | undefined>;
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

	/** A viewer without Personnel access names the rated person from the entry itself, so the overlay keeps it. */
	type NamedDueEntry = RatingSchemeDueEntry & { ratedPersonName?: string };

	function ratedPersonName(ratedPersonId: string): string | undefined {
		const person = editor.personnelLookup.find((candidate) => candidate.id === ratedPersonId);
		if (person) return `${person.rank} ${person.lastName}, ${person.firstName}`;
		const loaded: readonly NamedDueEntry[] = model.inputs.page.dashboard.data.ratingSchemeEntries;
		const before = loaded.find((candidate) => candidate.id === editor.entry.id);
		return before?.ratedPersonId === ratedPersonId ? before.ratedPersonName : undefined;
	}

	function putEntry(saved: RatingSchemeEntry) {
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

	const onSave: ComponentProps<EntryModal>['onSave'] = (data) =>
		save(async () => {
			putEntry(await saveRatingSchemeEntry(orgId, editor.entry.id, data));
		});

	/**
	 * A step keeps the entry past thru, so the panel stays open for the next one. Completing it removes the row,
	 * so that move saves through the row and focus moves on with it.
	 */
	const onMove: ComponentProps<EntryModal>['onMove'] = async (id, to, isCurrent) => {
		const move = async () => {
			const { entry } = await moveRatingSchemeEntry(orgId, id, to).catch((failure: unknown) => {
				throw new Error(rejectedRequestMessage(failure, 'The workflow did not move. Try again.'));
			});
			if (!isCurrent()) return undefined;
			putEntry(entry);
			return entry.workflowStatus;
		};
		if (!isEvaluationCompleted(to)) return move();
		let reached: WorkflowStatus | null | undefined;
		await save(async () => {
			reached = await move();
		});
		return reached;
	};

	const onChangeRater: ComponentProps<EntryModal>['onChangeRater'] = async (id, change, isCurrent) => {
		let opened = false;
		await save(async () => {
			const { entry, successor } = await changeRatingSchemeRater(orgId, id, change);
			if (!isCurrent()) return;
			putEntry(entry);
			if (successor) putEntry(successor);
			opened = successor !== null;
		});
		return opened;
	};
</script>

<Modal
	entry={editor.entry}
	personnel={editor.personnelLookup}
	{isCurrentWorkspace}
	{onSave}
	{onMove}
	{onChangeRater}
	onClose={close}
/>
