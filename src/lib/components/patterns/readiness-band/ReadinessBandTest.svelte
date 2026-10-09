<script lang="ts">
	import * as ReadinessBand from './index.js';

	const cells: Array<{ tier: ReadinessBand.ReadinessBandTier; percent: number | null; label: string }> = [
		{ tier: 'danger', percent: 48, label: 'Danger readiness' },
		{ tier: 'warn', percent: 64, label: 'Warning readiness' },
		{ tier: 'caution', percent: 76, label: 'Caution readiness' },
		{ tier: 'okay', percent: 84, label: 'Okay readiness' },
		{ tier: 'good', percent: 96, label: 'Good readiness' },
		{ tier: 'not-applicable', percent: null, label: 'Not applicable readiness' }
	];
</script>

<div>
	<div aria-label="Readiness band cells">
		{#each cells as cell (cell.tier)}
			<ReadinessBand.Cell tier={cell.tier} percent={cell.percent} aria-label={cell.label} />
		{/each}
	</div>
	<ReadinessBand.Legend />
</div>
