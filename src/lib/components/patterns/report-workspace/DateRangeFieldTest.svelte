<script lang="ts">
	import DateRangeField from './DateRangeField.svelte';

	let start = $state('2026-01-01');
	let end = $state('2026-12-31');
</script>

<DateRangeField
	bind:start
	bind:end
	presets={[{ id: 'q1', label: 'Q1', getRange: () => ({ start: '2025-01-01', end: '2025-03-31' }) }]}
/>
<output aria-label="Range">{start}..{end}</output>
