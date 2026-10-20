<script lang="ts" module>
	export interface CoverageBarSegment {
		key: string;
		label: string;
		covered: boolean;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils.js';

	let {
		segments,
		label,
		coveredText,
		gapText,
		class: className,
		children
	}: {
		segments: CoverageBarSegment[];
		/** Names the list for assistive technology. */
		label: string;
		/** Spoken for a filled segment, after its label. */
		coveredText: string;
		/** Spoken for a dashed segment, after its label. */
		gapText: string;
		class?: string;
		/** The caption under the bar. */
		children?: Snippet;
	} = $props();
</script>

<div class={cn('flex flex-col gap-2', className)}>
	<ul class="flex gap-1" aria-label={label}>
		{#each segments as segment (segment.key)}
			<li class="flex min-w-0 grow basis-0 flex-col gap-1">
				<span
					class={cn(
						'h-2 rounded-xs',
						segment.covered ? 'bg-muted-foreground/75' : 'border border-dashed border-warning'
					)}
					role="img"
					aria-label="{segment.label}: {segment.covered ? coveredText : gapText}"
				></span>
				<span
					class={cn(
						'truncate font-mono text-[0.625rem] leading-3 tracking-[0.06em] uppercase',
						segment.covered ? 'text-muted-foreground' : 'font-semibold text-warning-foreground'
					)}
					aria-hidden="true"
				>
					{segment.label}
				</span>
			</li>
		{/each}
	</ul>
	{#if children}
		<p class="text-[13px] leading-[18px] text-muted-foreground">{@render children()}</p>
	{/if}
</div>
