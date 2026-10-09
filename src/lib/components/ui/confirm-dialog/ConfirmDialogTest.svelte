<script lang="ts">
	import ConfirmDialog from './ConfirmDialog.svelte';

	let {
		disabled = false,
		asyncConfirm = false
	}: {
		disabled?: boolean;
		asyncConfirm?: boolean;
	} = $props();

	let open = $state(true);
	let cancelCount = $state(0);
	let confirmCount = $state(0);

	async function handleConfirm() {
		confirmCount += 1;
		if (asyncConfirm) {
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
	}

	function handleCancel() {
		cancelCount += 1;
		open = false;
	}
</script>

<button type="button" onclick={() => (open = true)}>Open confirm dialog</button>
<p data-testid="cancel-count">{cancelCount}</p>
<p data-testid="confirm-count">{confirmCount}</p>

{#if open}
	<ConfirmDialog
		title="Confirm shared action"
		message="This explains the consequence."
		confirmLabel="Confirm action"
		cancelLabel="Stand down"
		variant="destructive"
		{disabled}
		onConfirm={handleConfirm}
		onCancel={handleCancel}
	/>
{/if}
