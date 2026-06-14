<script lang="ts">
	let { loadAvailabilityRange } = $props();
</script>

<button type="button" onclick={() => loadAvailabilityRange?.({ rangeStart: '2026-01-01', rangeEnd: '2026-01-31' })}>
	Load Remove Range
</button>
