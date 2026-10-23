<script lang="ts">
	let {
		entry,
		onSave,
		onClose
	}: {
		entry: { id: string; status: string };
		onSave: (data: { status: string }, isCurrent: () => boolean) => Promise<void>;
		onClose: () => void;
	} = $props();

	let failed = $state<string | null>(null);
</script>

<section aria-label="Entry {entry.id}">
	{#if failed}<p>Modal says: {failed}</p>{/if}
	<button
		type="button"
		onclick={() =>
			onSave({ status: 'completed' }, () => true).catch((error: Error) => {
				failed = error.message;
			})}>Mark completed</button
	>
	<button type="button" onclick={onClose}>Close entry</button>
</section>
