<script lang="ts">
	let {
		entry,
		onSave,
		onMove,
		onChangeRater,
		onClose
	}: {
		entry: { id: string };
		onSave: (data: { notes: string }, isCurrent: () => boolean) => Promise<void>;
		onMove: (id: string, to: string | null, isCurrent: () => boolean) => Promise<unknown>;
		onChangeRater: (
			id: string,
			change: { changeDate: string; raterPersonId: string | null; raterName: string | null },
			isCurrent: () => boolean
		) => Promise<boolean>;
		onClose: () => void;
	} = $props();

	let said = $state<string | null>(null);
	const report = (work: Promise<unknown>) =>
		work.then(
			(result) => (said = `done ${String(result)}`),
			(error: Error) => (said = error.message)
		);
</script>

<section aria-label="Entry {entry.id}">
	{#if said}<p>Modal says: {said}</p>{/if}
	<button type="button" onclick={() => report(onSave({ notes: 'Updated' }, () => true))}>Save notes</button>
	<button type="button" onclick={() => report(onMove(entry.id, 'drafting', () => true))}>Start tracking</button>
	<button type="button" onclick={() => report(onMove(entry.id, 'completed', () => true))}>Mark completed</button>
	<button
		type="button"
		onclick={() =>
			report(
				onChangeRater(entry.id, { changeDate: '2026-06-30', raterPersonId: null, raterName: 'SSG New' }, () => true)
			)}>Change rater</button
	>
	<button type="button" onclick={onClose}>Close entry</button>
</section>
