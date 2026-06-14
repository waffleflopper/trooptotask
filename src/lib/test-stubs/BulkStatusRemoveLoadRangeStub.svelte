<script lang="ts">
	let { loadAvailabilityRange } = $props();

	let loadFailed = $state(false);

	async function handleClick() {
		loadFailed = false;
		try {
			await loadAvailabilityRange?.({ rangeStart: '2026-01-01', rangeEnd: '2026-01-31' });
		} catch {
			loadFailed = true;
		}
	}
</script>

<button type="button" onclick={handleClick}>Load Remove Range</button>
{#if loadFailed}
	<div role="status">Remove range load failed</div>
{/if}
