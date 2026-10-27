<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import Info from '@lucide/svelte/icons/info';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import type { PersonStateLine } from './staffingLabels';

	let { line }: { line: PersonStateLine } = $props();
</script>

<!-- An overlap asks someone to look, so it is amber like other attention; another commitment is only information. -->
{#if line}
	<span
		class={[
			'flex items-start gap-1.5 text-[13px] leading-[18px] text-foreground/80',
			line.tone === 'conflict' && 'rounded-md bg-accent/12 px-2 py-1.5',
			line.tone === 'elsewhere' && 'rounded-md bg-info/8 px-2 py-1.5'
		]}
	>
		{#if line.tone === 'clear'}
			<Check class="mt-[3px] size-3 shrink-0 text-success" aria-hidden="true" />
		{:else if line.tone === 'conflict'}
			<TriangleAlert class="mt-[2px] size-[13px] shrink-0 text-accent" aria-label="Overlap" />
		{:else}
			<Info class="mt-[2px] size-[13px] shrink-0 text-info" aria-label="Committed elsewhere" />
		{/if}
		<span class="min-w-0">{line.text}</span>
	</span>
{/if}
