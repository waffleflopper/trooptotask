<script lang="ts">
	let {
		evaluation,
		onSave,
		onMove,
		onChangeRater,
		onClose
	}: {
		evaluation: { id: string; workflowStatus: string | null };
		onSave: (id: string, patch: { notes: string }, isCurrent: () => boolean) => Promise<void>;
		onMove: (id: string, move: { from: string | null; to: string | null }, isCurrent: () => boolean) => Promise<void>;
		onChangeRater: (
			id: string,
			change: { changeDate: string; raterPersonId: string | null; raterName: string | null },
			isCurrent: () => boolean
		) => Promise<void>;
		onClose: () => void;
	} = $props();

	let said = $state<string | null>(null);
	const report = (work: Promise<void>) =>
		work.then(
			() => (said = 'done'),
			(error: Error) => (said = error.message)
		);
</script>

<section aria-label="Evaluation {evaluation.id}">
	<p>Step: {evaluation.workflowStatus ?? 'Not tracked'}</p>
	{#if said}<p>Sheet says: {said}</p>{/if}
	<button type="button" onclick={() => report(onSave(evaluation.id, { notes: 'Updated' }, () => true))}>
		Save notes
	</button>
	<button
		type="button"
		onclick={() => report(onMove(evaluation.id, { from: evaluation.workflowStatus, to: 'drafting' }, () => true))}
	>
		Start tracking
	</button>
	<button
		type="button"
		onclick={() => report(onMove(evaluation.id, { from: evaluation.workflowStatus, to: 'completed' }, () => true))}
	>
		Mark completed
	</button>
	<button
		type="button"
		onclick={() =>
			report(
				onChangeRater(
					evaluation.id,
					{ changeDate: '2026-06-30', raterPersonId: null, raterName: 'SSG New' },
					() => true
				)
			)}
	>
		Change rater
	</button>
	<button type="button" onclick={onClose}>Close evaluation</button>
</section>
