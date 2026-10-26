<script lang="ts">
	let {
		onApply,
		onComplete
	}: {
		onApply: (
			ids: string[],
			statusTypeId: string,
			start: string,
			end: string,
			note: string | null
		) => Promise<string[]>;
		onComplete: () => void;
	} = $props();

	async function finish() {
		await onApply(['person-1'], 'status-1', '2030-10-19', '2030-10-23', null);
		onComplete();
	}
</script>

<button type="button" onclick={finish}>Finish</button>
